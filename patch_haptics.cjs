const fs = require('fs');
let code = fs.readFileSync('components/ImageGallery.tsx', 'utf8');

// We want to add haptic feedback on paginate
code = code.replace(
    `const paginate = (newDirection: number) => {`,
    `const paginate = (newDirection: number) => {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(10); // Light haptic feedback
        }`
);

// We want to add haptic feedback on dismiss
code = code.replace(
    `onClose();`,
    `if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) window.navigator.vibrate([15, 30, 15]);
    onClose();`
);

fs.writeFileSync('components/ImageGallery.tsx', code);
