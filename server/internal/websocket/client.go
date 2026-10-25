package websocket

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"sort"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pixel1000/server/internal/models"
	"github.com/pixel1000/server/internal/platform/words"
)

// getDeterministicTeamPlayers gathers unique players on a team in a deterministic, sorted order so turns are never skipped.
func getDeterministicTeamPlayers(clients map[*Client]bool, role string) []string {
	seen := make(map[string]bool)
	var list []string
	for c := range clients {
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
			var stroke models.Stroke
			if err := json.Unmarshal(wsMsg.Payload, &stroke); err == nil {
				c.Room.mu.Lock()
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
		} else if wsMsg.Type == "update_settings" {
			var settingsPayload struct {
				TimeLimitSeconds int `json:"timeLimitSeconds"`
				InkLimit         int `json:"inkLimit"`
				MaxRounds        int `json:"maxRounds"`
			}
			if err := json.Unmarshal(wsMsg.Payload, &settingsPayload); err == nil {
				c.Room.mu.Lock()
				// Only the Room Owner / Admin is allowed to modify room settings!
				if c.UserID == c.Room.State.AdminID {
					if settingsPayload.TimeLimitSeconds >= 10 && settingsPayload.TimeLimitSeconds <= 300 {
						c.Room.Settings.TimeLimitSeconds = settingsPayload.TimeLimitSeconds
					}
					if settingsPayload.InkLimit >= 100 && settingsPayload.InkLimit <= 10000 {
						c.Room.Settings.InkLimit = settingsPayload.InkLimit
					}
					if settingsPayload.MaxRounds >= 1 && settingsPayload.MaxRounds <= 20 {
						c.Room.Settings.MaxRounds = settingsPayload.MaxRounds
					}
					log.Printf("Room %s settings updated: TimeLimit=%ds, InkLimit=%d, MaxRounds=%d",
						c.Room.ID, c.Room.Settings.TimeLimitSeconds, c.Room.Settings.InkLimit, c.Room.Settings.MaxRounds)
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

			// SEMANTIC RULE: Cannot start game without at least one Judge!
			hasJudge := false
			for client := range c.Room.Clients {
				if client.Role == "judge" {
					hasJudge = true
					break
				}
			}

			if !hasJudge {
				c.Room.mu.Unlock()
				errMsg, _ := json.Marshal(map[string]interface{}{
					"type": "error",
					"payload": map[string]string{
						"message": "Cannot start game without a Judge! At least one player must select the Judge role.",
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
			teamAOrder := getDeterministicTeamPlayers(c.Room.Clients, "teamA")
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
				var activeTeamOrder []string
				if c.Room.State.ActiveTeam == "teamA" {
					if len(c.Room.State.TeamAOrder) == 0 {
						c.Room.State.TeamAOrder = getDeterministicTeamPlayers(c.Room.Clients, "teamA")
					}
					activeTeamOrder = c.Room.State.TeamAOrder
				} else {
					if len(c.Room.State.TeamBOrder) == 0 {
						c.Room.State.TeamBOrder = getDeterministicTeamPlayers(c.Room.Clients, "teamB")
					}
					activeTeamOrder = c.Room.State.TeamBOrder
				}

				c.Room.State.TotalTeamSteps = len(activeTeamOrder)
				c.Room.State.ActiveTeamStep++

				if c.Room.State.ActiveTeamStep < len(activeTeamOrder) {
					// Advance to the next player in deterministic order! Canvas is preserved.
					c.Room.State.ActivePlayerID = activeTeamOrder[c.Room.State.ActiveTeamStep]
				} else {
					// All players on the team have completed their drawing step for this word -> transition to judging!
					c.Room.State.Status = "judging"
					c.Room.State.JudgeSubmissions = make(map[string]int)

					// Broadcast stroke_sync to all clients so judges immediately have 100% of the completed drawing!
					strokesBytes, _ := json.Marshal(c.Room.Strokes)
					syncMsg, _ := json.Marshal(map[string]interface{}{
						"type":    "stroke_sync",
						"payload": json.RawMessage(strokesBytes),
					})
					c.Room.Broadcast <- syncMsg
				}
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

					// Count unique connected judges (atomic, deduplicated by UserID)
					uniqueJudges := make(map[string]bool)
					for client := range c.Room.Clients {
						if client.Role == "judge" && client.UserID != "" {
							uniqueJudges[client.UserID] = true
						}
					}
					totalJudgesCount := len(uniqueJudges)

					// When all judges have submitted their rating, compute the mean score and advance
					if len(c.Room.State.JudgeSubmissions) >= totalJudgesCount && totalJudgesCount > 0 {
						sum := 0
						for _, sc := range c.Room.State.JudgeSubmissions {
							sum += sc
						}
						meanScore := (sum + len(c.Room.State.JudgeSubmissions)/2) / len(c.Room.State.JudgeSubmissions)
						c.Room.Scores[c.Room.State.ActiveTeam] += meanScore
						c.Room.State.LastMeanScore = meanScore

						// Clear strokes for the next team's new word
						c.Room.Strokes = []models.Stroke{}
						if c.Room.RedisClient != nil && c.Room.RedisClient.IsAvailable() {
							go func(rid string) {
								ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
								defer cancel()
								_ = c.Room.RedisClient.ClearStrokes(ctx, rid)
							}(c.Room.ID)
						}

						if c.Room.State.ActiveTeam == "teamA" {
							// Team Alpha finished. Now Team Beta draws Word 2!
							c.Room.State.ActiveTeam = "teamB"
							c.Room.State.Status = "playing"
							c.Room.State.JudgeSubmissions = make(map[string]int)

							teamBOrder := getDeterministicTeamPlayers(c.Room.Clients, "teamB")
							c.Room.State.TeamBOrder = teamBOrder
							c.Room.State.TotalTeamSteps = len(teamBOrder)
							c.Room.State.ActiveTeamStep = 0
							if len(teamBOrder) > 0 {
								c.Room.State.ActivePlayerID = teamBOrder[0]
							} else {
								c.Room.State.ActivePlayerID = ""
							}

							nextWord := words.GetRandomWord(c.Room.State.UsedWords)
							c.Room.State.CurrentWord = nextWord
							c.Room.State.UsedWords = append(c.Room.State.UsedWords, nextWord)
						} else {
							// Team Beta finished Word 2! That completes 1 full round for both teams.
							c.Room.State.CurrentRound++

							if c.Room.State.CurrentRound > c.Room.Settings.MaxRounds {
								// Match complete!
								c.Room.State.Status = "finished"
								go c.Room.UpdateStats()
							} else {
								// Next round begins with Team Alpha!
								c.Room.State.ActiveTeam = "teamA"
								c.Room.State.Status = "playing"
								c.Room.State.JudgeSubmissions = make(map[string]int)

								teamAOrder := getDeterministicTeamPlayers(c.Room.Clients, "teamA")
								c.Room.State.TeamAOrder = teamAOrder
								c.Room.State.TotalTeamSteps = len(teamAOrder)
								c.Room.State.ActiveTeamStep = 0
								if len(teamAOrder) > 0 {
									c.Room.State.ActivePlayerID = teamAOrder[0]
								} else {
									c.Room.State.ActivePlayerID = ""
								}

								nextWord := words.GetRandomWord(c.Room.State.UsedWords)
								c.Room.State.CurrentWord = nextWord
								c.Room.State.UsedWords = append(c.Room.State.UsedWords, nextWord)
							}
						}

						c.Room.mu.Unlock()

						// Broadcast clear canvas so the board is clean for the new team's word
						clearCanvasMsg, _ := json.Marshal(map[string]string{"type": "clear_canvas"})
						c.Room.Broadcast <- clearCanvasMsg
						go c.Room.BroadcastState()
						// CRITICAL FIX: No return here! Loop continues reading websocket messages!
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
