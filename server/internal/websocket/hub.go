package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/pixel1000/server/internal/models"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all for development
	},
}

type Room struct {
	ID         string
	Clients    map[*Client]bool
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	Grid       [256][256]string
	State      models.GameState
	Settings   models.RoomSettings
	TeamA      []*Client
	TeamB      []*Client
	Judges     []*Client
	Scores     map[string]int
	mu         sync.Mutex // Protect state writes
}

func NewRoom(id string) *Room {
	room := &Room{
		ID:         id,
		Clients:    make(map[*Client]bool),
		Broadcast:  make(chan []byte),
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
			PixelsPerTurn:    3,
		},
		Scores: map[string]int{"teamA": 0, "teamB": 0},
	}
	// Initialize grid with white
	for i := 0; i < 256; i++ {
		for j := 0; j < 256; j++ {
			room.Grid[i][j] = "#ffffff"
		}
	}
	return room
}

func (r *Room) Run() {
	for {
		select {
		case client := <-r.Register:
			r.mu.Lock()
			r.Clients[client] = true
			
			gridBytes, err := json.Marshal(r.Grid)
			if err == nil {
				msgBytes, _ := json.Marshal(map[string]interface{}{
					"type": "grid_sync",
					"payload": json.RawMessage(gridBytes),
				})
				client.Send <- msgBytes
			}
			r.mu.Unlock()
		case client := <-r.Unregister:
			r.mu.Lock()
			if _, ok := r.Clients[client]; ok {
				delete(r.Clients, client)
				close(client.Send)
			}
			r.mu.Unlock()
		case message := <-r.Broadcast:
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

type Hub struct {
	Rooms map[string]*Room
	mu    sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		Rooms: make(map[string]*Room),
	}
}

func (h *Hub) GetOrCreateRoom(id string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.Rooms[id]; ok {
		return room
	}
	room := NewRoom(id)
	h.Rooms[id] = room
	go room.Run()
	return room
}

// ServeWS handles websocket requests from the peer.
func ServeWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	roomId := r.URL.Query().Get("roomId")
	if roomId == "" {
		http.Error(w, "roomId is required", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	room := hub.GetOrCreateRoom(roomId)
	client := &Client{Room: room, Conn: conn, Send: make(chan []byte, 256)}
	client.Room.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
