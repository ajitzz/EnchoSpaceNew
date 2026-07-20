const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace("req.ip || req.socket.remoteAddress", "req.ip || req.socket?.remoteAddress || null");
fs.writeFileSync('server.ts', code);
