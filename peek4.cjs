const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
const msgs = lines.findIndex(l => l.includes("app.post('/api/messages'"));
if (msgs !== -1) {
    console.log('--- MESSAGES ---');
    console.log(lines.slice(msgs, msgs + 30).join('\n'));
}

const table = lines.findIndex(l => l.includes("CREATE TABLE IF NOT EXISTS messages"));
if (table !== -1) {
    console.log('--- MESSAGES TABLE ---');
    console.log(lines.slice(table, table + 20).join('\n'));
}
