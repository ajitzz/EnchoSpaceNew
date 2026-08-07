const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
const lines = code.split('\n');
console.log(lines.slice(3090, 3125).join('\n'));
