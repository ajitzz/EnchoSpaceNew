const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `    // update thread
    await pool.query(\`
      UPDATE threads
          // update thread
    await pool.query(\`
      UPDATE threads`;

const replacement = `    // update thread
    await pool.query(\`
      UPDATE threads`;

code = code.replace(target, replacement);

fs.writeFileSync('server.ts', code);
console.log('Fixed syntax error in server.ts');
