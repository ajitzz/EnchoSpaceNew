const fs = require('fs');
let code = fs.readFileSync('components/BottomNav.tsx', 'utf8');

code = code.replace(
    `className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-safe z-[200]"`,
    `className="md:hidden fixed bottom-0 left-0 right-0 bg-white/85 backdrop-blur-2xl saturate-150 border-t border-gray-100/50 pb-safe z-[200]"`
);

fs.writeFileSync('components/BottomNav.tsx', code);
