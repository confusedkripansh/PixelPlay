import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import Canvas from '../components/Canvas';

const Room = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const password = location.state?.password || '';
  
  const [gameState, setGameState] = useState('lobby'); // lobby, playing, judging
  const [role, setRole] = useState('teamA'); // teamA, teamB, judge
  const [activePlayer, setActivePlayer] = useState('me'); // 'me' or 'other'
  const [serverState, setServerState] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  
  const canvasRef = useRef(null);
  const wsRef = useRef(null);

  const user = JSON.parse(localStorage.getItem('pixel_user')) || { googleId: 'guest-' + Math.random(), name: 'Guest', avatarUrl: 'https://robohash.org/guest' };

  useEffect(() => {
    // Connect to WebSocket Server with userId, name, avatar, and password
    const wsUrl = new URL(`ws://localhost:8080/ws`);
    wsUrl.searchParams.append('roomId', roomId);
    wsUrl.searchParams.append('userId', user.googleId);
    wsUrl.searchParams.append('name', user.name || 'Guest');
    wsUrl.searchParams.append('avatar', user.avatarUrl || 'https://robohash.org/guest');
    if (password) {
      wsUrl.searchParams.append('password', password);
    }
    const ws = new WebSocket(wsUrl.toString());
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'stroke_sync':
            if (canvasRef.current && Array.isArray(msg.payload)) {
              canvasRef.current.syncFullStrokes(msg.payload);
            }
            break;
          case 'draw_stroke':
            if (canvasRef.current) {
              canvasRef.current.drawRemoteStroke(msg.payload);
            }
            break;
          case 'state_update':
            setServerState(msg.payload);
            setGameState(msg.payload.status);
            break;
        }
      } catch (e) {
        console.error("Invalid WS message:", e);
      }
    };

    return () => {
      ws.close();
    };
  }, [roomId, password, user.googleId, user.name, user.avatarUrl]);

  useEffect(() => {
    let timer;
    if (gameState === 'playing') {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            // Time is up, automatically end turn if it's my turn
            if (serverState?.activePlayerId === user.googleId) {
              handleEndTurn();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimeLeft(15);
    }
    return () => clearInterval(timer);
  }, [gameState, serverState?.activePlayerId, user.googleId]);

  useEffect(() => {
    let redirectTimer;
    if (gameState === 'finished') {
      redirectTimer = setTimeout(() => {
        navigate('/dashboard');
      }, 5000);
    }
    return () => clearTimeout(redirectTimer);
  }, [gameState, navigate]);

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

  const handlePixelDraw = (strokeData) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'draw_stroke',
        payload: strokeData
      }));
    }
  };

  const handleSubmitScore = (score) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'submit_score', payload: { score } }));
    }
  };

  const isAdmin = serverState?.AdminID === user.googleId;

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
            {isAdmin && (
              <button className="btn btn-primary" onClick={handleStartGame}>
                Start Game
              </button>
            )}
          </div>
        )}
      </header>

      <div style={{ display: 'flex', gap: '2rem' }}>
        {/* Sidebar */}
        <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }}>Team A (Score: {serverState?.scores?.teamA || 0}) {serverState?.activeTeam === 'teamA' && '(Drawing)'}</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(serverState?.teamA || []).length === 0 && <li style={{ color: 'var(--text-secondary)' }}>Waiting...</li>}
              {(serverState?.teamA || []).map((player) => (
                <li key={player.userId} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <img src={player.avatar} alt="avatar" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                  <span>{player.name} {player.userId === serverState?.activePlayerId ? '(Active)' : ''}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: 'var(--accent-secondary)', marginBottom: '1rem' }}>Team B (Score: {serverState?.scores?.teamB || 0}) {serverState?.activeTeam === 'teamB' && '(Drawing)'}</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(serverState?.teamB || []).length === 0 && <li style={{ color: 'var(--text-secondary)' }}>Waiting...</li>}
              {(serverState?.teamB || []).map((player) => (
                <li key={player.userId} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <img src={player.avatar} alt="avatar" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                  <span>{player.name} {player.userId === serverState?.activePlayerId ? '(Active)' : ''}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ color: '#f59e0b', marginBottom: '1rem' }}>Judges</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(serverState?.judges || []).length === 0 && <li style={{ color: 'var(--text-secondary)' }}>Waiting...</li>}
              {(serverState?.judges || []).map((player) => (
                <li key={player.userId} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <img src={player.avatar} alt="avatar" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                  <span>{player.name}</span>
                </li>
              ))}
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
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>
                  {serverState?.activePlayerId === user.googleId 
                    ? `Draw: ${serverState?.currentWord || 'Unknown'}` 
                    : `${serverState?.activeTeam === 'teamA' ? 'Team A' : 'Team B'} is drawing...`}
                </h2>
                <div style={{ padding: '0.5rem 1rem', background: timeLeft <= 5 ? 'var(--accent-danger)' : 'rgba(255,255,255,0.1)', borderRadius: '20px', fontWeight: 'bold' }}>
                  ⏳ {timeLeft}s
                </div>
              </div>
              <Canvas 
                ref={canvasRef}
                isMyTurn={serverState?.activePlayerId === user.googleId} 
                onPixelDraw={handlePixelDraw} 
                onEndTurn={handleEndTurn}
                pixelsPerTurn={1000}
              />
              
              <button 
                className="btn btn-primary" 
                style={{ marginTop: '2rem' }}
                onClick={handleEndTurn}
              >
                Simulate Finish Drawing
              </button>
            </div>
          ) : gameState === 'finished' ? (
            <div className="glass-panel" style={{ flex: 1, padding: '3rem', textAlign: 'center', animation: 'fadeIn 1s ease-in' }}>
              <h1 style={{ fontSize: '3rem', color: 'var(--accent-primary)', marginBottom: '1rem' }}>Match Complete!</h1>
              {(() => {
                const teamAScore = serverState?.scores?.teamA || 0;
                const teamBScore = serverState?.scores?.teamB || 0;
                const myRole = role;
                let result = '';
                if (teamAScore > teamBScore) result = myRole === 'teamA' ? 'Victory!' : 'Defeat...';
                else if (teamBScore > teamAScore) result = myRole === 'teamB' ? 'Victory!' : 'Defeat...';
                else result = 'Tie Game!';

                if (myRole === 'judge') result = 'Great Judging!';

                return (
                  <>
                    <h2 style={{ fontSize: '2.5rem', color: result.includes('Victory') ? 'var(--accent-success)' : result.includes('Defeat') ? 'var(--accent-danger)' : 'white' }}>
                      {result}
                    </h2>
                    <p style={{ marginTop: '2rem', fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
                      Final Scores: Team A ({teamAScore}) - Team B ({teamBScore})
                    </p>
                    <p style={{ marginTop: '1rem', color: 'var(--accent-secondary)' }}>
                      Redirecting to Dashboard in a moment...
                    </p>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="glass-panel" style={{ flex: 1, padding: '3rem', textAlign: 'center' }}>
              <h2 style={{ marginBottom: '2rem', color: 'var(--accent-primary)' }}>Judging Phase</h2>
              <h3>The word was: <span style={{ fontSize: '2rem', letterSpacing: '2px' }}>{serverState?.currentWord}</span></h3>
              
              {role === 'judge' ? (
                <div style={{ marginTop: '3rem' }}>
                  <p style={{ marginBottom: '1rem' }}>Rate the drawing similarity (1-10):</p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                      <button 
                        key={num} 
                        className="btn btn-secondary" 
                        style={{ padding: '1rem' }}
                        onClick={() => handleSubmitScore(num)}
                      >
                        {num}
                      </button>
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
