const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /const isInvalidMessage = replyText === ''[\s\S]*?if \(!isInvalidMessage\) \{[\s\S]*?await sendWhatsAppMessage\(from, replyText\);\n           \}/;

const match = code.match(regex);
if (!match) {
   console.log("Could not find invalid message check");
   process.exit(1);
}

const replacement = `const isInvalidMessage = replyText === ''
             || lowerReply.includes('replace this')
             || lowerReply.includes('sample message')
             || lowerReply.includes('[insert')
             || lowerReply.includes('placeholder');

           if (!isInvalidMessage) {
               await sendWhatsAppMessage(from, replyText);
           } else {
               // Prevent conversation breaks if AI fails or hallucinates placeholders
               const fallbackMsg = "Hello! Welcome to ENCHO Space. I'm currently processing a lot of requests. Please visit our website to explore available properties, or let me know if you have a specific question!";
               await sendWhatsAppMessage(from, fallbackMsg);
           }`;

code = code.replace(regex, replacement);
fs.writeFileSync('server.ts', code);
console.log('WhatsApp fallback updated');
