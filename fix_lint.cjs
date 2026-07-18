const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/for \(let c of campaigns.rows\)/g, 'for (const c of campaigns.rows)');
code = code.replace(/} catch\(e\) {}/g, "} catch(e) { console.error('Failed to parse media urls for optimization', e); }");

fs.writeFileSync('server.ts', code);
