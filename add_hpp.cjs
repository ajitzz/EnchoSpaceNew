const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const importHpp = `import hpp from 'hpp';`;
if (!code.includes(importHpp)) {
  code = code.replace(`import helmet from 'helmet';`, `import helmet from 'helmet';\nimport hpp from 'hpp';`);
}

const useHpp = `app.use(hpp()); // Protect against HTTP Parameter Pollution attacks`;
if (!code.includes(useHpp)) {
  code = code.replace(`app.use(express.json({ limit: '20mb' }));`, `app.use(express.json({ limit: '20mb' }));\n${useHpp}`);
}

fs.writeFileSync('server.ts', code);
console.log('Added hpp');
