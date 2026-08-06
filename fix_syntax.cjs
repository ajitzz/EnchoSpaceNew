const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// The issue is using backticks inside a template literal without escaping them.
const targetLine = "             - Document the removed terms in the \`policy_evasion_engine\` JSON output.";
const newLine = "             - Document the removed terms in the \\`policy_evasion_engine\\` JSON output.";

code = code.replace(targetLine, newLine);
fs.writeFileSync('server.ts', code);
console.log('Fixed syntax error');
