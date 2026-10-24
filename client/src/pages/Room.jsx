import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import Canvas from '../components/Canvas';
import { WS_BASE_URL } from '../config';

const Room = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const password = location.state?.password || '';
  
  const [gameState, setGameState] = useState('lobby'); // lobby, playing, judging, finished
  const [role, setRole] = useState('teamA'); // teamA, teamB, judge
  const [serverState, setServerState] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  // Room settings state
  const [sliderTime, setSliderTime] = useState(60);
  const [sliderInk, setSliderInk] = useState(1000);
  const [sliderRounds, setSliderRounds] = useState(3);
  
  const canvasRef = useRef(null);
  const wsRef = useRef(null);

  const user = JSON.parse(localStorage.getItem('pixel_user')) || { 
    googleId: 'guest-' + Math.floor(100000 + Math.random() * 900000), 
    name: 'Guest Player', 
    avatarUrl: 'https://robohash.org/guest' 
  };

  // Sync settings from server if available
  useEffect(() => {
    if (serverState?.settings) {
      if (serverState.settings.timeLimitSeconds) {
        setSliderTime(serverState.settings.timeLimitSeconds);
      }
      if (serverState.settings.inkLimit) {
        setSliderInk(serverState.settings.inkLimit);
      }
      if (serverState.settings.maxRounds) {
        setSliderRounds(serverState.settings.maxRounds);
      }
    }
  }, [serverState?.settings?.timeLimitSeconds, serverState?.settings?.inkLimit, serverState?.settings?.maxRounds]);

  // Clean canvas whenever drawer or word transitions
  useEffect(() => {
    if (gameState === 'playing' && canvasRef.current) {
      canvasRef.current.clearCanvas();
    }
  }, [serverState?.activePlayerId, serverState?.currentWord, gameState]);

  // Establish WebSocket connection
  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout = null;

    const connect = () => {
      const wsUrl = new URL(WS_BASE_URL);
      wsUrl.searchParams.append('roomId', roomId);
      wsUrl.searchParams.append('userId', user.googleId);
      wsUrl.searchParams.append('name', user.name || 'Guest Player');
      wsUrl.searchParams.append('avatar', user.avatarUrl || 'https://robohash.org/guest');
      
      const ws = new WebSocket(wsUrl.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setIsReconnecting(false);
        ws.send(JSON.stringify({
          type: 'authenticate',
          payload: { password: password || '' }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'error':
              alert(msg.payload?.message || 'Connection error');
              navigate('/lobby');
              break;
            case 'room_terminated':
              alert(msg.payload?.reason || 'The room was terminated because the owner left.');
              navigate('/lobby');
              break;
            case 'clear_canvas':
              if (canvasRef.current) {
                canvasRef.current.clearCanvas();
              }
              break;
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
            case 'match_summary':
              // Immediately update career stats in localStorage for instant dashboard feedback
              if (msg.payload?.results) {
                const myResult = msg.payload.results[user.googleId];
                if (myResult) {
                  const currentStats = user.stats || { wins: 0, losses: 0, experience: 0, totalPoints: 0 };
                  const updatedStats = {
                    wins: (currentStats.wins || 0) + (myResult.status === 'win' ? 1 : 0),
                    losses: (currentStats.losses || 0) + (myResult.status === 'loss' ? 1 : 0),
                    experience: (currentStats.experience || 0) + (myResult.xpEarned || 0),
                    totalPoints: (currentStats.totalPoints || 0) + (myResult.pointsEarned || 0),
                    pixelsDrawn: currentStats.pixelsDrawn || 0
                  };
                  const updatedUser = { ...user, stats: updatedStats };
                  localStorage.setItem('pixel_user', JSON.stringify(updatedUser));
                }
              }
              break;
          }
        } catch (e) {
          console.error("Invalid WS message:", e);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setIsReconnecting(true);
        reconnectTimeout = setTimeout(() => {
          if (isMounted) connect();
        }, 2000);
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [roomId, password, user.googleId, user.name, user.avatarUrl]);

  // Turn Countdown Timer
  useEffect(() => {
    let timer;
    if (gameState === 'playing') {
      const initialTime = serverState?.settings?.timeLimitSeconds || 60;
      setTimeLeft(initialTime);

      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            // Automatically advance when timer expires if drawer or host
            if (serverState?.activePlayerId === user.googleId || isAdmin) {
              handleEndTurn();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimeLeft(serverState?.settings?.timeLimitSeconds || 60);
    }
    return () => clearInterval(timer);
  }, [gameState, serverState?.activePlayerId, serverState?.currentRound, serverState?.settings?.timeLimitSeconds, user.googleId]);

  // Auto redirect to dashboard at end of match
  useEffect(() => {
    let redirectTimer;
    if (gameState === 'finished') {
      redirectTimer = setTimeout(() => {
        navigate('/dashboard');
      }, 6000);
    }
    return () => clearTimeout(redirectTimer);
  }, [gameState, navigate]);

  const handleStartGame = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start_game' }));
    }
  };

  const handleUpdateSettings = (timeLimit, inkLimit, rounds) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update_settings',
        payload: {
          timeLimitSeconds: Number(timeLimit),
          inkLimit: Number(inkLimit),
          maxRounds: Number(rounds)
        }
      }));
    }
  };

  const handleSliderTimeChange = (val) => {
    const num = Number(val);
    setSliderTime(num);
    handleUpdateSettings(num, sliderInk, sliderRounds);
  };

  const handleSliderInkChange = (val) => {
    const num = Number(val);
    setSliderInk(num);
    handleUpdateSettings(sliderTime, num, sliderRounds);
  };

  const handleSliderRoundsChange = (val) => {
    const num = Number(val);
    setSliderRounds(num);
    handleUpdateSettings(sliderTime, sliderInk, num);
  };

  const handleLeaveRoom = () => {
    if (isAdmin) {
      if (window.confirm("As room host, leaving will terminate this match for all players. Are you sure?")) {
        wsRef.current?.close();
        navigate('/lobby');
      }
    } else {
      wsRef.current?.close();
      navigate('/lobby');
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

  // Host verification supports both JSON key formats
  const isAdmin = (serverState?.adminId === user.googleId) || (serverState?.AdminID === user.googleId);
  const hasJudge = (serverState?.judges || []).length > 0;
  const isDrawer = serverState?.activePlayerId === user.googleId;
  const canEndTurn = isDrawer || isAdmin;
  const maxRoundsCount = serverState?.maxRounds || serverState?.settings?.maxRounds || 3;
  const currentRoundNum = serverState?.currentRound || 1;

  return (
    <div className="app-container" style={{ padding: '1.5rem 2rem' }}>
      {/* Reconnecting Banner */}
      {isReconnecting && (
        <div style={{
          background: 'linear-gradient(90deg, #ff2247, #ff5e3a)',
          color: 'white',
          padding: '0.75rem 1.5rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          fontWeight: 800,
          boxShadow: '0 0 20px rgba(255, 34, 71, 0.5)'
        }}>
          <span className="laser-pulse">⚠️ RECONNECTING TO MATCH BUS...</span>
        </div>
      )}

      {/* Esports Header */}
      <header className="glass-panel" style={{ 
        padding: '1rem 1.5rem', 
        marginBottom: '1.5rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderLeft: '4px solid #00f0ff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', fontWeight: 800 }}>MATCH ARENA</div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>ROOM:</span>
              <span style={{ color: '#00f0ff', textShadow: '0 0 10px rgba(0,240,255,0.4)' }}>{roomId}</span>
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge-live">
              {gameState === 'lobby' ? 'LOBBY' : gameState === 'playing' ? `ROUND ${currentRoundNum}/${maxRoundsCount}` : gameState.toUpperCase()}
            </span>
            {isAdmin && <span className="badge-tag" style={{ background: 'rgba(255, 208, 0, 0.15)', color: '#ffd000', border: '1px solid rgba(255, 208, 0, 0.4)' }}>HOST</span>}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {gameState === 'lobby' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8' }}>ROLE:</span>
                <select 
                  className="btn btn-secondary" 
                  value={role} 
                  onChange={handleRoleChange}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                >
                  <option value="teamA">Team Alpha (Blue)</option>
                  <option value="teamB">Team Beta (Red)</option>
                  <option value="judge">Judge (Referee)</option>
                </select>
              </div>

              {isAdmin && (
                <button 
                  className="btn btn-primary" 
                  onClick={handleStartGame}
                  disabled={!hasJudge}
                  style={{ opacity: hasJudge ? 1 : 0.5, cursor: hasJudge ? 'pointer' : 'not-allowed' }}
                  title={!hasJudge ? "Match cannot start without at least 1 Judge" : "Launch Arena Match"}
                >
                  {hasJudge ? '⚔️ Launch Match' : '⚠️ Need 1 Judge'}
                </button>
              )}
            </>
          )}

          <button 
            className="btn btn-secondary" 
            onClick={handleLeaveRoom}
            style={{ 
              background: 'rgba(255, 34, 71, 0.1)', 
              borderColor: 'rgba(255, 34, 71, 0.3)', 
              color: '#ff3366' 
            }}
          >
            {isAdmin ? 'Terminate Room' : 'Exit Room'}
          </button>
        </div>
      </header>

      {/* Arena Grid */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        
        {/* Team Rosters Sidebar */}
        <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Team Alpha Card */}
          <div className="glass-panel" style={{ 
            padding: '1.2rem', 
            borderLeft: serverState?.activeTeam === 'teamA' && gameState === 'playing' ? '4px solid #00f0ff' : '1px solid var(--glass-border)',
            boxShadow: serverState?.activeTeam === 'teamA' && gameState === 'playing' ? '0 0 20px rgba(0, 240, 255, 0.25)' : 'none'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00f0ff', boxShadow: '0 0 8px #00f0ff' }}></span>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#00f0ff' }}>TEAM ALPHA</h3>
              </div>
              <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#f8fafc' }}>
                {serverState?.scores?.teamA || 0} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>PTS</span>
              </span>
            </div>
            {serverState?.activeTeam === 'teamA' && gameState === 'playing' && (
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#00f0ff', marginBottom: '0.5rem', letterSpacing: '0.5px' }}>
                ✏️ CURRENTLY DRAWING
              </div>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {(serverState?.teamA || []).length === 0 && <li style={{ color: '#64748b', fontSize: '0.85rem' }}>No players joined yet</li>}
              {(serverState?.teamA || []).map((player) => (
                <li key={player.userId} style={{ 
                  padding: '0.45rem 0.65rem', 
                  background: player.userId === serverState?.activePlayerId ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255,255,255,0.03)', 
                  border: player.userId === serverState?.activePlayerId ? '1px solid #00f0ff' : '1px solid transparent',
                  borderRadius: '6px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.6rem' 
                }}>
                  <img src={player.avatar} alt="avatar" style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: player.userId === serverState?.activePlayerId ? '#00f0ff' : '#f8fafc' }}>
                    {player.name}
                  </span>
                  {player.userId === serverState?.activePlayerId && (
                    <span className="badge-tag" style={{ marginLeft: 'auto', background: '#00f0ff', color: '#000' }}>DRAWER</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Team Beta Card */}
          <div className="glass-panel" style={{ 
            padding: '1.2rem', 
            borderLeft: serverState?.activeTeam === 'teamB' && gameState === 'playing' ? '4px solid #ff3366' : '1px solid var(--glass-border)',
            boxShadow: serverState?.activeTeam === 'teamB' && gameState === 'playing' ? '0 0 20px rgba(255, 51, 102, 0.25)' : 'none'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff3366', boxShadow: '0 0 8px #ff3366' }}></span>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#ff3366' }}>TEAM BETA</h3>
              </div>
              <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#f8fafc' }}>
                {serverState?.scores?.teamB || 0} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>PTS</span>
              </span>
            </div>
            {serverState?.activeTeam === 'teamB' && gameState === 'playing' && (
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ff3366', marginBottom: '0.5rem', letterSpacing: '0.5px' }}>
                ✏️ CURRENTLY DRAWING
              </div>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {(serverState?.teamB || []).length === 0 && <li style={{ color: '#64748b', fontSize: '0.85rem' }}>No players joined yet</li>}
              {(serverState?.teamB || []).map((player) => (
                <li key={player.userId} style={{ 
                  padding: '0.45rem 0.65rem', 
                  background: player.userId === serverState?.activePlayerId ? 'rgba(255, 51, 102, 0.15)' : 'rgba(255,255,255,0.03)', 
                  border: player.userId === serverState?.activePlayerId ? '1px solid #ff3366' : '1px solid transparent',
                  borderRadius: '6px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.6rem' 
                }}>
                  <img src={player.avatar} alt="avatar" style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: player.userId === serverState?.activePlayerId ? '#ff3366' : '#f8fafc' }}>
                    {player.name}
                  </span>
                  {player.userId === serverState?.activePlayerId && (
                    <span className="badge-tag" style={{ marginLeft: 'auto', background: '#ff3366', color: '#fff' }}>DRAWER</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Judges Booth Card */}
          <div className="glass-panel" style={{ padding: '1.2rem', borderLeft: '4px solid #ffd000' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ffd000', boxShadow: '0 0 8px #ffd000' }}></span>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#ffd000' }}>JUDGES BOOTH</h3>
              </div>
              <span className="badge-tag" style={{ background: 'rgba(255,208,0,0.15)', color: '#ffd000' }}>
                {(serverState?.judges || []).length} REFEREE
              </span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {(serverState?.judges || []).length === 0 && (
                <li style={{ color: '#ffd000', fontSize: '0.8rem', background: 'rgba(255,208,0,0.1)', padding: '0.4rem', borderRadius: '4px' }}>
                  ⚠️ At least 1 Judge is needed to begin
                </li>
              )}
              {(serverState?.judges || []).map((player) => (
                <li key={player.userId} style={{ padding: '0.45rem 0.65rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <img src={player.avatar} alt="avatar" style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid #ffd000' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{player.name}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Central Arena Main Canvas Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          {gameState === 'lobby' ? (
            <div className="glass-panel" style={{ width: '100%', padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎮</div>
              <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>MATCH LOBBY</h2>
              <p style={{ color: '#94a3b8', maxWidth: '500px', marginBottom: '2rem', fontSize: '0.9rem' }}>
                {isAdmin 
                  ? 'Configure match rules, round robin rotation, and words below. When ready, launch the arena.' 
                  : 'Waiting for room host to launch the match. Pick your team or step in as Judge!'}
              </p>

              {isAdmin ? (
                <div style={{ 
                  background: 'rgba(7, 9, 14, 0.65)', 
                  border: '1px solid rgba(0, 240, 255, 0.25)', 
                  padding: '1.5rem', 
                  borderRadius: '12px', 
                  width: '100%', 
                  maxWidth: '460px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '1.25rem',
                  textAlign: 'left'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: '#00f0ff', fontSize: '1rem', letterSpacing: '0.5px' }}>
                      ⚙️ HOST MATCH CONTROLS
                    </h3>
                    <span className="badge-tag" style={{ background: '#00f0ff', color: '#000' }}>ADMIN ONLY</span>
                  </div>

                  {/* Total Rounds Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                      <span style={{ color: '#94a3b8' }}>Total Match Rounds (Words):</span>
                      <strong style={{ color: '#00f0ff' }}>{sliderRounds} Rounds</strong>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      step="1"
                      value={sliderRounds} 
                      onChange={(e) => handleSliderRoundsChange(e.target.value)}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
                      Each round consists of 1 word for Team Alpha and 1 word for Team Beta in round robin.
                    </div>
                  </div>

                  {/* Turn Time Limit */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                      <span style={{ color: '#94a3b8' }}>Turn Time Limit:</span>
                      <strong style={{ color: '#00f0ff' }}>{sliderTime} Seconds</strong>
                    </div>
                    <input 
                      type="range" 
                      min="15" 
                      max="120" 
                      step="5"
                      value={sliderTime} 
                      onChange={(e) => handleSliderTimeChange(e.target.value)}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Ink Limit */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                      <span style={{ color: '#94a3b8' }}>Ink Allowed per Turn:</span>
                      <strong style={{ color: '#00f0ff' }}>{sliderInk} Pixels</strong>
                    </div>
                    <input 
                      type="range" 
                      min="400" 
                      max="3000" 
                      step="100"
                      value={sliderInk} 
                      onChange={(e) => handleSliderInkChange(e.target.value)}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Launch Button */}
                  <button 
                    className="btn btn-primary" 
                    style={{ 
                      marginTop: '0.5rem', 
                      width: '100%', 
                      padding: '0.85rem',
                      opacity: hasJudge ? 1 : 0.5,
                      cursor: hasJudge ? 'pointer' : 'not-allowed'
                    }} 
                    onClick={handleStartGame}
                    disabled={!hasJudge}
                  >
                    {hasJudge ? '🚀 Launch Match Now' : '⚠️ Match Requires 1 Judge'}
                  </button>
                  {!hasJudge && (
                    <div style={{ background: 'rgba(255, 208, 0, 0.1)', border: '1px solid rgba(255, 208, 0, 0.3)', borderRadius: '6px', padding: '0.5rem', fontSize: '0.75rem', color: '#ffd000', textAlign: 'center' }}>
                      Ask a player to select the <strong>Judge</strong> role from the top menu.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.2rem 2rem', borderRadius: '8px', display: 'flex', gap: '2rem' }}>
                  <span>🎯 Rounds: <strong>{maxRoundsCount}</strong></span>
                  <span>⏳ Turn Time: <strong>{serverState?.settings?.timeLimitSeconds || 60}s</strong></span>
                  <span>🎨 Ink Pool: <strong>{serverState?.settings?.inkLimit || 1000}px</strong></span>
                </div>
              )}
            </div>
          ) : gameState === 'playing' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              
              {/* Active Match Banner */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                width: '100%', 
                maxWidth: '512px', 
                marginBottom: '1rem',
                background: 'rgba(13, 17, 24, 0.8)',
                padding: '0.75rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800 }}>ROUND {currentRoundNum} OF {maxRoundsCount}</div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: isDrawer ? '#00ff88' : '#00f0ff' }}>
                    {isDrawer ? `SECRET WORD: ${serverState?.currentWord}` : `${serverState?.activeTeam === 'teamA' ? 'Team Alpha' : 'Team Beta'} is Drawing...`}
                  </h3>
                </div>

                <div style={{ 
                  padding: '0.4rem 0.9rem', 
                  background: timeLeft <= 10 ? 'rgba(255, 34, 71, 0.2)' : 'rgba(0, 240, 255, 0.1)', 
                  border: timeLeft <= 10 ? '1px solid #ff2247' : '1px solid rgba(0, 240, 255, 0.3)',
                  borderRadius: '20px', 
                  fontWeight: 900,
                  fontSize: '1rem',
                  color: timeLeft <= 10 ? '#ff2247' : '#00f0ff'
                }}>
                  ⏳ {timeLeft}s
                </div>
              </div>

              {/* Canvas Component */}
              <Canvas 
                ref={canvasRef}
                isMyTurn={isDrawer} 
                onPixelDraw={handlePixelDraw} 
                onEndTurn={handleEndTurn}
                pixelsPerTurn={serverState?.settings?.inkLimit || 1000}
              />
              
              {/* Action Controls */}
              <div style={{ marginTop: '1.25rem', width: '100%', maxWidth: '512px', display: 'flex', gap: '1rem' }}>
                {canEndTurn && (
                  <button 
                    className="btn btn-primary" 
                    style={{ flex: 1, padding: '0.85rem' }}
                    onClick={handleEndTurn}
                  >
                    ⚡ Finish Drawing Early
                  </button>
                )}
              </div>
            </div>
          ) : gameState === 'judging' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              
              <div className="glass-panel" style={{ width: '100%', maxWidth: '512px', padding: '1.2rem', marginBottom: '1rem', textAlign: 'center', borderLeft: '4px solid #ffd000' }}>
                <span className="badge-tag" style={{ background: '#ffd000', color: '#000', marginBottom: '0.5rem' }}>JUDGING STAGE</span>
                <h2 style={{ margin: '0.2rem 0', fontSize: '1.25rem' }}>
                  Target Word: <span style={{ color: '#ffd000', letterSpacing: '1px' }}>{serverState?.currentWord}</span>
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  Review the artwork below and award points (1 to 10) based on accuracy.
                </div>
              </div>

              {/* Keep Canvas visible in read-only mode so judges & players see the drawing! */}
              <Canvas 
                ref={canvasRef}
                isMyTurn={false}
                pixelsPerTurn={serverState?.settings?.inkLimit || 1000}
              />

              {/* Scoring Panel */}
              <div className="glass-panel" style={{ width: '100%', maxWidth: '512px', marginTop: '1rem', padding: '1.25rem', textAlign: 'center' }}>
                {(role === 'judge' || isAdmin) ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffd000' }}>
                        {role === 'judge' ? '⭐️ SUBMIT OFFICIAL SCORE:' : '⭐️ HOST / QUICK SCORE:'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>(1 = Poor, 10 = Masterpiece)</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                        <button 
                          key={num} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.65rem 0', fontWeight: 900, fontSize: '1rem' }}
                          onClick={() => handleSubmitScore(num)}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem', padding: '0.5rem' }}>
                    <span className="laser-pulse">⏳ Waiting for Referee Judge to score the drawing...</span>
                  </div>
                )}
              </div>
            </div>
          ) : gameState === 'finished' ? (
            <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏆</div>
              <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: '#00f0ff' }}>MATCH COMPLETED</h1>
              {(() => {
                const teamAScore = serverState?.scores?.teamA || 0;
                const teamBScore = serverState?.scores?.teamB || 0;
                let outcome = 'TIE MATCH';
                let outcomeColor = '#ffd000';

                if (teamAScore > teamBScore) {
                  outcome = role === 'teamA' ? 'VICTORY!' : 'DEFEAT';
                  outcomeColor = role === 'teamA' ? '#00ff88' : '#ff3366';
                } else if (teamBScore > teamAScore) {
                  outcome = role === 'teamB' ? 'VICTORY!' : 'DEFEAT';
                  outcomeColor = role === 'teamB' ? '#00ff88' : '#ff3366';
                }
                if (role === 'judge') {
                  outcome = 'MATCH ADJUDICATED!';
                  outcomeColor = '#ffd000';
                }

                return (
                  <>
                    <h2 style={{ fontSize: '2rem', color: outcomeColor, margin: '1rem 0' }}>
                      {outcome}
                    </h2>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      gap: '2rem', 
                      margin: '1.5rem 0',
                      background: 'rgba(255,255,255,0.03)',
                      padding: '1rem',
                      borderRadius: '8px'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#00f0ff' }}>TEAM ALPHA</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{teamAScore}</div>
                      </div>
                      <div style={{ fontSize: '1.8rem', color: '#64748b' }}>VS</div>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#ff3366' }}>TEAM BETA</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{teamBScore}</div>
                      </div>
                    </div>
                    <p style={{ color: '#00f0ff', fontSize: '0.9rem', marginTop: '1.5rem' }}>
                      Stats updated! Redirecting to Career Dashboard in a few seconds...
                    </p>
                  </>
                );
              })()}
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
};

export default Room;