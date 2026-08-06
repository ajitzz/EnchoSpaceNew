const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
const initiate = lines.findIndex(l => l.includes("if (targetGateway === 'internal_wallet') {"));
if (initiate !== -1) {
    console.log('--- INTERNAL WALLET (tail) ---');
    console.log(lines.slice(initiate + 40, initiate + 80).join('\n'));
}
