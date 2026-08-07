const fs = require('fs');
let code = fs.readFileSync('docs/PROJECT_BOOTSTRAP.md', 'utf8');

const copilotDoc = `
## Latest Addition: AI Campaign Copilot & Preflight Engine
Added real-time validation via Gemini to catch Meta policy violations before they happen. It features an auto-fix UI for hosts and a preflight engine that halts execution of invalid payloads.
`;

code = code + "\n\n" + copilotDoc;

fs.writeFileSync('docs/PROJECT_BOOTSTRAP.md', code);
console.log("Patched bootstrap");
