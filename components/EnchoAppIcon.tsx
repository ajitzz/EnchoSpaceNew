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
      <g filter="url(#greenGlow)" transform="translate(60, 145) scale(6)">
        {/* v */}
        <path 
          d="M 0,14 H 7 L 12,29 L 17,14 H 24 L 16,34 H 8 Z" 
          fill="#10B981" 
        />
        {/* e */}
        <path 
          d="M 40,14 C 50,14 55,19 55,25 H 31 C 32,30 36,34 41,34 C 45,34 48,32 50,29 L 56,32 C 53,36 47,37 41,37 C 30,37 23,30 23,24 C 23,18 30,14 40,14 Z M 40,19 C 35,19 32,21 31,24 H 48 C 47,21 44,19 40,19 Z" 
          fill="#10B981" 
        />
        {/* leaf */}
        <path 
          d="M 48,16 C 51,6 61,2 64,4 C 65,10 58,15 48,16 Z" 
          fill="#10B981" 
        />
      </g>
    </svg>
  );
};

export default EnchoAppIcon;
