package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/pixel1000/server/internal/services"
)

type AuthHandler struct {
	userService services.UserService
}

func NewAuthHandler(userService services.UserService) *AuthHandler {
	return &AuthHandler{userService: userService}
}

type LoginRequest struct {
	Token      string `json:"token"`
	InGameName string `json:"inGameName"`
}

func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

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

	user, err := h.userService.UpsertGoogleUser(context.Background(), googleId, name, avatarUrl)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"user":   user,
		"token":  "dummy-jwt-for-prototype",
	})
}

func (h *AuthHandler) GetUserProfile(c *gin.Context) {
	googleId := c.Param("id")
	if googleId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing user ID"})
		return
	}

	user, err := h.userService.GetUserProfile(context.Background(), googleId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

func (h *AuthHandler) UpdateUserProfile(c *gin.Context) {
	googleId := c.Param("id")
	if googleId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing user ID"})
		return
	}

	var req struct {
		Name      string `json:"name"`
		AvatarURL string `json:"avatarUrl"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.userService.UpdateUserProfile(context.Background(), googleId, req.Name, req.AvatarURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}
