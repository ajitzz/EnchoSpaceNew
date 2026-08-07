const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace("console.error('[META API TRACES] Failed to save trace', e.message);", "require('fs').appendFileSync('meta_db_error.txt', e.stack + '\\n'); console.error('[META API TRACES] Failed to save trace', e.message);");

fs.writeFileSync('server.ts', code);
