const fs = require('fs');
const code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');
const search = `const handleRunAiCheck`;
const startIndex = code.indexOf(search);
console.log(code.substring(startIndex, startIndex + 1000));
