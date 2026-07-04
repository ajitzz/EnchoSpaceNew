const fs = require('fs');
let code = fs.readFileSync('components/FilterBar.tsx', 'utf8');

// I'll add the noise overlay to the FilterBar to match the bottom nav glass
code = code.replace(
    `className="p-5 md:px-10 md:py-6 pb-safe border-t border-gray-100 flex items-center justify-between bg-white w-full sticky bottom-0 z-20"`,
    `className="p-5 md:px-10 md:py-6 pb-safe border-t border-white/50 flex items-center justify-between bg-white/85 backdrop-blur-2xl saturate-150 w-full sticky bottom-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] glass-panel"`
);

// We'll also make the top categories bar glassmorphic when scrolling
code = code.replace(
    `className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 md:px-8 py-3 md:py-4 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-sm"`,
    `className="sticky top-[72px] md:top-[84px] z-40 bg-white/85 backdrop-blur-2xl saturate-150 border-b border-white/50 px-4 md:px-8 py-3 md:py-4 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-sm glass-panel"`
);

fs.writeFileSync('components/FilterBar.tsx', code);
