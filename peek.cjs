const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('async function executeCampaignStateMachine'));
if (start !== -1) {
    console.log(lines.slice(start, start + 60).join('\n'));
} else {
    console.log('Not found executeCampaignStateMachine');
}

const refuel = lines.findIndex(l => l.includes("app.post('/api/marketing/wallet/refuel'"));
if (refuel !== -1) {
    console.log('--- REFUEL ---');
    console.log(lines.slice(refuel, refuel + 50).join('\n'));
}

const initiate = lines.findIndex(l => l.includes("app.post('/api/payments/geo-route/initiate'"));
if (initiate !== -1) {
    console.log('--- INITIATE ---');
    console.log(lines.slice(initiate, initiate + 50).join('\n'));
}
