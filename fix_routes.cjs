const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace("app.post('/api/marketing/meta/webhooks'", "app.post(['/api/marketing/meta/webhooks', '/api/meta-webhooks']");

fs.writeFileSync('server.ts', code);
console.log('Fixed routes');
