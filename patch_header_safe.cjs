const fs = require('fs');
let code = fs.readFileSync('components/Header.tsx', 'utf8');

code = code.replace(
    `className="sticky top-0 z-50 bg-white/85 backdrop-blur-2xl saturate-150 border-b border-white/50 shadow-sm glass-panel"`,
    `className="sticky top-0 z-50 bg-white/85 backdrop-blur-2xl saturate-150 border-b border-white/50 shadow-sm glass-panel pt-safe"`
);

// We need to do the same for the filter bar sticky positioning in search view, but it's nested below header, 
// so header already pushes it down. But wait, header is sticky. Filter bar is sticky top-[72px].
// That might need adjustment if safe area pushes header down. We should probably use `top-[calc(72px+env(safe-area-inset-top))]` in FilterBar.

fs.writeFileSync('components/Header.tsx', code);
