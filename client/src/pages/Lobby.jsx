import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PilotAvatar from '../components/PilotAvatar';
import { 
  IconSwords, 
  IconGlobe, 
  IconLock, 
  IconDashboard, 
  IconLogout, 
  IconRefresh, 
  IconUsers, 
  IconTimer,
  IconZap,
  IconCheck,
  IconSparkles
} from '../components/Icons';
import { API_BASE_URL } from '../config';

const Lobby = () => {
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  
  // User & Name editing state
  const [user, setUser] = useState(() => {
    return JSON.parse(localStorage.getItem('pixel_user')) || { 
      googleId: 'guest-' + Math.floor(100000 + Math.random() * 900000),
      name: 'Guest Pilot', 
      avatarUrl: '',
      stats: { wins: 0, losses: 0, experience: 0, totalPoints: 0 }
    };
  });
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(user.name || 'Guest Pilot');
  const [isSavingName, setIsSavingName] = useState(false);
  
  const navigate = useNavigate();

  const fetchPublicRooms = async () => {
    setIsLoadingFeed(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/public`);
      const data = await res.json();
      if (data.status === 'success') {
        setPublicRooms(data.rooms || []);
      }
    } catch (err) {
      console.error("Failed to fetch public rooms feed:", err);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  useEffect(() => {
    fetchPublicRooms();
    const interval = setInterval(fetchPublicRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveUsername = async () => {
    if (!newName.trim()) return;
    setIsSavingName(true);
    const updatedUser = { ...user, name: newName.trim() };
    setUser(updatedUser);
    localStorage.setItem('pixel_user', JSON.stringify(updatedUser));

    try {
      await fetch(`${API_BASE_URL}/api/user/update/${user.googleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), avatarUrl: user.avatarUrl || '' })
      });
    } catch (e) {
      console.warn("Could not reach backend to sync username:", e);
    } finally {
      setIsSavingName(false);
      setIsEditingName(false);
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId.trim().toUpperCase()}`, { state: { password: password } });
    }
  };

  const handleCreate = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/room/${newRoomId}`, { state: { password: createPassword } });
  };

  const handleLogout = () => {
    localStorage.removeItem('pixel_user');
    navigate('/login');
  };

  const playerLevel = Math.floor(((user.stats?.experience || user.stats?.Experience) || 0) / 100) + 1;

  return (
    <div className="app-container" style={{ alignItems: 'center', paddingTop: '4vh' }}>
      {/* Top Esports Bar (Cloudflight Coding Contest Aesthetic) */}
      <header className="glass-panel" style={{ 
        width: '100%', 
        maxWidth: '880px', 
        marginBottom: '2rem', 
        padding: '0.85rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderLeft: '4px solid #ffd000'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: 'rgba(255, 208, 0, 0.15)',
            border: '1px solid #ffd000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px rgba(255, 208, 0, 0.3)'
          }}>
            <IconSwords size={22} color="#ffd000" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', letterSpacing: '0.5px' }}>
              PIXEL<span style={{ color: '#ffd000' }}>PLAY</span>
            </h1>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>
              COMPETITIVE DRAWING CONTEST
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {isEditingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#111319', padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid #ffd000' }}>
              <input 
                type="text" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.85rem', fontWeight: 800, width: '120px', outline: 'none' }}
                autoFocus
              />
              <button 
                className="btn btn-primary" 
                onClick={handleSaveUsername} 
                disabled={isSavingName}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
              >
                Save
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => { setNewName(user.name); setIsEditingName(false); }}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.65rem', 
                padding: '0.35rem 0.75rem', 
                background: '#111319', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '6px',
                cursor: 'pointer'
              }}
              onClick={() => setIsEditingName(true)}
              title="Click to edit username"
            >
              <PilotAvatar src={user.avatarUrl} name={user.name} size={32} border="#ffd000" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc' }}>
                  {user.name} <span style={{ fontSize: '0.65rem', color: '#ffd000' }}>✎</span>
                </span>
                <span style={{ fontSize: '0.7rem', color: '#ffd000', fontWeight: 700 }}>TIER {playerLevel}</span>
              </div>
            </div>
          )}

          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')} style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem' }}>
            <IconDashboard size={15} />
            <span>Career</span>
          </button>
          
          <button 
            className="btn btn-secondary" 
            onClick={handleLogout}
            style={{ 
              padding: '0.5rem 0.9rem', 
              fontSize: '0.8rem',
              color: '#ff3366', 
              borderColor: 'rgba(255, 51, 102, 0.4)', 
              background: 'rgba(255, 51, 102, 0.1)' 
            }}
          >
            <IconLogout size={15} color="#ff3366" />
            <span>Exit</span>
          </button>
        </div>
      </header>

      {/* Main Join & Create Cards */}
      <div style={{ display: 'flex', gap: '1.5rem', width: '100%', maxWidth: '880px' }}>
        
        {/* Join Card */}
        <div className="glass-panel" style={{ flex: 1, padding: '1.75rem', borderTop: '3px solid #ffd000' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <IconZap size={20} color="#ffd000" />
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#ffd000', letterSpacing: '0.5px' }}>CONNECT TO ARENA</h2>
          </div>

          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>
                ROOM CODE
              </label>
              <input 
                type="text" 
                value={roomId} 
                onChange={(e) => setRoomId(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.7rem', 
                  borderRadius: '6px', 
                  border: '1px solid rgba(255, 208, 0, 0.4)', 
                  background: '#111319', 
                  color: 'white',
                  fontWeight: 800,
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase'
                }}
                placeholder="ENTER 6-DIGIT CODE"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>
                PASSWORD (IF LOCKED)
              </label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.7rem', 
                  borderRadius: '6px', 
                  border: '1px solid rgba(255, 255, 255, 0.1)', 
                  background: '#111319', 
                  color: 'white' 
                }}
                placeholder="Leave empty for open rooms"
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.4rem', width: '100%' }}>
              <IconSwords size={16} />
              Deploy to Match
            </button>
          </form>
        </div>

        {/* Create Card */}
        <div className="glass-panel" style={{ flex: 1, padding: '1.75rem', borderTop: '3px solid #ff3366', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <IconGlobe size={20} color="#ff3366" />
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#ff3366', letterSpacing: '0.5px' }}>HOST NEW ARENA</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: '1.4' }}>
            Deploy a contest arena. As Host, you set round-robin turn timers, rounds, and match start authorization.
          </p>

          <div style={{ width: '100%', marginBottom: '1rem', textAlign: 'left' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>
              ARENA PASSWORD (OPTIONAL)
            </label>
            <input 
              type="password" 
              value={createPassword} 
              onChange={(e) => setCreatePassword(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.7rem', 
                borderRadius: '6px', 
                border: '1px solid rgba(255, 255, 255, 0.1)', 
                background: '#111319', 
                color: 'white' 
              }}
              placeholder="Leave blank for public feed"
            />
            {createPassword.trim() === '' ? (
              <div style={{ marginTop: '0.65rem', padding: '0.6rem 0.75rem', background: 'rgba(255, 208, 0, 0.1)', border: '1px solid rgba(255, 208, 0, 0.35)', borderRadius: '6px', color: '#ffd000', fontSize: '0.75rem', lineHeight: '1.3', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <IconGlobe size={15} color="#ffd000" style={{ marginTop: '2px', flexShrink: 0 }} />
                <span><strong>Public Match:</strong> No password given! This room will broadcast live to the Global Feed below so anyone can join.</span>
              </div>
            ) : (
              <div style={{ marginTop: '0.65rem', padding: '0.6rem 0.75rem', background: 'rgba(0, 240, 255, 0.08)', border: '1px solid rgba(0, 240, 255, 0.25)', borderRadius: '6px', color: '#00f0ff', fontSize: '0.75rem', lineHeight: '1.3', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <IconLock size={15} color="#00f0ff" style={{ marginTop: '2px', flexShrink: 0 }} />
                <span><strong>Private Match:</strong> Locked with password. Only players with this key can connect.</span>
              </div>
            )}
          </div>

          <button onClick={handleCreate} className="btn btn-hot" style={{ width: '100%', marginTop: 'auto' }}>
            <IconZap size={16} />
            Initialize Arena Match
          </button>
        </div>
      </div>

      {/* Global Public Room Feed */}
      <div className="glass-panel" style={{ width: '100%', maxWidth: '880px', marginTop: '2rem', padding: '1.5rem', marginBottom: '3rem', borderLeft: '4px solid #ffd000' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <IconGlobe size={20} color="#ffd000" />
            <h2 style={{ margin: 0, fontSize: '1.15rem', letterSpacing: '0.5px' }}>GLOBAL ARENA DISCOVERY</h2>
            <span className="badge-live">LIVE FEED</span>
          </div>

          <button 
            className="btn btn-secondary" 
            onClick={fetchPublicRooms}
            disabled={isLoadingFeed}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
          >
            <IconRefresh size={13} />
            <span>{isLoadingFeed ? 'Scanning...' : 'Refresh'}</span>
          </button>
        </div>

        {publicRooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: '#111319', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.08)' }}>
            <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.85rem' }}>
              No public arenas broadcasting right now.
            </p>
            <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.3rem' }}>
              Create an arena above without a password to feature your match live on this broadcast list!
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
            {publicRooms.map((r) => (
              <div 
                key={r.roomId}
                className="glass-panel"
                style={{ 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  background: '#111319',
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.75rem',
                  border: '1px solid rgba(255, 208, 0, 0.25)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: '#ffd000', letterSpacing: '0.5px' }}>
                    ROOM #{r.roomId}
                  </span>
                  <span className="badge-tag" style={{ 
                    background: r.status === 'lobby' ? '#ffd000' : 'rgba(255, 255, 255, 0.1)',
                    color: r.status === 'lobby' ? '#000' : '#fff'
                  }}>
                    {r.status.toUpperCase()}
                  </span>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <IconUsers size={14} color="#64748b" />
                    <span>Pilots: <strong style={{ color: '#f8fafc' }}>{r.playerCount}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <IconTimer size={14} color="#64748b" />
                    <span>Rules: {r.timeLimit || 60}s | {r.inkLimit || 1000}px</span>
                  </div>
                </div>

                <button 
                  className="btn btn-primary"
                  onClick={() => navigate(`/room/${r.roomId}`)}
                  style={{ width: '100%', padding: '0.55rem', fontSize: '0.75rem', marginTop: 'auto' }}
                >
                  <IconZap size={14} />
                  Join Match
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Lobby;
