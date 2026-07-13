package database // "package" is how Go groups related files together. Every Go file must start with a package declaration.

import (
	"context" // "context" allows us to set deadlines, cancel signals, and track request lifespans across functions.
	"log"     // "log" is a standard library for printing formatted text to the terminal.
	"time"    // "time" allows us to measure durations (like 10 seconds).

	"go.mongodb.org/mongo-driver/mongo"         // The official MongoDB driver for Go.
	"go.mongodb.org/mongo-driver/mongo/options" // Allows us to configure MongoDB connection settings.
)

// Connect is a function. In Go, if a function name starts with a Capital Letter, it is "Exported" (public), 
// meaning other files (like main.go) can use it.
// It returns three things: a pointer (*) to the Database, a pointer to the Client, and an error.
func Connect(uri string, dbName string) (*mongo.Database, *mongo.Client, error) {
	
	// context.WithTimeout creates a timer. If connecting to the DB takes longer than 10 seconds, it cancels the attempt.
	// := is the "short variable declaration" operator. It creates variables without needing to specify their type (Go infers it).
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	
	// "defer" is a powerful Go keyword. It schedules the "cancel()" function to run at the exact moment Connect() finishes.
	// This ensures our 10-second timer is cleaned up from memory no matter what happens.
	defer cancel()

	// mongo.Connect dials the internet to reach MongoDB. It returns the client connection pool, or an error.
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	
	// Go doesn't use try/catch blocks. Instead, we explicitly check if the error is "not nil" (meaning it exists).
	if err != nil {
		// If there is an error, we return "nil" (null) for the Database and Client, and return the error.
		return nil, nil, err
	}

	// The client is connected to the server. Now we select the specific database (e.g. "pixel1000").
	db := client.Database(dbName)
	
	// Print a success message to the terminal.
	log.Println("Connected to MongoDB database:", dbName)

	// Return the database, the client, and "nil" for the error (meaning success!).
	return db, client, nil
}
