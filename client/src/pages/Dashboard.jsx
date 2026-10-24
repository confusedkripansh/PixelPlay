import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

const Dashboard = () => {
  const navigate = useNavigate();
  const [userStats, setUserStats] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  
  const user = JSON.parse(localStorage.getItem('pixel_user'));

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const localStats = user.stats || { wins: 0, losses: 0, experience: 0, totalPoints: 0 };

    // Fetch latest profile from server
    fetch(`${API_BASE_URL}/api/user/profile/${user.googleId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error && data.stats) {
          // Merge server stats with any higher local stats
          const mergedStats = {
            wins: Math.max(data.stats.wins || 0, localStats.wins || 0),
            losses: Math.max(data.stats.losses || 0, localStats.losses || 0),
            experience: Math.max(data.stats.experience || 0, localStats.experience || 0),
            totalPoints: Math.max(data.stats.totalPoints || 0, localStats.totalPoints || 0)
          };
          setUserStats(mergedStats);
          setEditName(data.name || user.name);
          setEditAvatar(data.avatarUrl || user.avatarUrl);
        } else {
          setUserStats(localStats);
          setEditName(user.name);
          setEditAvatar(user.avatarUrl);
        }
      })
      .catch(err => {
        console.warn("Could not reach stats server, using local records:", err);
        setUserStats(localStats);
        setEditName(user.name);
        setEditAvatar(user.avatarUrl);
      });
  }, [navigate]);

  const handleSaveProfile = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/user/update/${user.googleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, avatarUrl: editAvatar })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setIsEditing(false);
        const updatedUser = { ...user, name: editName, avatarUrl: editAvatar };
        localStorage.setItem('pixel_user', JSON.stringify(updatedUser));
      }
    } catch (e) {
      console.error(e);
      // Fallback save locally
      setIsEditing(false);
      const updatedUser = { ...user, name: editName, avatarUrl: editAvatar };
      localStorage.setItem('pixel_user', JSON.stringify(updatedUser));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('pixel_user');
    navigate('/login');
  };

  if (!userStats) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <h2 style={{ color: '#00f0ff' }}>Loading Arena Profile...</h2>
      </div>
    );
  }

  const totalMatches = (userStats.wins || 0) + (userStats.losses || 0);
  const winRate = totalMatches > 0 ? Math.round((userStats.wins / totalMatches) * 100) : 0;
  const playerLevel = Math.floor((userStats.experience || 0) / 100) + 1;

  return (
    <div className="app-container" style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', fontWeight: 800 }}>PILOT RECORD</div>
          <h1 style={{ color: '#00f0ff', margin: 0, textShadow: '0 0 15px rgba(0,240,255,0.4)' }}>Career Dashboard</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-primary" onClick={() => navigate('/lobby')}>
            ⚔️ Enter Lobby
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={handleLogout}
            style={{ 
              color: '#ff3366', 
              borderColor: 'rgba(255, 51, 102, 0.4)', 
              background: 'rgba(255, 51, 102, 0.1)' 
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2rem' }}>
        {/* Profile Card */}
        <div className="glass-panel" style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', borderLeft: '4px solid #00f0ff' }}>
          <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
            <img 
              src={editAvatar} 
              alt="avatar" 
              style={{ 
                width: '120px', 
                height: '120px', 
                borderRadius: '50%', 
                border: '3px solid #00f0ff',
                boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)'
              }} 
            />
            <span className="badge-tag" style={{ 
              position: 'absolute', 
              bottom: '-5px', 
              left: '50%', 
              transform: 'translateX(-50%)',
              background: '#00f0ff',
              color: '#000',
              fontWeight: 800,
              boxShadow: '0 0 10px #00f0ff'
            }}>
              LVL {playerLevel}
            </span>
          </div>
          
          {isEditing ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <input 
                type="text" 
                value={editName} 
                onChange={e => setEditName(e.target.value)} 
                placeholder="In-Game Call-sign" 
                style={{ padding: '0.6rem', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '6px' }} 
              />
              <input 
                type="text" 
                value={editAvatar} 
                onChange={e => setEditAvatar(e.target.value)} 
                placeholder="Avatar URL" 
                style={{ padding: '0.6rem', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(0, 240, 255, 0.3)', borderRadius: '6px' }} 
              />
              <button className="btn btn-primary" onClick={handleSaveProfile} style={{ width: '100%' }}>Save Changes</button>
              <button className="btn btn-secondary" onClick={() => setIsEditing(false)} style={{ width: '100%' }}>Cancel</button>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: '1.3rem', margin: '0.5rem 0 0.2rem' }}>{editName}</h2>
              <span className="badge-tag" style={{ background: 'rgba(255,255,255,0.08)', color: '#94a3b8', marginBottom: '1rem' }}>
                {user.googleId.startsWith('guest-') ? 'GUEST RECRUIT' : 'VERIFIED PILOT'}
              </span>
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', marginTop: 'auto', fontSize: '0.8rem' }} 
                onClick={() => setIsEditing(true)}
              >
                Edit Call-sign
              </button>
            </>
          )}
        </div>

        {/* Stats Grid */}
        <div className="glass-panel" style={{ flex: 2, padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#ffd000', margin: 0, fontSize: '1.25rem', letterSpacing: '0.5px' }}>
              COMPETITIVE METRICS
            </h2>
            <span className="badge-live">LIVE CAREER</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {/* Wins */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0, 255, 136, 0.25)', padding: '1.2rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#00ff88', textTransform: 'uppercase', fontWeight: 800 }}>VICTORIES</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#00ff88', marginTop: '0.2rem' }}>
                {userStats.wins}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Matches Won</div>
            </div>

            {/* Losses */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255, 51, 102, 0.25)', padding: '1.2rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#ff3366', textTransform: 'uppercase', fontWeight: 800 }}>DEFEATS</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#ff3366', marginTop: '0.2rem' }}>
                {userStats.losses}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Matches Lost</div>
            </div>

            {/* Win Rate */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0, 240, 255, 0.25)', padding: '1.2rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#00f0ff', textTransform: 'uppercase', fontWeight: 800 }}>WIN RATIO</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#00f0ff', marginTop: '0.2rem' }}>
                {winRate}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Across {totalMatches} Matches</div>
            </div>

            {/* Total Points */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255, 208, 0, 0.25)', padding: '1.2rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#ffd000', textTransform: 'uppercase', fontWeight: 800 }}>ARENA POINTS</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#ffd000', marginTop: '0.2rem' }}>
                {userStats.totalPoints}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{userStats.experience} Total XP</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;