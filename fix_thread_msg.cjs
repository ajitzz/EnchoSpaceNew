const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetMsg = `            console.log(\`[COLD START ALERT] 🚨 SMS/Push dispatched to Host #\${t.host_id}: "You have a new Hot Lead for '\${propertyName}'! Click to reply." (Data Masked)\`);`;

const newMsg = `            await triggerColdStartAlert(t.host_id, propertyName, id, req);`;

code = code.replace(targetMsg, newMsg);
fs.writeFileSync('server.ts', code);
console.log('Fixed Thread Message Cold Start');
