const fs = require('fs');
let code = fs.readFileSync('components/MapSidebar.tsx', 'utf8');

// Make the Marker breathing engine much more intense when active
code = code.replace(
    `bg-gray-900 text-white px-5 py-2.5 scale-125 z-50`,
    `bg-gray-900 text-white px-5 py-2.5 scale-125 z-50 shadow-[0_20px_40px_rgba(0,0,0,0.4)] -translate-y-2 ring-2 ring-white/50`
);

fs.writeFileSync('components/MapSidebar.tsx', code);
