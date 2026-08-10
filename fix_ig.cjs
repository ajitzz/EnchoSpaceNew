const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  "        instagram_actor_id: igAccountId || undefined,",
  ""
);
fs.writeFileSync('server.ts', content);
console.log('Removed instagram_actor_id');
