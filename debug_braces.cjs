const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// A very naive brace counter, ignoring quotes/comments
function countBraces() {
  let count = 0;
  for(let i=0; i<code.length; i++) {
    if (code[i] === '{') count++;
    else if (code[i] === '}') count--;
  }
  return count;
}
console.log("Net braces count (naive):", countBraces());
