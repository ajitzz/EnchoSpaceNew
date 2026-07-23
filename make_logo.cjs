const fs = require('fs');

const svg = `
import React from 'react';

interface EnchoWordmarkProps {
  className?: string;
}

export const EnchoWordmark: React.FC<EnchoWordmarkProps> = ({ className = "h-7 w-auto" }) => {
  return (
    <svg 
      viewBox="0 0 170 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={\`\${className} transition-all duration-300\`}
      aria-label="AMIGOve"
    >
      <style>
        {
          \`
          .amigo-text {
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-weight: 900;
            font-size: 32px;
            letter-spacing: -0.02em;
            fill: #0F172A;
          }
          \`
        }
      </style>
      
      {/* We use standard path for 've' and leaf to ensure precise alignment */}
      <text x="0" y="32" className="amigo-text">AMIGO</text>
      
      {/* v - Vibrant Green (#10B981) */}
      {/* e - Vibrant Green (#10B981) */}
      <g transform="translate(108, 12)">
        {/* 'v' */}
        <path 
          d="M 4,6 H 8.5 L 12,18 L 15.5,6 H 20 L 14,20 H 10 Z" 
          fill="#10B981" 
        />
        
        {/* 'e' */}
        <path 
          d="M 32,6 C 36,6 39,8.5 40,13 H 23 C 23.5,8.5 27,6 32,6 Z M 27.5,11 H 35.5 C 34.5,8.5 32,8 32,8 C 30,8 28.5,9 27.5,11 Z M 23,15 H 28.5 C 29.5,18 33,18.5 35,16.5 L 38.5,18.5 C 36,22.5 28,23 24,19 C 22,17 22,16 23,15 Z" 
          fill="#10B981" 
        />
        
        {/* leaf on 'e' */}
        <path 
          d="M 38,8 C 39,2 47,0 47,0 C 47,8 41,10 38,8 Z" 
          fill="#10B981" 
        />
      </g>
    </svg>
  );
};
`
fs.writeFileSync('components/EnchoWordmark.tsx', svg);
