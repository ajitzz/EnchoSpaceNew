const fs = require('fs');
let code = fs.readFileSync('dist/server.js', 'utf8');
code = '// @ts-nocheck\n' + code;
fs.writeFileSync('server_fast.ts', code);
