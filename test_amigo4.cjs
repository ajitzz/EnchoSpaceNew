const fs = require('fs');

const svg = `
<svg viewBox="0 0 150 40" xmlns="http://www.w3.org/2000/svg">
  <!-- Use exact Inter font if available, fallback to system-ui -->
  <style>
    .brand-text { font-family: 'Inter', system-ui, sans-serif; }
  </style>
  <text x="0" y="32" class="brand-text" font-weight="900" font-size="32" fill="#0F172A" letter-spacing="-0.03em">AMIGO</text>
  <text x="103" y="32" class="brand-text" font-weight="700" font-size="24" fill="#10B981" letter-spacing="-0.02em">ve</text>
  
  <!-- leaf on 'e' -->
  <path d="M 124 19 C 127 10 135 6 138 8 C 139 14 133 19 124 19 Z" fill="#10B981" />
</svg>
`;

fs.writeFileSync('test_amigo4.svg', svg);
