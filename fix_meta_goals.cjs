const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/objective:\s*'OUTCOME_TRAFFIC',/g, "objective: 'OUTCOME_LEADS', // Milestone 8.3: Native Lead Forms");
code = code.replace(/optimization_goal:\s*'LINK_CLICKS',/g, "optimization_goal: 'LEAD_GENERATION', // Milestone 8.3: Lead Generation");

// Also let's update Advantage+ Broad Targeting inside the Meta dispatch
// by injecting targeting_optimization: 'unconstrained' into adset payload
code = code.replace(/targeting:\s*adsetSpecifications.targeting/g, "targeting: adsetSpecifications.targeting,\n          targeting_optimization: 'unconstrained' // Milestone 8.2: Advantage+ Broad Targeting");

fs.writeFileSync('server.ts', code);
console.log('Fixed Meta Goals');
