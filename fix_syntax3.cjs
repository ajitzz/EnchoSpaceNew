const fs = require('fs');
let host = fs.readFileSync('components/HostDashboard.tsx', 'utf8');
host = host.replace(/\/\* listingType=\{ \*\/listingType\} \/>/g, '/>');
fs.writeFileSync('components/HostDashboard.tsx', host);
