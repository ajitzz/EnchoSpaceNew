const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const t = `        if (assetFeedImages.length > 0) {`;
const r = `        if (false) { // FORCED FALSE FOR SANDBOX DEV MODE - DCO NOT SUPPORTED`;

if (code.includes(t)) {
    code = code.replace(t, r);
    fs.writeFileSync('server.ts', code);
    console.log("Patched to force standard ad successfully");
} else {
    console.log("Could not find target");
}
