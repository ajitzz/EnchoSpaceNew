const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /const mockOrderId = `order_sim_\$\{Date\.now\(\)\}_\$\{Math\.random\(\)\.toString\(36\)\.substring\(2, 8\)\}`;/g,
  'const mockOrderId = `order_sim_${crypto.randomUUID()}`;'
);

fs.writeFileSync('server.ts', code);
console.log("RZP mock order id patched.");
