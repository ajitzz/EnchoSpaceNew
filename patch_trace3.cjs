const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace("console.error('[META API TRACES] Failed to save trace', e.message, e.stack);", "fs.appendFileSync('meta_db_error.txt', e.message + '\\n' + e.stack + '\\n'); console.error('[META API TRACES] Failed to save trace', e.message, e.stack);");
fs.writeFileSync('server.ts', code);
