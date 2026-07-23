const fs = require('fs');

const svg = `
<svg viewBox="0 0 160 40" xmlns="http://www.w3.org/2000/svg">
  <style>
    .amigo-text {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-weight: 800;
      font-size: 30px;
      letter-spacing: -0.04em;
    }
    .ve-text {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-weight: 700;
      font-size: 22px;
      letter-spacing: -0.03em;
    }
  </style>
  <text x="0" y="32" class="amigo-text" fill="#0F172A">AMIGO</text>
  <text x="96" y="32" class="ve-text" fill="#10B981">ve</text>
  
  <!-- leaf on 'e' (e is around x=110, y=20) -->
  <path d="M 112 18 C 115 8 125 4 128 6 C 129 12 122 17 112 18 Z" fill="#10B981" />
</svg>
`;

fs.writeFileSync('test_amigo3.svg', svg);
