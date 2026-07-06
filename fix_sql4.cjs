const fs = require('fs');
let server = fs.readFileSync('server.ts', 'utf-8');

server = server.replace(/\\\$\\\$\{/g, '$${');

fs.writeFileSync('server.ts', server);
console.log('Done fix 4');
