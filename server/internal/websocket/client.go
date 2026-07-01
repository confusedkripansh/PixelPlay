package websocket

import (
	"bytes"
	"encoding/json"
	"log"
	"math/rand"
	"time"

	"github.com/gorilla/websocket"
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
	Role   string // "teamA", "teamB", "judge", "spectator"
}

type WsMessage struct {
	Type    string          `json:"type"` // "draw", "chat", "grid_sync"
	Payload json.RawMessage `json:"payload"`
}

type DrawPayload struct {
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Color string `json:"color"`
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
			log.Println("Invalid JSON:", err)
			continue
		}

		if wsMsg.Type == "draw" {
			var draw DrawPayload
			if err := json.Unmarshal(wsMsg.Payload, &draw); err == nil {
				// Validate bounds
				if draw.X >= 0 && draw.X < 256 && draw.Y >= 0 && draw.Y < 256 {
					c.Room.mu.Lock()
					c.Room.Grid[draw.X][draw.Y] = draw.Color
					c.Room.mu.Unlock()
					c.Room.Broadcast <- message
				}
			}
		} else if wsMsg.Type == "switch_role" {
			var rolePayload struct {
				Role string `json:"role"`
			}
			if err := json.Unmarshal(wsMsg.Payload, &rolePayload); err == nil {
				c.Room.mu.Lock()
				c.Role = rolePayload.Role
				// Broadcast state update
				stateBytes, _ := json.Marshal(c.Room.State)
				msg, _ := json.Marshal(map[string]interface{}{
					"type": "state_update",
					"payload": json.RawMessage(stateBytes),
				})
				c.Room.mu.Unlock()
				c.Room.Broadcast <- msg
			}
		} else if wsMsg.Type == "start_game" {
			c.Room.mu.Lock()
			if c.Room.State.Status == "lobby" {
				words := []string{"APPLE", "HOUSE", "DRAGON", "COMPUTER", "GUITAR", "OCEAN", "ROCKET", "CASTLE", "BICYCLE", "ASTRONAUT", "PIZZA"}
				c.Room.State.Status = "playing"
				c.Room.State.CurrentRound = 1
				c.Room.State.ActiveTeam = "teamA"
				
				// Pick random word
				c.Room.State.CurrentWord = words[rand.Intn(len(words))]
			}
			stateBytes, _ := json.Marshal(c.Room.State)
			msg, _ := json.Marshal(map[string]interface{}{
				"type": "state_update",
				"payload": json.RawMessage(stateBytes),
			})
			c.Room.mu.Unlock()
			c.Room.Broadcast <- msg
		} else if wsMsg.Type == "end_turn" {
			c.Room.mu.Lock()
			if c.Room.State.Status == "playing" {
				// Transition to judging for now
				c.Room.State.Status = "judging"
			}
			stateBytes, _ := json.Marshal(c.Room.State)
			msg, _ := json.Marshal(map[string]interface{}{
				"type": "state_update",
				"payload": json.RawMessage(stateBytes),
			})
			c.Room.mu.Unlock()
			c.Room.Broadcast <- msg
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
