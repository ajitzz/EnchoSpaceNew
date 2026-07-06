const fs = require('fs');
let server = fs.readFileSync('server.ts', 'utf-8');
const splitPoint = "process.on('SIGINT', () => shutdown('SIGINT'));";
const index = server.indexOf(splitPoint);
if (index !== -1) {
    server = server.substring(0, index + splitPoint.length) + '\n';
    fs.writeFileSync('server.ts', server);
    console.log('Truncated server.ts successfully!');
}
