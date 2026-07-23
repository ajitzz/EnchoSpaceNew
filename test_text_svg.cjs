const fs = require('fs');

const svg = `
<svg viewBox="0 0 165 40" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="32" font-weight="900" font-size="32" fill="#0F172A" letter-spacing="-0.03em" style="font-family: Inter, sans-serif;">AMIGO</text>
  <text x="108" y="32" font-weight="700" font-size="24" fill="#10B981" letter-spacing="-0.02em" style="font-family: Inter, sans-serif;">ve</text>
  
  <!-- leaf on 'e' (e is around x=125, y=20) -->
  <path d="M 126 18 C 129 10 137 7 140 9 C 141 14 135 18 126 18 Z" fill="#10B981" />
</svg>
`;

fs.writeFileSync('test_text_svg.svg', svg);
