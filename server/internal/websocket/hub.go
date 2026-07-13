package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync" // sync gives us Mutexes, which act like "traffic lights" to stop two threads from crashing into each other.

	"github.com/gorilla/websocket" // The standard third-party library for WebSockets in Go.
	"github.com/pixel1000/server/internal/models"
	"github.com/pixel1000/server/internal/services"
)

// upgrader transforms a normal, temporary HTTP request into a permanent WebSocket connection.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all for development (in production, you'd check if the origin is your React app's domain).
	},
}

// Room represents a single game lobby.
type Room struct {
	ID         string
	Password   string
	Clients    map[*Client]bool // A "Set" of clients currently in the room.
	Broadcast  chan []byte      // "chan" (Channel) is a pipe. Messages shoved into this pipe are sent to everyone in the room.
	Register   chan *Client     // When someone joins, their Client struct is shoved into this pipe.
	Unregister chan *Client     // When someone leaves, their Client struct is shoved into this pipe.
	Strokes    []models.Stroke  // A Slice (dynamic array) storing every drawn line in the current round.
	State      models.GameState
	Settings   models.RoomSettings
	TeamA      []*Client
	TeamB      []*Client
	Judges     []*Client
	Scores     map[string]int
	UserService services.UserService
	
	// mu is a Mutex (Mutual Exclusion lock). Because multiple Goroutines (players) can try to change the room state
	// at the exact same millisecond, we call "mu.Lock()" before making a change, and "mu.Unlock()" after. 
	// This forces players to line up single-file to make changes, preventing data corruption.
	mu         sync.Mutex 
}

// NewRoom creates a new Room struct.
func NewRoom(id string, userService services.UserService) *Room {
	room := &Room{
		ID:         id,
		Clients:    make(map[*Client]bool), // make() initializes an empty Map (dictionary).
		Broadcast:  make(chan []byte),      // Initialize the channels.
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		State: models.GameState{
			Status:       "lobby",
			CurrentRound: 0,
		},
		Settings: models.RoomSettings{
			MaxRounds:        3,
			Mode:             "round_limit",
			TimeLimitSeconds: 60,
		},
		Scores:  map[string]int{"teamA": 0, "teamB": 0},
		Strokes: []models.Stroke{},
		UserService: userService,
	}
	return room
}

// GetFullState builds a snapshot of the current room so we can send it to React.
func (r *Room) GetFullState() models.GameState {
	r.mu.Lock() // Turn the traffic light RED. Nobody else can touch the room while we read it.
	defer r.mu.Unlock() // Turn the traffic light GREEN right before this function returns.

	state := r.State
	state.TeamA = []models.PlayerInfo{}
	state.TeamB = []models.PlayerInfo{}
	state.Judges = []models.PlayerInfo{}
	state.Scores = r.Scores

	// "range" is how we loop over a Map, Array, or Slice in Go.
	for client := range r.Clients {
		info := models.PlayerInfo{
			UserID: client.UserID,
			Name:   client.Name,
			Avatar: client.Avatar,
		}
		if client.Role == "teamA" {
			// "append" adds an item to the end of a Slice.
			state.TeamA = append(state.TeamA, info)
		} else if client.Role == "teamB" {
			state.TeamB = append(state.TeamB, info)
		} else if client.Role == "judge" {
			state.Judges = append(state.Judges, info)
		}
	}
	return state
}

// BroadcastState sends the room snapshot to everyone.
func (r *Room) BroadcastState() {
	state := r.GetFullState()
	// json.Marshal converts our Go Struct into a raw string of JSON bytes (like JSON.stringify in JS).
	stateBytes, _ := json.Marshal(state)
	msg, _ := json.Marshal(map[string]interface{}{
		"type":    "state_update",
		"payload": json.RawMessage(stateBytes),
	})
	
	r.mu.Lock()
	defer r.mu.Unlock()
	for client := range r.Clients {
		// "select" allows us to safely try to shove a message into a Channel without freezing.
		select {
		case client.Send <- msg: // Try to shove the msg into the client's personal Send pipe.
		default:
			// If their pipe is full or blocked (e.g., their internet died), we kick them out.
			close(client.Send) // Close the pipe.
			delete(r.Clients, client) // Remove them from the map.
		}
	}
}

// Run is the central infinite loop for a Room. It runs in its own background Goroutine.
func (r *Room) Run() {
	for {
		select {
		// Wait here until a new client is shoved into the Register pipe.
		case client := <-r.Register:
			r.mu.Lock()
			r.Clients[client] = true
			
			strokesBytes, err := json.Marshal(r.Strokes)
			if err == nil {
				msgBytes, _ := json.Marshal(map[string]interface{}{
					"type": "stroke_sync",
					"payload": json.RawMessage(strokesBytes),
				})
				client.Send <- msgBytes // Send them the existing drawings so they catch up.
			}
			r.mu.Unlock()
			// "go" spins off a brand new lightweight thread (Goroutine) to broadcast the state
			// so this main loop doesn't have to wait for the broadcast to finish.
			go r.BroadcastState()

		// Wait here until a client is shoved into the Unregister pipe.
		case client := <-r.Unregister:
			r.mu.Lock()
			// Check if they are actually in the room ("ok" is true if they exist in the map).
			if _, ok := r.Clients[client]; ok {
				delete(r.Clients, client)
				close(client.Send)
			}
			r.mu.Unlock()
			go r.BroadcastState()

		// Wait here until a drawing stroke is shoved into the Broadcast pipe.
		case message := <-r.Broadcast:
			r.mu.Lock()
			for client := range r.Clients {
				select {
				case client.Send <- message: // Relay the drawing to everyone else.
				default:
					close(client.Send)
					delete(r.Clients, client)
				}
			}
			r.mu.Unlock()
		}
	}
}

// Hub manages all the active Rooms.
type Hub struct {
	Rooms map[string]*Room
	UserService services.UserService
	mu    sync.RWMutex // RWMutex allows multiple threads to READ at the same time, but only one to WRITE.
}

func NewHub(userService services.UserService) *Hub {
	return &Hub{
		Rooms:       make(map[string]*Room),
		UserService: userService,
	}
}

func (h *Hub) GetOrCreateRoom(id string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.Rooms[id]; ok {
		return room // Room exists, return it.
	}
	// Room doesn't exist. Create it, store it, and start its central loop in a background Goroutine!
	room := NewRoom(id, h.UserService)
	h.Rooms[id] = room
	go room.Run() // <--- This starts the infinite loop defined on Line 109.
	return room
}

// UpdateStats is called when the game finishes to assign XP.
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

	for client := range r.Clients {
		// Slices in Go can be sliced! "[:6]" means grab the first 6 characters of the string.
		if client.UserID == "" || client.UserID[:6] == "guest-" {
			continue // "continue" skips the rest of the loop and moves to the next player.
		}

		status := "tie"
		if client.Role == "judge" {
			status = "judge"
		} else if client.Role == winningTeam {
			status = "win"
		} else if winningTeam != "tie" {
			status = "loss"
		}

		err := r.UserService.UpdateGameStats(context.Background(), client.UserID, status, r.Scores[client.Role])
		if err != nil {
			log.Println("Error updating stats for", client.UserID, ":", err)
		}
	}
}

// ServeWS handles the initial HTTP request and upgrades it to a WebSocket.
func ServeWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	// Grab variables out of the URL (e.g. ?roomId=123)
	roomId := r.URL.Query().Get("roomId")
	userId := r.URL.Query().Get("userId")
	name := r.URL.Query().Get("name")
	avatar := r.URL.Query().Get("avatar")
	
	if roomId == "" || userId == "" {
		http.Error(w, "roomId and userId are required", http.StatusBadRequest)
		return
	}

	room := hub.GetOrCreateRoom(roomId)
	
	// Upgrade transforms the HTTP request into a persistent TCP socket.
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	// Create a new Client to represent this user's socket.
	client := &Client{
		Room:            room, 
		Conn:            conn, 
		Send:            make(chan []byte, 256), // A buffered channel holding up to 256 messages.
		UserID:          userId,
		Name:            name,
		Avatar:          avatar,
		Role:            "teamA", 
		IsAuthenticated: false,   // They haven't proven they know the password yet.
	}

	// Spin off two brand new Goroutines dedicated exclusively to this one player.
	// One constantly reads from their socket, one constantly writes to it.
	go client.WritePump()
	go client.ReadPump()
}
