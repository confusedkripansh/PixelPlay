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
      
      strokes.forEach(stroke => {
        drawSmoothStroke(ctx, stroke.x0, stroke.y0, stroke.x1, stroke.y1, stroke.color);
      });
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
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    if (!isMyTurn || inkUsed >= pixelsPerTurn) return;
    isDrawing.current = true;
    lastPos.current = getCoordinates(e);
  };

  const draw = (e) => {
    if (!isDrawing.current || !isMyTurn || inkUsed >= pixelsPerTurn) return;

    const currentPos = getCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Calculate distance for ink
    const dx = currentPos.x - lastPos.current.x;
    const dy = currentPos.y - lastPos.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (inkUsed + distance > pixelsPerTurn) {
      isDrawing.current = false;
      return;
    }

    drawSmoothStroke(ctx, lastPos.current.x, lastPos.current.y, currentPos.x, currentPos.y, activeColor);
    
    setInkUsed(prev => prev + distance);

    // Notify parent to send over WebSocket
    if (onPixelDraw) {
      onPixelDraw({
        x0: lastPos.current.x,
        y0: lastPos.current.y,
        x1: currentPos.x,
        y1: currentPos.y,
        color: activeColor
      });
    }

    lastPos.current = currentPos;
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  return (
    <div className="canvas-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      <div className="canvas-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Turn: {isMyTurn ? <span style={{ color: 'var(--accent-success)' }}>Your Turn</span> : 'Waiting...'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>Ink Left:</span>
          <div style={{ width: '150px', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(0, 100 - (inkUsed / pixelsPerTurn) * 100)}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.1s linear' }} />
          </div>
        </div>
      </div>
      
      {/* Color Picker */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Brush Color:</span>
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
        width={512} // Increased logical resolution for smooth vector strokes
        height={512}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        style={{
          width: '100%',
          maxWidth: '512px',
          aspectRatio: '1/1',
          cursor: isMyTurn && inkUsed < pixelsPerTurn ? 'crosshair' : 'not-allowed',
          backgroundColor: '#fff',
          boxShadow: 'var(--glass-shadow)',
          borderRadius: '8px'
        }}
      />
      {isMyTurn && (
        <button 
          className="btn btn-secondary" 
          style={{ width: '100%' }}
          onClick={() => {
            setInkUsed(0);
            if (onEndTurn) onEndTurn();
          }}
        >
          Finish Drawing Early
        </button>
      )}
    </div>
  );
});

export default Canvas;
