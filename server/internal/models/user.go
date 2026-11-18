package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/bsontype"
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
	CreatedAt int64              `bson:"createdAt" json:"createdAt"` // Unix timestamp in milliseconds (e.g. 1731938181000)
}

// UnmarshalBSON guarantees seamless backward compatibility for existing records stored with BSON DateTime or int64.
func (u *User) UnmarshalBSON(data []byte) error {
	type Alias User
	var raw struct {
		Alias      `bson:",inline"`
		RawCreated bson.RawValue `bson:"createdAt"`
	}
	if err := bson.Unmarshal(data, &raw); err != nil {
		return err
	}
	*u = User(raw.Alias)

	switch raw.RawCreated.Type {
	case bsontype.Int64:
		u.CreatedAt = raw.RawCreated.Int64()
	case bsontype.Int32:
		u.CreatedAt = int64(raw.RawCreated.Int32())
	case bsontype.DateTime:
		u.CreatedAt = raw.RawCreated.DateTime() // Returns int64 Unix milliseconds
	default:
		if u.CreatedAt == 0 {
			u.CreatedAt = time.Now().UnixMilli()
		}
	}
	return nil
}
