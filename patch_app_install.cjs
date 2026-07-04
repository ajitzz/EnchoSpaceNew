const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const importTarget = `import { NetworkStatus } from './components/NetworkStatus';`;
const importReplacement = `import { NetworkStatus } from './components/NetworkStatus';\nimport { InstallPrompt } from './components/InstallPrompt';`;

if (!code.includes('InstallPrompt')) {
    code = code.replace(importTarget, importReplacement);
}

const renderTarget = `<NetworkStatus />`;
const renderReplacement = `<NetworkStatus />\n      <InstallPrompt />`;

if (!code.includes('<InstallPrompt />')) {
    code = code.replace(renderTarget, renderReplacement);
}

fs.writeFileSync('App.tsx', code);
