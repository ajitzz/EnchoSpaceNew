const fs = require('fs');
let code = fs.readFileSync('components/Header.tsx', 'utf8');

// I'll add the glass panel to the Header to complete the VisionOS look
code = code.replace(
    `className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm"`,
    `className="sticky top-0 z-50 bg-white/85 backdrop-blur-2xl saturate-150 border-b border-white/50 shadow-sm glass-panel"`
);

// We should also adjust the mobile search bar to be a bit more glass-like
code = code.replace(
    `className="w-full bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 rounded-full px-4 py-3 flex items-center justify-between cursor-pointer hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-shadow"`,
    `className="w-full bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 rounded-full px-4 py-3 flex items-center justify-between cursor-pointer hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-shadow backdrop-blur-md"`
);

fs.writeFileSync('components/Header.tsx', code);
