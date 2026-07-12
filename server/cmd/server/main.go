package main

import (
	"context"
	"log"
	// "math/rand"
	"net/http"
	"os"
	// "time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"github.com/pixel1000/server/internal/handlers"
	"github.com/pixel1000/server/internal/platform/database"
	"github.com/pixel1000/server/internal/services"
	"github.com/pixel1000/server/internal/websocket"
)

func main() {

	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	// Connect to MongoDB using the platform layer
	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
	}
	
	db, client, err := database.Connect(mongoURI, "pixel1000")
	if err != nil {
		log.Fatal(err)
	}
	defer client.Disconnect(context.Background())

	// Initialize Services
	userService := services.NewUserService(db)

	// Initialize Handlers
	authHandler := handlers.NewAuthHandler(userService)
	hub := websocket.NewHub(userService)

	r := gin.Default()

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// API Routes
	api := r.Group("/api")
	{
		api.POST("/auth/google", authHandler.GoogleLogin)
		api.GET("/user/profile/:id", authHandler.GetUserProfile)
		api.POST("/user/update/:id", authHandler.UpdateUserProfile)
	}

	// WebSocket Route
	r.GET("/ws", func(c *gin.Context) {
		websocket.ServeWS(hub, c.Writer, c.Request)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server running on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}