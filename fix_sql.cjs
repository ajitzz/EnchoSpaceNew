const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/OR \['active', 'CAMPAIGN_LIVE'\]\.includes\(c\.status\)/g, "OR c.status IN ('active', 'CAMPAIGN_LIVE')");

fs.writeFileSync('server.ts', code);
console.log('Fixed SQL syntax');
