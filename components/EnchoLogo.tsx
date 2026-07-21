import React from 'react';

interface EnchoLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'icon';
  variant?: 'wordmark' | 'icon' | 'full';
  lightBg?: boolean;
  showSubtitle?: boolean;
}

/**
 * ENCHO Brand Wordmark Logo & Gateway Vector Asset
 * Custom geometric typography:
 * - E, N, C, O: Midnight Black (#0F172A)
 * - H: Horizon Orange (#FF5A1F) with archway/gateway negative space beneath crossbar
 */
export const EnchoLogo: React.FC<EnchoLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'wordmark',
  lightBg = true,
  showSubtitle = false,
}) => {
  const textColor = lightBg ? '#0F172A' : '#FFFFFF';
  const orangeColor = '#FF5A1F'; // Vibrant Horizon Orange

  // Size dimensions for container/SVG
  const heights = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-10',
    xl: 'h-16',
    icon: 'h-10 w-10',
  };

  if (variant === 'icon') {
    return (
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${heights[size]} ${className}`}
        aria-label="ENCHO Gateway Logo Icon"
      >
        {/* Rounded square container / App Icon background */}
        <rect width="100" height="100" rx="22" fill="#0F172A" />
        
        {/* Stylized Gateway 'H' in Horizon Orange */}
        <g transform="translate(20, 18)">
          {/* Left Pillar */}
          <rect x="0" y="0" width="16" height="64" rx="4" fill={orangeColor} />
          
          {/* Right Pillar */}
          <rect x="44" y="0" width="16" height="64" rx="4" fill={orangeColor} />
          
          {/* Upper Bridge Crossbar */}
          <rect x="16" y="16" width="28" height="14" fill={orangeColor} />
          
          {/* Archway Cutout (Gateway) beneath crossbar */}
          <path
            d="M 16,30 H 44 V 64 H 38 C 38,48 34,40 30,40 C 26,40 22,48 22,64 H 16 Z"
            fill="#0F172A"
          />
        </g>
        
        {/* Subtle accent dot */}
        <circle cx="82" cy="20" r="4" fill={orangeColor} />
      </svg>
    );
  }

  return (
    <div className={`inline-flex flex-col items-start select-none ${className}`}>
      <div className="inline-flex items-center">
        <svg
          viewBox="0 0 420 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`${heights[size]} w-auto`}
          aria-label="ENCHO Logo"
        >
          {/* Letter E */}
          <path
            d="M 20 20 H 68 V 33 H 36 V 43.5 H 62 V 56.5 H 36 V 67 H 68 V 80 H 20 Z"
            fill={textColor}
          />

          {/* Letter N */}
          <path
            d="M 88 20 H 103 L 127 60 V 20 H 142 V 80 H 127 L 103 40 V 80 H 88 Z"
            fill={textColor}
          />

          {/* Letter C */}
          <path
            d="M 205 20 C 228 20 238 31 238 37 H 222 C 222 34 216 32 205 32 C 190 32 181 41 181 50 C 181 59 190 68 205 68 C 216 68 222 66 222 63 H 238 C 238 69 228 80 205 80 C 178 80 164 64 164 50 C 164 36 178 20 205 20 Z"
            fill={textColor}
          />

          {/* Letter H: Visual Anchor in Horizon Orange with Archway Gateway */}
          <g id="letter-h-gateway">
            {/* Left Vertical Bar */}
            <path d="M 258 20 H 274 V 80 H 258 Z" fill={orangeColor} />
            
            {/* Right Vertical Bar */}
            <path d="M 302 20 H 318 V 80 H 302 Z" fill={orangeColor} />
            
            {/* Bridge Crossbar */}
            <path d="M 274 34 H 302 V 46 H 274 Z" fill={orangeColor} />
            
            {/* Archway Gateway (Negative space forming arch beneath crossbar) */}
            <path
              d="M 274 46 H 302 V 80 C 302 62 294 52 288 52 C 282 52 274 62 274 80 Z"
              fill={orangeColor}
            />
          </g>

          {/* Letter O */}
          <path
            d="M 370 20 C 392 20 405 35 405 50 C 405 65 392 80 370 80 C 348 80 335 65 335 50 C 335 35 348 20 370 20 Z M 370 32 C 358 32 351 41 351 50 C 351 59 358 68 370 68 C 382 68 389 59 389 50 C 389 41 382 32 370 32 Z"
            fill={textColor}
          />
        </svg>
      </div>

      {showSubtitle && (
        <span className="text-[8px] md:text-[9.5px] font-black tracking-[0.45em] text-[#8e8e93] uppercase leading-none mt-1 pl-0.5 group-hover:text-[#5e687a] transition-colors">
          STAYS
        </span>
      )}
    </div>
  );
};

export default EnchoLogo;
