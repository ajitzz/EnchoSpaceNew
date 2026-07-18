const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace('DO $ BEGIN', 'DO $$ BEGIN');
code = code.replace('END $;', 'END $$;');

fs.writeFileSync('server.ts', code);
