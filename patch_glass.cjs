const fs = require('fs');
let code = fs.readFileSync('index.css', 'utf8');

if (!code.includes('.noise-overlay')) {
    code += `\n
.noise-overlay {
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.04;
  mix-blend-mode: overlay;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}

/* Enhancing existing glass panels */
.glass-panel {
  position: relative;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(40px) saturate(200%);
  -webkit-backdrop-filter: blur(40px) saturate(200%);
  border-top: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 -10px 40px rgba(0,0,0,0.03);
}

.glass-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.04;
  mix-blend-mode: overlay;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}
`;
}
fs.writeFileSync('index.css', code);
