const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /\/\/ Simulate async engagement webhook arriving later[\s\S]*?console\.log\(`\[ASYNC WEBHOOK\].*?`\);\s+\}, delayMs\);/g,
  ''
);

fs.writeFileSync('server.ts', code);
console.log("Social engagement mock patched.");
