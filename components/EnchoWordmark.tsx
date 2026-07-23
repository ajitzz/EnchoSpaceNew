import React from 'react';

interface EnchoWordmarkProps {
  className?: string;
}

export const EnchoWordmark: React.FC<EnchoWordmarkProps> = ({ className = "h-6 w-auto" }) => {
  return (
    <svg 
      viewBox="0 0 252 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300`}
      aria-label="AMIGOve"
    >
      {/* A */}
      <path d="M 17 2 L 2 34 H 10 L 12.5 28 H 25.5 L 28 34 H 36 L 21 2 H 17 Z M 19 8 L 15 21 H 23 Z" fill="#0F172A" />
      {/* M */}
      <path d="M 42 34 V 2 H 51 L 60 18 L 69 2 H 78 V 34 H 70 V 13 L 62 26 H 58 L 50 13 V 34 H 42 Z" fill="#0F172A" />
      {/* I */}
      <path d="M 86 2 H 94 V 34 H 86 Z" fill="#0F172A" />
      {/* G */}
      <path d="M 118 2 C 106 2 98 10 98 18 C 98 26 106 34 118 34 C 127 34 135 29 137 21 H 128 C 127 25 123 27 118 27 C 111 27 107 23 107 18 C 107 13 111 9 118 9 C 123 9 126 11 128 14 L 135 9 C 132 4 126 2 118 2 Z" fill="#0F172A" />
      <path d="M 123 16 H 138 V 24 H 123 Z" fill="#0F172A" />
      {/* O */}
      <path d="M 160 2 C 148 2 140 10 140 18 C 140 26 148 34 160 34 C 172 34 180 26 180 18 C 180 10 172 2 160 2 Z M 160 9 C 167 9 171 13 171 18 C 171 23 167 27 160 27 C 153 27 149 23 149 18 C 149 13 153 9 160 9 Z" fill="#0F172A" />

      {/* ve - Vibrant Green (#10B981) */}
      <path d="M 183 14 H 190 L 195 29 L 200 14 H 207 L 199 34 H 191 Z" fill="#10B981" />
      {/* e - Vibrant Green (#10B981) */}
      <path d="M 223 14 C 233 14 238 19 238 25 H 214 C 215 30 219 34 224 34 C 228 34 231 32 233 29 L 239 32 C 236 36 230 37 224 37 C 213 37 206 30 206 24 C 206 18 213 14 223 14 Z M 223 19 C 218 19 215 21 214 24 H 231 C 230 21 227 19 223 19 Z" fill="#10B981" />
      {/* leaf on 'e' - Vibrant Green (#10B981) */}
      <path d="M 231 16 C 234 6 244 2 247 4 C 248 10 241 15 231 16 Z" fill="#10B981" />
    </svg>
  );
};
