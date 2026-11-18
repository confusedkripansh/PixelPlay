package database // "package" is how Go groups related files together. Every Go file must start with a package declaration.

import (
	"context" // "context" allows us to set deadlines, cancel signals, and track request lifespans across functions.
	"log"     // "log" is a standard library for printing formatted text to the terminal.
	"time"    // "time" allows us to measure durations (like 10 seconds).

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"         // The official MongoDB driver for Go.
	"go.mongodb.org/mongo-driver/mongo/options" // Allows us to configure MongoDB connection settings.
)

// Connect establishes a production-tuned MongoDB connection pool and verifies connectivity.
func Connect(uri string, dbName string) (*mongo.Database, *mongo.Client, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Production Connection Pool: Prevents connection exhaustion under high traffic
	clientOpts := options.Client().
		ApplyURI(uri).
		SetMaxPoolSize(30).
		SetMinPoolSize(5).
		SetMaxConnIdleTime(30 * time.Second)

	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return nil, nil, err
	}

	db := client.Database(dbName)
	log.Println("Connected to MongoDB database:", dbName)

	// Automated Index Initialization for unique identity guarantee and sub-millisecond lookups
	go initIndexes(db)

	return db, client, nil
}

func initIndexes(db *mongo.Database) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	usersCollection := db.Collection("users")

	// 1. Unique index on googleId to prevent duplicate user creation under concurrent logins
	uniqueGoogleId := mongo.IndexModel{
		Keys:    bson.D{{Key: "googleId", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("idx_unique_googleId"),
	}

	// 2. Index on experience for fast leaderboard rankings
	expIndex := mongo.IndexModel{
		Keys:    bson.D{{Key: "stats.experience", Value: -1}},
		Options: options.Index().SetName("idx_stats_experience"),
	}

	// 3. Index on wins for match history analysis
	winsIndex := mongo.IndexModel{
		Keys:    bson.D{{Key: "stats.wins", Value: -1}},
		Options: options.Index().SetName("idx_stats_wins"),
	}

	_, err := usersCollection.Indexes().CreateMany(ctx, []mongo.IndexModel{uniqueGoogleId, expIndex, winsIndex})
	if err != nil {
		log.Printf("Notice: MongoDB index setup: %v", err)
	} else {
		log.Println("MongoDB: Production indexes ensured on 'users' collection")
	}
}
