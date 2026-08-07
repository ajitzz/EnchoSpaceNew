const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace("res.status(500).json({ error: 'Failed pre-flight check' });\n  }\n});\n  }\n});", "res.status(500).json({ error: 'Failed pre-flight check' });\n  }\n});");
fs.writeFileSync('server.ts', code);
console.log("Fixed extra braces");
