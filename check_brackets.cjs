const fs = require('fs');
const content = fs.readFileSync('server.ts', 'utf8');

const lines = content.split('\n');
let count = 0;
for (let i = 2933; i < 2990; i++) {
  const line = lines[i];
  for (let c of line) {
    if (c === '{') count++;
    else if (c === '}') count--;
  }
  console.log(`${i+1}: ${line} [${count}]`);
}
