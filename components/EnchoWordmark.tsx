import React from 'react';

interface EnchoWordmarkProps {
  className?: string;
}

export const EnchoWordmark: React.FC<EnchoWordmarkProps> = ({ className = "h-6 w-auto" }) => {
  return (
    <svg 
      viewBox="0 0 150 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300`}
      aria-label="AMIGOve"
    >
      {/* 
        Using <text> with font-family: inherit ensures the logo 
        perfectly matches the project's primary font (Inter) 
        while retaining the flawless scaling of an SVG viewBox.
      */}
      <text 
        x="0" 
        y="32" 
        fontWeight="900" 
        fontSize="32" 
        fill="#0F172A" 
        letterSpacing="-0.03em" 
        style={{ fontFamily: 'inherit' }}
      >
        AMIGO
      </text>
      
      {/* Creative 've' with 'v' as a checkmark and leaf planted in 'e' */}
      <g transform="translate(102, 10)">
        {/* 'v' designed as a creative checkmark (tick) */}
        <path 
          d="M 2,11 L 8,23 L 23,0 L 19,-2 L 8,15 L 5,10 Z" 
          fill="#10B981" 
        />
        
        {/* 'e' drawn to match the typographic scale perfectly */}
        <path 
          d="M 37,5 C 44,5 49,9 49,15 H 31 C 31,21 35,24 39,24 C 42,24 45,22 47,19 L 51,22 C 48,25 43,28 39,28 C 30,28 25,22 25,14 C 25,7 30,5 37,5 Z M 37,9 C 32,9 30,11 29,13 H 45 C 44,11 41,9 37,9 Z" 
          fill="#10B981" 
        />
        
        {/* Small green leaf planted in 'e', projecting to the right side corner top */}
        <path 
          d="M 46,7 C 49,-1 59,-2 62,0 C 63,5 56,10 46,7 Z" 
          fill="#10B981" 
        />
      </g>
    </svg>
  );
};
