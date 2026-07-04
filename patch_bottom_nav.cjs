const fs = require('fs');
let code = fs.readFileSync('components/BottomNav.tsx', 'utf8');

if (!code.includes('import { motion } from')) {
    code = code.replace(`import React from 'react';`, `import React from 'react';\nimport { motion } from 'framer-motion';`);
}

// Replace nav buttons with motion.button
code = code.replace(
    /<button\s+onClick=\{\(\) => handleNav\('SEARCH'\)\}\s+className=\{`flex flex-col items-center gap-1 w-16 \$\{currentView === 'SEARCH' \? 'text-pink-600' : 'text-gray-500'}`\}>/g,
    `<motion.button 
        whileTap={{ scale: 0.85 }} 
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={() => handleNav('SEARCH')} 
        className={\`flex flex-col items-center gap-1 w-16 \${currentView === 'SEARCH' ? 'text-pink-600' : 'text-gray-500'}\`}>`
);
code = code.replace(
    /<button\s+onClick=\{\(\) => handleNav\('WISHLIST'\)\}\s+className=\{`flex flex-col items-center gap-1 w-16 \$\{currentView === 'WISHLIST' \? 'text-pink-600' : 'text-gray-500'}`\}>/g,
    `<motion.button 
        whileTap={{ scale: 0.85 }} 
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={() => handleNav('WISHLIST')} 
        className={\`flex flex-col items-center gap-1 w-16 \${currentView === 'WISHLIST' ? 'text-pink-600' : 'text-gray-500'}\`}>`
);
code = code.replace(
    /<button\s+onClick=\{\(\) => handleNav\('RESERVATIONS'\)\}\s+className=\{`flex flex-col items-center gap-1 w-16 \$\{currentView === 'RESERVATIONS' \? 'text-pink-600' : 'text-gray-500'}`\}>/g,
    `<motion.button 
        whileTap={{ scale: 0.85 }} 
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={() => handleNav('RESERVATIONS')} 
        className={\`flex flex-col items-center gap-1 w-16 \${currentView === 'RESERVATIONS' ? 'text-pink-600' : 'text-gray-500'}\`}>`
);
code = code.replace(
    /<button\s+onClick=\{\(\) => handleNav\('MESSAGES'\)\}\s+className=\{`flex flex-col items-center gap-1 w-16 relative \$\{currentView === 'MESSAGES' \? 'text-pink-600' : 'text-gray-500'}`\}>/g,
    `<motion.button 
        whileTap={{ scale: 0.85 }} 
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={() => handleNav('MESSAGES')} 
        className={\`flex flex-col items-center gap-1 w-16 relative \${currentView === 'MESSAGES' ? 'text-pink-600' : 'text-gray-500'}\`}>`
);
code = code.replace(
    /<button\s+onClick=\{\(\) => \{ if \(navigator\.vibrate\) navigator\.vibrate\(10\); onProfileClick\(\); \}\}\s+className="flex flex-col items-center gap-1 w-16 text-gray-500">/g,
    `<motion.button 
        whileTap={{ scale: 0.85 }} 
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={() => { if (navigator.vibrate) navigator.vibrate(10); onProfileClick(); }} 
        className="flex flex-col items-center gap-1 w-16 text-gray-500">`
);

// We need to replace the closing `</button>` for these
code = code.replace(/<\/button>/g, `</motion.button>`);

// Haptics on tab switch
const navHandlerOld = `const handleNav = (view: string) => {
    onNavigate(view);
  };`;
const navHandlerNew = `const handleNav = (view: string) => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(15);
    }
    onNavigate(view);
  };`;
code = code.replace(navHandlerOld, navHandlerNew);

fs.writeFileSync('components/BottomNav.tsx', code);
