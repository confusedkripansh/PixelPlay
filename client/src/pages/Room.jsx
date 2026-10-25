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
    name: 'Guest Player', 
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
      wsUrl.searchParams.append('name', user.name || 'Guest Player');
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
        const raw = typeof event.data === 'string' ? event.data : '';
        const lines = raw.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed);
            handleIncomingWsMessage(msg);
          } catch (e) {
            console.error("Invalid WS chunk:", e);
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

  // Turn Countdown Timer: ONLY the drawer sends end_turn on timer expiration
  useEffect(() => {
    let timer;
    if (gameState === 'playing') {
      const initialTime = serverState?.settings?.timeLimitSeconds || 60;
      setTimeLeft(initialTime);

      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
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
      if (window.confirm("As room host, leaving will terminate this room for everyone. Are you sure?")) {
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
  const canEndTurn = isDrawer; // Host CANNOT finish turn early; only active drawer can!
  
  const maxRoundsCount = serverState?.maxRounds || serverState?.settings?.maxRounds || 3;
  const currentRoundNum = serverState?.currentRound || 1;

  // Secret target word: visible to all members of the active drawing team!
  const activeTeamMembers = (serverState?.activeTeam === 'teamA' ? serverState?.teamA : serverState?.teamB) || [];
  const isUserOnActiveTeam = role === serverState?.activeTeam || activeTeamMembers.some(p => p.userId === user.googleId);
  
  // Multi-judge stats
  const totalJudges = (serverState?.judges || []).length;
  const judgeSubmissions = serverState?.judgeSubmissions || {};
  const submittedJudgesCount = Object.keys(judgeSubmissions).length;
  const mySubmittedScore = judgeSubmissions[user.googleId];

  const activeTeamStepNum = (serverState?.activeTeamStep || 0) + 1;
  const totalTeamStepsNum = serverState?.totalTeamSteps || activeTeamMembers.length || 1;

  // Skribbl letter blanks helper
  const renderWordBlanks = (word) => {
    if (!word) return '_ _ _ _ _';
    return word.split('').map(() => '_').join(' ');
  };

  return (
    <div className="app-container" style={{ padding: '1rem 1.5rem', maxWidth: '1280px' }}>
      
      {/* Reconnecting Alert */}
      {isReconnecting && (
        <div style={{
          background: '#ee5253',
          color: 'white',
          padding: '0.6rem 1.25rem',
          borderRadius: '12px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          fontWeight: 800,
          border: '3px solid #090e18',
          boxShadow: '0 4px 0 #070c14'
        }}>
          <IconZap size={18} color="#fff" />
          <span>RECONNECTING TO ROOM...</span>
        </div>
      )}

      {/* Skribbl.io Arcade Top Bar */}
      <header className="io-card" style={{ 
        padding: '0.75rem 1.25rem', 
        marginBottom: '1.25rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        background: '#1b2a47',
        border: '3px solid #090e18',
        boxShadow: '0 6px 0 #070c14'
      }}>
        {/* Left: Room Badge & Round */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            background: '#feca57',
            color: '#222f3e',
            fontWeight: 900,
            fontSize: '0.9rem',
            padding: '0.35rem 0.75rem',
            borderRadius: '10px',
            border: '2px solid #090e18',
            boxShadow: '0 3px 0 #ff9f43'
          }}>
            ROOM #{roomId}
          </div>

          <div style={{
            background: '#24375d',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '0.85rem',
            padding: '0.35rem 0.75rem',
            borderRadius: '10px',
            border: '2px solid #090e18'
          }}>
            {gameState === 'lobby' ? 'LOBBY' : `ROUND ${currentRoundNum} OF ${maxRoundsCount}`}
          </div>

          {isAdmin && (
            <span style={{ 
              background: '#feca57', 
              color: '#000', 
              fontWeight: 900, 
              fontSize: '0.75rem',
              padding: '0.3rem 0.6rem',
              borderRadius: '8px',
              border: '2px solid #090e18',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}>
              👑 HOST
            </span>
          )}
        </div>

        {/* Center: Big Skribbl Round Clock & Word Display */}
        {gameState !== 'lobby' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Round Clock */}
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: timeLeft <= 10 ? '#ee5253' : '#10ac84',
              color: '#ffffff',
              border: '3px solid #090e18',
              boxShadow: timeLeft <= 10 ? '0 4px 0 #b33939' : '0 4px 0 #0b6850',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '1.4rem'
            }}>
              {timeLeft}
            </div>

            {/* Word Banner */}
            <div style={{
              background: '#0e1726',
              padding: '0.45rem 1.25rem',
              borderRadius: '12px',
              border: '3px solid #090e18',
              boxShadow: '0 4px 0 #070c14',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              {gameState === 'playing' ? (
                isUserOnActiveTeam ? (
                  <>
                    <span style={{ fontSize: '0.65rem', color: '#feca57', fontWeight: 800, textTransform: 'uppercase' }}>
                      {isDrawer ? 'YOUR WORD TO DRAW' : 'YOUR TEAM IS DRAWING'}
                    </span>
                    <span style={{ fontSize: '1.35rem', fontWeight: 900, letterSpacing: '2px', color: '#1dd1a1' }}>
                      {serverState?.currentWord}
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '0.65rem', color: '#c8d6e5', fontWeight: 800, textTransform: 'uppercase' }}>
                      {serverState?.activeTeam === 'teamA' ? 'Team Blue' : 'Team Red'} is Drawing
                    </span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '4px', color: '#feca57' }}>
                      {renderWordBlanks(serverState?.currentWord)}
                    </span>
                  </>
                )
              ) : gameState === 'judging' ? (
                <>
                  <span style={{ fontSize: '0.65rem', color: '#feca57', fontWeight: 800 }}>REFEREE JUDGING</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '1px', color: '#feca57' }}>
                    {serverState?.currentWord}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#feca57' }}>GAME FINISHED</span>
              )}
            </div>
          </div>
        )}

        {/* Right: Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {gameState === 'lobby' && (
            <>
              <select 
                className="btn btn-secondary" 
                value={role} 
                onChange={handleRoleChange}
                style={{ padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
              >
                <option value="teamA">Team Blue</option>
                <option value="teamB">Team Red</option>
                <option value="judge">Referee</option>
              </select>

              {isAdmin && (
                <button 
                  className="btn btn-primary" 
                  onClick={handleStartGame}
                  disabled={!hasJudge}
                  style={{ padding: '0.55rem 1.1rem' }}
                >
                  <IconSwords size={16} />
                  {hasJudge ? 'Start Game' : 'Need 1 Referee'}
                </button>
              )}
            </>
          )}

          <button 
            className="btn btn-danger" 
            onClick={handleLeaveRoom}
            style={{ padding: '0.55rem 1rem' }}
          >
            <IconLogout size={16} color="#fff" />
            <span>{isAdmin ? 'End Room' : 'Exit'}</span>
          </button>
        </div>
      </header>

      {/* Main Floor: Skribbl Player List on Left, Canvas in Center */}
      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
        
        {/* Left Column: Skribbl Stacked Player Cards */}
        <div style={{ width: '270px', display: 'flex', flexDirection: 'column', gap: '0.85rem', flexShrink: 0 }}>
          
          {/* Team Blue Card */}
          <div className="io-card" style={{ padding: '0.85rem', borderTop: '6px solid #2e86de' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#2e86de' }} />
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#2e86de' }}>TEAM BLUE</h3>
              </div>
              <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#feca57' }}>
                {serverState?.scores?.teamA || 0} <span style={{ fontSize: '0.7rem', color: '#c8d6e5' }}>PTS</span>
              </span>
            </div>

            {(serverState?.teamA || []).length === 0 && (
              <div style={{ color: '#8395a7', fontSize: '0.8rem', textAlign: 'center', padding: '0.5rem' }}>No players</div>
            )}
            {(serverState?.teamA || []).map((player, idx) => {
              const isPlayerDrawing = player.userId === serverState?.activePlayerId && gameState === 'playing';
              return (
                <div 
                  key={player.userId} 
                  className={`skribbl-player-row ${isPlayerDrawing ? 'active-drawing' : ''}`}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 900, color: isPlayerDrawing ? '#fff' : '#feca57', minWidth: '18px' }}>
                    #{idx + 1}
                  </span>
                  <PilotAvatar src={player.avatar} name={player.name} size={28} border={isPlayerDrawing ? '#fff' : '#2e86de'} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {player.name}
                  </span>
                  {isPlayerDrawing && (
                    <span style={{ fontSize: '0.65rem', background: '#ffffff', color: '#10ac84', fontWeight: 900, padding: '0.2rem 0.4rem', borderRadius: '6px' }}>
                      DRAWING
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Team Red Card */}
          <div className="io-card" style={{ padding: '0.85rem', borderTop: '6px solid #ee5253' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ee5253' }} />
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#ee5253' }}>TEAM RED</h3>
              </div>
              <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#feca57' }}>
                {serverState?.scores?.teamB || 0} <span style={{ fontSize: '0.7rem', color: '#c8d6e5' }}>PTS</span>
              </span>
            </div>

            {(serverState?.teamB || []).length === 0 && (
              <div style={{ color: '#8395a7', fontSize: '0.8rem', textAlign: 'center', padding: '0.5rem' }}>No players</div>
            )}
            {(serverState?.teamB || []).map((player, idx) => {
              const isPlayerDrawing = player.userId === serverState?.activePlayerId && gameState === 'playing';
              return (
                <div 
                  key={player.userId} 
                  className={`skribbl-player-row ${isPlayerDrawing ? 'active-drawing' : ''}`}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 900, color: isPlayerDrawing ? '#fff' : '#feca57', minWidth: '18px' }}>
                    #{idx + 1}
                  </span>
                  <PilotAvatar src={player.avatar} name={player.name} size={28} border={isPlayerDrawing ? '#fff' : '#ee5253'} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {player.name}
                  </span>
                  {isPlayerDrawing && (
                    <span style={{ fontSize: '0.65rem', background: '#ffffff', color: '#10ac84', fontWeight: 900, padding: '0.2rem 0.4rem', borderRadius: '6px' }}>
                      DRAWING
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Referees Card */}
          <div className="io-card" style={{ padding: '0.85rem', borderTop: '6px solid #feca57' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <IconShield size={16} color="#feca57" />
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#feca57' }}>REFEREES</h3>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 900, background: '#feca57', color: '#000', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
                {totalJudges}
              </span>
            </div>

            {totalJudges === 0 && (
              <div style={{ color: '#feca57', fontSize: '0.75rem', background: 'rgba(254, 202, 87, 0.15)', padding: '0.4rem', borderRadius: '6px', textAlign: 'center' }}>
                Need at least 1 referee to start game!
              </div>
            )}
            {(serverState?.judges || []).map((player) => (
              <div key={player.userId} className="skribbl-player-row">
                <PilotAvatar src={player.avatar} name={player.name} size={28} border="#feca57" />
                <span style={{ fontSize: '0.85rem', fontWeight: 800, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {player.name}
                </span>
                {gameState === 'judging' && judgeSubmissions[player.userId] && (
                  <span style={{ fontSize: '0.65rem', color: '#1dd1a1', fontWeight: 900 }}>
                    ✓ SCORED
                  </span>
                )}
              </div>
            ))}
          </div>

        </div>

        {/* Center: Canvas Area & Controls */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
          
          {gameState === 'lobby' ? (
            <div className="io-card" style={{ width: '100%', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '50%', 
                background: '#feca57', 
                border: '3px solid #090e18',
                boxShadow: '0 5px 0 #ff9f43',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: '1rem'
              }}>
                <IconSwords size={32} color="#222f3e" />
              </div>

              <h2 style={{ fontSize: '1.8rem', color: '#feca57', marginBottom: '0.4rem' }}>GAME LOBBY</h2>
              <p style={{ color: '#c8d6e5', maxWidth: '480px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                {isAdmin 
                  ? 'Set your game rules below. Each team takes turns drawing collectively on the canvas!' 
                  : 'Waiting for room host to start the game. Choose your team or join as Referee!'}
              </p>

              {isAdmin ? (
                <div style={{ 
                  background: '#24375d', 
                  border: '3px solid #090e18', 
                  boxShadow: '0 5px 0 #070c14',
                  padding: '1.5rem', 
                  borderRadius: '16px', 
                  width: '100%', 
                  maxWidth: '460px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '1.1rem',
                  textAlign: 'left'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: '#feca57', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <IconSliders size={18} color="#feca57" /> ROOM RULES
                    </h3>
                    <span style={{ background: '#feca57', color: '#000', fontWeight: 900, padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem' }}>
                      HOST
                    </span>
                  </div>

                  {/* Rounds */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.85rem', fontWeight: 800 }}>
                      <span style={{ color: '#c8d6e5' }}>Total Rounds:</span>
                      <strong style={{ color: '#feca57' }}>{sliderRounds} Rounds</strong>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      step="1"
                      value={sliderRounds} 
                      onChange={(e) => handleSliderRoundsChange(e.target.value)}
                    />
                  </div>

                  {/* Turn Time */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.85rem', fontWeight: 800 }}>
                      <span style={{ color: '#c8d6e5' }}>Turn Time per Player:</span>
                      <strong style={{ color: '#feca57' }}>{sliderTime} Seconds</strong>
                    </div>
                    <input 
                      type="range" 
                      min="15" 
                      max="120" 
                      step="5"
                      value={sliderTime} 
                      onChange={(e) => handleSliderTimeChange(e.target.value)}
                    />
                  </div>

                  {/* Ink Limit */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.85rem', fontWeight: 800 }}>
                      <span style={{ color: '#c8d6e5' }}>Ink Limit per Player:</span>
                      <strong style={{ color: '#feca57' }}>{sliderInk} Pixels</strong>
                    </div>
                    <input 
                      type="range" 
                      min="400" 
                      max="3000" 
                      step="100"
                      value={sliderInk} 
                      onChange={(e) => handleSliderInkChange(e.target.value)}
                    />
                  </div>

                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem' }} 
                    onClick={handleStartGame}
                    disabled={!hasJudge}
                  >
                    <IconSwords size={20} />
                    {hasJudge ? 'START GAME NOW' : 'NEED AT LEAST 1 REFEREE'}
                  </button>
                </div>
              ) : (
                <div style={{ background: '#24375d', border: '3px solid #090e18', padding: '1rem 1.5rem', borderRadius: '12px', display: 'flex', gap: '1.5rem', fontSize: '0.9rem', fontWeight: 800 }}>
                  <span>🎯 Rounds: <strong style={{ color: '#feca57' }}>{maxRoundsCount}</strong></span>
                  <span>⏳ Turn: <strong style={{ color: '#feca57' }}>{serverState?.settings?.timeLimitSeconds || 60}s</strong></span>
                  <span>🎨 Ink: <strong style={{ color: '#feca57' }}>{serverState?.settings?.inkLimit || 1000}px</strong></span>
                </div>
              )}
            </div>
          ) : (
            /* Persistent Canvas Container: KEPT MOUNTED to prevent freezing/blanking */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              
              {/* Canvas is persistently rendered! */}
              <Canvas 
                ref={canvasRef}
                isMyTurn={gameState === 'playing' && isDrawer} 
                onPixelDraw={handlePixelDraw} 
                onEndTurn={handleEndTurn}
                pixelsPerTurn={serverState?.settings?.inkLimit || 1000}
              />

              {/* Controls when Playing */}
              {gameState === 'playing' && (
                <div style={{ marginTop: '0.85rem', width: '100%', maxWidth: '560px' }}>
                  {canEndTurn ? (
                    <button 
                      className="btn btn-primary" 
                      style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}
                      onClick={handleEndTurn}
                    >
                      <IconZap size={18} />
                      FINISH MY TURN (PASS TO NEXT TEAMMATE)
                    </button>
                  ) : isUserOnActiveTeam ? (
                    <div style={{ textAlign: 'center', padding: '0.6rem', background: '#1b2a47', borderRadius: '12px', border: '2px solid #090e18', fontWeight: 800, color: '#feca57' }}>
                      Teammate is drawing (Player {activeTeamStepNum} of {totalTeamStepsNum})
                    </div>
                  ) : null}
                </div>
              )}

              {/* Rating Controls when Judging */}
              {gameState === 'judging' && (
                <div className="io-card" style={{ width: '100%', maxWidth: '560px', marginTop: '0.85rem', padding: '1.1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#feca57', marginBottom: '0.4rem' }}>
                    REFEREE EVALUATION STAGE
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#c8d6e5', marginBottom: '0.75rem' }}>
                    Referees Voted: <strong>{submittedJudgesCount} of {totalJudges}</strong>
                  </div>

                  {role === 'judge' ? (
                    mySubmittedScore ? (
                      <div style={{ color: '#1dd1a1', padding: '0.6rem', background: '#24375d', borderRadius: '10px', fontWeight: 900, border: '2px solid #090e18' }}>
                        ✓ Your Score of {mySubmittedScore}/10 Submitted! Waiting for other referees...
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.6rem' }}>
                          RATE THIS DRAWING (1 = Poor, 10 = Masterpiece):
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.45rem' }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                            <button 
                              key={num} 
                              className="btn btn-gold" 
                              style={{ padding: '0.6rem 0', fontWeight: 900, fontSize: '1.1rem' }}
                              onClick={() => handleSubmitScore(num)}
                            >
                              ⭐ {num}
                            </button>
                          ))}
                        </div>
                      </>
                    )
                  ) : (
                    <div style={{ color: '#c8d6e5', fontSize: '0.9rem', fontWeight: 800 }}>
                      Waiting for referees to score the drawing...
                    </div>
                  )}
                </div>
              )}

              {/* Finished Match Celebration Modal */}
              {gameState === 'finished' && (
                <div className="io-card level-up-pop" style={{ width: '100%', maxWidth: '560px', marginTop: '1rem', padding: '2rem', textAlign: 'center', borderTop: '6px solid #feca57' }}>
                  <div style={{ 
                    width: '68px', 
                    height: '68px', 
                    borderRadius: '50%', 
                    background: '#feca57', 
                    border: '3px solid #090e18',
                    boxShadow: '0 5px 0 #ff9f43',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    margin: '0 auto 1rem'
                  }}>
                    <IconTrophy size={36} color="#222f3e" />
                  </div>

                  <h1 style={{ fontSize: '2.2rem', color: '#feca57', margin: '0 0 0.5rem' }}>
                    GAME OVER!
                  </h1>

                  {(() => {
                    const scoreA = serverState?.scores?.teamA || 0;
                    const scoreB = serverState?.scores?.teamB || 0;
                    let outcomeText = 'TIE GAME!';
                    let outcomeColor = '#feca57';

                    if (scoreA > scoreB) {
                      outcomeText = role === 'teamA' ? 'VICTORY!' : 'DEFEAT!';
                      outcomeColor = role === 'teamA' ? '#10ac84' : '#ee5253';
                    } else if (scoreB > scoreA) {
                      outcomeText = role === 'teamB' ? 'VICTORY!' : 'DEFEAT!';
                      outcomeColor = role === 'teamB' ? '#10ac84' : '#ee5253';
                    }
                    if (role === 'judge') {
                      outcomeText = 'MATCH ADJUDICATED!';
                      outcomeColor = '#feca57';
                    }

                    return (
                      <>
                        <h2 style={{ fontSize: '1.8rem', color: outcomeColor, margin: '0 0 1rem' }}>
                          {outcomeText}
                        </h2>

                        {/* Scores */}
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'center', 
                          gap: '2rem', 
                          background: '#24375d', 
                          padding: '1rem', 
                          borderRadius: '12px',
                          border: '2px solid #090e18',
                          margin: '1rem 0'
                        }}>
                          <div>
                            <div style={{ color: '#2e86de', fontWeight: 900, fontSize: '0.85rem' }}>TEAM BLUE</div>
                            <div style={{ fontSize: '2rem', fontWeight: 900 }}>{scoreA} PTS</div>
                          </div>
                          <div style={{ fontSize: '2rem', color: '#8395a7', fontWeight: 300, alignSelf: 'center' }}>VS</div>
                          <div>
                            <div style={{ color: '#ee5253', fontWeight: 900, fontSize: '0.85rem' }}>TEAM RED</div>
                            <div style={{ fontSize: '2rem', fontWeight: 900 }}>{scoreB} PTS</div>
                          </div>
                        </div>

                        {/* Level Up Banner */}
                        {matchResult?.levelUp && (
                          <div style={{
                            background: '#feca57',
                            color: '#222f3e',
                            borderRadius: '12px',
                            border: '3px solid #090e18',
                            boxShadow: '0 4px 0 #ff9f43',
                            padding: '0.85rem',
                            margin: '1rem 0',
                            fontWeight: 900
                          }}>
                            🎉 LEVEL UP! TIER {matchResult.oldLevel} ➔ TIER {matchResult.newLevel} 🎉
                          </div>
                        )}

                        {/* Rewards */}
                        <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
                          <div style={{ flex: 1, background: '#24375d', padding: '0.85rem', borderRadius: '10px', border: '2px solid #090e18' }}>
                            <div style={{ fontSize: '0.75rem', color: '#feca57', fontWeight: 900 }}>XP EARNED</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900 }}>+{matchResult?.xpEarned || 20} XP</div>
                          </div>
                          <div style={{ flex: 1, background: '#24375d', padding: '0.85rem', borderRadius: '10px', border: '2px solid #090e18' }}>
                            <div style={{ fontSize: '0.75rem', color: '#1dd1a1', fontWeight: 900 }}>POINTS WON</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900 }}>+{matchResult?.pointsEarned || 0} PTS</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem' }}>
                          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => navigate('/lobby')}>
                            Back to Lobby
                          </button>
                          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => navigate('/dashboard')}>
                            Career Stats
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Room;
