const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /if \(accessToken && metaCampId && !metaCampId\.includes\('act_8849203_camp_'\)\) \{/g,
  `if (accessToken && metaCampId) {`
);

fs.writeFileSync('server.ts', code);
console.log("Meta check patched.");
