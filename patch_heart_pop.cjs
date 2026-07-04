const fs = require('fs');
let code = fs.readFileSync('components/ListingCard.tsx', 'utf8');

// Update the heart animation to be punchier
code = code.replace(
    `whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}`,
    `whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.8 }}
            animate={isFavorite ? { scale: [1, 1.3, 1], transition: { duration: 0.3, type: "spring", stiffness: 400 } } : {}}`
);

fs.writeFileSync('components/ListingCard.tsx', code);
