import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

// The dummy token uses id: 'user_ajith'. Let's change it to id: 1
code = code.replace(/id: 'user_ajith'/g, 'id: 1');

fs.writeFileSync('server.ts', code);
