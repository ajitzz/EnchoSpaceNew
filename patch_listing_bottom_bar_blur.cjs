const fs = require('fs');
let code = fs.readFileSync('components/ListingDetails.tsx', 'utf8');

code = code.replace(
    `className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-safe z-50 flex items-center justify-between gap-4 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"`,
    `className="fixed bottom-0 left-0 right-0 bg-white/85 backdrop-blur-2xl saturate-150 border-t border-gray-200/50 p-4 pb-safe z-50 flex items-center justify-between gap-4 lg:hidden shadow-[0_-4px_20px_-1px_rgba(0,0,0,0.08)]"`
);

fs.writeFileSync('components/ListingDetails.tsx', code);
