const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
const initiate = lines.findIndex(l => l.includes("if (targetGateway === 'internal_wallet') {"));
if (initiate !== -1) {
    console.log('--- INTERNAL WALLET ---');
    console.log(lines.slice(initiate, initiate + 40).join('\n'));
}
