const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/^\\n/, '');
code = code.replace(/\\n\/\* eslint-disable/, '/* eslint-disable');
fs.writeFileSync('server.ts', code);
console.log('Fixed invalid chars.');
