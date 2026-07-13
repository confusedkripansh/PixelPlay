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
}

// userService is a Struct. Go does not have "classes". Structs are how we define objects.
// Note the lowercase 'u'. In Go, lowercase means it is "Private" (hidden from other packages).
// The only way other packages can use this struct is through the public interface above.
type userService struct {
	db *mongo.Database // A pointer to the MongoDB database object.
}

// NewUserService is a constructor function. It takes the database pointer and returns the Interface.
func NewUserService(db *mongo.Database) UserService {
	return &userService{db: db}
}

// "func (s *userService)" is a Receiver. This means UpsertGoogleUser is a method attached to the userService struct,
// similar to defining a method inside a Class in JavaScript. "s" is like "this" in JavaScript.
func (s *userService) UpsertGoogleUser(ctx context.Context, googleId, name, avatarUrl string) (*models.User, error) {
	// Select the "users" collection from the database.
	collection := s.db.Collection("users")

	// bson.M is a map (dictionary). It's essentially how we write JSON in Go to query MongoDB.
	filter := bson.M{"googleId": googleId}
	
	update := bson.M{
		// $setOnInsert is a MongoDB operator. It only applies these fields if a NEW document is being created.
		// If the user already exists, it ignores this, so we don't accidentally reset their stats to 0!
		"$setOnInsert": bson.M{
			"stats": models.UserStats{
				Wins:        0,
				Losses:      0,
				Experience:  0,
				TotalPoints: 0,
			},
			"createdAt": time.Now(),
		},
		// $set is a MongoDB operator that always updates these fields, even if the user exists.
		// We always update the name and avatar in case they changed it on their Google account recently.
		"$set": bson.M{
			"name":      name,
			"avatarUrl": avatarUrl,
		},
	}
	
	// SetUpsert(true) tells MongoDB: "If you can't find a user with this filter, create one using the update data."
	opts := options.Update().SetUpsert(true)
	
	// Execute the update query.
	_, err := collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		return nil, err
	}

	// Create an empty models.User struct to hold the data we are about to fetch.
	var user models.User
	// Find the user we just updated, and Decode (convert) the BSON data directly into our Go struct.
	err = collection.FindOne(ctx, filter).Decode(&user)
	if err != nil {
		return nil, err
	}

	// Return a pointer to the populated user struct, and nil for the error.
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
	update := bson.M{
		"$set": bson.M{
			"name":      name,
			"avatarUrl": avatarUrl,
		},
	}
	// We use UpdateOne. The underscore "_" means we are ignoring the first return value (the update result summary),
	// because we only care if there was an error.
	_, err := s.db.Collection("users").UpdateOne(ctx, bson.M{"googleId": googleId}, update)
	return err
}

func (s *userService) UpdateGameStats(ctx context.Context, googleId string, status string, points int) error {
	opts := options.Update().SetUpsert(true)
	
	// Create an empty bson.M map to hold the fields we want to mathematically increment.
	incFields := bson.M{}

	if status == "judge" {
		// Judges just get 20 participation XP.
		incFields["stats.experience"] = 20
	} else {
		// Teams get 10 XP for participating, and we add their round points to their totalPoints.
		incFields["stats.experience"] = 10
		incFields["stats.totalPoints"] = points
		
		if status == "win" {
			// $inc will ADD 1 to wins, rather than replacing the value.
			incFields["stats.wins"] = 1
			incFields["stats.experience"] = 50 // Bonus XP for winning
		} else if status == "loss" {
			incFields["stats.losses"] = 1
		}
	}

	filter := bson.M{"googleId": googleId}
	// The $inc operator atomically increments mathematical values in MongoDB. This prevents race conditions.
	update := bson.M{"$inc": incFields}

	_, err := s.db.Collection("users").UpdateOne(ctx, filter, update, opts)
	return err
}
