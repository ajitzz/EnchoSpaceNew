const fs = require('fs');
let filter = fs.readFileSync('components/FilterBar.tsx', 'utf-8');

filter = filter.replace(
    "{type !== 'Apartment' && type !== 'House' && type !== 'Cabin' && <HomeIcon className=\"w-5 h-5\" />}",
    "{type !== 'Apartment' && type !== 'House' && type !== 'Cabin' && type !== 'Resort' && <HomeIcon className=\"w-5 h-5\" />}"
);

fs.writeFileSync('components/FilterBar.tsx', filter);
console.log('FilterBar fallback fixed');
