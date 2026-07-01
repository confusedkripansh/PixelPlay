import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Lobby from './pages/Lobby';
import Room from './pages/Room';

function App() {
  // In a real app, you would check auth state here
  const isAuthenticated = true;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route 
        path="/lobby" 
        element={isAuthenticated ? <Lobby /> : <Navigate to="/login" />} 
      />
      <Route 
        path="/room/:roomId" 
        element={isAuthenticated ? <Room /> : <Navigate to="/login" />} 
      />
      <Route path="/" element={<Navigate to="/lobby" />} />
    </Routes>
  );
}

export default App;
