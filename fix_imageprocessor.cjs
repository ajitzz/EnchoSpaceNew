const fs = require('fs');
let code = fs.readFileSync('src/lib/imageProcessor.ts', 'utf8');

code = code.replace(/import fsSync from 'fs';/, "import * as fsSync from 'fs';");
fs.writeFileSync('src/lib/imageProcessor.ts', code);
console.log('Fixed fsSync');
