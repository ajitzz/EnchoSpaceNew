const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
const searchStr = "res.status(500).json({ error: 'Failed pre-flight check' });";
const idx = code.indexOf(searchStr);
if (idx > -1) {
  // Let's print out what exactly follows it.
  const following = code.substring(idx, idx + 200);
  console.log(JSON.stringify(following));
}
