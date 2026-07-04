const fs = require('fs');
let code = fs.readFileSync('components/FilterBar.tsx', 'utf8');

code = code.replace(
    `className="sticky top-[72px] md:top-[84px] z-40 bg-white/85 backdrop-blur-2xl saturate-150 border-b border-white/50 px-4 md:px-8 py-3 md:py-4 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-sm glass-panel"`,
    `className="sticky z-40 bg-white/85 backdrop-blur-2xl saturate-150 border-b border-white/50 px-4 md:px-8 py-3 md:py-4 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-sm glass-panel"
             style={{ top: 'calc(72px + env(safe-area-inset-top, 0px))' }}`
);

fs.writeFileSync('components/FilterBar.tsx', code);
