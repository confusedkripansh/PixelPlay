package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type UserStats struct {
	Wins        int `bson:"wins" json:"wins"`
	Losses      int `bson:"losses" json:"losses"`
	Experience  int `bson:"experience" json:"experience"`
	TotalPoints int `bson:"totalPoints" json:"totalPoints"`
	PixelsDrawn int `bson:"pixelsDrawn" json:"pixelsDrawn"`
}

type User struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	GoogleID  string             `bson:"googleId" json:"googleId"`
	Name      string             `bson:"name" json:"name"`
	AvatarURL string             `bson:"avatarUrl" json:"avatarUrl"`
	Stats     UserStats          `bson:"stats" json:"stats"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
}
