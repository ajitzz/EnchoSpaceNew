const fs = require('fs');
let file = fs.readFileSync('components/HostForm.tsx', 'utf-8');

const regex = /<button[\s\S]*?✨ Auto-write with AI[\s\S]*?<\/button>/;
file = file.replace(regex, '');

fs.writeFileSync('components/HostForm.tsx', file);
console.log('Removed old AI button');
