package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/pixel1000/server/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all for development
	},
}

type Room struct {
	ID         string
	Password   string
	Clients    map[*Client]bool
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	Strokes    []models.Stroke
	State      models.GameState
	Settings   models.RoomSettings
	TeamA      []*Client
	TeamB      []*Client
	Judges     []*Client
	Scores     map[string]int
	DB         *mongo.Database
	mu         sync.Mutex // Protect state writes
}

func NewRoom(id string, db *mongo.Database) *Room {
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
		},
		Scores:  map[string]int{"teamA": 0, "teamB": 0},
		Strokes: []models.Stroke{},
		DB:      db,
	}
	return room
}

func (r *Room) GetFullState() models.GameState {
	r.mu.Lock()
	defer r.mu.Unlock()

	state := r.State
	state.TeamA = []models.PlayerInfo{}
	state.TeamB = []models.PlayerInfo{}
	state.Judges = []models.PlayerInfo{}
	state.Scores = r.Scores

	for client := range r.Clients {
		info := models.PlayerInfo{
			UserID: client.UserID,
			Name:   client.Name,
			Avatar: client.Avatar,
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

func (r *Room) BroadcastState() {
	state := r.GetFullState()
	stateBytes, _ := json.Marshal(state)
	msg, _ := json.Marshal(map[string]interface{}{
		"type":    "state_update",
		"payload": json.RawMessage(stateBytes),
	})
	
	r.mu.Lock()
	defer r.mu.Unlock()
	for client := range r.Clients {
		select {
		case client.Send <- msg:
		default:
			close(client.Send)
			delete(r.Clients, client)
		}
	}
}

func (r *Room) Run() {
	for {
		select {
		case client := <-r.Register:
			r.mu.Lock()
			r.Clients[client] = true
			
			strokesBytes, err := json.Marshal(r.Strokes)
			if err == nil {
				msgBytes, _ := json.Marshal(map[string]interface{}{
					"type": "stroke_sync",
					"payload": json.RawMessage(strokesBytes),
				})
				client.Send <- msgBytes
			}
			r.mu.Unlock()
			go r.BroadcastState()
		case client := <-r.Unregister:
			r.mu.Lock()
			if _, ok := r.Clients[client]; ok {
				delete(r.Clients, client)
				close(client.Send)
			}
			r.mu.Unlock()
			go r.BroadcastState()
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
	DB    *mongo.Database
	mu    sync.RWMutex
}

func NewHub(db *mongo.Database) *Hub {
	return &Hub{
		Rooms: make(map[string]*Room),
		DB:    db,
	}
}

func (h *Hub) GetOrCreateRoom(id string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.Rooms[id]; ok {
		return room
	}
	room := NewRoom(id, h.DB)
	h.Rooms[id] = room
	go room.Run()
	return room
}

func (r *Room) UpdateStats() {
	if r.DB == nil {
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

	coll := r.DB.Collection("users")
	opts := options.Update().SetUpsert(true)

	for client := range r.Clients {
		if client.UserID == "" || client.UserID[:6] == "guest-" {
			continue // Skip guests entirely
		}

		incFields := bson.M{}

		if client.Role == "judge" {
			// Judges just get participation XP
			incFields["stats.experience"] = 20
		} else {
			// Teams get points and win/loss stats
			won := (client.Role == winningTeam)
			incFields["stats.experience"] = 10
			incFields["stats.totalPoints"] = r.Scores[client.Role]
			
			if won {
				incFields["stats.wins"] = 1
				incFields["stats.experience"] = 50 // Bonus for winning
			} else if winningTeam != "tie" {
				incFields["stats.losses"] = 1
			}
		}

		filter := bson.M{"googleId": client.UserID}
		update := bson.M{"$inc": incFields}

		_, err := coll.UpdateOne(context.Background(), filter, update, opts)
		if err != nil {
			log.Println("Error updating stats for", client.UserID, ":", err)
		}
	}
}

func ServeWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	roomId := r.URL.Query().Get("roomId")
	userId := r.URL.Query().Get("userId")
	name := r.URL.Query().Get("name")
	avatar := r.URL.Query().Get("avatar")
	password := r.URL.Query().Get("password")
	
	if roomId == "" || userId == "" {
		http.Error(w, "roomId and userId are required", http.StatusBadRequest)
		return
	}

	room := hub.GetOrCreateRoom(roomId)
	
	room.mu.Lock()
	// Password check
	if room.Password == "" {
		// New room, set password and admin
		room.Password = password
		room.State.AdminID = userId
	} else if room.Password != password {
		room.mu.Unlock()
		http.Error(w, "invalid password", http.StatusUnauthorized)
		return
	}
	room.mu.Unlock()

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	client := &Client{
		Room:   room, 
		Conn:   conn, 
		Send:   make(chan []byte, 256), 
		UserID: userId,
		Name:   name,
		Avatar: avatar,
		Role:   "teamA", // default role
	}
	client.Room.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
