package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync" // sync gives us Mutexes, which act like "traffic lights" to stop two threads from crashing into each other.
	"time"

	"github.com/gorilla/websocket" // The standard third-party library for WebSockets in Go.
	"github.com/pixel1000/server/internal/models"
	"github.com/pixel1000/server/internal/platform/cache"
	"github.com/pixel1000/server/internal/platform/words"
	"github.com/pixel1000/server/internal/services"
)

// upgrader transforms a normal, temporary HTTP request into a permanent WebSocket connection.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all for development (in production, you'd check if the origin is your React app's domain).
	},
}

// serverInstanceID uniquely identifies this backend process to avoid Pub/Sub self-echo.
var serverInstanceID = fmt.Sprintf("srv-%d", time.Now().UnixNano())

// RedisEnvelope wraps messages published across Redis Pub/Sub so instances can ignore their own broadcasts.
type RedisEnvelope struct {
	InstanceID string          `json:"instanceId"`
	Payload    json.RawMessage `json:"payload"`
}

// PublicRoomInfo represents live discovery information for a public room (no password required).
type PublicRoomInfo struct {
	RoomID      string `json:"roomId"`
	PlayerCount int    `json:"playerCount"`
	Status      string `json:"status"`
	TimeLimit   int    `json:"timeLimit"`
	InkLimit    int    `json:"inkLimit"`
}

// Room represents a single game lobby.
// In a horizontally scaled cluster, multiple server instances might manage clients connected to the same room.
// Redis Pub/Sub acts as the central event bus connecting them.
type Room struct {
	ID             string
	Password       string
	Clients        map[*Client]bool   // Local clients directly connected to this server instance.
	Disconnected   map[string]*Client // Temporarily disconnected clients granted a 30s grace window.
	Broadcast      chan []byte        // Outbound pipe: publishes to Redis Pub/Sub (or LocalBroadcast if standalone).
	LocalBroadcast chan []byte        // Inbound pipe: received from Redis Pub/Sub, pushed to local clients.
	Register       chan *Client       // When someone joins, their Client struct is shoved into this pipe.
	Unregister     chan *Client       // When someone leaves, their Client struct is shoved into this pipe.
	Strokes        []models.Stroke    // Dynamic array storing drawn lines.
	State          models.GameState
	Settings       models.RoomSettings
	TeamA          []*Client
	TeamB          []*Client
	Judges         []*Client
	Scores         map[string]int
	UserService    services.UserService
	RedisClient    *cache.RedisClient // Optional distributed cache/bus connection for multi-server setups.
	Hub            *Hub
	TeamATurnCount int
	TeamBTurnCount int

	RoleAssignments          map[string]string // Persistent role mapping: UserID -> "judge" | "teamA" | "teamB"
	JudgingSessionID         int64             // Unique timestamp ID for current judging session
	EmptyJudgeWatchdogActive bool              // Ensures only one 60s judge watchdog runs at a time
	EmptyTeamAWatchdogActive bool              // Ensures only one 60s teamA watchdog runs at a time
	EmptyTeamBWatchdogActive bool              // Ensures only one 60s teamB watchdog runs at a time

	// mu is a Mutex (Mutual Exclusion lock). Because multiple Goroutines (players) can try to change the room state
	// at the exact same millisecond, we call "mu.Lock()" before making a change, and "mu.Unlock()" after.
	mu sync.Mutex
}

// NewRoom creates a new Room struct.
func NewRoom(id string, userService services.UserService, redisClient *cache.RedisClient, hub *Hub) *Room {
	room := &Room{
		ID:             id,
		Clients:        make(map[*Client]bool),
		Disconnected:   make(map[string]*Client),
		Broadcast:      make(chan []byte, 256),
		LocalBroadcast: make(chan []byte, 256),
		Register:       make(chan *Client),
		Unregister:     make(chan *Client),
		RoleAssignments: make(map[string]string),
		State: models.GameState{
			Status:       "lobby",
			CurrentRound: 0,
			UsedWords:    []string{},
		},
		Settings: models.RoomSettings{
			MaxRounds:          3,
			Mode:               "round_limit",
			TimeLimitSeconds:   60,
			InkLimit:           1000,
			JudgingTimeSeconds: 40,
		},
		Scores:      map[string]int{"teamA": 0, "teamB": 0},
		Strokes:     []models.Stroke{},
		UserService: userService,
		RedisClient: redisClient,
		Hub:         hub,
	}
	return room
}

// GetFullState builds a snapshot of the current room so we can send it to React.
// It includes active clients as well as disconnected players currently within their 30s grace period.
func (r *Room) GetFullState() models.GameState {
	r.mu.Lock()
	defer r.mu.Unlock()

	state := r.State
	state.TeamA = []models.PlayerInfo{}
	state.TeamB = []models.PlayerInfo{}
	state.Judges = []models.PlayerInfo{}
	state.Scores = r.Scores
	state.Settings = r.Settings
	state.MaxRounds = r.Settings.MaxRounds
	state.AdminID = r.State.AdminID
	if state.JudgeSubmissions == nil {
		state.JudgeSubmissions = make(map[string]int)
	}

	// 1. Add active local clients (deduplicated by UserID to guarantee atomic presence)
	seenUsers := make(map[string]bool)
	for client := range r.Clients {
		if client.UserID == "" || seenUsers[client.UserID] {
			continue
		}
		seenUsers[client.UserID] = true
		info := models.PlayerInfo{
			UserID:         client.UserID,
			Name:           client.Name,
			Avatar:         client.Avatar,
			IsDisconnected: false,
		}
		if client.Role == "teamA" {
			state.TeamA = append(state.TeamA, info)
		} else if client.Role == "teamB" {
			state.TeamB = append(state.TeamB, info)
		} else if client.Role == "judge" {
			state.Judges = append(state.Judges, info)
		}
	}

	// 2. Add players who disconnected recently and have a grace window to reconnect
	for _, client := range r.Disconnected {
		if client.UserID == "" || seenUsers[client.UserID] {
			continue
		}
		seenUsers[client.UserID] = true
		info := models.PlayerInfo{
			UserID:         client.UserID,
			Name:           client.Name,
			Avatar:         client.Avatar,
			IsDisconnected: true,
		}
		if client.Role == "teamA" {
			state.TeamA = append(state.TeamA, info)
		} else if client.Role == "teamB" {
			state.TeamB = append(state.TeamB, info)
		} else if client.Role == "judge" {
			state.Judges = append(state.Judges, info)
		}
	}

	return state
}

// BroadcastState sends the room snapshot to all players across all server instances.
func (r *Room) BroadcastState() {
	state := r.GetFullState()
	stateBytes, _ := json.Marshal(state)
	msg, _ := json.Marshal(map[string]interface{}{
		"type":    "state_update",
		"payload": json.RawMessage(stateBytes),
	})

	// Persist the updated state to Redis so other servers and reconnecting players fetch accurate data
	if r.RedisClient != nil && r.RedisClient.IsAvailable() {
		cached := models.CachedRoom{
			Password: r.Password,
			AdminID:  r.State.AdminID,
			Settings: r.Settings,
			State:    state,
			Scores:   r.Scores,
		}
		_ = r.RedisClient.SetRoomState(context.Background(), r.ID, cached, 2*time.Hour)

		// If this is an active public room (no password and not finished), update its entry in the global feed.
		// If the room finished, terminated, or has 0 players, purge it immediately from Redis!
		totalPlayers := len(r.Clients) + len(r.Disconnected)
		if r.Password == "" && state.Status != "finished" && state.Status != "terminated" && totalPlayers > 0 {
			info := PublicRoomInfo{
				RoomID:      r.ID,
				PlayerCount: totalPlayers,
				Status:      state.Status,
				TimeLimit:   r.Settings.TimeLimitSeconds,
				InkLimit:    r.Settings.InkLimit,
			}
			_ = r.RedisClient.SetPublicRoom(context.Background(), r.ID, info)
		} else {
			_ = r.RedisClient.RemovePublicRoom(context.Background(), r.ID)
		}
	}

	// Dispatch to the Broadcast pipe
	r.Broadcast <- msg
}

// Run is the central event loop for a Room. It coordinates local and distributed Redis Pub/Sub events.
func (r *Room) Run() {
	// If Redis is active, subscribe to this room's Pub/Sub channel.
	// Any server instance that publishes to this channel will have its message relayed to our local clients.
	if r.RedisClient != nil && r.RedisClient.IsAvailable() {
		channel := fmt.Sprintf("room:%s:events", r.ID)
		pubsub := r.RedisClient.Subscribe(context.Background(), channel)
		go func() {
			defer pubsub.Close()
			ch := pubsub.Channel()
			for msg := range ch {
				var env RedisEnvelope
				if err := json.Unmarshal([]byte(msg.Payload), &env); err == nil && env.InstanceID != "" {
					if env.InstanceID == serverInstanceID {
						// Ignore self-echo: already delivered locally with 0ms delay
						continue
					}
					select {
					case r.LocalBroadcast <- env.Payload:
					default:
					}
				} else {
					select {
					case r.LocalBroadcast <- []byte(msg.Payload):
					default:
					}
				}
			}
		}()
	}

	for {
		select {
		// New client connected to this server
		case client := <-r.Register:
			r.mu.Lock()
			// ATOMIC PRESENCE: Remove any prior connection for this UserID from r.Clients
			for existingClient := range r.Clients {
				if existingClient.UserID == client.UserID {
					if existingClient.Role != "" {
						client.Role = existingClient.Role
					}
					delete(r.Clients, existingClient)
					close(existingClient.Send)
					log.Printf("Atomic Presence: Replaced stale connection for player %s in room %s", client.UserID, r.ID)
				}
			}
			// Check if this player is returning within their reconnection grace period!
			if oldClient, reconnected := r.Disconnected[client.UserID]; reconnected {
				if oldClient.Role != "" {
					client.Role = oldClient.Role
				}
				delete(r.Disconnected, client.UserID)
				log.Printf("Player %s successfully reconnected to room %s within grace period!", client.UserID, r.ID)
			}

			// ROLE PRESERVATION: Strictly check persistent role mapping
			if assignedRole, ok := r.RoleAssignments[client.UserID]; ok && assignedRole != "" {
				client.Role = assignedRole
			} else {
				if client.Role == "" {
					client.Role = "teamA"
				}
				r.RoleAssignments[client.UserID] = client.Role
			}
			r.Clients[client] = true

			// Fetch existing strokes: prefer distributed Redis strokes if available, else local RAM
			var strokesBytes []byte
			if r.RedisClient != nil && r.RedisClient.IsAvailable() {
				rawStrokes, err := r.RedisClient.GetStrokes(context.Background(), r.ID)
				if err == nil && len(rawStrokes) > 0 {
					var strokes []models.Stroke
					for _, raw := range rawStrokes {
						var s models.Stroke
						if json.Unmarshal(raw, &s) == nil {
							strokes = append(strokes, s)
						}
					}
					strokesBytes, _ = json.Marshal(strokes)
				}
			}
			if len(strokesBytes) == 0 {
				strokesBytes, _ = json.Marshal(r.Strokes)
			}

			msgBytes, _ := json.Marshal(map[string]interface{}{
				"type":    "stroke_sync",
				"payload": json.RawMessage(strokesBytes),
			})
			select {
			case client.Send <- msgBytes:
			default:
			}
			r.mu.Unlock()

			go r.BroadcastState()

		// Client dropped connection
		case client := <-r.Unregister:
			r.mu.Lock()
			if _, ok := r.Clients[client]; ok {
				delete(r.Clients, client)
				close(client.Send)

				// ATOMIC PRESENCE: Check if another active connection for this UserID is already live in r.Clients!
				hasAnotherLiveConn := false
				for active := range r.Clients {
					if active.UserID == client.UserID {
						hasAnotherLiveConn = true
						break
					}
				}

				if !hasAnotherLiveConn {
					r.Disconnected[client.UserID] = client
					uid := client.UserID
					isAdmin := (client.UserID == r.State.AdminID)

					go func(targetUID string, admin bool) {
						time.Sleep(20 * time.Second)
						r.mu.Lock()
						// Check if the user has reconnected in r.Clients
						hasReconnected := false
						for active := range r.Clients {
							if active.UserID == targetUID {
								hasReconnected = true
								break
							}
						}

						if !hasReconnected {
							delete(r.Disconnected, targetUID)
							if admin {
								r.mu.Unlock()
								log.Printf("Room %s: Host %s left and did not reconnect within grace period. Terminating room.", r.ID, targetUID)
								r.Terminate("The room owner has left. The room has been terminated.")
								return
							}

							// If the room has become completely empty, terminate it!
							if len(r.Clients) == 0 && len(r.Disconnected) == 0 {
								r.mu.Unlock()
								log.Printf("Room %s is now empty. Terminating room.", r.ID)
								r.Terminate("All players have left the room.")
								return
							}

							// Check if essential roles became empty
							r.triggerRoleWatchdogsLocked()

							// If the disconnected player was the active drawer, advance the turn so the team never gets stuck!
							if r.State.Status == "playing" && r.State.ActivePlayerID == targetUID {
								log.Printf("Active drawer %s disconnected permanently. Advancing turn.", targetUID)
								r.AdvanceTurnLocked()
							}

							r.mu.Unlock()
							log.Printf("Player %s grace period expired. Removed from room %s.", targetUID, r.ID)
							r.BroadcastState()
						} else {
							delete(r.Disconnected, targetUID)
							r.mu.Unlock()
						}
					}(uid, isAdmin)
				}
			}
			r.triggerRoleWatchdogsLocked()
			r.mu.Unlock()
			go r.BroadcastState()

		// Outbound broadcast event (e.g. stroke drawn, game started, state updated)
		case message := <-r.Broadcast:
			// 1. Immediately forward to all local clients with 0ms network latency!
			select {
			case r.LocalBroadcast <- message:
			default:
			}

			// 2. Publish to Redis Pub/Sub wrapped in an envelope so OTHER server instances receive it
			if r.RedisClient != nil && r.RedisClient.IsAvailable() {
				channel := fmt.Sprintf("room:%s:events", r.ID)
				env := RedisEnvelope{
					InstanceID: serverInstanceID,
					Payload:    message,
				}
				if envBytes, err := json.Marshal(env); err == nil {
					go func(data []byte) {
						ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
						defer cancel()
						_ = r.RedisClient.Publish(ctx, channel, data)
					}(envBytes)
				}
			}

		// Inbound broadcast event: delivers bytes to local connected clients
		case message := <-r.LocalBroadcast:
			// Check if message is a room_terminated event
			var eventHeader struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(message, &eventHeader) == nil && eventHeader.Type == "room_terminated" {
				r.mu.Lock()
				for client := range r.Clients {
					select {
					case client.Send <- message:
					default:
					}
					close(client.Send)
					delete(r.Clients, client)
				}
				r.mu.Unlock()
				if r.Hub != nil {
					r.Hub.RemoveRoom(r.ID)
				}
				return // Terminate the room event loop
			}

			r.mu.Lock()
			for client := range r.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(r.Clients, client)
				}
			}
			r.mu.Unlock()
		}
	}
}

// Terminate immediately shuts down the room, informs all players, and cleans up state across servers.
func (r *Room) Terminate(reason string) {
	msg, _ := json.Marshal(map[string]interface{}{
		"type": "room_terminated",
		"payload": map[string]string{
			"reason": reason,
		},
	})

	// Publish to Redis Pub/Sub so clients connected to other server instances are also terminated
	if r.RedisClient != nil && r.RedisClient.IsAvailable() {
		channel := fmt.Sprintf("room:%s:events", r.ID)
		_ = r.RedisClient.Publish(context.Background(), channel, msg)
		_ = r.RedisClient.ClearRoom(context.Background(), r.ID)
	}

	r.mu.Lock()
	for client := range r.Clients {
		select {
		case client.Send <- msg:
		default:
		}
		close(client.Send)
		delete(r.Clients, client)
	}
	r.Disconnected = make(map[string]*Client)
	r.mu.Unlock()

	// Clean up from Hub memory
	if r.Hub != nil {
		r.Hub.RemoveRoom(r.ID)
	}
}

// countActiveJudgesLocked counts unique judges actively connected to the room.
func (r *Room) countActiveJudgesLocked() int {
	seen := make(map[string]bool)
	count := 0
	for c := range r.Clients {
		if c.Role == "judge" && c.UserID != "" && !seen[c.UserID] {
			seen[c.UserID] = true
			count++
		}
	}
	return count
}

// countActiveTeamLocked counts unique players on a given team actively connected to the room.
func (r *Room) countActiveTeamLocked(team string) int {
	seen := make(map[string]bool)
	count := 0
	for c := range r.Clients {
		if c.Role == team && c.UserID != "" && !seen[c.UserID] {
			seen[c.UserID] = true
			count++
		}
	}
	return count
}

// triggerRoleWatchdogsLocked starts 60-second self-termination watchdogs if any essential role is empty.
// MUST be called while holding r.mu.Lock().
func (r *Room) triggerRoleWatchdogsLocked() {
	if r.State.Status != "playing" && r.State.Status != "judging" {
		return
	}

	// 1. Judge Watchdog: Terminate if room has no referee for >60 seconds
	if r.countActiveJudgesLocked() == 0 && !r.EmptyJudgeWatchdogActive {
		r.EmptyJudgeWatchdogActive = true
		go func() {
			time.Sleep(60 * time.Second)
			r.mu.Lock()
			r.EmptyJudgeWatchdogActive = false
			shouldTerminate := (r.State.Status == "playing" || r.State.Status == "judging") && r.countActiveJudgesLocked() == 0
			r.mu.Unlock()

			if shouldTerminate {
				log.Printf("Room %s: No referee present for >60 seconds during match. Auto-terminating.", r.ID)
				r.Terminate("No referee has been present in the room for over 60 seconds. Match terminated.")
			}
		}()
	}

	// 2. Team Alpha Watchdog: Terminate if Team Alpha is completely empty for >60 seconds
	if r.countActiveTeamLocked("teamA") == 0 && !r.EmptyTeamAWatchdogActive {
		r.EmptyTeamAWatchdogActive = true
		go func() {
			time.Sleep(60 * time.Second)
			r.mu.Lock()
			r.EmptyTeamAWatchdogActive = false
			shouldTerminate := (r.State.Status == "playing" || r.State.Status == "judging") && r.countActiveTeamLocked("teamA") == 0
			r.mu.Unlock()

			if shouldTerminate {
				log.Printf("Room %s: Team Blue has been empty for >60 seconds during match. Auto-terminating.", r.ID)
				r.Terminate("Team Blue has been empty for over 60 seconds. Match terminated.")
			}
		}()
	}

	// 3. Team Beta Watchdog: Terminate if Team Beta is completely empty for >60 seconds
	if r.countActiveTeamLocked("teamB") == 0 && !r.EmptyTeamBWatchdogActive {
		r.EmptyTeamBWatchdogActive = true
		go func() {
			time.Sleep(60 * time.Second)
			r.mu.Lock()
			r.EmptyTeamBWatchdogActive = false
			shouldTerminate := (r.State.Status == "playing" || r.State.Status == "judging") && r.countActiveTeamLocked("teamB") == 0
			r.mu.Unlock()

			if shouldTerminate {
				log.Printf("Room %s: Team Red has been empty for >60 seconds during match. Auto-terminating.", r.ID)
				r.Terminate("Team Red has been empty for over 60 seconds. Match terminated.")
			}
		}()
	}
}

// AdvanceTurnLocked advances the turn step within the active team or transitions to judging.
// MUST be called while holding r.mu.Lock().
func (r *Room) AdvanceTurnLocked() {
	var activeTeamOrder []string
	if r.State.ActiveTeam == "teamA" {
		activeTeamOrder = r.State.TeamAOrder
	} else {
		activeTeamOrder = r.State.TeamBOrder
	}

	r.State.TotalTeamSteps = len(activeTeamOrder)
	r.State.ActiveTeamStep++

	if r.State.ActiveTeamStep < len(activeTeamOrder) {
		// Advance to next player in team
		r.State.ActivePlayerID = activeTeamOrder[r.State.ActiveTeamStep]
	} else {
		// All players on team have finished drawing this word -> transition to judging!
		r.State.Status = "judging"
		r.State.JudgeSubmissions = make(map[string]int)

		duration := r.Settings.JudgingTimeSeconds
		if duration < 40 {
			duration = 40
		}
		r.State.JudgingDuration = duration
		r.State.JudgingDeadline = time.Now().Add(time.Duration(duration) * time.Second).UnixMilli()

		sessionID := time.Now().UnixNano()
		r.JudgingSessionID = sessionID
		currentRound := r.State.CurrentRound
		activeTeam := r.State.ActiveTeam

		// Broadcast stroke_sync to all clients so judges immediately have 100% of the completed drawing
		strokesBytes, _ := json.Marshal(r.Strokes)
		syncMsg, _ := json.Marshal(map[string]interface{}{
			"type":    "stroke_sync",
			"payload": json.RawMessage(strokesBytes),
		})
		select {
		case r.Broadcast <- syncMsg:
		default:
		}

		// Check if any role is currently empty
		r.triggerRoleWatchdogsLocked()

		// Launch the dynamic judging rating timer
		go r.startJudgingTimer(sessionID, currentRound, activeTeam, duration)
	}
}

// startJudgingTimer waits for durationSec. If any judge has not submitted a rating,
// it auto-allots a default score of 5, finalizes judging, and advances the match.
func (r *Room) startJudgingTimer(sessionID int64, round int, team string, durationSec int) {
	time.Sleep(time.Duration(durationSec) * time.Second)

	r.mu.Lock()
	// If the judging session has already finished or status changed, no-op
	if r.JudgingSessionID != sessionID || r.State.Status != "judging" || r.State.CurrentRound != round || r.State.ActiveTeam != team {
		r.mu.Unlock()
		return
	}

	log.Printf("Judging timer (%ds) expired in room %s. Defaulting missing judges to 5.", durationSec, r.ID)

	if r.State.JudgeSubmissions == nil {
		r.State.JudgeSubmissions = make(map[string]int)
	}

	// Gather all designated judges
	judgeSet := make(map[string]bool)
	for uid, role := range r.RoleAssignments {
		if role == "judge" {
			judgeSet[uid] = true
		}
	}
	for c := range r.Clients {
		if c.Role == "judge" && c.UserID != "" {
			judgeSet[c.UserID] = true
		}
	}
	for _, c := range r.Disconnected {
		if c.Role == "judge" && c.UserID != "" {
			judgeSet[c.UserID] = true
		}
	}

	// For any judge who hasn't submitted a rating, allot default score of 5
	for jID := range judgeSet {
		if _, voted := r.State.JudgeSubmissions[jID]; !voted {
			r.State.JudgeSubmissions[jID] = 5
			log.Printf("Room %s: Judge %s timed out. Auto-allotted score 5.", r.ID, jID)
		}
	}

	// Fallback if no judges were in the set
	if len(r.State.JudgeSubmissions) == 0 {
		r.State.JudgeSubmissions["system_default"] = 5
	}

	r.FinalizeJudgingLocked()
	r.mu.Unlock() // Release lock immediately before broadcasting

	// Broadcast clear canvas so the board is clean for the new team's word
	clearCanvasMsg, _ := json.Marshal(map[string]string{"type": "clear_canvas"})
	select {
	case r.Broadcast <- clearCanvasMsg:
	default:
	}
	go r.BroadcastState()
}

// FinalizeJudgingLocked tallies judge ratings (defaulting unsubmitted judges to 5),
// updates team scores, clears strokes, and transitions to the next team or round.
// MUST be called while holding r.mu.Lock().
func (r *Room) FinalizeJudgingLocked() {
	r.JudgingSessionID = 0
	r.State.JudgingDeadline = 0

	sum := 0
	for _, sc := range r.State.JudgeSubmissions {
		sum += sc
	}
	meanScore := 5
	if len(r.State.JudgeSubmissions) > 0 {
		meanScore = (sum + len(r.State.JudgeSubmissions)/2) / len(r.State.JudgeSubmissions)
	}
	r.Scores[r.State.ActiveTeam] += meanScore
	r.State.LastMeanScore = meanScore

	// Clear strokes for the next team's new word
	r.Strokes = []models.Stroke{}
	if r.RedisClient != nil && r.RedisClient.IsAvailable() {
		go func(rid string) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_ = r.RedisClient.ClearStrokes(ctx, rid)
		}(r.ID)
	}

	if r.State.ActiveTeam == "teamA" {
		// Team Alpha finished. Now Team Beta draws Word 2!
		r.State.ActiveTeam = "teamB"
		r.State.Status = "playing"
		r.State.JudgeSubmissions = make(map[string]int)

		teamBOrder := getDeterministicTeamPlayers(r, "teamB")
		r.State.TeamBOrder = teamBOrder
		r.State.TotalTeamSteps = len(teamBOrder)
		r.State.ActiveTeamStep = 0
		if len(teamBOrder) > 0 {
			r.State.ActivePlayerID = teamBOrder[0]
		} else {
			r.State.ActivePlayerID = ""
		}

		nextWord := words.GetRandomWord(r.State.UsedWords)
		r.State.CurrentWord = nextWord
		r.State.UsedWords = append(r.State.UsedWords, nextWord)
	} else {
		// Team Beta finished Word 2! That completes 1 full round for both teams.
		r.State.CurrentRound++

		if r.State.CurrentRound > r.Settings.MaxRounds {
			// Match complete!
			r.State.Status = "finished"
			go r.UpdateStats()
		} else {
			// Next round begins with Team Alpha!
			r.State.ActiveTeam = "teamA"
			r.State.Status = "playing"
			r.State.JudgeSubmissions = make(map[string]int)

			teamAOrder := getDeterministicTeamPlayers(r, "teamA")
			r.State.TeamAOrder = teamAOrder
			r.State.TotalTeamSteps = len(teamAOrder)
			r.State.ActiveTeamStep = 0
			if len(teamAOrder) > 0 {
				r.State.ActivePlayerID = teamAOrder[0]
			} else {
				r.State.ActivePlayerID = ""
			}

			nextWord := words.GetRandomWord(r.State.UsedWords)
			r.State.CurrentWord = nextWord
			r.State.UsedWords = append(r.State.UsedWords, nextWord)
		}
	}
}

// Hub manages all active Rooms on this server instance.
type Hub struct {
	Rooms       map[string]*Room
	UserService services.UserService
	RedisClient *cache.RedisClient
	mu          sync.RWMutex
}

// NewHub initializes the Hub with optional Redis client.
func NewHub(userService services.UserService, redisClient *cache.RedisClient) *Hub {
	return &Hub{
		Rooms:       make(map[string]*Room),
		UserService: userService,
		RedisClient: redisClient,
	}
}

// RemoveRoom permanently removes a room from Hub memory.
func (h *Hub) RemoveRoom(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.Rooms, id)
	if h.RedisClient != nil && h.RedisClient.IsAvailable() {
		_ = h.RedisClient.RemovePublicRoom(context.Background(), id)
	}
	log.Printf("Room %s removed from Hub memory", id)
}

// GetPublicRooms fetches all open rooms without a password.
// In a horizontally scaled deployment, it pulls from Redis to aggregate across all server instances.
func (h *Hub) GetPublicRooms() []PublicRoomInfo {
	if h.RedisClient != nil && h.RedisClient.IsAvailable() {
		rawMap, err := h.RedisClient.GetAllPublicRooms(context.Background())
		if err == nil {
			var list []PublicRoomInfo
			for _, raw := range rawMap {
				var info PublicRoomInfo
				if json.Unmarshal(raw, &info) == nil {
					// Strictly exclude finished, terminated, or empty rooms from the global discovery feed
					if info.Status != "finished" && info.Status != "terminated" && info.PlayerCount > 0 {
						list = append(list, info)
					}
				}
			}
			return list
		}
	}

	// In-memory fallback
	h.mu.RLock()
	defer h.mu.RUnlock()
	var list []PublicRoomInfo
	for _, room := range h.Rooms {
		room.mu.Lock()
		totalPlayers := len(room.Clients) + len(room.Disconnected)
		if room.Password == "" && room.State.Status != "finished" && room.State.Status != "terminated" && totalPlayers > 0 {
			list = append(list, PublicRoomInfo{
				RoomID:      room.ID,
				PlayerCount: totalPlayers,
				Status:      room.State.Status,
				TimeLimit:   room.Settings.TimeLimitSeconds,
				InkLimit:    room.Settings.InkLimit,
			})
		}
		room.mu.Unlock()
	}
	return list
}

// GetOrCreateRoom returns the in-memory Room or loads it from Redis if initialized elsewhere.
func (h *Hub) GetOrCreateRoom(id string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	if room, ok := h.Rooms[id]; ok {
		return room
	}

	room := NewRoom(id, h.UserService, h.RedisClient, h)

	// If Redis is active, load any existing room state that another server instance may have initialized
	if h.RedisClient != nil && h.RedisClient.IsAvailable() {
		var cached models.CachedRoom
		if err := h.RedisClient.GetRoomState(context.Background(), id, &cached); err == nil {
			if cached.Password != "" {
				room.Password = cached.Password
			}
			if cached.AdminID != "" {
				room.State.AdminID = cached.AdminID
			}
			if cached.State.Status != "" {
				room.State = cached.State
			}
			if cached.Scores != nil {
				room.Scores = cached.Scores
			}
			if cached.Settings.MaxRounds > 0 {
				room.Settings = cached.Settings
			}
			log.Printf("Loaded existing room %s state from Redis", id)
		}
	}

	h.Rooms[id] = room
	go room.Run()
	return room
}

// UpdateStats is called when the game finishes to assign XP asynchronously via the Worker Pool.
func (r *Room) UpdateStats() {
	if r.UserService == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	scoreA := r.Scores["teamA"]
	scoreB := r.Scores["teamB"]

	var winningTeam string
	if scoreA > scoreB {
		winningTeam = "teamA"
	} else if scoreB > scoreA {
		winningTeam = "teamB"
	} else {
		winningTeam = "tie"
	}

	// 1. Combine active clients, disconnected clients, and full state rosters
	allPlayers := make(map[string]string)
	for client := range r.Clients {
		if client.UserID != "" {
			allPlayers[client.UserID] = client.Role
		}
	}
	for _, client := range r.Disconnected {
		if client.UserID != "" {
			allPlayers[client.UserID] = client.Role
		}
	}
	for _, p := range r.State.TeamA {
		if p.UserID != "" && allPlayers[p.UserID] == "" {
			allPlayers[p.UserID] = "teamA"
		}
	}
	for _, p := range r.State.TeamB {
		if p.UserID != "" && allPlayers[p.UserID] == "" {
			allPlayers[p.UserID] = "teamB"
		}
	}
	for _, p := range r.State.Judges {
		if p.UserID != "" && allPlayers[p.UserID] == "" {
			allPlayers[p.UserID] = "judge"
		}
	}

	playerResults := make(map[string]map[string]interface{})

	for uid, role := range allPlayers {
		if uid == "" {
			continue
		}

		status := "tie"
		xpEarned := 20
		pointsEarned := 0

		if role == "judge" {
			status = "judge"
			xpEarned = 25
			pointsEarned = 0
		} else if role == winningTeam {
			status = "win"
			xpEarned = 50
			pointsEarned = r.Scores[role]
		} else if winningTeam != "tie" {
			status = "loss"
			xpEarned = 10
			pointsEarned = r.Scores[role]
		} else {
			status = "tie"
			xpEarned = 20
			pointsEarned = r.Scores[role]
		}

		playerResults[uid] = map[string]interface{}{
			"status":       status,
			"role":         role,
			"xpEarned":     xpEarned,
			"pointsEarned": pointsEarned,
		}

		// Asynchronously update MongoDB for EVERY user (both Google pilots & guests)
		r.UserService.QueueGameStatsUpdate(uid, status, pointsEarned)
		log.Printf("Queued career stats update for user %s: status=%s, pts=%d, xp=%d", uid, status, pointsEarned, xpEarned)
	}

	// Broadcast match summary so frontends update immediately (sent once via r.Broadcast)
	summaryMsg, _ := json.Marshal(map[string]interface{}{
		"type": "match_summary",
		"payload": map[string]interface{}{
			"winningTeam": winningTeam,
			"scores":      r.Scores,
			"results":     playerResults,
		},
	})

	// Broadcast to the room outbound channel (which forwards once to local clients and Redis)
	r.Broadcast <- summaryMsg
}

// ServeWS handles the initial HTTP request and upgrades it to a WebSocket.
func ServeWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	roomId := r.URL.Query().Get("roomId")
	userId := r.URL.Query().Get("userId")
	name := r.URL.Query().Get("name")
	avatar := r.URL.Query().Get("avatar")

	if roomId == "" || userId == "" {
		http.Error(w, "roomId and userId are required", http.StatusBadRequest)
		return
	}

	room := hub.GetOrCreateRoom(roomId)

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	client := &Client{
		Room:            room,
		Conn:            conn,
		Send:            make(chan []byte, 256),
		UserID:          userId,
		Name:            name,
		Avatar:          avatar,
		Role:            "teamA",
		IsAuthenticated: false,
	}

	go client.WritePump()
	go client.ReadPump()
}
