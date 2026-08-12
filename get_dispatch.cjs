const fs = require('fs');
const code = fs.readFileSync('server.ts', 'utf8');

const match = code.match(/async function dispatchMetaCampaign\([\s\S]*?\n\}/);
if (match) {
    fs.writeFileSync('dispatch_function.ts', match[0]);
    console.log('Saved to dispatch_function.ts');
} else {
    console.log('Not found');
}
