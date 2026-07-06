const fs = require('fs');

let host = fs.readFileSync('components/HostForm.tsx', 'utf-8');

if (!host.includes('Trees,') && host.includes('Trees')) {
    // it was already added or something else
}

if (!host.includes('Trees')) {
    host = host.replace("import { Building2, Home", "import { Trees, Building2, Home");
    fs.writeFileSync('components/HostForm.tsx', host);
}

