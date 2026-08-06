const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetMsg = `            sendWhatsAppMessage(
               booking.phone,
               \`✉️ New message regarding your booking:"\${content}"\`
            );`;

const newMsg = `            sendWhatsAppMessage(
               booking.phone,
               \`✉️ New message regarding your booking:"\${sanitized}"\`
            );`;

code = code.replace(targetMsg, newMsg);
fs.writeFileSync('server.ts', code);
console.log('Fixed Messages');
