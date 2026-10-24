import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PilotAvatar from '../components/PilotAvatar';
import { 
  IconSwords, 
  IconTrophy, 
  IconZap, 
  IconLogout, 
  IconDashboard, 
  IconShield,
  IconBrush,
  IconCheck
} from '../components/Icons';
import { API_BASE_URL } from '../config';

const Dashboard = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(() => {
    return JSON.parse(localStorage.getItem('pixel_user')) || {
      googleId: 'guest-pilot',
      name: 'Guest Pilot',
      avatarUrl: '',
      stats: { wins: 0, losses: 0, experience: 0, totalPoints: 0 }
    };
  });
  
  const [userStats, setUserStats] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(currentUser.name || 'Guest Pilot');
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
        <h2 style={{ color: '#ffd000', letterSpacing: '1px' }}>SYNCHRONIZING CAREER DOSSIER...</h2>
      </div>
    );
  }

  const totalMatches = (userStats.wins || 0) + (userStats.losses || 0);
  const winRate = totalMatches > 0 ? Math.round((userStats.wins / totalMatches) * 100) : 0;
  const playerTier = Math.floor((userStats.experience || 0) / 100) + 1;
  const xpInTier = (userStats.experience || 0) % 100;

  const getTierTitle = (tier) => {
    if (tier >= 10) return 'CONTEST GRANDMASTER';
    if (tier >= 7) return 'ELITE STRIKER';
    if (tier >= 4) return 'VANGUARD ARTIST';
    if (tier >= 2) return 'ARENA COMPETITOR';
    return 'RECRUIT PILOT';
  };

  return (
    <div className="app-container" style={{ padding: '2rem', maxWidth: '920px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#ffd000', fontWeight: 800 }}>
            TOURNAMENT DOSSIER
          </div>
          <h1 style={{ color: '#f8fafc', margin: 0, fontSize: '1.75rem', letterSpacing: '0.5px' }}>
            CAREER <span style={{ color: '#ffd000' }}>DASHBOARD</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.85rem' }}>
          <button className="btn btn-primary" onClick={() => navigate('/lobby')} style={{ padding: '0.6rem 1.2rem' }}>
            <IconSwords size={16} />
            <span>Enter Lobby</span>
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={handleLogout}
            style={{ 
              color: '#ff3366', 
              borderColor: 'rgba(255, 51, 102, 0.4)', 
              background: 'rgba(255, 51, 102, 0.1)',
              padding: '0.6rem 1.1rem'
            }}
          >
            <IconLogout size={16} color="#ff3366" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'flex-start' }}>
        {/* Profile Card */}
        <div className="glass-panel" style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', borderLeft: '4px solid #ffd000' }}>
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <PilotAvatar src={currentUser.avatarUrl} name={currentUser.name} size={110} border="#ffd000" glow={true} />
            <span className="badge-tag" style={{ 
              position: 'absolute', 
              bottom: '-8px', 
              left: '50%', 
              transform: 'translateX(-50%)',
              background: '#ffd000',
              color: '#000',
              fontWeight: 900,
              boxShadow: '0 0 10px rgba(255, 208, 0, 0.5)',
              whiteSpace: 'nowrap'
            }}>
              TIER {playerTier}
            </span>
          </div>
          
          {isEditing ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800, marginBottom: '0.3rem' }}>
                  CALL-SIGN / USERNAME
                </label>
                <input 
                  type="text" 
                  value={editName} 
                  onChange={e => setEditName(e.target.value)} 
                  placeholder="Enter Call-sign" 
                  style={{ 
                    width: '100%',
                    padding: '0.65rem', 
                    background: '#111319', 
                    color: 'white', 
                    border: '1px solid #ffd000', 
                    borderRadius: '6px',
                    fontWeight: 800,
                    outline: 'none'
                  }} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800, marginBottom: '0.3rem' }}>
                  AVATAR IMAGE URL (OPTIONAL)
                </label>
                <input 
                  type="text" 
                  value={editAvatar} 
                  onChange={e => setEditAvatar(e.target.value)} 
                  placeholder="https://..." 
                  style={{ 
                    width: '100%',
                    padding: '0.65rem', 
                    background: '#111319', 
                    color: 'white', 
                    border: '1px solid rgba(255,255,255,0.15)', 
                    borderRadius: '6px',
                    outline: 'none'
                  }} 
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveProfile} 
                  disabled={isSaving}
                  style={{ flex: 1 }}
                >
                  {saveSuccess ? <><IconCheck size={16} /> Saved!</> : isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setEditName(currentUser.name);
                    setEditAvatar(currentUser.avatarUrl);
                    setIsEditing(false);
                  }} 
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: '1.4rem', margin: '0.75rem 0 0.15rem', color: '#f8fafc', textAlign: 'center' }}>
                {currentUser.name}
              </h2>
              <span style={{ fontSize: '0.75rem', color: '#ffd000', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '1.5rem' }}>
                {getTierTitle(playerTier)}
              </span>

              {/* Progress to next tier */}
              <div style={{ width: '100%', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 700 }}>
                  <span>TIER PROGRESS</span>
                  <span style={{ color: '#ffd000' }}>{xpInTier}/100 XP</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${xpInTier}%`, height: '100%', background: '#ffd000', boxShadow: '0 0 8px rgba(255, 208, 0, 0.6)' }} />
                </div>
              </div>

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
        <div className="glass-panel" style={{ flex: 1.8, padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ color: '#ffd000', margin: 0, fontSize: '1.15rem', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <IconTrophy size={18} color="#ffd000" /> TOURNAMENT COMBAT METRICS
            </h2>
            <span className="badge-live">OFFICIAL RECORDS</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {/* Wins */}
            <div style={{ background: '#111319', border: '1px solid rgba(255, 208, 0, 0.35)', padding: '1.25rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.7rem', color: '#ffd000', textTransform: 'uppercase', fontWeight: 800 }}>VICTORIES</div>
              <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ffd000', marginTop: '0.1rem' }}>
                {userStats.wins}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Matches Won</div>
            </div>

            {/* Losses */}
            <div style={{ background: '#111319', border: '1px solid rgba(255, 51, 102, 0.25)', padding: '1.25rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.7rem', color: '#ff3366', textTransform: 'uppercase', fontWeight: 800 }}>DEFEATS</div>
              <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ff3366', marginTop: '0.1rem' }}>
                {userStats.losses}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Matches Lost</div>
            </div>

            {/* Win Rate */}
            <div style={{ background: '#111319', border: '1px solid rgba(255, 255, 255, 0.12)', padding: '1.25rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.7rem', color: '#f8fafc', textTransform: 'uppercase', fontWeight: 800 }}>WIN RATIO</div>
              <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#f8fafc', marginTop: '0.1rem' }}>
                {winRate}%
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Across {totalMatches} Matches</div>
            </div>

            {/* Total Points */}
            <div style={{ background: '#111319', border: '1px solid rgba(255, 208, 0, 0.25)', padding: '1.25rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.7rem', color: '#ffd000', textTransform: 'uppercase', fontWeight: 800 }}>TOTAL SCORE</div>
              <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ffd000', marginTop: '0.1rem' }}>
                {userStats.totalPoints}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{userStats.experience} Total XP</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
