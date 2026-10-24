package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisClient wraps the official go-redis Client.
// It provides helper methods for Pub/Sub and Room State Caching across horizontally scaled servers.
type RedisClient struct {
	Client *redis.Client
}

// NewRedisClient creates and validates a connection to Redis.
// If Redis is unreachable or addr is empty, it returns nil with an error,
// allowing the server to gracefully fall back to local in-memory operation.
func NewRedisClient(addr, password string, db int) (*RedisClient, error) {
	if addr == "" {
		return nil, fmt.Errorf("redis address is empty")
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password, // No password by default
		DB:           db,       // Default DB 0
		DialTimeout:  3 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Ping verifies if the Redis server is actually alive and accepting commands.
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to redis at %s: %w", addr, err)
	}

	log.Printf("Successfully connected to Redis at %s", addr)
	return &RedisClient{Client: rdb}, nil
}

// IsAvailable checks if the Redis client is initialized and reachable.
func (r *RedisClient) IsAvailable() bool {
	return r != nil && r.Client != nil
}

// Publish broadcasts a message to a specific Redis channel.
// This is used for cross-server communication (e.g. broadcasting strokes to other server instances).
func (r *RedisClient) Publish(ctx context.Context, channel string, message interface{}) error {
	if !r.IsAvailable() {
		return nil
	}

	var data []byte
	var err error

	switch v := message.(type) {
	case []byte:
		data = v
	case string:
		data = []byte(v)
	default:
		data, err = json.Marshal(v)
		if err != nil {
			return fmt.Errorf("failed to marshal publish payload: %w", err)
		}
	}

	return r.Client.Publish(ctx, channel, data).Err()
}

// Subscribe listens to a specific Redis Pub/Sub channel.
func (r *RedisClient) Subscribe(ctx context.Context, channel string) *redis.PubSub {
	if !r.IsAvailable() {
		return nil
	}
	return r.Client.Subscribe(ctx, channel)
}

// SetRoomState caches the current room state (scores, round, current word, status) in Redis with a TTL.
func (r *RedisClient) SetRoomState(ctx context.Context, roomID string, state interface{}, ttl time.Duration) error {
	if !r.IsAvailable() {
		return nil
	}

	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("failed to marshal room state: %w", err)
	}

	key := fmt.Sprintf("room:%s:state", roomID)
	return r.Client.Set(ctx, key, data, ttl).Err()
}

// GetRoomState fetches and unmarshals the cached room state from Redis.
func (r *RedisClient) GetRoomState(ctx context.Context, roomID string, dest interface{}) error {
	if !r.IsAvailable() {
		return fmt.Errorf("redis not available")
	}

	key := fmt.Sprintf("room:%s:state", roomID)
	data, err := r.Client.Get(ctx, key).Bytes()
	if err != nil {
		return err
	}

	return json.Unmarshal(data, dest)
}

// AppendStroke pushes a newly drawn stroke to a Redis List for this room.
func (r *RedisClient) AppendStroke(ctx context.Context, roomID string, stroke interface{}) error {
	if !r.IsAvailable() {
		return nil
	}

	data, err := json.Marshal(stroke)
	if err != nil {
		return fmt.Errorf("failed to marshal stroke: %w", err)
	}

	key := fmt.Sprintf("room:%s:strokes", roomID)
	// RPUSH adds the stroke to the end of the list, preserving stroke order.
	if err := r.Client.RPush(ctx, key, data).Err(); err != nil {
		return err
	}
	// Keep strokes alive for 2 hours of inactivity
	r.Client.Expire(ctx, key, 2*time.Hour)
	return nil
}

// GetStrokes returns all strokes currently recorded for a room.
func (r *RedisClient) GetStrokes(ctx context.Context, roomID string) ([][]byte, error) {
	if !r.IsAvailable() {
		return nil, fmt.Errorf("redis not available")
	}

	key := fmt.Sprintf("room:%s:strokes", roomID)
	items, err := r.Client.LRange(ctx, key, 0, -1).Result()
	if err != nil {
		return nil, err
	}

	result := make([][]byte, len(items))
	for i, item := range items {
		result[i] = []byte(item)
	}
	return result, nil
}

// ClearRoom removes all keys (state, strokes) for a given room.
func (r *RedisClient) ClearRoom(ctx context.Context, roomID string) error {
	if !r.IsAvailable() {
		return nil
	}

	stateKey := fmt.Sprintf("room:%s:state", roomID)
	strokesKey := fmt.Sprintf("room:%s:strokes", roomID)
	_ = r.RemovePublicRoom(ctx, roomID)
	return r.Client.Del(ctx, stateKey, strokesKey).Err()
}

// SetPublicRoom stores/updates a public room's live discovery summary in Redis.
func (r *RedisClient) SetPublicRoom(ctx context.Context, roomID string, summary interface{}) error {
	if !r.IsAvailable() {
		return nil
	}
	data, err := json.Marshal(summary)
	if err != nil {
		return err
	}
	return r.Client.HSet(ctx, "rooms:public", roomID, data).Err()
}

// RemovePublicRoom removes a room from the public live discovery list.
func (r *RedisClient) RemovePublicRoom(ctx context.Context, roomID string) error {
	if !r.IsAvailable() {
		return nil
	}
	return r.Client.HDel(ctx, "rooms:public", roomID).Err()
}

// GetAllPublicRooms fetches all public rooms currently registered across all server instances.
func (r *RedisClient) GetAllPublicRooms(ctx context.Context) (map[string][]byte, error) {
	if !r.IsAvailable() {
		return nil, fmt.Errorf("redis not available")
	}
	items, err := r.Client.HGetAll(ctx, "rooms:public").Result()
	if err != nil {
		return nil, err
	}
	result := make(map[string][]byte, len(items))
	for k, v := range items {
		result[k] = []byte(v)
	}
	return result, nil
}
