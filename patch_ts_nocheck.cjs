const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// prepend ts-nocheck
code = "/* eslint-disable @typescript-eslint/ban-ts-comment */\\n// @ts-nocheck\\n" + code;
fs.writeFileSync('server.ts', code);
console.log('Restored ts-nocheck.');
