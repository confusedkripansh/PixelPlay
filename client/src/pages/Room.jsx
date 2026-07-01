import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Canvas from '../components/Canvas';

const Room = () => {
  const { roomId } = useParams();
  const [gameState, setGameState] = useState('lobby'); // lobby, playing, judging
  const [role, setRole] = useState('teamA'); // teamA, teamB, judge
  const [activePlayer, setActivePlayer] = useState('me'); // 'me' or 'other'
  const [serverState, setServerState] = useState(null);
  
  const canvasRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    // Connect to WebSocket Server
    const ws = new WebSocket(`ws://localhost:8080/ws?roomId=${roomId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'draw' && canvasRef.current) {
          canvasRef.current.drawRemotePixel(msg.payload.x, msg.payload.y, msg.payload.color);
        } else if (msg.type === 'grid_sync' && canvasRef.current) {
          canvasRef.current.syncFullGrid(msg.payload);
        } else if (msg.type === 'state_update') {
          setServerState(msg.payload);
          setGameState(msg.payload.Status);
        }
      } catch (e) {
        console.error("Invalid WS message:", e);
      }
    };

    return () => {
      ws.close();
    };
  }, [roomId]);

  const handleStartGame = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start_game' }));
    }
  };

  const handleRoleChange = (e) => {
    const newRole = e.target.value;
    setRole(newRole);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'switch_role', payload: { role: newRole } }));
    }
  };

  const handleEndTurn = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_turn' }));
    }
  };

  const handlePixelDraw = (pixelData) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'draw',
        payload: pixelData
      }));
    }
  };

  return (
    <div className="app-container" style={{ padding: '2rem' }}>
      <header className="glass-panel" style={{ padding: '1rem 2rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Room: <span style={{ color: 'var(--accent-primary)' }}>{roomId}</span></h2>
          <span style={{ color: 'var(--text-secondary)' }}>Status: {gameState.toUpperCase()}</span>
        </div>
        
        {gameState === 'lobby' && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Switch Role:</span>
            <select 
              className="btn btn-secondary" 
              value={role} 
              onChange={handleRoleChange}
              style={{ background: 'rgba(0,0,0,0.2)' }}
            >
              <option value="teamA">Team A</option>
              <option value="teamB">Team B</option>
              <option value="judge">Judge</option>
            </select>
            <button className="btn btn-primary" onClick={handleStartGame}>
              Start Game
            </button>
          </div>
        )}
      </header>

      <div style={{ display: 'flex', gap: '2rem' }}>
        {/* Sidebar */}
        <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }}>Team A {serverState?.ActiveTeam === 'teamA' && '(Drawing)'}</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', borderLeft: serverState?.ActiveTeam === 'teamA' ? '4px solid var(--accent-success)' : 'none' }}>
                Player One (Active)
              </li>
              <li style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>Player Two</li>
            </ul>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: 'var(--accent-secondary)', marginBottom: '1rem' }}>Team B {serverState?.ActiveTeam === 'teamB' && '(Drawing)'}</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>Player Three</li>
              <li style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>Player Four</li>
            </ul>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#f59e0b', marginBottom: '1rem' }}>Judges</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li style={{ padding: '0.5rem' }}>Judge 1</li>
              <li style={{ padding: '0.5rem' }}>Judge 2</li>
            </ul>
          </div>
        </div>

        {/* Main Area */}
        <div style={{ flex: '3', display: 'flex', flexDirection: 'column' }}>
          {gameState === 'lobby' ? (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <h2>Waiting for players...</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>The admin will start the game when everyone is ready.</p>
            </div>
          ) : gameState === 'playing' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 style={{ marginBottom: '1rem' }}>
                {role === serverState?.ActiveTeam ? `Draw: ${serverState?.CurrentWord || 'Unknown'}` : `${serverState?.ActiveTeam || 'Someone'} is drawing...`}
              </h2>
              <Canvas 
                ref={canvasRef}
                isMyTurn={role === serverState?.ActiveTeam && activePlayer === 'me'} 
                onPixelDraw={handlePixelDraw} 
                onEndTurn={handleEndTurn}
              />
              
              <button 
                className="btn btn-primary" 
                style={{ marginTop: '2rem' }}
                onClick={handleEndTurn}
              >
                Simulate Finish Drawing
              </button>
            </div>
          ) : (
            <div className="glass-panel" style={{ flex: 1, padding: '3rem', textAlign: 'center' }}>
              <h2 style={{ marginBottom: '2rem', color: 'var(--accent-primary)' }}>Judging Phase</h2>
              <h3>The word was: <span style={{ fontSize: '2rem', letterSpacing: '2px' }}>APPLE</span></h3>
              
              {role === 'judge' ? (
                <div style={{ marginTop: '3rem' }}>
                  <p style={{ marginBottom: '1rem' }}>Rate the drawing similarity (1-10):</p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                      <button key={num} className="btn btn-secondary" style={{ padding: '1rem' }}>{num}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ marginTop: '3rem', color: 'var(--text-secondary)' }}>Waiting for judges to submit their scores...</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Room;
