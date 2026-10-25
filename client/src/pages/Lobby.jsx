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
  IconCheck
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
      name: 'Guest Player', 
      avatarUrl: '',
      stats: { wins: 0, losses: 0, experience: 0, totalPoints: 0 }
    };
  });
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(user.name || 'Guest Player');
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
    <div className="app-container" style={{ alignItems: 'center', paddingTop: '3vh', maxWidth: '980px' }}>
      
      {/* Skribbl.io / SmashKarts.io Header Bar */}
      <header className="io-card" style={{ 
        width: '100%', 
        marginBottom: '1.5rem', 
        padding: '0.85rem 1.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#1b2a47',
        border: '3px solid #090e18',
        boxShadow: '0 6px 0 #070c14'
      }}>
        {/* Game Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#feca57',
            border: '2px solid #090e18',
            boxShadow: '0 3px 0 #ff9f43',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <IconSwords size={24} color="#222f3e" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', color: '#ffffff', letterSpacing: '0.5px' }}>
              PIXEL<span style={{ color: '#feca57' }}>PLAY.IO</span>
            </h1>
            <div style={{ fontSize: '0.7rem', color: '#c8d6e5', fontWeight: 800 }}>
              MULTIPLAYER DRAWING BATTLE
            </div>
          </div>
        </div>

        {/* User Card with Inline Name Editor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {isEditingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#24375d', padding: '0.35rem 0.65rem', borderRadius: '10px', border: '2px solid #feca57' }}>
              <input 
                type="text" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.9rem', fontWeight: 800, width: '130px', outline: 'none' }}
                autoFocus
              />
              <button 
                className="btn btn-primary" 
                onClick={handleSaveUsername} 
                disabled={isSavingName}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              >
                Save
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => { setNewName(user.name); setIsEditingName(false); }}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
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
                background: '#24375d', 
                border: '2px solid #090e18', 
                borderRadius: '10px',
                boxShadow: '0 3px 0 #070c14',
                cursor: 'pointer'
              }}
              onClick={() => setIsEditingName(true)}
              title="Click to edit your nickname"
            >
              <PilotAvatar src={user.avatarUrl} name={user.name} size={34} border="#feca57" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 900, color: '#feca57' }}>
                  {user.name} ✎
                </span>
                <span style={{ fontSize: '0.7rem', color: '#1dd1a1', fontWeight: 800 }}>LVL {playerLevel}</span>
              </div>
            </div>
          )}

          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')} style={{ padding: '0.55rem 0.95rem' }}>
            <IconDashboard size={16} />
            <span>Profile</span>
          </button>
          
          <button 
            className="btn btn-danger" 
            onClick={handleLogout}
            style={{ padding: '0.55rem 0.95rem' }}
          >
            <IconLogout size={16} color="#fff" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Join & Create Cards (Skribbl 3D Push Card Layout) */}
      <div style={{ display: 'flex', gap: '1.25rem', width: '100%', marginBottom: '1.5rem' }}>
        
        {/* Join Room Card */}
        <div className="io-card" style={{ flex: 1, padding: '1.5rem', borderTop: '6px solid #10ac84' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <IconZap size={22} color="#1dd1a1" />
            <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#1dd1a1' }}>JOIN MATCH</h2>
          </div>

          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: '#c8d6e5', fontWeight: 800 }}>
                ROOM CODE
              </label>
              <input 
                type="text" 
                value={roomId} 
                onChange={(e) => setRoomId(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.75rem', 
                  borderRadius: '10px', 
                  border: '2px solid #090e18', 
                  background: '#24375d', 
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '1rem',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  outline: 'none'
                }}
                placeholder="E.G. ABC123"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: '#c8d6e5', fontWeight: 800 }}>
                PASSWORD (IF PRIVATE)
              </label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.75rem', 
                  borderRadius: '10px', 
                  border: '2px solid #090e18', 
                  background: '#24375d', 
                  color: '#ffffff',
                  outline: 'none'
                }}
                placeholder="Leave blank for public room"
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.4rem', width: '100%', padding: '0.85rem' }}>
              <IconSwords size={18} />
              JOIN MATCH NOW
            </button>
          </form>
        </div>

        {/* Create Room Card */}
        <div className="io-card" style={{ flex: 1, padding: '1.5rem', borderTop: '6px solid #ee5253', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <IconGlobe size={22} color="#ee5253" />
            <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#ee5253' }}>CREATE ROOM</h2>
          </div>
          <p style={{ color: '#c8d6e5', fontSize: '0.85rem', marginBottom: '0.9rem' }}>
            Host your own match with custom turn times, team drawing, and words!
          </p>

          <div style={{ width: '100%', marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: '#c8d6e5', fontWeight: 800 }}>
              ROOM PASSWORD (OPTIONAL)
            </label>
            <input 
              type="password" 
              value={createPassword} 
              onChange={(e) => setCreatePassword(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.75rem', 
                borderRadius: '10px', 
                border: '2px solid #090e18', 
                background: '#24375d', 
                color: '#ffffff',
                outline: 'none'
              }}
              placeholder="Leave blank for public room"
            />
            {createPassword.trim() === '' ? (
              <div style={{ marginTop: '0.6rem', padding: '0.55rem 0.75rem', background: 'rgba(16, 172, 132, 0.15)', border: '2px solid #10ac84', borderRadius: '10px', color: '#1dd1a1', fontSize: '0.75rem', fontWeight: 800 }}>
                🌐 Public Room: Anyone from the global list below can join!
              </div>
            ) : (
              <div style={{ marginTop: '0.6rem', padding: '0.55rem 0.75rem', background: 'rgba(238, 82, 83, 0.15)', border: '2px solid #ee5253', borderRadius: '10px', color: '#ff6b6b', fontSize: '0.75rem', fontWeight: 800 }}>
                🔒 Private Room: Only friends with this password can enter.
              </div>
            )}
          </div>

          <button onClick={handleCreate} className="btn btn-gold" style={{ width: '100%', marginTop: 'auto', padding: '0.85rem' }}>
            <IconZap size={18} />
            CREATE NEW ROOM
          </button>
        </div>
      </div>

      {/* Public Rooms Feed */}
      <div className="io-card" style={{ width: '100%', padding: '1.25rem', marginBottom: '2.5rem', borderTop: '6px solid #feca57' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <IconGlobe size={20} color="#feca57" />
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#feca57' }}>PUBLIC ROOMS</h2>
            <span className="badge-live">LIVE</span>
          </div>

          <button 
            className="btn btn-secondary" 
            onClick={fetchPublicRooms}
            disabled={isLoadingFeed}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
          >
            <IconRefresh size={14} />
            <span>{isLoadingFeed ? 'Scanning...' : 'Refresh'}</span>
          </button>
        </div>

        {publicRooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', background: '#24375d', borderRadius: '12px', border: '2px dashed #090e18' }}>
            <p style={{ color: '#c8d6e5', margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>
              No public rooms right now!
            </p>
            <p style={{ color: '#8395a7', fontSize: '0.8rem', marginTop: '0.3rem' }}>
              Create a room above with no password to appear on this public feed!
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem' }}>
            {publicRooms.map((r) => (
              <div 
                key={r.roomId}
                style={{ 
                  padding: '0.85rem', 
                  borderRadius: '12px', 
                  background: '#24375d',
                  border: '2px solid #090e18',
                  boxShadow: '0 4px 0 #070c14',
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.6rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 900, fontSize: '1.05rem', color: '#feca57' }}>
                    ROOM #{r.roomId}
                  </span>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    fontWeight: 900, 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '6px',
                    background: r.status === 'lobby' ? '#10ac84' : '#ee5253',
                    color: '#ffffff'
                  }}>
                    {r.status.toUpperCase()}
                  </span>
                </div>

                <div style={{ fontSize: '0.8rem', color: '#c8d6e5', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Players: <strong style={{ color: '#fff' }}>{r.playerCount}</strong></span>
                  <span>Turn: <strong style={{ color: '#feca57' }}>{r.timeLimit || 60}s</strong></span>
                </div>

                <button 
                  className="btn btn-primary"
                  onClick={() => navigate(`/room/${r.roomId}`)}
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.8rem', marginTop: '0.2rem' }}
                >
                  <IconZap size={14} />
                  PLAY
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
