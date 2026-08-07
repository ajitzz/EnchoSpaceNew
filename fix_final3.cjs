const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
const searchStr = "res.status(500).json({ error: 'Failed pre-flight check' });";
const replaceRegex = /res\.status\(500\)\.json\(\{ error: 'Failed pre-flight check' \}\);\s*\}\s*\}\);\s*\}\s*\}\);/m;
code = code.replace(replaceRegex, "res.status(500).json({ error: 'Failed pre-flight check' });\n  }\n});");
fs.writeFileSync('server.ts', code);
console.log("Fixed it!");
