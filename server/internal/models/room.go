package models

type RoomSettings struct {
	MaxRounds        int    `json:"maxRounds"`
	Mode             string `json:"mode"` // "time_limit" or "round_limit"
	TimeLimitSeconds int    `json:"timeLimitSeconds"`
}

type PlayerInfo struct {
	UserID string `json:"userId"`
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
}

type Stroke struct {
	X0    float64 `json:"x0"`
	Y0    float64 `json:"y0"`
	X1    float64 `json:"x1"`
	Y1    float64 `json:"y1"`
	Color string  `json:"color"`
}

type GameState struct {
	Status         string       `json:"status"` // "lobby", "drawing", "judging", "finished"
	CurrentRound   int          `json:"currentRound"`
	ActiveTeam     string       `json:"activeTeam"` // "A" or "B"
	ActivePlayerID string       `json:"activePlayerId"`
	CurrentWord    string       `json:"currentWord,omitempty"`
	AdminID        string       `json:"AdminID,omitempty"`
	TeamA          []PlayerInfo   `json:"teamA"`
	TeamB          []PlayerInfo   `json:"teamB"`
	Judges         []PlayerInfo   `json:"judges"`
	Scores         map[string]int `json:"scores"`
}

type Room struct {
	RoomID   string       `json:"roomId"`
	Password string       `json:"-"` // Omit from JSON for security
	AdminID  string       `json:"adminId"`
	Settings RoomSettings `json:"settings"`
	State    GameState    `json:"gameState"`
	TeamA    []string     `json:"teamA"`
	TeamB    []string     `json:"teamB"`
	Judges   []string     `json:"judges"`
	Scores   map[string]int `json:"scores"` // "teamA": score, "teamB": score
}

func NewRoom(id, password, adminId string) *Room {
	return &Room{
		RoomID:   id,
		Password: password,
		AdminID:  adminId,
		Settings: RoomSettings{
			MaxRounds:        3,
			Mode:             "round_limit",
			TimeLimitSeconds: 60,
		},
		State: GameState{
			Status:       "lobby",
			CurrentRound: 0,
		},
		TeamA:  []string{},
		TeamB:  []string{},
		Judges: []string{},
		Scores: map[string]int{"teamA": 0, "teamB": 0},
	}
}
