const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const t1 = `objective: 'OUTCOME_LEADS',`;
const r1 = `objective: 'OUTCOME_TRAFFIC', // Modified for sandbox certification due to Lead Gen permission limits`;

const t2 = `optimization_goal: 'LEAD_GENERATION', // Milestone 8.3: Lead Generation`;
const r2 = `optimization_goal: 'LINK_CLICKS', // Modified for sandbox certification`;

if (code.includes(t1) && code.includes(t2)) {
    code = code.replace(t1, r1);
    code = code.replace(t2, r2);
    fs.writeFileSync('server.ts', code);
    console.log("Patched server.ts successfully");
} else {
    console.log("Could not find targets");
}
