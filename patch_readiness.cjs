const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `  // Signal 3: App Mode Verification (Requires App Token or Admin rights)
  try {
    const appRes = await fetch(\`\${baseUrl}/\${appId}?fields=is_in_development_mode&access_token=\${accessToken}\`);
    const appData = await appRes.json();
    if (appData.error) {
      // Often token doesn't have app read permissions
      report.signals.push({ type: 'APP_MODE', status: 'EXTERNAL_UNVERIFIABLE', error: appData.error });
      // We do not block here if it's unverifiable, but we rely on human DB flags
    } else {`;

const replacement = `  // Signal 3: App Mode Verification (Requires App Token or Admin rights)
  try {
    const appSecret = process.env.META_APP_SECRET;
    const verifyToken = appSecret ? \`\${appId}|\${appSecret}\` : accessToken;
    const appRes = await fetch(\`\${baseUrl}/\${appId}?fields=is_in_development_mode&access_token=\${verifyToken}\`);
    const appData = await appRes.json();
    if (appData.error) {
      // Often token doesn't have app read permissions
      report.signals.push({ type: 'APP_MODE', status: 'EXTERNAL_UNVERIFIABLE', error: appData.error });
      report.blockers.push('App Mode is EXTERNAL_UNVERIFIABLE. System token lacks permission to verify App Mode.');
    } else {`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Patched checkExternalMetaReadiness');
} else {
  console.log('checkExternalMetaReadiness target not found');
}
