import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

const Canvas = forwardRef(({ 
  isMyTurn, 
  onPixelDraw, // Note: Now acts as onStrokeDraw
  onEndTurn,
  pixelsPerTurn = 1000 // Now acts as Ink Limit
}, ref) => {
  const canvasRef = useRef(null);
  const [inkUsed, setInkUsed] = useState(0);
  const [activeColor, setActiveColor] = useState('#000000');
  
  const isDrawing = useRef(false);
  const lastPos = useRef(null);

  useImperativeHandle(ref, () => ({
    clearCanvas: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setInkUsed(0);
    },
    drawRemoteStroke: (stroke) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      drawSmoothStroke(ctx, stroke.x0, stroke.y0, stroke.x1, stroke.y1, stroke.color);
    },
    syncFullStrokes: (strokes) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      // Clear before sync
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      if (Array.isArray(strokes)) {
        strokes.forEach(stroke => {
          drawSmoothStroke(ctx, stroke.x0, stroke.y0, stroke.x1, stroke.y1, stroke.color);
        });
      }
    }
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Fill white background initially
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Set up smooth brush settings
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12; // Big paintbrush feel
  }, []);

  const drawSmoothStroke = (ctx, x0, y0, x1, y1, color) => {
    if (!ctx) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    // Also draw circle at ends for seamless joins
    ctx.beginPath();
    ctx.arc(x1, y1, 5, 0, Math.PI * 2);
    ctx.fill();
  };

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Handle touch events
    if (e.touches && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    if (!isMyTurn || inkUsed >= pixelsPerTurn) return;
    if (e.type === 'touchstart') e.preventDefault();
    isDrawing.current = true;
    const pos = getCoordinates(e);
    lastPos.current = pos;

    // Render initial dot on click / touch tap
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = activeColor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      ctx.fill();

      if (onPixelDraw) {
        onPixelDraw({
          x0: pos.x,
          y0: pos.y,
          x1: pos.x,
          y1: pos.y,
          color: activeColor
        });
      }
    }
  };

  const draw = (e) => {
    if (!isDrawing.current || !isMyTurn || inkUsed >= pixelsPerTurn || !lastPos.current) return;
    if (e.type === 'touchmove') e.preventDefault();

    const currentPos = getCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Calculate distance for ink
    const dx = currentPos.x - lastPos.current.x;
    const dy = currentPos.y - lastPos.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 1) return; // skip sub-pixel jitters

    if (inkUsed + distance > pixelsPerTurn) {
      isDrawing.current = false;
      lastPos.current = null;
      return;
    }

    drawSmoothStroke(ctx, lastPos.current.x, lastPos.current.y, currentPos.x, currentPos.y, activeColor);
    
    setInkUsed(prev => prev + distance);

    // Notify parent to send over WebSocket
    if (onPixelDraw) {
      onPixelDraw({
        x0: Math.round(lastPos.current.x * 10) / 10,
        y0: Math.round(lastPos.current.y * 10) / 10,
        x1: Math.round(currentPos.x * 10) / 10,
        y1: Math.round(currentPos.y * 10) / 10,
        color: activeColor
      });
    }

    lastPos.current = currentPos;
  };

  const stopDrawing = (e) => {
    if (e && e.type === 'touchend') e.preventDefault();
    isDrawing.current = false;
    lastPos.current = null;
  };

  const colorPresets = [
    { label: 'Black', color: '#000000' },
    { label: 'Cyan', color: '#00f0ff' },
    { label: 'Red', color: '#ff3366' },
    { label: 'Green', color: '#00ff88' },
    { label: 'Gold', color: '#ffd000' },
    { label: 'Blue', color: '#0066ff' },
    { label: 'White', color: '#ffffff' }
  ];

  const inkPercentage = Math.max(0, 100 - Math.round((inkUsed / pixelsPerTurn) * 100));

  return (
    <div className="canvas-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%', maxWidth: '512px' }}>
      {/* Gaming HUD Header */}
      <div className="canvas-hud" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '0.6rem 1rem',
        background: 'rgba(15, 20, 28, 0.95)',
        border: isMyTurn ? '1px solid #ffd000' : '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        boxShadow: isMyTurn ? '0 0 15px rgba(255, 208, 0, 0.15)' : 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ 
            fontSize: '0.75rem', 
            textTransform: 'uppercase', 
            letterSpacing: '1px', 
            fontWeight: 800,
            color: isMyTurn ? '#ffd000' : '#94a3b8'
          }}>
            {isMyTurn ? '● LIVE DRAWING TURN' : '○ SPECTATING CANVAS'}
          </span>
        </div>

        {/* Ink Meter: ONLY visible for the active drawer! Never for judges or spectators */}
        {isMyTurn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8' }}>
              INK: <span style={{ color: inkPercentage > 20 ? '#ffd000' : '#ff3366' }}>{inkPercentage}%</span>
            </span>
            <div style={{ 
              width: '120px', 
              height: '8px', 
              background: 'rgba(255,255,255,0.08)', 
              borderRadius: '4px', 
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ 
                width: `${inkPercentage}%`, 
                height: '100%', 
                background: inkPercentage > 20 ? '#ffd000' : '#ff3366',
                boxShadow: inkPercentage > 20 ? '0 0 8px rgba(255, 208, 0, 0.7)' : '0 0 8px rgba(255, 51, 102, 0.8)',
                transition: 'width 0.1s linear' 
              }} />
            </div>
          </div>
        )}
      </div>
      
      {/* Palette Bar */}
      {isMyTurn && (
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: 'rgba(15, 20, 28, 0.8)',
          padding: '0.4rem 0.8rem',
          borderRadius: '8px',
          border: '1px solid rgba(255, 208, 0, 0.2)'
        }}>
          {colorPresets.map((p) => (
            <button
              key={p.color}
              type="button"
              onClick={() => setActiveColor(p.color)}
              title={p.label}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: p.color,
                border: activeColor === p.color ? '2px solid #ffd000' : '1px solid rgba(255,255,255,0.2)',
                boxShadow: activeColor === p.color ? '0 0 8px #ffd000' : 'none',
                cursor: 'pointer',
                transform: activeColor === p.color ? 'scale(1.2)' : 'scale(1)',
                transition: 'transform 0.15s ease'
              }}
            />
          ))}
          <input 
            type="color" 
            value={activeColor}
            onChange={(e) => setActiveColor(e.target.value)}
            title="Custom Color"
            style={{
              width: '28px',
              height: '28px',
              padding: 0,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: 'transparent'
            }}
          />
        </div>
      )}

      {/* Main Canvas */}
      <canvas
        ref={canvasRef}
        width={512}
        height={512}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{
          width: '100%',
          maxWidth: '512px',
          aspectRatio: '1/1',
          cursor: isMyTurn && inkUsed < pixelsPerTurn ? 'crosshair' : 'not-allowed',
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          border: isMyTurn ? '2px solid #ffd000' : '2px solid rgba(255, 255, 255, 0.12)',
          boxShadow: isMyTurn ? '0 0 25px rgba(255, 208, 0, 0.25)' : '0 8px 30px rgba(0,0,0,0.5)',
          touchAction: 'none'
        }}
      />
    </div>
  );
});

export default Canvas;
