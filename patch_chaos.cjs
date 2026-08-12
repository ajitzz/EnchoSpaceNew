const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /app\.use\(\(req, res, next\) => \{\s+\/\/ Only inject faults into non-critical backend read APIs[\s\S]*?next\(\);\s+\}\);/g,
  ''
);

fs.writeFileSync('server.ts', code);
console.log("Chaos monkey patched.");
