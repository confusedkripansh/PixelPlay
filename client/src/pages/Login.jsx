import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { IconSwords, IconZap, IconUser } from '../components/Icons';
import { API_BASE_URL } from '../config';

const Login = () => {
  const navigate = useNavigate();
  const [inGameName, setInGameName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGuestLogin = () => {
    const guestId = 'guest-' + Math.floor(100000 + Math.random() * 900000);
    const guestUser = {
      googleId: guestId,
      name: inGameName.trim() || `Player_${guestId.slice(-4)}`,
      avatarUrl: '',
      stats: { wins: 0, losses: 0, experience: 0, totalPoints: 0 }
    };
    localStorage.setItem('pixel_user', JSON.stringify(guestUser));
    navigate('/lobby');
  };

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="io-card" style={{ 
        padding: '2.5rem', 
        textAlign: 'center', 
        maxWidth: '440px', 
        width: '100%',
        borderTop: '6px solid #feca57'
      }}>
        <div style={{ 
          width: '60px', 
          height: '60px', 
          borderRadius: '50%', 
          background: '#feca57', 
          border: '3px solid #090e18',
          boxShadow: '0 4px 0 #ff9f43',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          margin: '0 auto 1rem'
        }}>
          <IconSwords size={30} color="#222f3e" />
        </div>

        <h1 style={{ marginBottom: '0.2rem', fontSize: '2.2rem', color: '#ffffff' }}>
          PIXEL<span style={{ color: '#feca57' }}>PLAY.IO</span>
        </h1>
        <h2 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: '#1dd1a1', fontWeight: 800 }}>
          MULTIPLAYER DRAWING GAME
        </h2>
        <p style={{ color: '#c8d6e5', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          Sign in to save your level and stats, or jump straight into the game as a guest!
        </p>

        {errorMessage && (
          <div style={{ background: '#ee5253', border: '2px solid #090e18', color: '#fff', padding: '0.65rem', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.8rem', fontWeight: 800 }}>
            {errorMessage}
          </div>
        )}

        <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
          <label style={{ color: '#c8d6e5', display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', fontWeight: 800 }}>
            NICKNAME (OPTIONAL)
          </label>
          <input 
            type="text" 
            value={inGameName}
            onChange={(e) => setInGameName(e.target.value)}
            placeholder="e.g. MasterArtist"
            style={{ 
              width: '100%', 
              padding: '0.75rem', 
              borderRadius: '10px', 
              border: '2px solid #090e18', 
              background: '#24375d', 
              color: 'white', 
              outline: 'none',
              fontWeight: 900,
              fontSize: '1rem'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', alignItems: 'center' }}>
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              setIsLoading(true);
              setErrorMessage('');
              try {
                const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    token: credentialResponse.credential,
                    inGameName: inGameName
                  })
                });
                const data = await res.json();
                if (data.status === 'success') {
                  localStorage.setItem('pixel_user', JSON.stringify(data.user));
                  navigate('/lobby');
                } else {
                  setErrorMessage(data.error || "Login rejected by server.");
                }
              } catch (e) {
                console.error("Login request failed", e);
                setErrorMessage(`Could not reach backend at ${API_BASE_URL}. Error: ${e.message}`);
              } finally {
                setIsLoading(false);
              }
            }}
            onError={() => {
              setErrorMessage('Google Sign-In was cancelled or failed.');
            }}
            theme="filled_black"
          />

          <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.75rem', margin: '0.2rem 0' }}>
            <div style={{ flex: 1, height: '2px', background: '#090e18' }}></div>
            <span style={{ color: '#8395a7', fontSize: '0.75rem', fontWeight: 900 }}>OR</span>
            <div style={{ flex: 1, height: '2px', background: '#090e18' }}></div>
          </div>

          <button 
            onClick={handleGuestLogin}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem' }}
          >
            <IconUser size={18} />
            <span>PLAY AS GUEST</span>
          </button>
        </div>

        {isLoading && (
          <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#feca57', fontWeight: 800 }}>
            Connecting to game server...
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
