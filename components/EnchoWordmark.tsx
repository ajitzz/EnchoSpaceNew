import React from 'react';

interface EnchoWordmarkProps {
  className?: string;
}

export const EnchoWordmark: React.FC<EnchoWordmarkProps> = ({ className = "h-6 w-auto" }) => {
  return (
    <svg 
      viewBox="0 0 160 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300`}
      aria-label="ENCHO"
    >
      {/* E - Deep Midnight Black */}
      <path 
        d="M 0,4 H 22 V 11 H 7 V 16.5 H 18.5 V 23.5 H 7 V 29 H 22 V 36 H 0 Z" 
        fill="#0F172A" 
      />
      
      {/* N - Deep Midnight Black */}
      <path 
        d="M 28,4 H 35 L 50,26.5 V 4 H 57 V 36 H 50 L 35,13.5 V 36 H 28 Z" 
        fill="#0F172A" 
      />
      
      {/* C - Deep Midnight Black */}
      <path 
        d="M 84,11.5 A 16,16 0 1,0 84,28.5 L 78.5,23.5 A 9,9 0 1,1 78.5,16.5 Z" 
        fill="#0F172A" 
      />
      
      {/* H - Visual Anchor in Vibrant Horizon Orange with Smooth Gateway Archway underneath */}
      <path 
        d="M 94,4 H 101 V 16 H 117 V 4 H 124 V 36 H 117 V 29 A 8,6.5 0 0 0 101,29 V 36 H 94 Z" 
        fill="#FF5722" 
      />
      
      {/* O - Deep Midnight Black */}
      <path 
        d="M 143,4 A 16,16 0 1,0 143,36 A 16,16 0 1,0 143,4 Z M 143,11 A 9,9 0 1,1 143,29 A 9,9 0 1,1 143,11 Z" 
        fill="#0F172A" 
      />
    </svg>
  );
};
