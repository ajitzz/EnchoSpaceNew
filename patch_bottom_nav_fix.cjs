const fs = require('fs');
let code = fs.readFileSync('components/BottomNav.tsx', 'utf8');

// Replace the opening button tag with motion.button
code = code.replace(
    /<button\n              key=\{tab.id\}/g,
    `<motion.button
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              key={tab.id}`
);

// Add haptics to onClick
code = code.replace(
    /uiAudio\.playClick\(\);/g,
    `uiAudio.playClick();
                if (navigator.vibrate) navigator.vibrate(10);`
);

fs.writeFileSync('components/BottomNav.tsx', code);
