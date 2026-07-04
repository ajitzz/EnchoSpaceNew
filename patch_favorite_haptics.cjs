const fs = require('fs');
let code = fs.readFileSync('components/ListingCard.tsx', 'utf8');

code = code.replace(
    `onToggleFavorite(listing);`,
    `if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) window.navigator.vibrate(20);
        onToggleFavorite(listing);`
);

// And we make the heart pop animation more springy
code = code.replace(
    `whileTap={{ scale: 0.8 }}`,
    `whileTap={{ scale: 0.8 }}
                            transition={{ type: "spring", stiffness: 400, damping: 17 }}`
);

fs.writeFileSync('components/ListingCard.tsx', code);
