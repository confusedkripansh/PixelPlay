import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

const Canvas = forwardRef(({ 
  isMyTurn, 
  onPixelDraw,
  onEndTurn,
  pixelsPerTurn = 3
}, ref) => {
  const canvasRef = useRef(null);
  const [pixelsDrawnThisTurn, setPixelsDrawnThisTurn] = useState(0);
  const [activeColor, setActiveColor] = useState('#000000');

  useImperativeHandle(ref, () => ({
    drawRemotePixel: (x, y, color) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    },
    syncFullGrid: (grid) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      for (let i = 0; i < 256; i++) {
        for (let j = 0; j < 256; j++) {
           if (grid[i][j] && grid[i][j] !== "#ffffff") {
               ctx.fillStyle = grid[i][j];
               ctx.fillRect(i, j, 1, 1);
           }
        }
      }
    }
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Fill white background initially
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const drawPixel = (e) => {
    if (!isMyTurn || pixelsDrawnThisTurn >= pixelsPerTurn) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate scale in case the canvas is resized via CSS
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = activeColor;
    ctx.fillRect(x, y, 1, 1); // Draw 1x1 pixel

    setPixelsDrawnThisTurn(prev => prev + 1);
    
    // Notify parent to send over WebSocket
    if (onPixelDraw) {
      onPixelDraw({ x, y, color: activeColor });
    }
  };

  const handleMouseMove = (e) => {
    // Only draw if left mouse button is pressed and it's our turn
    if (e.buttons !== 1) return;
    drawPixel(e);
  };

  return (
    <div className="canvas-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="canvas-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Turn: {isMyTurn ? <span style={{ color: 'var(--accent-success)' }}>Your Turn</span> : 'Waiting...'}</span>
        <span>Pixels drawn: {pixelsDrawnThisTurn} / {pixelsPerTurn}</span>
      </div>
      
      {/* Color Picker for All Shades */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Select Color:</span>
        <input 
          type="color" 
          value={activeColor}
          onChange={(e) => setActiveColor(e.target.value)}
          style={{
            width: '50px',
            height: '40px',
            padding: 0,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            backgroundColor: 'transparent'
          }}
        />
      </div>

      <canvas
        ref={canvasRef}
        width={256}
        height={256}
        onMouseDown={drawPixel}
        onMouseMove={handleMouseMove}
        style={{
          width: '100%',
          maxWidth: '512px', // Visual scale up for UI (2x size of 256)
          aspectRatio: '1/1',
          cursor: isMyTurn && pixelsDrawnThisTurn < pixelsPerTurn ? 'crosshair' : 'not-allowed',
          backgroundColor: '#fff',
          imageRendering: 'pixelated', // Keeps pixels sharp when scaled up
          boxShadow: 'var(--glass-shadow)'
        }}
      />
      {isMyTurn && (
        <button 
          className="btn btn-secondary" 
          style={{ width: '100%' }}
          onClick={() => {
            setPixelsDrawnThisTurn(0);
            if (onEndTurn) onEndTurn();
          }}
        >
          End Turn Early
        </button>
      )}
    </div>
  );
});

export default Canvas;
