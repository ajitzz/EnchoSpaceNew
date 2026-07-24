const fs = require('fs');

const svg = `
<svg viewBox="0 0 160 40" xmlns="http://www.w3.org/2000/svg">
  <text 
    x="0" 
    y="32" 
    font-weight="900" 
    font-size="32" 
    fill="#0F172A" 
    letter-spacing="-0.03em" 
    style="font-family: Inter, system-ui, sans-serif;"
  >
    AMIGO
  </text>
  
  <g transform="translate(103, 10)">
    <!-- 'v' as a sleek tick mark -->
    <!-- The left stroke goes down, the right stroke goes high up to form a checkmark -->
    <path 
      d="M 2,11 L 8,23 L 23,0 L 19,-2 L 8,15 L 5,10 Z" 
      fill="#10B981" 
    />
    
    <!-- 'e' matching the font size -->
    <!-- Center is around 35 -->
    <path 
      d="M 37,5 C 44,5 49,9 49,15 H 31 C 31,21 35,24 39,24 C 42,24 45,22 47,19 L 51,22 C 48,25 43,28 39,28 C 30,28 25,22 25,14 C 25,7 30,5 37,5 Z M 37,9 C 32,9 30,11 29,13 H 45 C 44,11 41,9 37,9 Z" 
      fill="#10B981" 
    />
    
    <!-- Elegant leaf projecting top-right from 'e' -->
    <!-- 'e' top-right curve is around x=45, y=7 -->
    <path 
      d="M 46,7 C 49,-1 59,-2 62,0 C 63,5 56,10 46,7 Z" 
      fill="#10B981" 
    />
  </g>
</svg>
`;

fs.writeFileSync('test_amigove3.svg', svg);
