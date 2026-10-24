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
      name: inGameName.trim() || `Pilot_${guestId.slice(-4)}`,
      avatarUrl: '',
      stats: { wins: 0, losses: 0, experience: 0, totalPoints: 0 }
    };
    localStorage.setItem('pixel_user', JSON.stringify(guestUser));
    navigate('/lobby');
  };

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="login-container glass-panel" style={{ 
        padding: '2.5rem', 
        textAlign: 'center', 
        maxWidth: '420px', 
        width: '100%',
        borderTop: '4px solid #ffd000',
        boxShadow: '0 0 35px rgba(255, 208, 0, 0.15)'
      }}>
        <div style={{ 
          width: '54px', 
          height: '54px', 
          borderRadius: '8px', 
          background: 'rgba(255, 208, 0, 0.15)', 
          border: '1px solid #ffd000',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          margin: '0 auto 1rem',
          boxShadow: '0 0 15px rgba(255, 208, 0, 0.25)'
        }}>
          <IconSwords size={26} color="#ffd000" />
        </div>
        <h1 className="logo" style={{ marginBottom: '0.2rem', fontSize: '1.8rem', letterSpacing: '0.5px' }}>
          PIXEL<span style={{ color: '#ffd000' }}>PLAY</span>
        </h1>
        <h2 style={{ marginBottom: '0.4rem', fontSize: '0.95rem', color: '#f8fafc', fontWeight: 800, letterSpacing: '0.5px' }}>
          COMPETITIVE DRAWING CONTEST
        </h2>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.8rem', lineHeight: '1.4' }}>
          Sign in via Google to permanently record your tournament career, or deploy instantly as an unverified guest pilot.
        </p>

        {errorMessage && (
          <div style={{ background: 'rgba(255, 51, 102, 0.15)', border: '1px solid #ff3366', color: '#fca5a5', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.8rem', textAlign: 'left' }}>
            {errorMessage}
          </div>
        )}

        <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
          <label style={{ color: '#94a3b8', display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem', fontWeight: 800 }}>
            CALL-SIGN / NAME (OPTIONAL)
          </label>
          <input 
            type="text" 
            value={inGameName}
            onChange={(e) => setInGameName(e.target.value)}
            placeholder="e.g. CyberViper"
            style={{ 
              width: '100%', 
              padding: '0.75rem', 
              borderRadius: '6px', 
              border: '1px solid rgba(255, 208, 0, 0.4)', 
              background: '#111319', 
              color: 'white', 
              outline: 'none',
              fontWeight: 800
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

          <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.75rem', margin: '0.25rem 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
            <span style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 800 }}>OR DIRECT ENTRY</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
          </div>

          <button 
            onClick={handleGuestLogin}
            className="btn btn-secondary"
            style={{ width: '100%', padding: '0.75rem', fontSize: '0.8rem' }}
          >
            <IconUser size={16} />
            <span>Deploy as Guest Pilot</span>
          </button>
        </div>

        {isLoading && (
          <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#ffd000' }}>
            <span className="laser-pulse">Connecting to arena cluster...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
