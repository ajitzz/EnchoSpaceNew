const fs = require('fs');
let code = fs.readFileSync('components/ListingCard.tsx', 'utf8');

// The listing card click needs to trigger UI audio
code = code.replace(
    `<motion.div
        key={listing.id}
        className="flex flex-col h-full bg-white transition-all w-full select-none"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
    >`,
    `<motion.div
        key={listing.id}
        className="flex flex-col h-full bg-white transition-all w-full select-none"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        whileTap={{ scale: 0.98 }}
    >`
);

fs.writeFileSync('components/ListingCard.tsx', code);
