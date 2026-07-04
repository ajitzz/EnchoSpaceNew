const fs = require('fs');
let code = fs.readFileSync('components/ListingCard.tsx', 'utf8');

// I want to see if we missed the grid gap in the search view
code = code.replace(
    `className="font-bold text-gray-900 truncate text-[16px] pr-2 leading-tight group-hover:text-[#e51d53] transition-colors"`,
    `className="font-bold text-gray-900 truncate text-[16px] leading-tight group-hover:text-[#e51d53] transition-colors"`
);

fs.writeFileSync('components/ListingCard.tsx', code);
