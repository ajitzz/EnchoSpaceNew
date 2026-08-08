const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `const campData = await executeMetaRequest('campaign_creation', \`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/campaigns\`, campPayload);`;
if (code.includes(target)) {
    // We will just do a simple string replace for the base url
    code = code.replace(/https:\/\/graph\.facebook\.com\/v19\.0/g, '${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}');
    fs.writeFileSync('server.ts', code);
    console.log("Updated to use dynamic base URL.");
} else {
    console.log("Could not find meta URLs");
}
