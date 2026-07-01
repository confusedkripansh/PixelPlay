package auth

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/pixel1000/server/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Handler struct {
	db *mongo.Database
}

func NewHandler(db *mongo.Database) *Handler {
	return &Handler{db: db}
}

type LoginRequest struct {
	Token      string `json:"token"`
	InGameName string `json:"inGameName"`
}

func (h *Handler) GoogleLogin(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parse JWT without signature validation for prototype (Google handles the auth in the frontend)
	token, _, err := new(jwt.Parser).ParseUnverified(req.Token, jwt.MapClaims{})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid token"})
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid claims"})
		return
	}

	googleId, _ := claims["sub"].(string)
	name, _ := claims["name"].(string)
	if req.InGameName != "" {
		name = req.InGameName
	}
	avatarUrl, _ := claims["picture"].(string)
	if avatarUrl == "" {
		avatarUrl = "https://robohash.org/" + googleId
	}

	collection := h.db.Collection("users")
	
	// Upsert User
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
	_, err = collection.UpdateOne(context.Background(), filter, update, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Fetch updated user
	var user models.User
	err = collection.FindOne(context.Background(), filter).Decode(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error fetching user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"token":  req.Token,
		"user":   user,
	})
}
