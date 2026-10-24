import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import Canvas from '../components/Canvas';
import PilotAvatar from '../components/PilotAvatar';
import { 
  IconSwords, 
  IconCrown, 
  IconShield, 
  IconTimer, 
  IconBrush, 
  IconTrophy, 
  IconZap, 
  IconLogout, 
  IconSliders 
} from '../components/Icons';
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
    name: 'Guest Pilot', 
    avatarUrl: '' 
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

  // Clean canvas whenever active drawer or word transitions
  useEffect(() => {
    if (gameState === 'playing' && canvasRef.current) {
      canvasRef.current.clearCanvas();
    }
  }, [serverState?.activePlayerId, serverState?.currentWord, gameState]);

  // Establish WebSocket connection
  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout = null;

    const handleIncomingWsMessage = (msg) => {
      switch (msg.type) {
        case 'error':
          alert(msg.payload?.message || 'Connection error');
          navigate('/lobby');
          break;
        case 'room_terminated':
          alert(msg.payload?.reason || 'The match room was closed by the host.');
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
          // Skip if drawn by ourselves (already rendered immediately on local canvas)
          if (msg.payload?.senderId && msg.payload.senderId === user.googleId) {
            break;
          }
          if (canvasRef.current) {
            canvasRef.current.drawRemoteStroke(msg.payload);
          }
          break;
        case 'state_update':
          setServerState(msg.payload);
          setGameState(msg.payload.status);
          break;
        case 'match_summary':
          if (msg.payload?.results) {
            const myResult = msg.payload.results[user.googleId];
            if (myResult) {
              const stored = JSON.parse(localStorage.getItem('pixel_user')) || user;
              const currentStats = stored.stats || { wins: 0, losses: 0, experience: 0, totalPoints: 0 };
              const isWin = myResult.status === 'win';
              const isLoss = myResult.status === 'loss';
              const xp = Number(myResult.xpEarned || 0);
              const pts = Number(myResult.pointsEarned || 0);

              const updatedStats = {
                wins: (currentStats.wins || 0) + (isWin ? 1 : 0),
                losses: (currentStats.losses || 0) + (isLoss ? 1 : 0),
                experience: (currentStats.experience || 0) + xp,
                totalPoints: (currentStats.totalPoints || 0) + pts,
                pixelsDrawn: currentStats.pixelsDrawn || 0
              };
              const updatedUser = { ...stored, stats: updatedStats };
              localStorage.setItem('pixel_user', JSON.stringify(updatedUser));
            }
          }
          break;
        default:
          break;
      }
    };

    const connect = () => {
      const wsUrl = new URL(WS_BASE_URL);
      wsUrl.searchParams.append('roomId', roomId);
      wsUrl.searchParams.append('userId', user.googleId);
      wsUrl.searchParams.append('name', user.name || 'Guest Pilot');
      wsUrl.searchParams.append('avatar', user.avatarUrl || '');
      
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
        if (!event.data) return;
        // Split by newline to support batched WebSocket messages smoothly without dropping frames
        const raw = typeof event.data === 'string' ? event.data : '';
        const lines = raw.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed);
            handleIncomingWsMessage(msg);
          } catch (e) {
            console.error("Invalid WS message chunk:", e);
          }
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
        payload: {
          ...strokeData,
          senderId: user.googleId
        }
      }));
    }
  };

  const handleSubmitScore = (score) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'submit_score', payload: { score } }));
    }
  };

  const isAdmin = (serverState?.adminId === user.googleId) || (serverState?.AdminID === user.googleId);
  const hasJudge = (serverState?.judges || []).length > 0;
  const isDrawer = serverState?.activePlayerId === user.googleId;
  const canEndTurn = isDrawer || isAdmin;
  const maxRoundsCount = serverState?.maxRounds || serverState?.settings?.maxRounds || 3;
  const currentRoundNum = serverState?.currentRound || 1;

  return (
    <div className="app-container" style={{ padding: '1.25rem 2rem' }}>
      {/* Reconnecting Banner */}
      {isReconnecting && (
        <div style={{
          background: 'linear-gradient(90deg, #ff2247, #ff5e3a)',
          color: 'white',
          padding: '0.65rem 1.5rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          fontWeight: 800,
          boxShadow: '0 0 20px rgba(255, 34, 71, 0.4)'
        }}>
          <IconZap size={18} color="#fff" />
          <span className="laser-pulse">RECONNECTING TO MATCH ARENA...</span>
        </div>
      )}

      {/* Top Match Navigation HUD */}
      <header className="glass-panel" style={{ 
        padding: '0.85rem 1.5rem', 
        marginBottom: '1.5rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderLeft: '4px solid #00f0ff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', fontWeight: 800 }}>
              MATCH COMBAT BUS
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 900 }}>ARENA:</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#00f0ff', letterSpacing: '1px' }}>
                #{roomId}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge-live">
              {gameState === 'lobby' ? 'LOBBY' : gameState === 'playing' ? `ROUND ${currentRoundNum}/${maxRoundsCount}` : gameState.toUpperCase()}
            </span>
            {isAdmin && (
              <span className="badge-tag" style={{ background: 'rgba(255, 208, 0, 0.15)', color: '#ffd000', border: '1px solid rgba(255, 208, 0, 0.4)' }}>
                <IconCrown size={12} color="#ffd000" /> HOST
              </span>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
          {gameState === 'lobby' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8' }}>DEPLOY AS:</span>
                <select 
                  className="btn btn-secondary" 
                  value={role} 
                  onChange={handleRoleChange}
                  style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                >
                  <option value="teamA">Team Alpha (Blue)</option>
                  <option value="teamB">Team Beta (Red)</option>
                  <option value="judge">Referee (Judge)</option>
                </select>
              </div>

              {isAdmin && (
                <button 
                  className="btn btn-primary" 
                  onClick={handleStartGame}
                  disabled={!hasJudge}
                  style={{ opacity: hasJudge ? 1 : 0.5, cursor: hasJudge ? 'pointer' : 'not-allowed', padding: '0.5rem 1.1rem' }}
                  title={!hasJudge ? "Match cannot start without at least 1 Judge" : "Launch Arena Match"}
                >
                  <IconSwords size={16} />
                  {hasJudge ? 'Launch Match' : 'Need 1 Judge'}
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
              color: '#ff3366',
              padding: '0.5rem 1rem'
            }}
          >
            <IconLogout size={15} color="#ff3366" />
            {isAdmin ? 'Terminate' : 'Exit'}
          </button>
        </div>
      </header>

      {/* Main Arena Floor */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        
        {/* Team Rosters Sidebar */}
        <div style={{ width: '310px', display: 'flex', flexDirection: 'column', gap: '1rem', flexShrink: 0 }}>
          
          {/* Team Alpha Card */}
          <div className="glass-panel" style={{ 
            padding: '1.1rem', 
            borderLeft: serverState?.activeTeam === 'teamA' && gameState === 'playing' ? '4px solid #00f0ff' : '1px solid var(--glass-border)',
            boxShadow: serverState?.activeTeam === 'teamA' && gameState === 'playing' ? '0 0 20px rgba(0, 240, 255, 0.25)' : 'none'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00f0ff', boxShadow: '0 0 8px #00f0ff' }}></span>
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#00f0ff', letterSpacing: '0.5px' }}>TEAM ALPHA</h3>
              </div>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f8fafc' }}>
                {serverState?.scores?.teamA || 0} <span style={{ fontSize: '0.7rem', color: '#64748b' }}>PTS</span>
              </span>
            </div>
            {serverState?.activeTeam === 'teamA' && gameState === 'playing' && (
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#00f0ff', marginBottom: '0.5rem', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <IconBrush size={13} color="#00f0ff" /> CURRENTLY DRAWING
              </div>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {(serverState?.teamA || []).length === 0 && <li style={{ color: '#64748b', fontSize: '0.8rem' }}>No pilots deployed</li>}
              {(serverState?.teamA || []).map((player) => (
                <li key={player.userId} style={{ 
                  padding: '0.4rem 0.6rem', 
                  background: player.userId === serverState?.activePlayerId ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255,255,255,0.02)', 
                  border: player.userId === serverState?.activePlayerId ? '1px solid #00f0ff' : '1px solid transparent',
                  borderRadius: '6px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.6rem' 
                }}>
                  <PilotAvatar src={player.avatar} name={player.name} size={28} border="#00f0ff" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: player.userId === serverState?.activePlayerId ? '#00f0ff' : '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
            padding: '1.1rem', 
            borderLeft: serverState?.activeTeam === 'teamB' && gameState === 'playing' ? '4px solid #ff3366' : '1px solid var(--glass-border)',
            boxShadow: serverState?.activeTeam === 'teamB' && gameState === 'playing' ? '0 0 20px rgba(255, 51, 102, 0.25)' : 'none'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff3366', boxShadow: '0 0 8px #ff3366' }}></span>
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#ff3366', letterSpacing: '0.5px' }}>TEAM BETA</h3>
              </div>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f8fafc' }}>
                {serverState?.scores?.teamB || 0} <span style={{ fontSize: '0.7rem', color: '#64748b' }}>PTS</span>
              </span>
            </div>
            {serverState?.activeTeam === 'teamB' && gameState === 'playing' && (
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#ff3366', marginBottom: '0.5rem', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <IconBrush size={13} color="#ff3366" /> CURRENTLY DRAWING
              </div>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {(serverState?.teamB || []).length === 0 && <li style={{ color: '#64748b', fontSize: '0.8rem' }}>No pilots deployed</li>}
              {(serverState?.teamB || []).map((player) => (
                <li key={player.userId} style={{ 
                  padding: '0.4rem 0.6rem', 
                  background: player.userId === serverState?.activePlayerId ? 'rgba(255, 51, 102, 0.15)' : 'rgba(255,255,255,0.02)', 
                  border: player.userId === serverState?.activePlayerId ? '1px solid #ff3366' : '1px solid transparent',
                  borderRadius: '6px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.6rem' 
                }}>
                  <PilotAvatar src={player.avatar} name={player.name} size={28} border="#ff3366" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: player.userId === serverState?.activePlayerId ? '#ff3366' : '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
          <div className="glass-panel" style={{ padding: '1.1rem', borderLeft: '4px solid #ffd000' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <IconShield size={16} color="#ffd000" />
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#ffd000', letterSpacing: '0.5px' }}>REFEREES</h3>
              </div>
              <span className="badge-tag" style={{ background: 'rgba(255,208,0,0.15)', color: '#ffd000' }}>
                {(serverState?.judges || []).length} JUDGE
              </span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {(serverState?.judges || []).length === 0 && (
                <li style={{ color: '#ffd000', fontSize: '0.75rem', background: 'rgba(255,208,0,0.1)', padding: '0.4rem', borderRadius: '4px' }}>
                  At least 1 Judge is needed to begin match
                </li>
              )}
              {(serverState?.judges || []).map((player) => (
                <li key={player.userId} style={{ padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <PilotAvatar src={player.avatar} name={player.name} size={28} border="#ffd000" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{player.name}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Central Arena Main Canvas Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
          
          {gameState === 'lobby' ? (
            <div className="glass-panel" style={{ width: '100%', padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ 
                width: '60px', 
                height: '60px', 
                borderRadius: '50%', 
                background: 'rgba(0, 240, 255, 0.1)', 
                border: '1px solid rgba(0, 240, 255, 0.3)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: '1rem'
              }}>
                <IconSwords size={28} color="#00f0ff" />
              </div>
              <h2 style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>ARENA LOBBY</h2>
              <p style={{ color: '#94a3b8', maxWidth: '480px', marginBottom: '2rem', fontSize: '0.85rem', lineHeight: '1.4' }}>
                {isAdmin 
                  ? 'Configure match rules, round robin rotation, and words below. When ready, launch the arena.' 
                  : 'Waiting for room host to launch the match. Pick your team or step in as Judge!'}
              </p>

              {isAdmin ? (
                <div style={{ 
                  background: 'rgba(7, 9, 14, 0.75)', 
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
                    <h3 style={{ margin: 0, color: '#00f0ff', fontSize: '0.95rem', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <IconSliders size={16} color="#00f0ff" /> HOST MATCH SETTINGS
                    </h3>
                    <span className="badge-tag" style={{ background: '#00f0ff', color: '#000' }}>HOST ONLY</span>
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
                    <IconSwords size={18} />
                    {hasJudge ? 'Launch Match Now' : 'Need 1 Judge to Launch'}
                  </button>
                  {!hasJudge && (
                    <div style={{ background: 'rgba(255, 208, 0, 0.1)', border: '1px solid rgba(255, 208, 0, 0.3)', borderRadius: '6px', padding: '0.5rem', fontSize: '0.75rem', color: '#ffd000', textAlign: 'center' }}>
                      Select the <strong>Referee</strong> role in the top header.
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
                marginBottom: '0.85rem',
                background: 'rgba(13, 17, 24, 0.85)',
                padding: '0.65rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800 }}>ROUND {currentRoundNum} OF {maxRoundsCount}</div>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: isDrawer ? '#00ff88' : '#00f0ff' }}>
                    {isDrawer ? `SECRET WORD: ${serverState?.currentWord}` : `${serverState?.activeTeam === 'teamA' ? 'Team Alpha' : 'Team Beta'} is Drawing...`}
                  </h3>
                </div>

                <div style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.85rem', 
                  background: timeLeft <= 10 ? 'rgba(255, 34, 71, 0.2)' : 'rgba(0, 240, 255, 0.1)', 
                  border: timeLeft <= 10 ? '1px solid #ff2247' : '1px solid rgba(0, 240, 255, 0.3)',
                  borderRadius: '20px', 
                  fontWeight: 900,
                  fontSize: '0.95rem',
                  color: timeLeft <= 10 ? '#ff2247' : '#00f0ff'
                }}>
                  <IconTimer size={14} color={timeLeft <= 10 ? '#ff2247' : '#00f0ff'} />
                  <span>{timeLeft}s</span>
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
              <div style={{ marginTop: '1rem', width: '100%', maxWidth: '512px', display: 'flex', gap: '1rem' }}>
                {canEndTurn && (
                  <button 
                    className="btn btn-primary" 
                    style={{ flex: 1, padding: '0.8rem' }}
                    onClick={handleEndTurn}
                  >
                    <IconZap size={16} />
                    Finish Drawing Early
                  </button>
                )}
              </div>
            </div>
          ) : gameState === 'judging' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              
              <div className="glass-panel" style={{ width: '100%', maxWidth: '512px', padding: '1rem 1.25rem', marginBottom: '0.85rem', textAlign: 'center', borderLeft: '4px solid #ffd000' }}>
                <span className="badge-tag" style={{ background: '#ffd000', color: '#000', marginBottom: '0.3rem' }}>
                  <IconShield size={12} color="#000" /> JUDGING STAGE
                </span>
                <h2 style={{ margin: '0.1rem 0', fontSize: '1.15rem' }}>
                  Target Word: <span style={{ color: '#ffd000', letterSpacing: '1px' }}>{serverState?.currentWord}</span>
                </h2>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
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
              <div className="glass-panel" style={{ width: '100%', maxWidth: '512px', marginTop: '0.85rem', padding: '1.1rem', textAlign: 'center' }}>
                {(role === 'judge' || isAdmin) ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffd000' }}>
                        {role === 'judge' ? 'AWARD OFFICIAL SCORE:' : 'HOST / SIMULATE SCORE:'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>(1 = Poor, 10 = Masterpiece)</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                        <button 
                          key={num} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.55rem 0', fontWeight: 900, fontSize: '0.95rem' }}
                          onClick={() => handleSubmitScore(num)}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '0.4rem' }}>
                    <span className="laser-pulse">Waiting for Referee to score the drawing...</span>
                  </div>
                )}
              </div>
            </div>
          ) : gameState === 'finished' ? (
            <div className="glass-panel" style={{ width: '100%', maxWidth: '580px', padding: '2.5rem', textAlign: 'center' }}>
              <div style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '50%', 
                background: 'rgba(0, 240, 255, 0.1)', 
                border: '1px solid rgba(0, 240, 255, 0.3)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                margin: '0 auto 1rem'
              }}>
                <IconTrophy size={32} color="#00f0ff" />
              </div>
              <h1 style={{ fontSize: '2.2rem', marginBottom: '0.3rem', color: '#00f0ff' }}>MATCH CONCLUDED</h1>
              {(() => {
                const teamAScore = serverState?.scores?.teamA || 0;
                const teamBScore = serverState?.scores?.teamB || 0;
                let outcome = 'TIE MATCH';
                let outcomeColor = '#ffd000';

                if (teamAScore > teamBScore) {
                  outcome = role === 'teamA' ? 'VICTORY' : 'DEFEAT';
                  outcomeColor = role === 'teamA' ? '#00ff88' : '#ff3366';
                } else if (teamBScore > teamAScore) {
                  outcome = role === 'teamB' ? 'VICTORY' : 'DEFEAT';
                  outcomeColor = role === 'teamB' ? '#00ff88' : '#ff3366';
                }
                if (role === 'judge') {
                  outcome = 'MATCH ADJUDICATED';
                  outcomeColor = '#ffd000';
                }

                return (
                  <>
                    <h2 style={{ fontSize: '1.8rem', color: outcomeColor, margin: '0.8rem 0' }}>
                      {outcome}
                    </h2>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      gap: '2rem', 
                      margin: '1.25rem 0',
                      background: 'rgba(255,255,255,0.02)',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#00f0ff', fontWeight: 800 }}>TEAM ALPHA</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{teamAScore}</div>
                      </div>
                      <div style={{ fontSize: '1.8rem', color: '#64748b', fontWeight: 300 }}>VS</div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#ff3366', fontWeight: 800 }}>TEAM BETA</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{teamBScore}</div>
                      </div>
                    </div>
                    <p style={{ color: '#00f0ff', fontSize: '0.85rem', marginTop: '1.25rem' }}>
                      Career stats recorded! Redirecting to pilot dossier...
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
