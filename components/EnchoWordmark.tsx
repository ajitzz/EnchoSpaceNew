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
      <text 
        x="103" 
        y="32" 
        fontWeight="700" 
        fontSize="24" 
        fill="#10B981" 
        letterSpacing="-0.02em" 
        style={{ fontFamily: 'inherit' }}
      >
        ve
      </text>
      
      {/* 
        Floating leaf accent above the 'e'.
        Positioned slightly detached so it looks elegant and remains 
        structurally sound even if OS-level font rendering shifts the 'e' by 1-2px.
      */}
      <path 
        d="M 124 17 C 127 8 135 4 138 6 C 139 12 133 17 124 17 Z" 
        fill="#10B981" 
      />
    </svg>
  );
};
