const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Remove hardcoded token
code = code.replace(
  /const META_API_TOKEN = process\.env\.META_API_TOKEN \|\| "EAAkr7Y9S.*";/g,
  'const META_API_TOKEN = process.env.META_API_TOKEN;'
);

// Update WhatsApp mock logic
code = code.replace(
  /const isMockToken = !process\.env\.META_API_TOKEN \|\| META_API_TOKEN\.startsWith\("EAAkr7Y9S"\);\s+if \(isMockToken\) {/g,
  'if (!META_API_TOKEN) {\n      console.warn("[WHATSAPP] META_API_TOKEN is missing. Failing closed.");\n      return false;\n    }'
);

fs.writeFileSync('server.ts', code);
console.log("Token patched.");
