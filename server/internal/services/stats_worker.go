package services

import (
	"context"
	"log"
	"time"
)

// StatUpdateJob represents a single background update task for user stats.
type StatUpdateJob struct {
	GoogleID string
	Status   string
	Points   int
}

// StatsWorkerPool manages a buffered queue and worker goroutines to process
// MongoDB stats updates asynchronously. This protects MongoDB from sudden connection spikes
// when hundreds or thousands of players finish games at the exact same second.
type StatsWorkerPool struct {
	jobs        chan StatUpdateJob
	workerCount int
	stopChan    chan struct{}
}

// NewStatsWorkerPool creates and starts the asynchronous database workers.
func NewStatsWorkerPool(bufferSize, workerCount int) *StatsWorkerPool {
	pool := &StatsWorkerPool{
		jobs:        make(chan StatUpdateJob, bufferSize),
		workerCount: workerCount,
		stopChan:    make(chan struct{}),
	}
	return pool
}

// Start spawns the worker goroutines that process queued jobs against the provided UserService.
func (p *StatsWorkerPool) Start(service UserService) {
	for i := 0; i < p.workerCount; i++ {
		go func(workerID int) {
			for {
				select {
				case job := <-p.jobs:
					ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					err := service.UpdateGameStats(ctx, job.GoogleID, job.Status, job.Points)
					cancel()
					if err != nil {
						log.Printf("[Worker %d] Failed to update stats for %s: %v", workerID, job.GoogleID, err)
					}
				case <-p.stopChan:
					return
				}
			}
		}(i + 1)
	}
}

// Enqueue adds a job to the buffer. If the buffer is temporarily full,
// it falls back to a warning log rather than freezing the calling goroutine.
func (p *StatsWorkerPool) Enqueue(job StatUpdateJob) {
	select {
	case p.jobs <- job:
	default:
		log.Printf("WARN: Stats worker queue is full! Unable to enqueue stats for %s", job.GoogleID)
	}
}

// Stop signals all workers to stop.
func (p *StatsWorkerPool) Stop() {
	close(p.stopChan)
}
