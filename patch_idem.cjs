const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /const idempotencyKey = bodyIdemKey \|\| headerIdemKey \|\| `idem_\$\{Date\.now\(\)\}_\$\{Math\.random\(\)\.toString\(36\)\.substring\(7\)\}`;/g,
  'const idempotencyKey = bodyIdemKey || headerIdemKey || crypto.randomUUID();'
);

fs.writeFileSync('server.ts', code);
console.log("Idem key patched.");
