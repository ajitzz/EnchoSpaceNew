const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

// The gap on mobile should be slightly smaller vertically so the next card peeks above the fold
code = code.replace(
    `className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-x-6 gap-y-10"`,
    `className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8 md:gap-y-10"`
);
// Replace the second occurrence for the loaded state
code = code.replace(
    `className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-x-6 gap-y-10"`,
    `className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8 md:gap-y-10"`
);

fs.writeFileSync('App.tsx', code);
