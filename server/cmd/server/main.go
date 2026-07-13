package main // "package main" is special. It tells the Go compiler that this is a runnable program, not just a library.

import (
	"context" // Used for timeout management when connecting to MongoDB.
	"log"     // Used to print status messages to the terminal.
	"math/rand" // Used to generate random numbers (e.g. for Room IDs, though handled elsewhere).
	"net/http"  // The standard Go package for HTTP servers and status codes (like http.StatusOK = 200).
	"os"        // Allows us to interact with the Operating System, like reading environment variables.
	"time"      // Used for setting delays and timeouts.

	// Third-party packages imported from GitHub
	"github.com/gin-gonic/gin" // Gin is a fast web framework for Go, very similar to Express in Node.js.
	"github.com/joho/godotenv" // godotenv loads variables from a .env file into os.Environ().

	// Internal packages we wrote for this project
	"github.com/pixel1000/server/internal/handlers"
	"github.com/pixel1000/server/internal/middlewares"
	"github.com/pixel1000/server/internal/platform/database"
	"github.com/pixel1000/server/internal/services"
	"github.com/pixel1000/server/internal/websocket"
)

// func main() is the entry point of every Go application. The program starts executing here.
func main() {
	// Initialize the random seed using the current time so our random numbers are actually random.
	rand.Seed(time.Now().UnixNano())

	// Attempt to load the .env file. If it fails (err != nil), we just print a log and move on.
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	// os.Getenv reads a variable from the terminal environment.
	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		// If it's empty, fallback to the default local MongoDB URI.
		mongoURI = "mongodb://localhost:27017"
	}
	
	// Call our platform layer to establish the MongoDB connection.
	db, client, err := database.Connect(mongoURI, "pixel1000")
	if err != nil {
		// log.Fatal prints the error and completely crashes (stops) the program.
		log.Fatal(err)
	}
	// Defer disconnecting from MongoDB until the main() function exits (when the server shuts down).
	defer client.Disconnect(context.Background())

	// DEPENDENCY INJECTION: We pass the raw database pointer into the UserService.
	userService := services.NewUserService(db)

	// DEPENDENCY INJECTION: We pass the UserService into the Handlers so they can use it without touching the database directly.
	authHandler := handlers.NewAuthHandler(userService)
	hub := websocket.NewHub(userService)

	// Create a default Gin router engine (similar to const app = express()).
	r := gin.Default()

	// Use our newly extracted CORS middleware
	r.Use(middlewares.CORSMiddleware())

	// Define a simple GET route for health checking.
	r.GET("/health", func(c *gin.Context) {
		// c.JSON formats the response as JSON. gin.H is just a shortcut for a generic JSON object map[string]any.
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Group routes under the "/api" prefix
	api := r.Group("/api")
	{
		// Public routes (anyone can hit this to get a token)
		api.POST("/auth/google", authHandler.GoogleLogin)
		
		// Protected routes (you MUST have a valid JWT token in your headers to access these)
		protected := api.Group("/user")
		protected.Use(middlewares.JWTAuthMiddleware())
		{
			protected.GET("/profile/:id", authHandler.GetUserProfile)
			protected.POST("/update/:id", authHandler.UpdateUserProfile)
		}
	}

	// Define the WebSocket route. When a user hits /ws, we upgrade them to a persistent socket.
	r.GET("/ws", func(c *gin.Context) {
		websocket.ServeWS(hub, c.Writer, c.Request)
	})

	// Check if a PORT is set in the environment, otherwise default to 8080.
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server running on port %s", port)
	
	// Start the HTTP server. This line blocks forever unless there is a fatal crash.
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}