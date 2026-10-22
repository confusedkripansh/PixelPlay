import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

const Login = () => {
  const [inGameName, setInGameName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  const handleGuestLogin = () => {
    const guestId = 'guest-' + Math.floor(100000 + Math.random() * 900000);
    const guestUser = {
      googleId: guestId,
      name: inGameName.trim() || `Player_${guestId.slice(-4)}`,
      avatarUrl: `https://robohash.org/${guestId}?set=set4`
    };
    localStorage.setItem('pixel_user', JSON.stringify(guestUser));
    navigate('/lobby');
  };

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="login-container glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
        <h1 className="logo" style={{ marginBottom: '1rem' }}>
          Pixel<span className="text-gradient" style={{ color: 'var(--accent-primary)' }}>1000</span>
        </h1>
        <h2 style={{ marginBottom: '0.5rem' }}>Welcome to the Arena</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Sign in to track your stats or play directly as a guest!
        </p>

        {errorMessage && (
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
            {errorMessage}
          </div>
        )}

        <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
          <label style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
            In-Game Name (Optional)
          </label>
          <input 
            type="text" 
            value={inGameName}
            onChange={(e) => setInGameName(e.target.value)}
            placeholder="e.g. PixelMaster99"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
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
                  console.log("Logged in:", data.user);
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
              setErrorMessage('Google Sign-In failed or was cancelled.');
            }}
            theme="filled_black"
          />

          <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.5rem', margin: '0.5rem 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
          </div>

          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={handleGuestLogin}
            style={{ width: '100%', padding: '0.75rem' }}
          >
            🎮 Play Instantly as Guest
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
