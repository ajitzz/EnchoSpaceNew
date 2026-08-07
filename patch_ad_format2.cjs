const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const t = `              asset_feed_spec: {`;
const r = `              asset_feed_spec: {                ad_formats: ['SINGLE_IMAGE'],`;

if (code.includes(t)) {
    code = code.replace(t, r);
    fs.writeFileSync('server.ts', code);
    console.log("Patched ad_formats successfully");
} else {
    console.log("Could not find ad_formats target");
}
