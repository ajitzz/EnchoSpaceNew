const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetImport = "import {";
const newImport = "import { Grid,";

// Just replace the first occurrence of import { from lucide-react. We can do it robustly:
code = code.replace(/import\s*\{/, "import { Grid, ");

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Added Grid to imports');
