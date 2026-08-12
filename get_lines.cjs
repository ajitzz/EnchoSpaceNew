const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
console.log(lines.findIndex(l => l.includes('async function dispatchMetaCampaign(campaignId')));
