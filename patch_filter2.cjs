const fs = require('fs');
let filter = fs.readFileSync('components/FilterBar.tsx', 'utf-8');

filter = filter.replace(
    "const propertyTypes = ['Apartment', 'House', 'Barn', 'Bed & breakfast', 'Boat', 'Cabin', 'Campervan', 'Castle'];",
    "const propertyTypes = ['Resort', 'Apartment', 'House', 'Barn', 'Bed & breakfast', 'Boat', 'Cabin', 'Campervan', 'Castle'];"
);

filter = filter.replace(
    "{type === 'Cabin' && <TreeIcon className=\"w-5 h-5\" />}",
    "{type === 'Cabin' && <TreeIcon className=\"w-5 h-5\" />}\n                                        {type === 'Resort' && <TreeIcon className=\"w-5 h-5\" />}"
);

fs.writeFileSync('components/FilterBar.tsx', filter);
console.log('FilterBar properties patched');
