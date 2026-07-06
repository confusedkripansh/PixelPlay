import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Lobby = () => {
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem('pixel_user')) || { name: 'Player One', avatarUrl: 'https://robohash.org/test' };

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId) {
      navigate(`/room/${roomId}`, { state: { password: password } });
    }
  };

  const [createPassword, setCreatePassword] = useState('');

  const handleCreate = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/room/${newRoomId}`, { state: { password: createPassword } });
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
              placeholder="••••••••"
            />
          </div>
          <button onClick={handleCreate} className="btn btn-secondary" style={{ width: '100%' }}>
            Host New Game
          </button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
