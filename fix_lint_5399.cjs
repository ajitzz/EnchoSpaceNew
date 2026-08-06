const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetLine = "      let uploadedHashes = { square: '', vertical: '', landscape: '' };";
const newLine = "      const uploadedHashes = { square: '', vertical: '', landscape: '' };";

code = code.replace(targetLine, newLine);
fs.writeFileSync('server.ts', code);
console.log('Fixed lint 5399');
