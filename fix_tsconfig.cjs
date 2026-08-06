const fs = require('fs');
let tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
tsconfig.compilerOptions = tsconfig.compilerOptions || {};
tsconfig.compilerOptions.esModuleInterop = true;
tsconfig.compilerOptions.skipLibCheck = true;
fs.writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 2));
console.log('Fixed tsconfig.json');
