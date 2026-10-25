package services

import (
	"context"
	"time"

	"github.com/pixel1000/server/internal/models"
	"go.mongodb.org/mongo-driver/bson" // bson is "Binary JSON". It is how MongoDB stores data under the hood.
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// UserService is an Interface. Interfaces act as a strict contract.
// Any Struct that claims to be a "UserService" MUST have these exact four functions.
// This is powerful because we can swap out a MongoDB UserService for a PostgreSQL UserService later, 
// and as long as they both meet this contract, the rest of the app won't care!
type UserService interface {
	UpsertGoogleUser(ctx context.Context, googleId, name, avatarUrl string) (*models.User, error)
	GetUserProfile(ctx context.Context, googleId string) (*models.User, error)
	UpdateUserProfile(ctx context.Context, googleId, name, avatarUrl string) error
	UpdateGameStats(ctx context.Context, googleId string, status string, points int) error
	QueueGameStatsUpdate(googleId string, status string, points int)
}

// userService is a Struct. Go does not have "classes". Structs are how we define objects.
// Note the lowercase 'u'. In Go, lowercase means it is "Private" (hidden from other packages).
// The only way other packages can use this struct is through the public interface above.
type userService struct {
	db     *mongo.Database // A pointer to the MongoDB database object.
	worker *StatsWorkerPool // Asynchronous worker pool for high-concurrency writes.
}

// NewUserService is a constructor function. It takes the database pointer and returns the Interface.
func NewUserService(db *mongo.Database) UserService {
	svc := &userService{
		db:     db,
		worker: NewStatsWorkerPool(10000, 10), // Buffer of 10k jobs, 10 concurrent DB writers
	}
	svc.worker.Start(svc)
	return svc
}

// QueueGameStatsUpdate pushes stat updates to the async worker pool without blocking the caller.
func (s *userService) QueueGameStatsUpdate(googleId string, status string, points int) {
	if s.worker != nil {
		s.worker.Enqueue(StatUpdateJob{
			GoogleID: googleId,
			Status:   status,
			Points:   points,
		})
	}
}

// "func (s *userService)" is a Receiver. This means UpsertGoogleUser is a method attached to the userService struct,
// similar to defining a method inside a Class in JavaScript. "s" is like "this" in JavaScript.
func (s *userService) UpsertGoogleUser(ctx context.Context, googleId, name, avatarUrl string) (*models.User, error) {
	collection := s.db.Collection("users")
	filter := bson.M{"googleId": googleId}

	// 1. Check if user already exists in DB
	var existing models.User
	err := collection.FindOne(ctx, filter).Decode(&existing)
	if err == nil {
		// User already exists! PRESERVE their custom edited name and avatar so logout/login never resets it!
		if existing.Name != "" {
			return &existing, nil
		}
	}

	// 2. New user or empty profile: insert initial profile from Google
	update := bson.M{
		"$setOnInsert": bson.M{
			"name":      name,
			"avatarUrl": avatarUrl,
			"stats": models.UserStats{
				Wins:        0,
				Losses:      0,
				Experience:  0,
				TotalPoints: 0,
			},
			"createdAt": time.Now(),
		},
	}
	opts := options.Update().SetUpsert(true)
	_, err = collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		return nil, err
	}

	var user models.User
	err = collection.FindOne(ctx, filter).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *userService) GetUserProfile(ctx context.Context, googleId string) (*models.User, error) {
	var user models.User
	// Simple lookup by googleId.
	err := s.db.Collection("users").FindOne(ctx, bson.M{"googleId": googleId}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *userService) UpdateUserProfile(ctx context.Context, googleId, name, avatarUrl string) error {
	opts := options.Update().SetUpsert(true)
	update := bson.M{
		"$set": bson.M{
			"name":      name,
			"avatarUrl": avatarUrl,
		},
		"$setOnInsert": bson.M{
			"createdAt": time.Now(),
			"stats": models.UserStats{
				Wins:        0,
				Losses:      0,
				Experience:  0,
				TotalPoints: 0,
			},
		},
	}
	_, err := s.db.Collection("users").UpdateOne(ctx, bson.M{"googleId": googleId}, update, opts)
	return err
}

func (s *userService) UpdateGameStats(ctx context.Context, googleId string, status string, points int) error {
	opts := options.Update().SetUpsert(true)
	
	incFields := bson.M{}

	if status == "judge" {
		incFields["stats.experience"] = 25
	} else {
		incFields["stats.totalPoints"] = points
		
		if status == "win" {
			incFields["stats.wins"] = 1
			incFields["stats.experience"] = 50
		} else if status == "loss" {
			incFields["stats.losses"] = 1
			incFields["stats.experience"] = 10
		} else {
			// Tie outcome
			incFields["stats.experience"] = 20
		}
	}

	filter := bson.M{"googleId": googleId}
	update := bson.M{
		"$inc": incFields,
		"$setOnInsert": bson.M{
			"createdAt": time.Now(),
		},
	}

	_, err := s.db.Collection("users").UpdateOne(ctx, filter, update, opts)
	return err
}
