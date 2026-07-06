import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [inGameName, setInGameName] = useState('');
  const navigate = useNavigate();

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="login-container glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
        <h1 className="logo" style={{ marginBottom: '1rem' }}>
          Pixel<span className="text-gradient" style={{ color: 'var(--accent-primary)' }}>1000</span>
        </h1>
        <h2 style={{ marginBottom: '0.5rem' }}>Welcome to the Arena</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Sign in to track your stats and join the pixel art battle!
        </p>

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
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              try {
                const res = await fetch('http://localhost:8080/api/auth/google', {
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
                }
              } catch (e) {
                console.error("Login request failed", e);
              }
            }}
            onError={() => {
              console.log('Login Failed');
            }}
            theme="filled_black"
          />
        </div>
      </div>
    </div>
  );
};

export default Login;
