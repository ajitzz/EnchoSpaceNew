import React from 'react';

interface EnchoWordmarkProps {
  className?: string;
}

export const EnchoWordmark: React.FC<EnchoWordmarkProps> = ({ className = "h-6 w-auto" }) => {
  return (
    <svg 
      viewBox="0 0 152 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300`}
      aria-label="ENCHO"
    >
      {/* E - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 0,6 H 20 V 12 H 6.2 V 17 H 16.5 V 23 H 6.2 V 28 H 20 V 34 H 0 Z" 
        fill="#0F172A" 
      />
      
      {/* N - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 27,6 H 33.5 L 45.5,25 V 6 H 52 V 34 H 45.5 L 33.5,15 V 34 H 27 Z" 
        fill="#0F172A" 
      />
      
      {/* C - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 83,11.5 A 14,14 0 1,0 83,28.5 L 78.2,24.2 A 7.8,7.8 0 1,1 78.2,15.8 Z" 
        fill="#0F172A" 
      />
      
      {/* H - Visual Anchor in Vibrant Horizon Orange (#FF5722)
          Customized so the negative space beneath its middle crossbar forms a smooth, 
          elegant gateway archway while remaining 100% instantly readable as a bold 'H'. */}
      <path 
        d="M 89,6 H 95.2 V 17 H 108.8 V 6 H 115 V 34 H 108.8 A 6.8,8.5 0 0,0 95.2,34 H 89 V 6 Z" 
        fill="#FF5722" 
      />
      
      {/* O - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 135,6 A 14,14 0 1,0 135,34 A 14,14 0 1,0 135,6 Z M 135,12.2 A 7.8,7.8 0 1,1 135,27.8 A 7.8,7.8 0 1,1 135,12.2 Z" 
        fill="#0F172A" 
      />
    </svg>
  );
};
