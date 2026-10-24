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
  IconZap 
} from '../components/Icons';
import { API_BASE_URL } from '../config';

const Lobby = () => {
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem('pixel_user')) || { 
    googleId: 'guest-pilot',
    name: 'Guest Pilot', 
    avatarUrl: '' 
  };

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
      {/* Top Esports Bar */}
      <header className="glass-panel" style={{ 
        width: '100%', 
        maxWidth: '860px', 
        marginBottom: '2rem', 
        padding: '0.85rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderLeft: '4px solid #00f0ff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.2), rgba(0, 150, 255, 0.1))',
            border: '1px solid #00f0ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px rgba(0, 240, 255, 0.3)'
          }}>
            <IconSwords size={20} color="#00f0ff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', letterSpacing: '0.5px' }}>
              PIXEL<span style={{ color: '#00f0ff', textShadow: '0 0 12px rgba(0,240,255,0.5)' }}>PLAY</span>
            </h1>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 800 }}>
              COMPETITIVE DRAWING ARENA
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.65rem', 
            padding: '0.35rem 0.75rem', 
            background: 'rgba(255,255,255,0.03)', 
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '6px' 
          }}>
            <PilotAvatar src={user.avatarUrl} name={user.name} size={32} border="#00f0ff" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc' }}>{user.name}</span>
              <span style={{ fontSize: '0.7rem', color: '#00f0ff', fontWeight: 700 }}>TIER {playerLevel}</span>
            </div>
          </div>

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
      <div style={{ display: 'flex', gap: '1.5rem', width: '100%', maxWidth: '860px' }}>
        
        {/* Join Card */}
        <div className="glass-panel" style={{ flex: 1, padding: '1.75rem', borderTop: '3px solid #00f0ff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <IconZap size={20} color="#00f0ff" />
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#00f0ff', letterSpacing: '0.5px' }}>CONNECT TO MATCH</h2>
          </div>

          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>
                ARENA ROOM ID
              </label>
              <input 
                type="text" 
                value={roomId} 
                onChange={(e) => setRoomId(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.7rem', 
                  borderRadius: '6px', 
                  border: '1px solid rgba(0, 240, 255, 0.3)', 
                  background: 'rgba(0,0,0,0.4)', 
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
                  background: 'rgba(0,0,0,0.4)', 
                  color: 'white' 
                }}
                placeholder="Leave empty for open rooms"
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.4rem', width: '100%' }}>
              <IconSwords size={16} />
              Deploy to Arena
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
            Deploy a dedicated arena. As Room Host, you control round robin word limits and start authorization.
          </p>

          <div style={{ width: '100%', marginBottom: '1rem', textAlign: 'left' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>
              ARENA PRIVACY KEY (OPTIONAL)
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
                background: 'rgba(0,0,0,0.4)', 
                color: 'white' 
              }}
              placeholder="Leave blank for public feed"
            />
            {createPassword.trim() === '' ? (
              <div style={{ marginTop: '0.65rem', padding: '0.6rem 0.75rem', background: 'rgba(0, 255, 136, 0.08)', border: '1px solid rgba(0, 255, 136, 0.25)', borderRadius: '6px', color: '#00ff88', fontSize: '0.75rem', lineHeight: '1.3', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <IconGlobe size={15} color="#00ff88" style={{ marginTop: '2px', flexShrink: 0 }} />
                <span><strong>Public Match:</strong> Broadcasts live to the Global Feed below so any player can join.</span>
              </div>
            ) : (
              <div style={{ marginTop: '0.65rem', padding: '0.6rem 0.75rem', background: 'rgba(0, 136, 255, 0.08)', border: '1px solid rgba(0, 136, 255, 0.25)', borderRadius: '6px', color: '#38bdf8', fontSize: '0.75rem', lineHeight: '1.3', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <IconLock size={15} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
                <span><strong>Private Match:</strong> Only pilots with this exact password key can connect.</span>
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
      <div className="glass-panel" style={{ width: '100%', maxWidth: '860px', marginTop: '2rem', padding: '1.5rem', marginBottom: '3rem', borderLeft: '4px solid #00ff88' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <IconGlobe size={20} color="#00ff88" />
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
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: 'rgba(255,255,255,0.015)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.08)' }}>
            <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.85rem' }}>
              No public arenas broadcasting right now.
            </p>
            <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.3rem' }}>
              Create an arena above without a password to feature your match live on this broadcast list!
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {publicRooms.map((r) => (
              <div 
                key={r.roomId}
                className="glass-panel"
                style={{ 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  background: 'rgba(255, 255, 255, 0.02)',
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.75rem',
                  border: '1px solid rgba(0, 240, 255, 0.2)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: '#00f0ff', letterSpacing: '0.5px' }}>
                    ARENA #{r.roomId}
                  </span>
                  <span className="badge-tag" style={{ 
                    background: r.status === 'lobby' ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 208, 0, 0.15)',
                    color: r.status === 'lobby' ? '#00ff88' : '#ffd000'
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
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.75rem', marginTop: 'auto' }}
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
