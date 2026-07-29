import React from 'react';

interface EnchoAppIconProps {
  size?: number;
  className?: string;
}

/**
 * ENCHO 10/10 Mobile App Icon
 * 
 * - Shape: Clean squircle / superellipse with 22% corner radius (iOS / Android icon standard)
 * - Background: Solid deep Midnight Navy (#0F172A)
 * - Symbol: Custom monolithic 'H' in glowing Horizon Orange (#FF5722)
 * - Detail: Smooth architectural gateway / portal arch carved into the negative space beneath the crossbar
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
      aria-label="ENCHO App Icon"
    >
      <defs>
        {/* Glow filter for OLED high contrast vibrance */}
        <filter id="orangeGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="#FF5722" floodOpacity="0.25" />
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

      {/* Monolithic Custom 'H' with Architectural Gateway Arch */}
      <g filter="url(#orangeGlow)">
        <path 
          d="
            M 144,116 
            H 212 
            V 232 
            H 300 
            V 116 
            H 368 
            V 396 
            H 300 
            V 324 
            A 44,52 0 0,0 212,324 
            V 396 
            H 144 
            Z
          " 
          fill="#FF5722" 
        />
      </g>
    </svg>
  );
};

export default EnchoAppIcon;
