const fs = require('fs');
let host = fs.readFileSync('components/HostForm.tsx', 'utf-8');

if (!host.includes('Trees,') && !host.includes(' Trees')) {
    host = host.replace("Building2, Home", "Building2, Home, Trees");
    fs.writeFileSync('components/HostForm.tsx', host);
}
