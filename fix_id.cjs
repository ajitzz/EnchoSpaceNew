const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace("            correlationId,\n            id,\n            req.user.id,", "            correlationId,\n            campaignId,\n            req.user.id,");
fs.writeFileSync('server.ts', code);
