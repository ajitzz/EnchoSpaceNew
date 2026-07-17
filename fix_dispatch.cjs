const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetFuncStart = "async function dispatchMetaCampaign(campaignId: number, req: any) {";
const startIdx = code.indexOf(targetFuncStart);
console.log(code.substring(startIdx + 6000, startIdx + 8000));
