const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
let openBraces = 0;
for(let i=0; i<code.length; i++) {
  if (code[i] === '{') openBraces++;
  if (code[i] === '}') openBraces--;
}
console.log("Braces mismatch count:", openBraces);
