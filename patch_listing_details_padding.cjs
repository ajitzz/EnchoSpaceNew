const fs = require('fs');
let code = fs.readFileSync('components/ListingDetails.tsx', 'utf8');

// I'm noticing a lot of padding that might feel too tight on mobile
code = code.replace(
    `<div className="flex items-start gap-4">`,
    `<div className="flex items-start gap-5">`
);

fs.writeFileSync('components/ListingDetails.tsx', code);
