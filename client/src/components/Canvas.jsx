import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

const Canvas = forwardRef(({ 
  isMyTurn, 
  onPixelDraw, 
  onEndTurn,
  pixelsPerTurn = 1000
}, ref) => {
  const canvasRef = useRef(null);
  const [inkUsed, setInkUsed] = useState(0);
  const [activeColor, setActiveColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(8);
  
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
      const size = stroke.size || 8;
      drawSmoothStroke(ctx, stroke.x0, stroke.y0, stroke.x1, stroke.y1, stroke.color, size);
    },
    syncFullStrokes: (strokes) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      if (Array.isArray(strokes)) {
        strokes.forEach(stroke => {
          const size = stroke.size || 8;
          drawSmoothStroke(ctx, stroke.x0, stroke.y0, stroke.x1, stroke.y1, stroke.color, size);
        });
      }
    }
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const drawSmoothStroke = (ctx, x0, y0, x1, y1, color, size = 8) => {
    if (!ctx) return;
    const startX = Number(x0);
    const startY = Number(y0);
    const endX = Number(x1);
    const endY = Number(y1);
    if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) return;

    const strokeWidth = Number(size) || 8;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    // Differentiate single click (dot) from continuous segment to avoid beading aliasing
    if (Math.abs(startX - endX) < 0.1 && Math.abs(startY - endY) < 0.1) {
      ctx.arc(startX, startY, strokeWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  };

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

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

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = activeColor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();

      if (onPixelDraw) {
        onPixelDraw({
          x0: Math.round(pos.x * 10) / 10,
          y0: Math.round(pos.y * 10) / 10,
          x1: Math.round(pos.x * 10) / 10,
          y1: Math.round(pos.y * 10) / 10,
          color: activeColor,
          size: brushSize
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

    const dx = currentPos.x - lastPos.current.x;
    const dy = currentPos.y - lastPos.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 1) return;

    if (inkUsed + distance > pixelsPerTurn) {
      isDrawing.current = false;
      lastPos.current = null;
      return;
    }

    drawSmoothStroke(ctx, lastPos.current.x, lastPos.current.y, currentPos.x, currentPos.y, activeColor, brushSize);
    setInkUsed(prev => prev + distance);

    if (onPixelDraw) {
      onPixelDraw({
        x0: Math.round(lastPos.current.x * 10) / 10,
        y0: Math.round(lastPos.current.y * 10) / 10,
        x1: Math.round(currentPos.x * 10) / 10,
        y1: Math.round(currentPos.y * 10) / 10,
        color: activeColor,
        size: brushSize
      });
    }

    lastPos.current = currentPos;
  };

  const stopDrawing = (e) => {
    if (e && e.type === 'touchend') e.preventDefault();
    isDrawing.current = false;
    lastPos.current = null;
  };

  // Vibrant Skribbl.io 12-Color Palette
  const skribblPalette = [
    '#000000', '#ffffff', '#7f8c8d', '#2e86de', 
    '#00d2d3', '#10ac84', '#1dd1a1', '#feca57', 
    '#ff9f43', '#ee5253', '#5f27cd', '#ff9ff3'
  ];

  const inkPercentage = Math.max(0, 100 - Math.round((inkUsed / pixelsPerTurn) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '560px' }}>
      
      {/* Top Status & Ink (Only for Drawer) */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '0.4rem 0.8rem',
        background: '#1b2a47',
        border: '3px solid #090e18',
        borderRadius: '12px',
        boxShadow: '0 4px 0 #070c14'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ 
            fontSize: '0.85rem', 
            fontWeight: 900,
            color: isMyTurn ? '#1dd1a1' : '#feca57',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}>
            {isMyTurn ? '✏️ YOUR TURN TO DRAW!' : '👀 SPECTATING BOARD'}
          </span>
        </div>

        {/* Ink Meter: ONLY visible for active drawer */}
        {isMyTurn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#feca57' }}>
              INK: <span style={{ color: inkPercentage > 20 ? '#1dd1a1' : '#ee5253' }}>{inkPercentage}%</span>
            </span>
            <div style={{ 
              width: '110px', 
              height: '10px', 
              background: '#090e18', 
              borderRadius: '6px', 
              overflow: 'hidden',
              border: '1.5px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ 
                width: `${inkPercentage}%`, 
                height: '100%', 
                background: inkPercentage > 20 ? '#1dd1a1' : '#ee5253',
                transition: 'width 0.1s linear' 
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Main Drawing Canvas (Skribbl.io Chunky Frame) */}
      <div style={{
        background: '#ffffff',
        border: isMyTurn ? '4px solid #10ac84' : '4px solid #090e18',
        borderRadius: '14px',
        boxShadow: isMyTurn ? '0 8px 0 #0b6850' : '0 8px 0 #070c14',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        transition: 'border 0.2s ease, box-shadow 0.2s ease'
      }}>
        <canvas
          ref={canvasRef}
          width={560}
          height={480}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            aspectRatio: '560/480',
            cursor: isMyTurn && inkUsed < pixelsPerTurn ? 'crosshair' : 'default',
            backgroundColor: '#ffffff',
            touchAction: 'none'
          }}
        />
      </div>

      {/* Skribbl.io Arcade Color Palette Toolbar */}
      {isMyTurn && (
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap',
          gap: '0.5rem', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: '#1b2a47',
          padding: '0.6rem 0.9rem',
          borderRadius: '14px',
          border: '3px solid #090e18',
          boxShadow: '0 5px 0 #070c14'
        }}>
          {/* Swatches */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {skribblPalette.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => setActiveColor(col)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: col,
                  border: activeColor === col ? '3px solid #ffffff' : '2px solid #090e18',
                  boxShadow: activeColor === col ? '0 0 8px #ffffff' : '0 2px 0 rgba(0,0,0,0.4)',
                  cursor: 'pointer',
                  transform: activeColor === col ? 'scale(1.25)' : 'scale(1)',
                  transition: 'transform 0.1s ease'
                }}
              />
            ))}
          </div>

          {/* Brush sizes with dynamic size indicator pills */}
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {[
              { size: 4, dotPx: 5, label: 'Fine' },
              { size: 8, dotPx: 9, label: 'Medium' },
              { size: 14, dotPx: 14, label: 'Thick' },
              { size: 22, dotPx: 20, label: 'Chunky' }
            ].map(({ size, dotPx, label }) => (
              <button
                key={size}
                type="button"
                title={`Brush: ${label} (${size}px)`}
                onClick={() => setBrushSize(size)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: brushSize === size ? '#feca57' : '#34495e',
                  border: brushSize === size ? '2.5px solid #ffffff' : '2px solid #090e18',
                  boxShadow: brushSize === size ? '0 0 8px #feca57' : '0 2px 0 #090e18',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'transform 0.1s ease, border-color 0.1s ease',
                  transform: brushSize === size ? 'scale(1.08)' : 'scale(1)'
                }}
              >
                <span
                  style={{
                    width: `${dotPx}px`,
                    height: `${dotPx}px`,
                    borderRadius: '50%',
                    background: brushSize === size ? '#222f3e' : '#ffffff',
                    display: 'inline-block'
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default Canvas;
