import React from 'react';

interface EnchoWordmarkProps {
  className?: string;
}

export const EnchoWordmark: React.FC<EnchoWordmarkProps> = ({ className = "h-6 w-auto" }) => {
  return (
    <svg 
      viewBox="0 0 162 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300`}
      aria-label="ENCHO"
    >
      {/* E - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 0,5 H 21 V 11.5 H 6.5 V 16.75 H 18 V 23.25 H 6.5 V 28.5 H 21 V 35 H 0 Z" 
        fill="#0F172A" 
      />
      
      {/* N - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 28.5,5 H 35 L 48.5,25.5 V 5 H 55 V 35 H 48.5 L 35,14.5 V 35 H 28.5 Z" 
        fill="#0F172A" 
      />
      
      {/* C - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 88,10.2 A 15,15 0 1,0 88,29.8 L 83.2,25.2 A 8.5,8.5 0 1,1 83.2,14.8 Z" 
        fill="#0F172A" 
      />
      
      {/* H - Visual Anchor in Vibrant Horizon Orange (#FF5722) with Gateway Archway underneath */}
      <path 
        d="M 96,5 H 102.5 V 16.5 H 115.5 V 5 H 122 V 35 H 115.5 A 6.5,12 0 0 1 102.5,35 H 96 Z" 
        fill="#FF5722" 
      />
      
      {/* O - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 144.5,5 A 15,15 0 1,0 144.5,35 A 15,15 0 1,0 144.5,5 Z M 144.5,11.5 A 8.5,8.5 0 1,1 144.5,28.5 A 8.5,8.5 0 1,1 144.5,11.5 Z" 
        fill="#0F172A" 
      />
    </svg>
  );
};
