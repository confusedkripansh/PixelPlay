package services

import (
	"context"
	"time"

	"github.com/pixel1000/server/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type UserService interface {
	UpsertGoogleUser(ctx context.Context, googleId, name, avatarUrl string) (*models.User, error)
	GetUserProfile(ctx context.Context, googleId string) (*models.User, error)
	UpdateUserProfile(ctx context.Context, googleId, name, avatarUrl string) error
	UpdateGameStats(ctx context.Context, googleId string, status string, points int) error
}

type userService struct {
	db *mongo.Database
}

func NewUserService(db *mongo.Database) UserService {
	return &userService{db: db}
}

func (s *userService) UpsertGoogleUser(ctx context.Context, googleId, name, avatarUrl string) (*models.User, error) {
	collection := s.db.Collection("users")

	filter := bson.M{"googleId": googleId}
	update := bson.M{
		"$setOnInsert": bson.M{
			"stats": models.UserStats{
				Wins:        0,
				Losses:      0,
				Experience:  0,
				TotalPoints: 0,
			},
			"createdAt": time.Now(),
		},
		"$set": bson.M{
			"name":      name,
			"avatarUrl": avatarUrl,
		},
	}
	opts := options.Update().SetUpsert(true)
	
	_, err := collection.UpdateOne(ctx, filter, update, opts)
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
	err := s.db.Collection("users").FindOne(ctx, bson.M{"googleId": googleId}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *userService) UpdateUserProfile(ctx context.Context, googleId, name, avatarUrl string) error {
	update := bson.M{
		"$set": bson.M{
			"name":      name,
			"avatarUrl": avatarUrl,
		},
	}
	_, err := s.db.Collection("users").UpdateOne(ctx, bson.M{"googleId": googleId}, update)
	return err
}

func (s *userService) UpdateGameStats(ctx context.Context, googleId string, status string, points int) error {
	opts := options.Update().SetUpsert(true)
	incFields := bson.M{}

	if status == "judge" {
		incFields["stats.experience"] = 20
	} else {
		incFields["stats.experience"] = 10
		incFields["stats.totalPoints"] = points
		
		if status == "win" {
			incFields["stats.wins"] = 1
			incFields["stats.experience"] = 50
		} else if status == "loss" {
			incFields["stats.losses"] = 1
		}
	}

	filter := bson.M{"googleId": googleId}
	update := bson.M{"$inc": incFields}

	_, err := s.db.Collection("users").UpdateOne(ctx, filter, update, opts)
	return err
}
