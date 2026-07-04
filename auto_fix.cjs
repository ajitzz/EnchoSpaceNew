const fs = require('fs');

let ts = fs.readFileSync('server.ts', 'utf8').split('\n');
// We will manually fix the ones we know
// Let's use a simpler approach: we know where the missing '});' are from the AST or we can just use regex.

const lines = fs.readFileSync('server_errors.txt', 'utf8').split('\n');
const toInsert = new Set();
for (const line of lines) {
  const match = line.match(/server\.ts\((\d+),/);
  if (match) {
    toInsert.add(parseInt(match[1]) - 1);
  }
}

// Sort descending to not mess up indices
const sorted = Array.from(toInsert).sort((a, b) => b - a);

for (const lineIdx of sorted) {
  // Let's print the line and the previous line
  console.log(`Error at line ${lineIdx + 1}:`);
  console.log(`  ${ts[lineIdx - 1]}`);
  console.log(`  ${ts[lineIdx]}`);
}
