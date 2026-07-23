import React from 'react';

interface AmigoveAppIconProps {
  size?: number;
  className?: string;
}

export const AmigoveAppIcon: React.FC<AmigoveAppIconProps> = ({ size = 512, className = "" }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 512 512" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="AMIGOVE App Icon"
    >
      <defs>
        <linearGradient id="brandGradIcon" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C24A30" />
          <stop offset="100%" stopColor="#E05A3D" />
        </linearGradient>
        <filter id="orangeGlowIcon" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="15" floodColor="#E05A3D" floodOpacity="0.3" />
        </filter>
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
        fill="#1A1C21" 
      />
      
      {/* The Forward Spark */}
      <g filter="url(#orangeGlowIcon)" transform="translate(60, 60) scale(0.4)">
        <path d="M 180 650 L 330 180 L 480 650" fill="none" stroke="url(#brandGradIcon)" strokeWidth="120" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M 260 450 L 580 450 L 680 300" fill="none" stroke="url(#brandGradIcon)" strokeWidth="120" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="630" cy="180" r="80" fill="#F4B34A" />
      </g>
    </svg>
  );
};

export default AmigoveAppIcon;
