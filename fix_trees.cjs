const fs = require('fs');
let file = fs.readFileSync('components/HostForm.tsx', 'utf-8');
file = file.replace('Building2, Home,', 'Building2, Home, Trees,');
fs.writeFileSync('components/HostForm.tsx', file);
console.log('Fixed Trees import');
