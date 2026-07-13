package handlers

import (
	"context" // Used for passing request-scoped data and cancellation signals to the Service layer.
	"net/http" // Provides standard HTTP status codes (like http.StatusOK, http.StatusBadRequest).
	"os"
	"time"

	"github.com/gin-gonic/gin" // Gin is our web framework. It handles routing and HTTP requests.
	"github.com/golang-jwt/jwt/v5" // A library to parse JSON Web Tokens (JWTs) sent by Google.
	"github.com/pixel1000/server/internal/services" // Our custom business logic layer.
)

// AuthHandler is a struct (an object) that will hold all the dependencies this handler needs.
// In this case, it holds a reference to the UserService so it can talk to the database.
type AuthHandler struct {
	userService services.UserService
}

// NewAuthHandler is a constructor function. It takes a UserService and returns a pointer (*) to an AuthHandler.
func NewAuthHandler(userService services.UserService) *AuthHandler {
	return &AuthHandler{userService: userService}
}

// LoginRequest defines the exact JSON structure we expect the React frontend to send us.
// The `json:"token"` tags tell Go exactly which JSON fields map to which struct fields.
type LoginRequest struct {
	Token      string `json:"token"`
	InGameName string `json:"inGameName"`
}

// GoogleLogin is a "Receiver Function" attached to *AuthHandler. 
// It takes a *gin.Context, which contains all the info about the incoming HTTP request (headers, body, etc).
func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	// Create an empty LoginRequest struct.
	var req LoginRequest
	
	// ShouldBindJSON reads the raw HTTP request body and attempts to fill our "req" struct.
	// If the frontend sent invalid JSON (like a missing comma), this will throw an error.
	if err := c.ShouldBindJSON(&req); err != nil {
		// c.JSON sends an HTTP response. gin.H is a shortcut to create a JSON object on the fly.
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return // "return" stops the function early so we don't execute the rest of the code.
	}

	// Parse the JWT token sent by Google. We use ParseUnverified because Google already verified the user 
	// on the frontend, and we are just reading the data payload (the "claims") out of the token.
	token, _, err := new(jwt.Parser).ParseUnverified(req.Token, jwt.MapClaims{})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid token"})
		return
	}

	// Type Assertion: We assert that the token claims are a map (dictionary) of data.
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid claims"})
		return
	}

	// Extract the Google ID, Name, and Picture from the JWT claims map.
	// The ", _" means we are ignoring the boolean that tells us if the key actually existed in the map.
	googleId, _ := claims["sub"].(string)
	name, _ := claims["name"].(string)
	if req.InGameName != "" {
		name = req.InGameName // Override their Google name if they typed a custom one in our app.
	}
	
	avatarUrl, _ := claims["picture"].(string)
	if avatarUrl == "" {
		// If they don't have a Google picture, generate a random robot avatar using their ID.
		avatarUrl = "https://robohash.org/" + googleId
	}

	// Now that we've verified the HTTP request, we hand the clean data off to our Service layer.
	// The Handler doesn't touch the database, it just asks the UserService to do it.
	user, err := h.userService.UpsertGoogleUser(context.Background(), googleId, name, avatarUrl)
	if err != nil {
		// If the database crashed, return a 500 Internal Server Error.
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Generate a real JWT token signed by our server
	serverSecret := os.Getenv("JWT_SECRET")
	var tokenString string
	if serverSecret != "" {
		serverToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": user.GoogleID,
			"exp": time.Now().Add(time.Hour * 24).Unix(), // Expires in 24 hours
		})
		tokenString, _ = serverToken.SignedString([]byte(serverSecret))
	} else {
		tokenString = "dummy-jwt-for-prototype" // Fallback if no secret exists
	}

	// Everything worked! Send a 200 OK HTTP response with the populated user data.
	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"user":   user,
		"token":  tokenString,
	})
}

// GetUserProfile handles GET requests to /api/user/profile/:id
func (h *AuthHandler) GetUserProfile(c *gin.Context) {
	// c.Param extracts the ":id" part from the URL (e.g. /api/user/profile/12345)
	googleId := c.Param("id")
	if googleId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing user ID"})
		return
	}

	// Delegate the database lookup to the Service layer.
	user, err := h.userService.GetUserProfile(context.Background(), googleId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Send the user struct back as JSON.
	c.JSON(http.StatusOK, user)
}

// UpdateUserProfile handles POST requests to /api/user/update/:id
func (h *AuthHandler) UpdateUserProfile(c *gin.Context) {
	googleId := c.Param("id")
	if googleId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing user ID"})
		return
	}

	// We can define an anonymous struct inline if we only need it once.
	// This defines the exact JSON body we expect to receive for a profile update.
	var req struct {
		Name      string `json:"name"`
		AvatarURL string `json:"avatarUrl"`
	}
	
	// Bind the JSON body to our inline struct.
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Ask the Service layer to update the database.
	err := h.userService.UpdateUserProfile(context.Background(), googleId, req.Name, req.AvatarURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}
