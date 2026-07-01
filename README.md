# PixelPlay: Real-Time Multiplayer Pixel Art Game

PixelPlay is a real-time multiplayer drawing game where two teams battle it out on a 256x256 grid. Players take turns drawing pixels to construct a given word, while judges score the final piece!

## 🚀 Tech Stack
- **Frontend**: React.js (Vite), Vanilla CSS (Glassmorphism & Dark Mode)
- **Backend**: Golang, Gin Web Framework, Gorilla WebSockets
- **Database**: MongoDB (User profiles and statistics)
- **Authentication**: Google OAuth 2.0 Sign-In

---

## 🎮 Features
- **Real-Time WebSockets**: Ultra-low latency synchronization. When a player draws a pixel, the Go server instantly routes it to all other players in the room.
- **In-Memory Grid State**: The 256x256 grid is stored directly in the Go server's RAM. If a player disconnects or joins late, they receive the full canvas state instantly upon joining.
- **Persistent Profiles**: Logging in via Google automatically creates or updates your profile in MongoDB, tracking your total Wins, Losses, and Experience Points (XP) across all games.
- **Dynamic Roles**: Unrestricted lobby system where users can instantly switch between Team A, Team B, or Judge roles without needing permission.
- **Game State Machine**: Automated room progression from the `Lobby` -> `Playing Phase` (Drawing) -> `Judging Phase`.

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
