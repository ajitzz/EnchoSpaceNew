const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const importTarget = `import { AuthModal } from './components/AuthModal';`;
const importReplacement = `import { AuthModal } from './components/AuthModal';\nimport { NetworkStatus } from './components/NetworkStatus';`;

if (!code.includes('NetworkStatus')) {
    code = code.replace(importTarget, importReplacement);
}

const renderTarget = `<SEO />`;
const renderReplacement = `<SEO />\n      <NetworkStatus />`;

if (!code.includes('<NetworkStatus />')) {
    code = code.replace(renderTarget, renderReplacement);
}

fs.writeFileSync('App.tsx', code);
