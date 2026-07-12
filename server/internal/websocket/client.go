package websocket

import (
	"bytes"
	"encoding/json"
	"log"
	"math/rand"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pixel1000/server/internal/models"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 5120
)

var (
	newline = []byte{'\n'}
	space   = []byte{' '}
)

type Client struct {
	Room   *Room
	Conn   *websocket.Conn
	Send   chan []byte
	UserID string
	Name   string
	Avatar string
	Role            string // "teamA", "teamB", "judge", "spectator"
	IsAuthenticated bool
}

type WsMessage struct {
	Type    string          `json:"type"` // "draw_stroke", "chat", "stroke_sync"
	Payload json.RawMessage `json:"payload"`
}

func (c *Client) ReadPump() {
	defer func() {
		c.Room.Unregister <- c
		c.Conn.Close()
	}()
	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error { c.Conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
		message = bytes.TrimSpace(bytes.Replace(message, newline, space, -1))

		var wsMsg WsMessage
		if err := json.Unmarshal(message, &wsMsg); err != nil {
			log.Println("Invalid message format:", err)
			continue
		}

		if !c.IsAuthenticated {
			if wsMsg.Type == "authenticate" {
				var authPayload struct {
					Password string `json:"password"`
				}
				json.Unmarshal(wsMsg.Payload, &authPayload)

				c.Room.mu.Lock()
				if c.Room.Password == "" {
					c.Room.Password = authPayload.Password
					c.Room.State.AdminID = c.UserID
					c.IsAuthenticated = true
				} else if c.Room.Password == authPayload.Password {
					c.IsAuthenticated = true
				}
				c.Room.mu.Unlock()

				if c.IsAuthenticated {
					c.Room.Register <- c
				} else {
					c.Conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":{"message":"Invalid password"}}`))
					break
				}
			}
			continue
		}

		if wsMsg.Type == "draw_stroke" {
			var stroke models.Stroke
			if err := json.Unmarshal(wsMsg.Payload, &stroke); err == nil {
				c.Room.mu.Lock()
				c.Room.Strokes = append(c.Room.Strokes, stroke)
				c.Room.mu.Unlock()
				c.Room.Broadcast <- message
			}
		} else if wsMsg.Type == "switch_role" {
			var rolePayload struct {
				Role string `json:"role"`
			}
			if err := json.Unmarshal(wsMsg.Payload, &rolePayload); err == nil {
				c.Room.mu.Lock()
				c.Role = rolePayload.Role
				c.Room.mu.Unlock()
				go c.Room.BroadcastState()
			}
		} else if wsMsg.Type == "start_game" {
			c.Room.mu.Lock()
			if c.Room.State.Status == "lobby" && c.Room.State.AdminID == c.UserID {
				words := []string{"APPLE", "HOUSE", "DRAGON", "COMPUTER", "GUITAR", "OCEAN", "ROCKET", "CASTLE", "BICYCLE", "ASTRONAUT", "PIZZA"}
				c.Room.State.Status = "playing"
				c.Room.State.CurrentRound = 1
				c.Room.State.ActiveTeam = "teamA"
				
				// Assign active player
				for client := range c.Room.Clients {
					if client.Role == "teamA" {
						c.Room.State.ActivePlayerID = client.UserID
						break
					}
				}
				
				// Pick random word
				c.Room.State.CurrentWord = words[rand.Intn(len(words))]
			}
			c.Room.mu.Unlock()
			go c.Room.BroadcastState()
		} else if wsMsg.Type == "end_turn" {
			c.Room.mu.Lock()
			if c.Room.State.Status == "playing" {
				// Transition to judging for now
				c.Room.State.Status = "judging"
			}
			c.Room.mu.Unlock()
			go c.Room.BroadcastState()
		} else if wsMsg.Type == "submit_score" {
			var scorePayload struct {
				Score int `json:"score"`
			}
			if err := json.Unmarshal(wsMsg.Payload, &scorePayload); err == nil {
				c.Room.mu.Lock()
				if c.Role == "judge" && c.Room.State.Status == "judging" {
					c.Room.Scores[c.Room.State.ActiveTeam] += scorePayload.Score
					
					// Swap team
					if c.Room.State.ActiveTeam == "teamA" {
						c.Room.State.ActiveTeam = "teamB"
					} else {
						c.Room.State.ActiveTeam = "teamA"
						c.Room.State.CurrentRound++
					}

					if c.Room.State.CurrentRound > c.Room.Settings.MaxRounds {
						c.Room.State.Status = "finished"
						go c.Room.UpdateStats()
					} else {
						c.Room.State.Status = "playing"
						words := []string{"APPLE", "HOUSE", "DRAGON", "COMPUTER", "GUITAR", "OCEAN", "ROCKET", "CASTLE", "BICYCLE", "ASTRONAUT", "PIZZA", "MOUNTAIN", "GALAXY", "ELEPHANT", "ROBOT"}
						c.Room.State.CurrentWord = words[rand.Intn(len(words))]
						
						// Assign random active player from the new active team
						var teamMembers []string
						for client := range c.Room.Clients {
							if client.Role == c.Room.State.ActiveTeam {
								teamMembers = append(teamMembers, client.UserID)
							}
						}
						if len(teamMembers) > 0 {
							c.Room.State.ActivePlayerID = teamMembers[rand.Intn(len(teamMembers))]
						} else {
							c.Room.State.ActivePlayerID = ""
						}
					}
				}
				c.Room.mu.Unlock()
				go c.Room.BroadcastState()
			}
		} else {
			c.Room.Broadcast <- message
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write(newline)
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
