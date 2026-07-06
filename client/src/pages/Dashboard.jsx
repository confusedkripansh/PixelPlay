import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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

    // Fetch latest profile
    fetch(`http://localhost:8080/api/user/profile/${user.googleId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setUserStats(data.stats);
          setEditName(data.name);
          setEditAvatar(data.avatarUrl);
        } else {
          // Fallback for guests or new users
          setUserStats({ wins: 0, losses: 0, experience: 0, totalPoints: 0 });
          setEditName(user.name);
          setEditAvatar(user.avatarUrl);
        }
      })
      .catch(err => {
        console.error(err);
        setUserStats({ wins: 0, losses: 0, experience: 0, totalPoints: 0 });
        setEditName(user.name);
        setEditAvatar(user.avatarUrl);
      });
  }, [user, navigate]);

  const handleSaveProfile = async () => {
    try {
      const res = await fetch(`http://localhost:8080/api/user/update/${user.googleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, avatarUrl: editAvatar })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setIsEditing(false);
        // Update local storage
        const updatedUser = { ...user, name: editName, avatarUrl: editAvatar };
        localStorage.setItem('pixel_user', JSON.stringify(updatedUser));
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!userStats) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}><h2>Loading Stats...</h2></div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--accent-primary)' }}>Career Dashboard</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/lobby')}>Back to Lobby</button>
      </div>

      <div style={{ display: 'flex', gap: '2rem' }}>
        {/* Profile Card */}
        <div className="glass-panel" style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src={editAvatar} alt="avatar" style={{ width: '120px', height: '120px', borderRadius: '50%', marginBottom: '1rem', border: '4px solid var(--accent-secondary)' }} />
          
          {isEditing ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="In-Game Name" style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid var(--glass-border)' }} />
              <input type="text" value={editAvatar} onChange={e => setEditAvatar(e.target.value)} placeholder="Avatar URL" style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid var(--glass-border)' }} />
              <button className="btn btn-primary" onClick={handleSaveProfile}>Save</button>
              <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
            </div>
          ) : (
            <>
              <h2>{editName}</h2>
              <p style={{ color: 'var(--text-secondary)' }}>{user.googleId}</p>
              <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => setIsEditing(true)}>Edit Profile</button>
            </>
          )}
        </div>

        {/* Stats Card */}
        <div className="glass-panel" style={{ flex: 2, padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', color: '#f59e0b' }}>Career Stats</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
              <h4 style={{ color: 'var(--text-secondary)', margin: 0 }}>Wins</h4>
              <p style={{ fontSize: '2rem', margin: '0.5rem 0 0 0', color: 'var(--accent-success)' }}>{userStats.wins}</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
              <h4 style={{ color: 'var(--text-secondary)', margin: 0 }}>Losses</h4>
              <p style={{ fontSize: '2rem', margin: '0.5rem 0 0 0', color: 'var(--accent-danger)' }}>{userStats.losses}</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
              <h4 style={{ color: 'var(--text-secondary)', margin: 0 }}>Experience</h4>
              <p style={{ fontSize: '2rem', margin: '0.5rem 0 0 0', color: 'var(--accent-secondary)' }}>{userStats.experience}</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
              <h4 style={{ color: 'var(--text-secondary)', margin: 0 }}>Total Points Scored</h4>
              <p style={{ fontSize: '2rem', margin: '0.5rem 0 0 0', color: 'var(--accent-primary)' }}>{userStats.totalPoints}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
