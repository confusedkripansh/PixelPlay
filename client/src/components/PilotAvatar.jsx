import React from 'react';

/**
 * PilotAvatar renders a sleek esports emblem or real Google photo.
 * It eliminates tacky robohash robot images in favor of sharp competitive gaming styling.
 */
const PilotAvatar = ({ 
  src, 
  name = 'Pilot', 
  size = 36, 
  border = '#00f0ff',
  glow = false,
  className = ''
}) => {
  const isCustomOrGoogle = src && (
    src.includes('googleusercontent.com') || 
    src.startsWith('data:') || 
    src.startsWith('blob:') ||
    (!src.includes('robohash.org') && src.startsWith('http'))
  );

  const initial = (name || 'P').charAt(0).toUpperCase();

  // Color generator based on name string for consistent distinctive badges
  const getBadgeColor = (str) => {
    const colors = ['#00f0ff', '#ff3366', '#ffd000', '#00ff88', '#38bdf8', '#a855f7'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const badgeColor = border || getBadgeColor(name);

  if (isCustomOrGoogle) {
    return (
      <img
        src={src}
        alt={name}
        className={className}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          objectFit: 'cover',
          border: `2px solid ${badgeColor}`,
          boxShadow: glow ? `0 0 12px ${badgeColor}` : 'none',
          background: 'rgba(15, 20, 28, 0.8)'
        }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: `linear-gradient(135deg, rgba(15, 20, 28, 0.95), rgba(26, 34, 50, 0.95))`,
        border: `2px solid ${badgeColor}`,
        boxShadow: glow ? `0 0 12px ${badgeColor}` : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: badgeColor,
        fontWeight: 900,
        fontSize: `${Math.round(size * 0.42)}px`,
        fontFamily: "'Chakra Petch', monospace, sans-serif",
        textShadow: `0 0 8px ${badgeColor}`,
        userSelect: 'none',
        flexShrink: 0
      }}
    >
      {initial}
    </div>
  );
};

export default PilotAvatar;
