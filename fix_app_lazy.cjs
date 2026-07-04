const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');
code = code.replace(/\.then\(module => \(\{\s*default: module\.default \|\| module\.[a-zA-Z0-9_]+\s*\}\)\)/g, '');
fs.writeFileSync('App.tsx', code);
