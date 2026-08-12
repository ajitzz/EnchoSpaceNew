const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/const entries = req\.body\.entry;\n     const entries = req\.body\.entry;/g, 'const entries = req.body.entry;');

fs.writeFileSync('server.ts', code);
console.log('Fixed entries declaration.');
