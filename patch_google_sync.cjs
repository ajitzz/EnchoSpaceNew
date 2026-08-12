const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /const simulatedGoogleId = `customers\/\$\{Math\.floor\(1000000000 \+ Math\.random\(\) \* 9000000000\)\}\/campaigns\/\$\{Math\.floor\(100000000 \+ Math\.random\(\) \* 900000000\)\}`;/g,
  'const simulatedGoogleId = null;'
);

fs.writeFileSync('server.ts', code);
console.log("Google ID patched.");
