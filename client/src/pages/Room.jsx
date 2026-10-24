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
  IconSliders,
  IconSparkles,
  IconCheck
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
  const [matchResult, setMatchResult] = useState(null);
  
  // Room settings state
  const [sliderTime, setSliderTime] = useState(60);
  const [sliderInk, setSliderInk] = useState(1000);
  const [sliderRounds, setSliderRounds] = useState(3);
  
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const matchSummaryProcessedRef = useRef(false);

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

  // Clean canvas ONLY when a new word starts or game starts/resets.
  // CRITICAL FIX: Do NOT clear on activePlayerId change, so round-robin teammates draw on the same collective canvas!
  useEffect(() => {
    if (gameState === 'playing' && canvasRef.current) {
      // Intentionally do not clear on teammate handoff; only clear when currentWord changes
    }
  }, [serverState?.currentWord]);

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
          // CRITICAL FIX: Guard against duplicate processing so stats are incremented only once!
          if (msg.payload?.results && !matchSummaryProcessedRef.current) {
            matchSummaryProcessedRef.current = true;
            const myResult = msg.payload.results[user.googleId];
            if (myResult) {
              const stored = JSON.parse(localStorage.getItem('pixel_user')) || user;
              const currentStats = stored.stats || { wins: 0, losses: 0, experience: 0, totalPoints: 0 };
              const isWin = myResult.status === 'win';
              const isLoss = myResult.status === 'loss';
              const xp = Number(myResult.xpEarned || 0);
              const pts = Number(myResult.pointsEarned || 0);

              const prevXP = currentStats.experience || 0;
              const newXP = prevXP + xp;
              const oldLvl = Math.floor(prevXP / 100) + 1;
              const newLvl = Math.floor(newXP / 100) + 1;
              const didLevelUp = newLvl > oldLvl;

              const updatedStats = {
                wins: (currentStats.wins || 0) + (isWin ? 1 : 0),
                losses: (currentStats.losses || 0) + (isLoss ? 1 : 0),
                experience: newXP,
                totalPoints: (currentStats.totalPoints || 0) + pts,
                pixelsDrawn: currentStats.pixelsDrawn || 0
              };
              const updatedUser = { ...stored, stats: updatedStats };
              localStorage.setItem('pixel_user', JSON.stringify(updatedUser));

              setMatchResult({
                status: myResult.status,
                role: myResult.role,
                xpEarned: xp,
                pointsEarned: pts,
                oldLevel: oldLvl,
                newLevel: newLvl,
                levelUp: didLevelUp,
                winningTeam: msg.payload.winningTeam,
                scores: msg.payload.scores
              });
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

  // Turn Countdown Timer: ONLY drawer advances on timer expiration
  useEffect(() => {
    let timer;
    if (gameState === 'playing') {
      const initialTime = serverState?.settings?.timeLimitSeconds || 60;
      setTimeLeft(initialTime);

      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            // CRITICAL FIX: Only active drawer triggers end_turn on expiration!
            if (serverState?.activePlayerId === user.googleId) {
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
  
  // CRITICAL FIX: Host must NOT have control over early finish! Only active drawer can finish early.
  const canEndTurn = isDrawer;
  
  const maxRoundsCount = serverState?.maxRounds || serverState?.settings?.maxRounds || 3;
  const currentRoundNum = serverState?.currentRound || 1;

  // CRITICAL FIX: Secret target word must be visible to all members of the active drawing team!
  const activeTeamMembers = (serverState?.activeTeam === 'teamA' ? serverState?.teamA : serverState?.teamB) || [];
  const isUserOnActiveTeam = role === serverState?.activeTeam || activeTeamMembers.some(p => p.userId === user.googleId);
  
  // Multi-judge stats
  const totalJudges = (serverState?.judges || []).length;
  const judgeSubmissions = serverState?.judgeSubmissions || {};
  const submittedJudgesCount = Object.keys(judgeSubmissions).length;
  const mySubmittedScore = judgeSubmissions[user.googleId];

  // Round-robin step information
  const activeTeamStepNum = (serverState?.activeTeamStep || 0) + 1;
  const totalTeamStepsNum = serverState?.totalTeamSteps || activeTeamMembers.length || 1;

  return (
    <div className="app-container" style={{ padding: '1.25rem 2rem' }}>
      {/* Reconnecting Banner */}
      {isReconnecting && (
        <div style={{
          background: 'linear-gradient(90deg, #ff3366, #ff5e3a)',
          color: 'white',
          padding: '0.65rem 1.5rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          fontWeight: 800,
          boxShadow: '0 0 20px rgba(255, 51, 102, 0.4)'
        }}>
          <IconZap size={18} color="#fff" />
          <span className="laser-pulse">RECONNECTING TO TOURNAMENT ARENA...</span>
        </div>
      )}

      {/* Top Match Navigation HUD (Cloudflight Coding Contest Aesthetic) */}
      <header className="glass-panel" style={{ 
        padding: '0.85rem 1.5rem', 
        marginBottom: '1.5rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderLeft: '4px solid #ffd000'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#ffd000', fontWeight: 800 }}>
              CONTEST ARENA
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 900 }}>ROOM:</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ffd000', letterSpacing: '1px' }}>
                #{roomId}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge-live">
              {gameState === 'lobby' ? 'LOBBY' : gameState === 'playing' ? `ROUND ${currentRoundNum}/${maxRoundsCount}` : gameState.toUpperCase()}
            </span>
            {isAdmin && (
              <span className="badge-tag" style={{ background: '#ffd000', color: '#000' }}>
                <IconCrown size={12} color="#000" /> HOST
              </span>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
          {gameState === 'lobby' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8' }}>ROLE:</span>
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
                  title={!hasJudge ? "Match cannot start without at least 1 Judge" : "Launch Contest Match"}
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
              background: 'rgba(255, 51, 102, 0.1)', 
              borderColor: 'rgba(255, 51, 102, 0.3)', 
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
            borderLeft: serverState?.activeTeam === 'teamA' && gameState === 'playing' ? '4px solid #00f0ff' : '1px solid rgba(255,255,255,0.08)',
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
                <IconBrush size={13} color="#00f0ff" /> COLLECTIVE DRAWING (STEP {activeTeamStepNum}/{totalTeamStepsNum})
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
                    <span className="badge-tag" style={{ marginLeft: 'auto', background: '#00f0ff', color: '#000' }}>DRAWING</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Team Beta Card */}
          <div className="glass-panel" style={{ 
            padding: '1.1rem', 
            borderLeft: serverState?.activeTeam === 'teamB' && gameState === 'playing' ? '4px solid #ff3366' : '1px solid rgba(255,255,255,0.08)',
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
                <IconBrush size={13} color="#ff3366" /> COLLECTIVE DRAWING (STEP {activeTeamStepNum}/{totalTeamStepsNum})
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
                    <span className="badge-tag" style={{ marginLeft: 'auto', background: '#ff3366', color: '#fff' }}>DRAWING</span>
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
              <span className="badge-tag" style={{ background: '#ffd000', color: '#000' }}>
                {totalJudges} JUDGE{totalJudges === 1 ? '' : 'S'}
              </span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {totalJudges === 0 && (
                <li style={{ color: '#ffd000', fontSize: '0.75rem', background: 'rgba(255,208,0,0.1)', padding: '0.4rem', borderRadius: '4px' }}>
                  At least 1 Judge is needed to begin match
                </li>
              )}
              {(serverState?.judges || []).map((player) => (
                <li key={player.userId} style={{ padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <PilotAvatar src={player.avatar} name={player.name} size={28} border="#ffd000" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{player.name}</span>
                  {gameState === 'judging' && judgeSubmissions[player.userId] && (
                    <span className="badge-tag" style={{ marginLeft: 'auto', background: 'rgba(255, 208, 0, 0.2)', color: '#ffd000' }}>
                      <IconCheck size={11} color="#ffd000" /> SCORED
                    </span>
                  )}
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
                borderRadius: '8px', 
                background: 'rgba(255, 208, 0, 0.1)', 
                border: '1px solid #ffd000',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: '1rem',
                boxShadow: '0 0 15px rgba(255, 208, 0, 0.25)'
              }}>
                <IconSwords size={28} color="#ffd000" />
              </div>
              <h2 style={{ fontSize: '1.6rem', marginBottom: '0.4rem', color: '#ffd000' }}>CONTEST ARENA LOBBY</h2>
              <p style={{ color: '#94a3b8', maxWidth: '520px', marginBottom: '2rem', fontSize: '0.85rem', lineHeight: '1.4' }}>
                {isAdmin 
                  ? 'Configure contest parameters below. Each word is drawn collectively by the entire team in a round-robin rotation.' 
                  : 'Waiting for room host to launch the match. Pick your team or step in as Referee!'}
              </p>

              {isAdmin ? (
                <div style={{ 
                  background: '#111319', 
                  border: '1px solid rgba(255, 208, 0, 0.35)', 
                  padding: '1.5rem', 
                  borderRadius: '8px', 
                  width: '100%', 
                  maxWidth: '480px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '1.25rem',
                  textAlign: 'left'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: '#ffd000', fontSize: '0.95rem', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <IconSliders size={16} color="#ffd000" /> HOST MATCH SETTINGS
                    </h3>
                    <span className="badge-tag" style={{ background: '#ffd000', color: '#000' }}>HOST ONLY</span>
                  </div>

                  {/* Total Rounds Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                      <span style={{ color: '#94a3b8' }}>Total Rounds (Words per Team):</span>
                      <strong style={{ color: '#ffd000' }}>{sliderRounds} Rounds</strong>
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
                      Each round consists of 1 word for Team Alpha and 1 word for Team Beta in team round-robin.
                    </div>
                  </div>

                  {/* Turn Time Limit: Time allotted per player in round robin */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                      <span style={{ color: '#94a3b8' }}>Turn Time per Player (Round Robin):</span>
                      <strong style={{ color: '#ffd000' }}>{sliderTime} Seconds</strong>
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
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
                      Time allotted to every player in round robin fashion to contribute to the team's single drawing.
                    </div>
                  </div>

                  {/* Ink Limit */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                      <span style={{ color: '#94a3b8' }}>Ink Pool per Player Turn:</span>
                      <strong style={{ color: '#ffd000' }}>{sliderInk} Pixels</strong>
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
                    {hasJudge ? 'Launch Arena Match' : 'Need 1 Judge to Launch'}
                  </button>
                  {!hasJudge && (
                    <div style={{ background: 'rgba(255, 208, 0, 0.1)', border: '1px solid rgba(255, 208, 0, 0.3)', borderRadius: '6px', padding: '0.5rem', fontSize: '0.75rem', color: '#ffd000', textAlign: 'center' }}>
                      Select the <strong>Referee</strong> role in the top header.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: '#111319', border: '1px solid rgba(255,255,255,0.08)', padding: '1.2rem 2rem', borderRadius: '8px', display: 'flex', gap: '2rem' }}>
                  <span>🎯 Rounds: <strong>{maxRoundsCount}</strong></span>
                  <span>⏳ Turn Time / Player: <strong>{serverState?.settings?.timeLimitSeconds || 60}s</strong></span>
                  <span>🎨 Ink Pool / Turn: <strong>{serverState?.settings?.inkLimit || 1000}px</strong></span>
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
                background: '#111319',
                padding: '0.75rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#ffd000', fontWeight: 800 }}>
                    ROUND {currentRoundNum} OF {maxRoundsCount} • ROUND ROBIN STEP {activeTeamStepNum}/{totalTeamStepsNum}
                  </div>
                  
                  {/* CRITICAL FIX: Word is visible to all teammates on the active drawing team! */}
                  <h3 style={{ margin: '0.15rem 0 0', fontSize: '1rem', color: isUserOnActiveTeam ? '#ffd000' : '#f8fafc' }}>
                    {isUserOnActiveTeam 
                      ? (
                        <span>
                          WORD: <span style={{ color: '#ffd000', letterSpacing: '0.5px' }}>{serverState?.currentWord}</span>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginLeft: '0.4rem' }}>
                            ({isDrawer ? 'YOUR TURN' : 'TEAM DRAWING'})
                          </span>
                        </span>
                      ) : (
                        <span>{serverState?.activeTeam === 'teamA' ? 'Team Alpha' : 'Team Beta'} is Drawing...</span>
                      )
                    }
                  </h3>
                </div>

                <div style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.85rem', 
                  background: timeLeft <= 10 ? 'rgba(255, 51, 102, 0.2)' : 'rgba(255, 208, 0, 0.1)', 
                  border: timeLeft <= 10 ? '1px solid #ff3366' : '1px solid rgba(255, 208, 0, 0.35)',
                  borderRadius: '6px', 
                  fontWeight: 900,
                  fontSize: '0.95rem',
                  color: timeLeft <= 10 ? '#ff3366' : '#ffd000'
                }}>
                  <IconTimer size={14} color={timeLeft <= 10 ? '#ff3366' : '#ffd000'} />
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
              
              {/* Action Controls: CRITICAL FIX: Only active drawer can finish early. Host cannot! */}
              <div style={{ marginTop: '1rem', width: '100%', maxWidth: '512px', display: 'flex', gap: '1rem' }}>
                {canEndTurn ? (
                  <button 
                    className="btn btn-primary" 
                    style={{ flex: 1, padding: '0.8rem' }}
                    onClick={handleEndTurn}
                  >
                    <IconZap size={16} />
                    Finish My Turn Early (Pass to Next Teammate)
                  </button>
                ) : (
                  isUserOnActiveTeam && (
                    <div style={{ width: '100%', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', padding: '0.4rem', background: '#111319', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      Collective Drawing in Progress: Player {activeTeamStepNum} of {totalTeamStepsNum} is drawing.
                    </div>
                  )
                )}
              </div>
            </div>
          ) : gameState === 'judging' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              
              <div className="glass-panel" style={{ width: '100%', maxWidth: '512px', padding: '1rem 1.25rem', marginBottom: '0.85rem', textAlign: 'center', borderLeft: '4px solid #ffd000' }}>
                <span className="badge-tag" style={{ background: '#ffd000', color: '#000', marginBottom: '0.3rem' }}>
                  <IconShield size={12} color="#000" /> REFEREE JUDGING STAGE
                </span>
                <h2 style={{ margin: '0.1rem 0', fontSize: '1.15rem' }}>
                  Target Word: <span style={{ color: '#ffd000', letterSpacing: '1px' }}>{serverState?.currentWord}</span>
                </h2>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Judges Submissions: <strong style={{ color: '#ffd000' }}>{submittedJudgesCount} of {totalJudges} Referees</strong> voted.
                </div>
              </div>

              {/* Keep Canvas visible in read-only mode so judges & players see the drawing! */}
              <Canvas 
                ref={canvasRef}
                isMyTurn={false}
                pixelsPerTurn={serverState?.settings?.inkLimit || 1000}
              />

              {/* Scoring Panel: CRITICAL FIX: Only judges can rate! Host has NO control over rating */}
              <div className="glass-panel" style={{ width: '100%', maxWidth: '512px', marginTop: '0.85rem', padding: '1.1rem', textAlign: 'center' }}>
                {role === 'judge' ? (
                  mySubmittedScore ? (
                    <div style={{ color: '#ffd000', padding: '0.6rem', background: 'rgba(255,208,0,0.1)', borderRadius: '6px', border: '1px solid rgba(255,208,0,0.3)', fontWeight: 800, fontSize: '0.85rem' }}>
                      <IconCheck size={16} color="#ffd000" /> Score of {mySubmittedScore}/10 Submitted. Waiting for other referees...
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffd000' }}>
                          AWARD YOUR OFFICIAL SCORE:
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
                  )
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '0.4rem' }}>
                    <span className="laser-pulse">
                      Referees are evaluating the drawing ({submittedJudgesCount}/{totalJudges} submitted)...
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : gameState === 'finished' ? (
            /* CRITICAL FIX: Gamified Achievement Banner & Dynamic Level-Up Celebration */
            <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2.5rem 2rem', textAlign: 'center', borderTop: '4px solid #ffd000' }}>
              
              <div style={{ 
                width: '68px', 
                height: '68px', 
                borderRadius: '8px', 
                background: 'rgba(255, 208, 0, 0.15)', 
                border: '2px solid #ffd000',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                boxShadow: '0 0 25px rgba(255, 208, 0, 0.3)'
              }}>
                <IconTrophy size={36} color="#ffd000" />
              </div>

              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#ffd000', fontWeight: 800 }}>
                CONTEST MATCH FINISHED
              </div>

              {(() => {
                const teamAScore = serverState?.scores?.teamA || 0;
                const teamBScore = serverState?.scores?.teamB || 0;
                let outcome = 'TIE MATCH';
                let outcomeColor = '#ffd000';

                if (teamAScore > teamBScore) {
                  outcome = role === 'teamA' ? 'VICTORY' : 'DEFEAT';
                  outcomeColor = role === 'teamA' ? '#ffd000' : '#ff3366';
                } else if (teamBScore > teamAScore) {
                  outcome = role === 'teamB' ? 'VICTORY' : 'DEFEAT';
                  outcomeColor = role === 'teamB' ? '#ffd000' : '#ff3366';
                }
                if (role === 'judge') {
                  outcome = 'MATCH ADJUDICATED';
                  outcomeColor = '#ffd000';
                }

                return (
                  <>
                    <h1 style={{ fontSize: '2.2rem', color: outcomeColor, margin: '0.5rem 0 1rem', letterSpacing: '1px' }}>
                      {outcome}
                    </h1>

                    {/* Scores Comparison */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      gap: '2.5rem', 
                      margin: '1.25rem 0',
                      background: '#111319',
                      padding: '1.25rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#00f0ff', fontWeight: 800 }}>TEAM ALPHA</div>
                        <div style={{ fontSize: '2rem', fontWeight: 900 }}>{teamAScore} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>PTS</span></div>
                      </div>
                      <div style={{ fontSize: '2rem', color: '#64748b', fontWeight: 300, alignSelf: 'center' }}>VS</div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#ff3366', fontWeight: 800 }}>TEAM BETA</div>
                        <div style={{ fontSize: '2rem', fontWeight: 900 }}>{teamBScore} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>PTS</span></div>
                      </div>
                    </div>

                    {/* Dynamic Level-Up Banner if level increased! */}
                    {matchResult?.levelUp && (
                      <div className="level-up-pop gold-glow" style={{
                        background: 'linear-gradient(135deg, rgba(255, 208, 0, 0.25), rgba(255, 208, 0, 0.05))',
                        border: '2px solid #ffd000',
                        borderRadius: '8px',
                        padding: '1rem',
                        margin: '1.25rem 0',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <IconSparkles size={20} color="#ffd000" />
                          <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffd000', letterSpacing: '1px' }}>
                            LEVEL UP ACHIEVED!
                          </span>
                          <IconSparkles size={20} color="#ffd000" />
                        </div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc' }}>
                          TIER {matchResult.oldLevel} ➔ <span style={{ color: '#ffd000', fontSize: '1.15rem' }}>TIER {matchResult.newLevel}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          New rank unlocked on competitive leaderboard!
                        </div>
                      </div>
                    )}

                    {/* Rewards Summary Banner */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(2, 1fr)', 
                      gap: '1rem', 
                      margin: '1.25rem 0',
                      textAlign: 'left'
                    }}>
                      <div style={{ background: '#111319', border: '1px solid rgba(255, 208, 0, 0.3)', padding: '1rem', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.7rem', color: '#ffd000', fontWeight: 800, textTransform: 'uppercase' }}>
                          EXPERIENCE GAINED
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#ffd000', marginTop: '0.2rem' }}>
                          +{matchResult?.xpEarned || 20} <span style={{ fontSize: '0.8rem' }}>XP</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>For match performance</div>
                      </div>

                      <div style={{ background: '#111319', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '1rem', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.7rem', color: '#f8fafc', fontWeight: 800, textTransform: 'uppercase' }}>
                          POINTS RECORDED
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#f8fafc', marginTop: '0.2rem' }}>
                          +{matchResult?.pointsEarned || 0} <span style={{ fontSize: '0.8rem' }}>PTS</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Added to career total</div>
                      </div>
                    </div>

                    {/* Navigation Actions */}
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                      <button 
                        className="btn btn-primary" 
                        style={{ flex: 1, padding: '0.85rem' }}
                        onClick={() => navigate('/lobby')}
                      >
                        <IconSwords size={18} />
                        Back to Lobby
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        style={{ flex: 1, padding: '0.85rem' }}
                        onClick={() => navigate('/dashboard')}
                      >
                        <IconTrophy size={18} />
                        View Career Dossier
                      </button>
                    </div>
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
