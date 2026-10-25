import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PilotAvatar from '../components/PilotAvatar';
import { 
  IconSwords, 
  IconTrophy, 
  IconZap, 
  IconLogout, 
  IconDashboard, 
  IconCheck
} from '../components/Icons';
import { API_BASE_URL } from '../config';

const Dashboard = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(() => {
    return JSON.parse(localStorage.getItem('pixel_user')) || {
      googleId: 'guest-player',
      name: 'Guest Player',
      avatarUrl: '',
      stats: { wins: 0, losses: 0, experience: 0, totalPoints: 0 }
    };
  });
  
  const [userStats, setUserStats] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(currentUser.name || 'Guest Player');
  const [editAvatar, setEditAvatar] = useState(currentUser.avatarUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!currentUser || !currentUser.googleId) {
      navigate('/login');
      return;
    }

    const localStats = currentUser.stats || { wins: 0, losses: 0, experience: 0, totalPoints: 0 };

    // Fetch latest profile from server
    fetch(`${API_BASE_URL}/api/user/profile/${currentUser.googleId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error && data.stats) {
          const mergedStats = {
            wins: Math.max(data.stats.wins || 0, localStats.wins || 0),
            losses: Math.max(data.stats.losses || 0, localStats.losses || 0),
            experience: Math.max(data.stats.experience || 0, localStats.experience || 0),
            totalPoints: Math.max(data.stats.totalPoints || 0, localStats.totalPoints || 0)
          };
          setUserStats(mergedStats);
          if (data.name) setEditName(data.name);
          if (data.avatarUrl) setEditAvatar(data.avatarUrl);
        } else {
          setUserStats(localStats);
        }
      })
      .catch(err => {
        console.warn("Could not reach stats server, using local records:", err);
        setUserStats(localStats);
      });
  }, [navigate, currentUser.googleId]);

  const handleSaveProfile = async () => {
    if (!editName.trim()) return;
    setIsSaving(true);
    setSaveSuccess(false);

    const updatedUser = { 
      ...currentUser, 
      name: editName.trim(), 
      avatarUrl: editAvatar.trim() 
    };

    // 1. Instantly persist to localStorage and React state
    setCurrentUser(updatedUser);
    localStorage.setItem('pixel_user', JSON.stringify(updatedUser));

    // 2. Persist to MongoDB backend
    try {
      const res = await fetch(`${API_BASE_URL}/api/user/update/${currentUser.googleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: editName.trim(), 
          avatarUrl: editAvatar.trim() 
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSaveSuccess(true);
        setTimeout(() => {
          setIsEditing(false);
          setSaveSuccess(false);
        }, 800);
      } else {
        setIsEditing(false);
      }
    } catch (e) {
      console.error("Backend profile update fallback:", e);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('pixel_user');
    navigate('/login');
  };

  if (!userStats) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <h2 style={{ color: '#feca57', letterSpacing: '1px' }}>LOADING STATS...</h2>
      </div>
    );
  }

  const totalMatches = (userStats.wins || 0) + (userStats.losses || 0);
  const winRate = totalMatches > 0 ? Math.round((userStats.wins / totalMatches) * 100) : 0;
  const playerTier = Math.floor((userStats.experience || 0) / 100) + 1;
  const xpInTier = (userStats.experience || 0) % 100;

  return (
    <div className="app-container" style={{ padding: '2rem 1.5rem', maxWidth: '880px', margin: '0 auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
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
            <IconTrophy size={24} color="#222f3e" />
          </div>
          <div>
            <h1 style={{ color: '#ffffff', margin: 0, fontSize: '1.6rem' }}>
              PLAYER <span style={{ color: '#feca57' }}>PROFILE</span>
            </h1>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-primary" onClick={() => navigate('/lobby')} style={{ padding: '0.6rem 1.2rem' }}>
            <IconSwords size={18} />
            <span>Play Game</span>
          </button>
          <button 
            className="btn btn-danger" 
            onClick={handleLogout}
            style={{ padding: '0.6rem 1.1rem' }}
          >
            <IconLogout size={18} color="#fff" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        
        {/* Left: Player Badge Card */}
        <div className="io-card" style={{ flex: 1, padding: '1.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: '6px solid #feca57' }}>
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <PilotAvatar src={currentUser.avatarUrl} name={currentUser.name} size={110} border="#feca57" glow={true} />
            <span style={{ 
              position: 'absolute', 
              bottom: '-8px', 
              left: '50%', 
              transform: 'translateX(-50%)',
              background: '#feca57',
              color: '#222f3e',
              fontWeight: 900,
              fontSize: '0.8rem',
              padding: '0.2rem 0.6rem',
              borderRadius: '8px',
              border: '2px solid #090e18',
              boxShadow: '0 3px 0 #ff9f43',
              whiteSpace: 'nowrap'
            }}>
              LEVEL {playerTier}
            </span>
          </div>
          
          {isEditing ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#c8d6e5', fontWeight: 800, marginBottom: '0.25rem' }}>
                  NICKNAME
                </label>
                <input 
                  type="text" 
                  value={editName} 
                  onChange={e => setEditName(e.target.value)} 
                  placeholder="Enter name" 
                  style={{ 
                    width: '100%',
                    padding: '0.65rem', 
                    background: '#24375d', 
                    color: 'white', 
                    border: '2px solid #feca57', 
                    borderRadius: '8px',
                    fontWeight: 900,
                    outline: 'none'
                  }} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#c8d6e5', fontWeight: 800, marginBottom: '0.25rem' }}>
                  AVATAR IMAGE URL
                </label>
                <input 
                  type="text" 
                  value={editAvatar} 
                  onChange={e => setEditAvatar(e.target.value)} 
                  placeholder="https://..." 
                  style={{ 
                    width: '100%',
                    padding: '0.65rem', 
                    background: '#24375d', 
                    color: 'white', 
                    border: '2px solid #090e18', 
                    borderRadius: '8px',
                    outline: 'none'
                  }} 
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveProfile} 
                  disabled={isSaving}
                  style={{ flex: 1, padding: '0.55rem' }}
                >
                  {saveSuccess ? <><IconCheck size={16} /> Saved!</> : isSaving ? 'Saving...' : 'Save'}
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setEditName(currentUser.name);
                    setEditAvatar(currentUser.avatarUrl);
                    setIsEditing(false);
                  }} 
                  style={{ flex: 1, padding: '0.55rem' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: '1.4rem', margin: '0.5rem 0 0.2rem', color: '#ffffff', textAlign: 'center' }}>
                {currentUser.name}
              </h2>

              {/* Progress to next level */}
              <div style={{ width: '100%', margin: '1rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#c8d6e5', marginBottom: '0.3rem', fontWeight: 800 }}>
                  <span>LEVEL PROGRESS</span>
                  <span style={{ color: '#feca57' }}>{xpInTier}/100 XP</span>
                </div>
                <div style={{ width: '100%', height: '10px', background: '#090e18', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ width: `${xpInTier}%`, height: '100%', background: '#feca57', transition: 'width 0.2s ease' }} />
                </div>
              </div>

              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', marginTop: 'auto', padding: '0.6rem' }} 
                onClick={() => setIsEditing(true)}
              >
                ✏️ Edit Nickname
              </button>
            </>
          )}
        </div>

        {/* Right: Arcade Stats Grid */}
        <div className="io-card" style={{ flex: 1.6, padding: '1.75rem', borderTop: '6px solid #10ac84' }}>
          <h2 style={{ color: '#1dd1a1', margin: '0 0 1.25rem', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <IconTrophy size={20} color="#1dd1a1" /> GAMEPLAY STATS
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {/* Wins */}
            <div style={{ background: '#24375d', border: '2px solid #090e18', boxShadow: '0 4px 0 #070c14', padding: '1rem', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.75rem', color: '#1dd1a1', fontWeight: 900 }}>WINS</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#1dd1a1', marginTop: '0.1rem' }}>
                {userStats.wins}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8395a7' }}>Games Won</div>
            </div>

            {/* Losses */}
            <div style={{ background: '#24375d', border: '2px solid #090e18', boxShadow: '0 4px 0 #070c14', padding: '1rem', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.75rem', color: '#ee5253', fontWeight: 900 }}>LOSSES</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#ee5253', marginTop: '0.1rem' }}>
                {userStats.losses}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8395a7' }}>Games Lost</div>
            </div>

            {/* Win Rate */}
            <div style={{ background: '#24375d', border: '2px solid #090e18', boxShadow: '0 4px 0 #070c14', padding: '1rem', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.75rem', color: '#feca57', fontWeight: 900 }}>WIN RATE</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#feca57', marginTop: '0.1rem' }}>
                {winRate}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8395a7' }}>{totalMatches} Total Matches</div>
            </div>

            {/* Total Points */}
            <div style={{ background: '#24375d', border: '2px solid #090e18', boxShadow: '0 4px 0 #070c14', padding: '1rem', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.75rem', color: '#00d2d3', fontWeight: 900 }}>TOTAL SCORE</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#00d2d3', marginTop: '0.1rem' }}>
                {userStats.totalPoints}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8395a7' }}>{userStats.experience} Total XP</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
