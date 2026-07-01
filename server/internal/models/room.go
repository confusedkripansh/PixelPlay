package models

type RoomSettings struct {
	MaxRounds        int    `json:"maxRounds"`
	Mode             string `json:"mode"` // "time_limit" or "round_limit"
	TimeLimitSeconds int    `json:"timeLimitSeconds"`
	PixelsPerTurn    int    `json:"pixelsPerTurn"`
}

type GameState struct {
	Status         string `json:"status"` // "lobby", "drawing", "judging", "finished"
	CurrentRound   int    `json:"currentRound"`
	ActiveTeam     string `json:"activeTeam"` // "A" or "B"
	ActivePlayerID string `json:"activePlayerId"`
	CurrentWord    string `json:"currentWord,omitempty"`
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
			PixelsPerTurn:    3,
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
