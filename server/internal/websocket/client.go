package websocket

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pixel1000/server/internal/models"
	"github.com/pixel1000/server/internal/platform/words"
)

// getDeterministicTeamPlayers gathers unique players on a team in a deterministic, sorted order so turns are never skipped.
// It inspects both actively connected clients and temporarily disconnected clients (in grace period) to prevent skipping turns during page reloads.
func getDeterministicTeamPlayers(r *Room, role string) []string {
	seen := make(map[string]bool)
	var list []string
	for c := range r.Clients {
		if c.Role == role && c.UserID != "" && !seen[c.UserID] {
			seen[c.UserID] = true
			list = append(list, c.UserID)
		}
	}
	for _, c := range r.Disconnected {
		if c.Role == role && c.UserID != "" && !seen[c.UserID] {
			seen[c.UserID] = true
			list = append(list, c.UserID)
		}
	}
	sort.Strings(list)
	return list
}

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
				// If room password is not in this instance's memory, check Redis in case another server created it
				if c.Room.Password == "" && c.Room.RedisClient != nil && c.Room.RedisClient.IsAvailable() {
					var cached models.CachedRoom
					if err := c.Room.RedisClient.GetRoomState(context.Background(), c.Room.ID, &cached); err == nil && cached.Password != "" {
						c.Room.Password = cached.Password
						c.Room.State.AdminID = cached.AdminID
					}
				}

				if c.Room.State.AdminID == "" {
					// First person to join sets the password and becomes admin/host.
					c.Room.Password = authPayload.Password
					c.Room.State.AdminID = c.UserID
					c.IsAuthenticated = true

					// Sync password and admin state to Redis
					if c.Room.RedisClient != nil && c.Room.RedisClient.IsAvailable() {
						cached := models.CachedRoom{
							Password: c.Room.Password,
							AdminID:  c.Room.State.AdminID,
							Settings: c.Room.Settings,
							State:    c.Room.State,
							Scores:   c.Room.Scores,
						}
						_ = c.Room.RedisClient.SetRoomState(context.Background(), c.Room.ID, cached, 2*time.Hour)
					}
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
			c.Room.mu.Lock()
			// STRICT PERMISSION: Drawing is ONLY allowed during "playing" mode, and ONLY by the designated active drawer!
			if c.Room.State.Status != "playing" || c.UserID != c.Room.State.ActivePlayerID {
				c.Room.mu.Unlock()
				continue
			}

			var stroke models.Stroke
			if err := json.Unmarshal(wsMsg.Payload, &stroke); err == nil {
				c.Room.Strokes = append(c.Room.Strokes, stroke)
				c.Room.mu.Unlock()

				// 1. Send the stroke to everyone immediately for buttery-smooth rendering (<1ms latency)
				c.Room.Broadcast <- message

				// 2. Record stroke to Redis asynchronously so the read loop NEVER lags
				if c.Room.RedisClient != nil && c.Room.RedisClient.IsAvailable() {
					go func(st models.Stroke) {
						ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
						defer cancel()
						_ = c.Room.RedisClient.AppendStroke(ctx, c.Room.ID, st)
					}(stroke)
				}
			} else {
				c.Room.mu.Unlock()
			}
		} else if wsMsg.Type == "switch_role" {
			var rolePayload struct {
				Role string `json:"role"`
			}
			if err := json.Unmarshal(wsMsg.Payload, &rolePayload); err == nil {
				c.Room.mu.Lock()
				// Only allow switching roles in the lobby phase before game starts!
				if c.Room.State.Status == "lobby" {
					c.Role = rolePayload.Role
					if c.Room.RoleAssignments == nil {
						c.Room.RoleAssignments = make(map[string]string)
					}
					c.Room.RoleAssignments[c.UserID] = rolePayload.Role
				}
				c.Room.mu.Unlock()
				go c.Room.BroadcastState() // Tell everyone their role changed.
			}
		} else if wsMsg.Type == "terminate_room" || wsMsg.Type == "leave_room" {
			c.Room.mu.Lock()
			isAdmin := (c.UserID == c.Room.State.AdminID)
			c.Room.mu.Unlock()
			if isAdmin {
				log.Printf("Host %s explicitly terminated room %s", c.UserID, c.Room.ID)
				c.Room.Terminate("The host has ended this match.")
				return
			}
		} else if wsMsg.Type == "update_settings" {
			var settingsPayload struct {
				TimeLimitSeconds   int `json:"timeLimitSeconds"`
				InkLimit           int `json:"inkLimit"`
				MaxRounds          int `json:"maxRounds"`
				JudgingTimeSeconds int `json:"judgingTimeSeconds"`
			}
			if err := json.Unmarshal(wsMsg.Payload, &settingsPayload); err == nil {
				c.Room.mu.Lock()
				// Only the Room Owner / Admin is allowed to modify room settings!
				if c.UserID == c.Room.State.AdminID {
					// Strict bounds enforcement:
					// 1. Turn Time: minimum 30s, maximum 300s
					if settingsPayload.TimeLimitSeconds >= 30 && settingsPayload.TimeLimitSeconds <= 300 {
						c.Room.Settings.TimeLimitSeconds = settingsPayload.TimeLimitSeconds
					}
					// 2. Ink Limit: minimum 500 pixels, maximum 10,000 pixels
					if settingsPayload.InkLimit >= 500 && settingsPayload.InkLimit <= 10000 {
						c.Room.Settings.InkLimit = settingsPayload.InkLimit
					}
					// 3. Rounds: minimum 1 round, maximum 10 rounds
					if settingsPayload.MaxRounds >= 1 && settingsPayload.MaxRounds <= 10 {
						c.Room.Settings.MaxRounds = settingsPayload.MaxRounds
					}
					// 4. Referee Rating Time: minimum 40s (enforced), maximum 180s
					if settingsPayload.JudgingTimeSeconds >= 40 && settingsPayload.JudgingTimeSeconds <= 180 {
						c.Room.Settings.JudgingTimeSeconds = settingsPayload.JudgingTimeSeconds
					}
					log.Printf("Room %s settings updated: TimeLimit=%ds, InkLimit=%d, MaxRounds=%d, JudgingTime=%ds",
						c.Room.ID, c.Room.Settings.TimeLimitSeconds, c.Room.Settings.InkLimit, c.Room.Settings.MaxRounds, c.Room.Settings.JudgingTimeSeconds)
				}
				c.Room.mu.Unlock()
				go c.Room.BroadcastState()
			}
		} else if wsMsg.Type == "start_game" {
			c.Room.mu.Lock()
			if c.Room.State.Status != "lobby" {
				c.Room.mu.Unlock()
				continue
			}

			// STRICT HOST-ONLY CHECK: Only the designated room Admin can start the match!
			if c.Room.State.AdminID != c.UserID {
				c.Room.mu.Unlock()
				errMsg, _ := json.Marshal(map[string]interface{}{
					"type": "error",
					"payload": map[string]string{
						"message": "Only the room host can start the game!",
					},
				})
				c.Send <- errMsg
				continue
			}

			// STRICT RULE: All 3 gameplay roles MUST have at least 1 player (Team Alpha, Team Beta, and Judge)!
			hasTeamA := false
			hasTeamB := false
			hasJudge := false
			for client := range c.Room.Clients {
				if client.Role == "teamA" && client.UserID != "" {
					hasTeamA = true
				} else if client.Role == "teamB" && client.UserID != "" {
					hasTeamB = true
				} else if client.Role == "judge" && client.UserID != "" {
					hasJudge = true
				}
			}

			if !hasTeamA || !hasTeamB || !hasJudge {
				c.Room.mu.Unlock()
				var missing []string
				if !hasTeamA {
					missing = append(missing, "Team Alpha (Blue)")
				}
				if !hasTeamB {
					missing = append(missing, "Team Beta (Red)")
				}
				if !hasJudge {
					missing = append(missing, "Judge (Referee)")
				}

				errMsg, _ := json.Marshal(map[string]interface{}{
					"type": "error",
					"payload": map[string]string{
						"message": fmt.Sprintf("Cannot start game! The following role(s) must have at least 1 player: %s", strings.Join(missing, ", ")),
					},
				})
				c.Send <- errMsg
				continue
			}

			// Initialize game parameters
			c.Room.State.Status = "playing"
			c.Room.State.CurrentRound = 1
			c.Room.State.ActiveTeam = "teamA"
			c.Room.State.JudgeSubmissions = make(map[string]int)

			// Permanently lock all currently active player roles into RoleAssignments
			if c.Room.RoleAssignments == nil {
				c.Room.RoleAssignments = make(map[string]string)
			}
			for cl := range c.Room.Clients {
				if cl.UserID != "" && cl.Role != "" {
					c.Room.RoleAssignments[cl.UserID] = cl.Role
				}
			}

			// Clean slate for strokes: clear RAM, clear Redis
			c.Room.Strokes = []models.Stroke{}
			if c.Room.RedisClient != nil && c.Room.RedisClient.IsAvailable() {
				go func(rid string) {
					ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
					defer cancel()
					_ = c.Room.RedisClient.ClearStrokes(ctx, rid)
				}(c.Room.ID)
			}
			
			// Deterministic team setup: sorted and deduplicated so no player is ever skipped
			teamAOrder := getDeterministicTeamPlayers(c.Room, "teamA")
			c.Room.State.TeamAOrder = teamAOrder
			c.Room.State.TotalTeamSteps = len(teamAOrder)
			c.Room.State.ActiveTeamStep = 0
			if len(teamAOrder) > 0 {
				c.Room.State.ActivePlayerID = teamAOrder[0]
			} else {
				c.Room.State.ActivePlayerID = ""
			}
			
			// Pick a fresh, precise word from our 320+ curated dictionary
			nextWord := words.GetRandomWord(c.Room.State.UsedWords)
			c.Room.State.CurrentWord = nextWord
			c.Room.State.UsedWords = append(c.Room.State.UsedWords, nextWord)
			c.Room.mu.Unlock()

			// Broadcast clear canvas so all players' boards are wiped clean
			clearCanvasMsg, _ := json.Marshal(map[string]string{"type": "clear_canvas"})
			c.Room.Broadcast <- clearCanvasMsg

			go c.Room.BroadcastState()
		} else if wsMsg.Type == "end_turn" {
			c.Room.mu.Lock()
			// STRICT PERMISSION: Only the active drawer can finish their turn/step early! Host cannot force early finish.
			if c.Room.State.Status == "playing" && c.UserID == c.Room.State.ActivePlayerID {
				c.Room.AdvanceTurnLocked()
			}
			c.Room.mu.Unlock()
			go c.Room.BroadcastState()
		} else if wsMsg.Type == "submit_score" {
			var scorePayload struct {
				Score int `json:"score"`
			}
			if err := json.Unmarshal(wsMsg.Payload, &scorePayload); err == nil {
				c.Room.mu.Lock()
				// STRICT PERMISSION: Only Judges/Referees can score the drawing! Host cannot rate unless they are a judge.
				if c.Role == "judge" && c.Room.State.Status == "judging" {
					if c.Room.State.JudgeSubmissions == nil {
						c.Room.State.JudgeSubmissions = make(map[string]int)
					}
					if scorePayload.Score >= 1 && scorePayload.Score <= 10 {
						c.Room.State.JudgeSubmissions[c.UserID] = scorePayload.Score
					}

					// Count unique present judges (atomic, deduplicated by UserID)
					totalJudgesCount := c.Room.countActiveJudgesLocked()

					// When all judges have submitted their rating, compute the mean score and advance immediately
					if len(c.Room.State.JudgeSubmissions) >= totalJudgesCount && totalJudgesCount > 0 {
						c.Room.FinalizeJudgingLocked()
						c.Room.mu.Unlock()

						// Broadcast clear canvas so the board is clean for the new team's word
						clearCanvasMsg, _ := json.Marshal(map[string]string{"type": "clear_canvas"})
						c.Room.Broadcast <- clearCanvasMsg
						go c.Room.BroadcastState()
					} else {
						c.Room.mu.Unlock()
						go c.Room.BroadcastState()
					}
				} else {
					c.Room.mu.Unlock()
				}
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
