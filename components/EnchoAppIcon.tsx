import React from 'react';

interface EnchoAppIconProps {
  size?: number;
  className?: string;
}

/**
 * AMIGOve Mobile App Icon
 * 
 * - Shape: Clean squircle / superellipse with 22% corner radius (iOS / Android icon standard)
 * - Background: Solid deep Midnight Navy (#0F172A)
 * - Symbol: Custom 've' with an artistic green leaf in vibrant green (#10B981)
 */
export const EnchoAppIcon: React.FC<EnchoAppIconProps> = ({ size = 512, className = "" }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 512 512" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="AMIGOve App Icon"
    >
      <defs>
        {/* Glow filter for OLED high contrast vibrance */}
        <filter id="greenGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="#10B981" floodOpacity="0.35" />
        </filter>
        {/* Squircle clip mask */}
        <clipPath id="squircleClip">
          <rect x="0" y="0" width="512" height="512" rx="115" ry="115" />
        </clipPath>
      </defs>

      {/* Background Squircle */}
      <rect 
        x="0" 
        y="0" 
        width="512" 
        height="512" 
        rx="115" 
        ry="115" 
        fill="#0F172A" 
      />

      {/* Custom 've' with artistic leaf */}
      <g filter="url(#greenGlow)" transform="translate(102, 154) scale(7)">
        {/* v */}
        <path 
          d="M 0,10 H 5.5 L 9,22 L 12.5,10 H 18 L 11.5,28 H 6.5 Z" 
          fill="#10B981" 
        />
        {/* e top half */}
        <path 
          d="M 29,10 C 33,10 36,13 37,18 H 19.5 C 20,13 23,10 29,10 Z M 25,15 H 32 C 31,13 27,13 25,15 Z" 
          fill="#10B981" 
        />
        {/* e bottom half */}
        <path 
          d="M 19.5,20 H 25.5 C 26,24 30,24 31,22 H 37 C 36,26 33,29 29,29 C 25,29 20,26 19.5,20 Z" 
          fill="#10B981" 
        />
        {/* leaf */}
        <path 
          d="M 34,11 C 34,2 44,0 44,0 C 44,10 37,12 34,11 Z" 
          fill="#10B981" 
        />
      </g>
    </svg>
  );
};

export default EnchoAppIcon;
