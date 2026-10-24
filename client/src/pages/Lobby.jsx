import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

const Lobby = () => {
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem('pixel_user')) || { name: 'Player One', avatarUrl: 'https://robohash.org/test' };

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
    if (roomId) {
      navigate(`/room/${roomId}`, { state: { password: password } });
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

  return (
    <div className="app-container" style={{ alignItems: 'center', paddingTop: '10vh' }}>
      <header className="app-header" style={{ width: '100%', maxWidth: '800px', marginBottom: '3rem' }}>
        <h1 className="logo">
          Pixel<span style={{ color: 'var(--accent-primary)' }}>1000</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="user-profile glass-panel" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <img src={user.avatarUrl} alt="Avatar" style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 'bold' }}>{user.name}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Level {Math.floor((user.stats?.Experience || 0) / 100) || 1}</span>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
            Dashboard
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={handleLogout}
            style={{ 
              color: '#f87171', 
              borderColor: 'rgba(239, 68, 68, 0.4)', 
              background: 'rgba(239, 68, 68, 0.1)' 
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '2rem', width: '100%', maxWidth: '800px' }}>
        {/* Join Room */}
        <div className="glass-panel" style={{ flex: 1, padding: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Join Room</h2>
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Room ID</label>
              <input 
                type="text" 
                value={roomId} 
                onChange={(e) => setRoomId(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                placeholder="Enter 6-character ID"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Password (Optional)</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>
              Join Game
            </button>
          </form>
        </div>

        {/* Create Room */}
        <div className="glass-panel" style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '1rem' }}>Create Room</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Host a new game and invite your friends. You will be the admin and can customize the rules.
          </p>
          <div style={{ width: '100%', marginBottom: '1.5rem', textAlign: 'left' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Room Password (Optional)</label>
            <input 
              type="password" 
              value={createPassword} 
              onChange={(e) => setCreatePassword(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
              placeholder="Leave empty for public match"
            />
            {createPassword.trim() === '' ? (
              <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '6px', color: '#6ee7b7', fontSize: '0.8rem', lineHeight: '1.3' }}>
                🌍 <strong>Public Room:</strong> No password set. Anyone on the <strong>Global Feed</strong> below will be able to discover and join your match!
              </div>
            ) : (
              <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '6px', color: '#93c5fd', fontSize: '0.8rem', lineHeight: '1.3' }}>
                🔒 <strong>Private Room:</strong> Only players with this specific password can join your room.
              </div>
            )}
          </div>
          <button onClick={handleCreate} className="btn btn-secondary" style={{ width: '100%' }}>
            Host New Game
          </button>
        </div>
      </div>

      {/* Global Public Room Feed */}
      <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', marginTop: '2.5rem', padding: '1.75rem', marginBottom: '4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🌍</span>
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Global Room Feed</h2>
            <span style={{ 
              background: 'rgba(16, 185, 129, 0.2)', 
              color: '#34d399', 
              fontSize: '0.75rem', 
              fontWeight: 'bold', 
              padding: '0.2rem 0.6rem', 
              borderRadius: '12px',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              ● LIVE
            </span>
          </div>

          <button 
            className="btn btn-secondary" 
            onClick={fetchPublicRooms}
            disabled={isLoadingFeed}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <span>{isLoadingFeed ? 'Refreshing...' : '🔄 Refresh Feed'}</span>
          </button>
        </div>

        {publicRooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed var(--glass-border)' }}>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
              No public rooms active right now.
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Create a room above without a password to be featured live on this global feed!
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '1rem' }}>
            {publicRooms.map((r) => (
              <div 
                key={r.roomId}
                className="glass-panel"
                style={{ 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  background: 'rgba(255, 255, 255, 0.04)',
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.75rem',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--accent-primary)' }}>
                    Room #{r.roomId}
                  </span>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '4px',
                    background: r.status === 'lobby' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: r.status === 'lobby' ? '#93c5fd' : '#fcd34d'
                  }}>
                    {r.status.toUpperCase()}
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div>👤 Players: <strong style={{ color: 'white' }}>{r.playerCount}</strong></div>
                  <div>⏳ Rules: {r.timeLimit || 60}s | {r.inkLimit || 1000}px</div>
                </div>

                <button 
                  className="btn btn-primary"
                  onClick={() => navigate(`/room/${r.roomId}`)}
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', marginTop: 'auto' }}
                >
                  Quick Join ⚡
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
