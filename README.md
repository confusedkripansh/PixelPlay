# PixelPlay: Distributed Real-Time Multiplayer Drawing Arena

PixelPlay is a high-concurrency, real-time competitive drawing arena inspired by *Skribbl.io* and *Smash Karts*. Two teams (Team Blue vs. Team Red) take turns collaboratively drawing secret prompt words under strict time and ink limits, while independent Referees score their artwork in real time.

> 📖 **Deep Dive Documentation**: For exhaustive Low-Level Design (LLD), High-Level Architecture (HLD), Redis $O(1)$ multiplexing mechanics, scaling parameters, and 18 senior engineering interview questions, see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## 🚀 Tech Stack

- **Frontend**: React 18, Vite, HTML5 Canvas 2D API, Vanilla CSS (3D Arcade Push Aesthetic), React Router v6.
- **Backend Real-Time Cluster**: Go 1.22+, Gin Web Framework, Gorilla WebSockets.
- **Scaling & Cache Layer**: Redis 7 (Multiplexed Pub/Sub Event Bus, Pipelined Batch Stroke Lists, Room State Cache).
- **Persistence Tier**: MongoDB Atlas (Connection Pool, Automated Compound Indexes, Asynchronous Worker Pool).
- **Authentication & Security**: Google OAuth 2.0 (JWT), HMAC-SHA256 Bearer Tokens, 3–16 Character Regex Sanitization.
- **Hosting & Edge**: Vercel (Edge SPA Frontend) + Render (Containerized Go Real-Time Nodes).

---

## 🎮 Core Architectural Highlights

- **$O(1)$ Redis Pub/Sub Multiplexer**: Uses a single server-wide persistent subscription (`PSUBSCRIBE room:*:events`) across all rooms, keeping Redis connections strictly below 13 and eliminating per-room socket exhaustion.
- **Decoupled Stroke Pipeline**: Live coordinates stream to connected viewers with `<1ms` in-memory latency, while Redis storage writes (`RPUSH`) are decoupled and committed as an atomic pipelined batch when the user releases their mouse (`stroke_end`), reducing Redis write operations by **>98%**.
- **Atomic Presence Deduplication**: Seamlessly handles rapid page reloads, deduplicating connections by `UserID` and granting a 20-second reconnection grace window to preserve team roles without ghost players.
- **Asynchronous Worker Pool**: Decouples MongoDB match write operations from the WebSocket loop using a 10,000-job buffered queue processed by 10 background worker goroutines.
- **Strict Free-Tier Budgeting**: Operates within a 30MB Redis RAM limit and 20 concurrent connection ceiling while comfortably supporting **200+ active drawing rooms (~1,200 concurrent players)**.

---

## 🛠️ Prerequisites
To run this project locally on your machine, you must have the following installed:
1. **Node.js** (v18+ recommended) for running the React frontend.
2. **Go** (v1.20+ recommended) for running the backend API.
3. **MongoDB**: A running MongoDB instance on your local machine on the default port `27017`.

*(If you are on a Mac, you can start MongoDB quickly via Docker: `docker run -d -p 27017:27017 --name local-mongo mongo:latest` or via Homebrew).*

---

## 💻 Installation & Running Locally

The repository is split into two distinct parts: the `server` and the `client`. You will need to open **two separate terminal windows**.

### Step 1: Start the Go Backend Server
1. Open Terminal 1.
2. Navigate to the backend directory:
   ```bash
   cd server
   ```
3. Run the Go server:
   ```bash
   go run cmd/server/main.go
   ```
4. *You should see logs indicating a successful connection to MongoDB and that the server is running on port 8080.*

### Step 2: Start the React Frontend
1. Open Terminal 2.
2. Navigate to the frontend directory:
   ```bash
   cd client
   ```
3. Install the dependencies (if you haven't already):
   ```bash
   npm install
   ```
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
5. *The terminal will output a local link (usually `http://localhost:5173`).*

---

## 🕹️ How to Simulate a Multiplayer Game Locally

Because this is a multiplayer game, you need to simulate multiple players!

1. Open your browser and go to `http://localhost:5173`. 
2. Open a **second tab or an Incognito window** and go to `http://localhost:5173`.
3. In both windows, enter a cool In-Game Name and click the **Google Sign-In** button.
4. On the first window, click **Host New Game**. The URL will change to `/room/<RANDOM_ID>`.
5. Copy that 6-character `<RANDOM_ID>` and enter it into the "Join Room" input on the second window. Click **Join Game**.
6. You are now in the same room! 
7. Change the role dropdown in the second window to **Team B**.
8. In the first window, click **Start Game**.
9. Both screens will instantly transition to the Drawing Phase, and a random word will be generated! Test the real-time syncing by picking a color and drawing on the canvas.
