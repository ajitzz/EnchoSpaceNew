import React from 'react';

interface AmigoveWordmarkProps {
  className?: string;
  fill?: string;
}

export const AmigoveWordmark: React.FC<AmigoveWordmarkProps> = ({ className = "h-6 w-auto", fill = "#E05A3D" }) => {
  return (
    <svg 
      viewBox="0 0 200 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300`}
      aria-label="AMIGOVE"
    >
      <text x="0" y="32" fontFamily="Outfit, sans-serif" fontWeight="800" fontSize="32" letterSpacing="0.05em" fill={fill}>
        AMIGOVE
      </text>
    </svg>
  );
};

export default AmigoveWordmark;
