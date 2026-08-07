const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// For pre-flight-check
const preflightStr = "res.status(500).json({ error: 'Failed pre-flight check' });";
code = code.replace(preflightStr, preflightStr + "\n  }\n});\n");

// For copilot
const copilotStr = "res.status(500).json({ error: 'Failed to analyze campaign' });";
code = code.replace(copilotStr, copilotStr + "\n  }\n});\n");

fs.writeFileSync('server.ts', code);
console.log("Restored braces!");
