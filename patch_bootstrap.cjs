const fs = require('fs');
let code = fs.readFileSync('docs/PROJECT_BOOTSTRAP.md', 'utf8');

const addition = `
## Meta Campaign Engineering Brain
The AI Campaign Copilot has been upgraded to a full Meta Campaign Engineering Brain. It now includes:
- Live Meta Policy Intelligence (\`/docs/meta\` layer).
- Landing Page & Media Inspector simulations.
- Audience & Budget Engineering (Estimates for size, CPL, etc.).
- Learning Engine 2.0 (Injects recent 200 OK and 400+ trace logs into the AI prompt).
- Strict Pre-flight validation enforcing 15-mile radiuses and 18-65 age gates for Housing.
`;

code = code + "\n" + addition;
fs.writeFileSync('docs/PROJECT_BOOTSTRAP.md', code);
console.log("Patched bootstrap");
