import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Lobby from './pages/Lobby';
import Room from './pages/Room';
import Dashboard from './pages/Dashboard';

const ProtectedRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem('pixel_user'));
  if (!user) {
    return <Navigate to="/login" />;
  }
  return children;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route 
        path="/lobby" 
        element={<ProtectedRoute><Lobby /></ProtectedRoute>} 
      />
      <Route 
        path="/room/:roomId" 
        element={<ProtectedRoute><Room /></ProtectedRoute>} 
      />
      <Route 
        path="/dashboard" 
        element={<ProtectedRoute><Dashboard /></ProtectedRoute>} 
      />
      <Route path="/" element={<Navigate to="/lobby" />} />
    </Routes>
  );
}

export default App;
