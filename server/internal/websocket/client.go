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
	// Time allowed to write a message to the peer.
	writeWait      = 10 * time.Second
	// Time allowed to read the next pong message from the peer.
	pongWait       = 60 * time.Second
	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod     = (pongWait * 9) / 10
	// Maximum message size allowed from peer.
	maxMessageSize = 5120
)

var (
	newline = []byte{'\n'}
	space   = []byte{' '}
)

// Client is a middleman between the WebSocket connection and the Hub.
// Think of it as the physical "player" in the server's memory.
type Client struct {
	Room   *Room
	Conn   *websocket.Conn // The actual TCP network connection.
	Send   chan []byte     // A buffered channel of outbound messages. If we put a message here, WritePump sends it.
	UserID string
	Name   string
	Avatar string
	Role            string // "teamA", "teamB", "judge", "spectator"
	IsAuthenticated bool   // Did they provide the correct room password?
}

// WsMessage represents the structure of every single JSON packet sent by the browser.
type WsMessage struct {
	Type    string          `json:"type"` // e.g., "draw_stroke", "chat", "start_game"
	Payload json.RawMessage `json:"payload"` // The dynamic data associated with the Type.
}

// ReadPump pumps messages from the WebSocket connection to the Hub.
// The application runs ReadPump in a per-connection Goroutine. 
func (c *Client) ReadPump() {
	// "defer" ensures that if this function ever stops (e.g. connection drops), 
	// the client is unregistered from the room and the socket is cleanly closed.
	defer func() {
		c.Room.Unregister <- c
		c.Conn.Close()
	}()
	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error { c.Conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	
	// Infinite loop: constantly wait for the next message from the browser.
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break // Break the loop, which triggers the defer func() above to clean up.
		}
		// Strip newlines to keep JSON clean.
		message = bytes.TrimSpace(bytes.Replace(message, newline, space, -1))

		var wsMsg WsMessage
		// Convert the raw bytes into our Go WsMessage struct.
		if err := json.Unmarshal(message, &wsMsg); err != nil {
			log.Println("Invalid message format:", err)
			continue // Skip to the next message if this one is garbage.
		}

		// AUTHENTICATION GATE
		// If they haven't proven they know the password, the ONLY message we accept is "authenticate".
		if !c.IsAuthenticated {
			if wsMsg.Type == "authenticate" {
				var authPayload struct {
					Password string `json:"password"`
				}
				json.Unmarshal(wsMsg.Payload, &authPayload)

				c.Room.mu.Lock()
				if c.Room.Password == "" {
					// First person to join sets the password and becomes admin.
					c.Room.Password = authPayload.Password
					c.Room.State.AdminID = c.UserID
					c.IsAuthenticated = true
				} else if c.Room.Password == authPayload.Password {
					c.IsAuthenticated = true
				}
				c.Room.mu.Unlock()

				if c.IsAuthenticated {
					c.Room.Register <- c // Welcome to the room!
				} else {
					c.Conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":{"message":"Invalid password"}}`))
					break // Kick them out.
				}
			}
			continue
		}

		// GAMEPLAY MESSAGE ROUTING
		if wsMsg.Type == "draw_stroke" {
			var stroke models.Stroke
			if err := json.Unmarshal(wsMsg.Payload, &stroke); err == nil {
				c.Room.mu.Lock()
				c.Room.Strokes = append(c.Room.Strokes, stroke)
				c.Room.mu.Unlock()
				c.Room.Broadcast <- message // Send the stroke to everyone else to render.
			}
		} else if wsMsg.Type == "switch_role" {
			var rolePayload struct {
				Role string `json:"role"`
			}
			if err := json.Unmarshal(wsMsg.Payload, &rolePayload); err == nil {
				c.Room.mu.Lock()
				c.Role = rolePayload.Role
				c.Room.mu.Unlock()
				go c.Room.BroadcastState() // Tell everyone their role changed.
			}
		} else if wsMsg.Type == "start_game" {
			c.Room.mu.Lock()
			// Only the Admin can start the game from the lobby.
			if c.Room.State.Status == "lobby" && c.Room.State.AdminID == c.UserID {
				words := []string{"APPLE", "HOUSE", "DRAGON", "COMPUTER", "GUITAR", "OCEAN", "ROCKET", "CASTLE", "BICYCLE", "ASTRONAUT", "PIZZA"}
				c.Room.State.Status = "playing"
				c.Room.State.CurrentRound = 1
				c.Room.State.ActiveTeam = "teamA"
				
				// Find the first person on Team A and make them the drawer.
				for client := range c.Room.Clients {
					if client.Role == "teamA" {
						c.Room.State.ActivePlayerID = client.UserID
						break
					}
				}
				
				// Pick a random word for the round.
				c.Room.State.CurrentWord = words[rand.Intn(len(words))]
			}
			c.Room.mu.Unlock()
			go c.Room.BroadcastState()
		} else if wsMsg.Type == "end_turn" {
			c.Room.mu.Lock()
			if c.Room.State.Status == "playing" {
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
				// Only Judges can submit scores, and only during the judging phase.
				if c.Role == "judge" && c.Room.State.Status == "judging" {
					c.Room.Scores[c.Room.State.ActiveTeam] += scorePayload.Score
					
					// Swap active team for the next round.
					if c.Room.State.ActiveTeam == "teamA" {
						c.Room.State.ActiveTeam = "teamB"
					} else {
						c.Room.State.ActiveTeam = "teamA"
						c.Room.State.CurrentRound++
					}

					// End the game if max rounds reached, otherwise reset for next round.
					if c.Room.State.CurrentRound > c.Room.Settings.MaxRounds {
						c.Room.State.Status = "finished"
						go c.Room.UpdateStats() // Update MongoDB!
					} else {
						c.Room.State.Status = "playing"
						words := []string{"APPLE", "HOUSE", "DRAGON", "COMPUTER", "GUITAR", "OCEAN", "ROCKET", "CASTLE", "BICYCLE", "ASTRONAUT", "PIZZA", "MOUNTAIN", "GALAXY", "ELEPHANT", "ROBOT"}
						c.Room.State.CurrentWord = words[rand.Intn(len(words))]
						
						// Assign a random player from the new active team to draw.
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
			// If it's a generic chat message, just broadcast it to everyone.
			c.Room.Broadcast <- message
		}
	}
}

// WritePump pumps messages from the Hub back down to the WebSocket connection.
// A goroutine running WritePump is started for each connection.
func (c *Client) WritePump() {
	// A Ticker acts like setInterval in JS. We use it to Ping the browser to see if it's still alive.
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()
	for {
		select {
		// Wait here until the Hub shoves a message into this client's personal "Send" channel.
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The Hub closed the channel, meaning the server wants to disconnect us.
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message) // Write the bytes to the TCP socket!

			// Batching: If there are multiple messages queued up rapidly, send them all at once to save bandwidth.
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write(newline)
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}
		
		// The Ticker fired! Send a heartbeat ping to the browser.
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
