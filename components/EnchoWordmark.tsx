import React from 'react';

interface EnchoWordmarkProps {
  className?: string;
}

export const EnchoWordmark: React.FC<EnchoWordmarkProps> = ({ className = "h-6 w-auto" }) => {
  return (
    <svg 
      viewBox="0 0 195 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300`}
      aria-label="AMIGOve"
    >
      {/* A - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 11,6 H 17 L 28,34 H 21.5 L 19,27 H 9 L 6.5,34 H 0 Z M 14,12 L 10.5,22 H 17.5 Z" 
        fill="#0F172A" 
      />
      
      {/* M - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 32,34 V 6 H 40 L 46,19 L 52,6 H 60 V 34 H 54 V 15 L 48,27 H 44 L 38,15 V 34 Z" 
        fill="#0F172A" 
      />
      
      {/* I - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 65,6 H 71 V 34 H 65 Z" 
        fill="#0F172A" 
      />
      
      {/* G - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 90,6 A 14,14 0 1,0 90,34 A 14,14 0 0,0 103,22 H 91 V 27.5 H 96.5 A 8,8 0 1,1 90,12 A 8.5,8.5 0 0,1 97,16 L 101,12.5 A 14,14 0 0,0 90,6 Z" 
        fill="#0F172A" 
      />
      
      {/* O - Deep Midnight Black (#0F172A) */}
      <path 
        d="M 123,6 A 14,14 0 1,0 123,34 A 14,14 0 1,0 123,6 Z M 123,12 A 8,8 0 1,1 123,28 A 8,8 0 1,1 123,12 Z" 
        fill="#0F172A" 
      />
      
      {/* v - Vibrant Green (#10B981) */}
      <path 
        d="M 143,16 H 148.5 L 152,28 L 155.5,16 H 161 L 154.5,34 H 149.5 Z" 
        fill="#10B981" 
      />

      {/* e - Vibrant Green (#10B981) */}
      <path 
        d="M 172,16 C 176,16 179,19 180,24 H 162.5 C 163,19 166,16 172,16 Z M 168,21 H 175 C 174,19 170,19 168,21 Z M 162.5,26 H 168.5 C 169,30 173,30 174,28 H 180 C 179,32 176,35 172,35 C 168,35 163,32 162.5,26 Z" 
        fill="#10B981" 
      />
      
      {/* leaf on 'e' - Vibrant Green (#10B981) */}
      <path 
        d="M 177,17 C 177,8 187,6 187,6 C 187,16 180,18 177,17 Z" 
        fill="#10B981" 
      />
    </svg>
  );
};
