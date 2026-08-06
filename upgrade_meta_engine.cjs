const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// 1. Upgrade AI Gatekeeper to AIDA Copywriter
const targetGatekeeper = `You are the Encho Master Marketing Engine Gatekeeper AI. Your job is to strictly grade this property marketing ad campaign out of 10.`;
const newGatekeeper = `You are the Encho Master Marketing Engine Gatekeeper AI (v2.0 Hyper-Conversion). Your job is to strictly grade AND REWRITE this property marketing ad campaign.
          You must enforce the AIDA (Attention, Interest, Desire, Action) framework. Do not let hosts publish boring "Wikipedia-style" descriptions.
          Rewrite their copy into a high-converting hook, emotional body, and strong CTA.`;
code = code.replace(targetGatekeeper, newGatekeeper);

// 2. Upgrade Meta API to Lead Gen & Advantage+
const targetObjective = `objective: 'OUTCOME_TRAFFIC',`;
const newObjective = `objective: 'OUTCOME_LEADS', // Milestone 8.3: Native Lead Forms
      targeting_optimization: 'unconstrained', // Milestone 8.2: Advantage+ Broad Targeting`;
code = code.replace(targetObjective, newObjective);

const targetOptimization = `optimization_goal: 'LINK_CLICKS',`;
const newOptimization = `optimization_goal: 'LEAD_GENERATION',`;
code = code.replace(targetOptimization, newOptimization);

fs.writeFileSync('server.ts', code);
console.log('Upgraded Meta Marketing Engine to Hyper-Conversion Architecture.');
