const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetRule3 = `3. HOUSING EQUALITY CODE (HEC): Zero discriminatory language or prohibited target filtering.`;
const newRule3 = `3. HOUSING EQUALITY CODE (HEC) & POLICY EVASION ENGINE:
             - You must act as the Policy Evasion Engine.
             - Aggressively sanitize and remove ANY Meta-flagged housing terms: "exclusive", "cheap", "gated community", "safe neighborhood", "couples only", "no kids", "perfect for singles", "luxury living".
             - Replace them with compliant, universal terms (e.g. "curated", "value", "tranquil escape").
             - Document the removed terms in the \\\`policy_evasion_engine\\\` JSON output.`;

code = code.replace(targetRule3, newRule3);
fs.writeFileSync('server.ts', code);
console.log('Updated server.ts prompt rules');
