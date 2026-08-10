const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `  // Signal 3: App Mode Verification (Requires App Token or Admin rights)
  try {
    const appSecret = process.env.META_APP_SECRET;
    const verifyToken = appSecret ? \`\${appId}|\${appSecret}\` : accessToken;
    const appRes = await fetch(\`\${baseUrl}/\${appId}?fields=is_in_development_mode&access_token=\${verifyToken}\`);
    const appData = await appRes.json();
    if (appData.error) {
      // Often token doesn't have app read permissions
      report.signals.push({ type: 'APP_MODE', status: 'EXTERNAL_UNVERIFIABLE', error: appData.error });
      report.blockers.push('App Mode is EXTERNAL_UNVERIFIABLE. System token lacks permission to verify App Mode.');
    } else {
      if (appData.is_in_development_mode) {
        report.signals.push({ type: 'APP_MODE', status: 'FAILED', data: appData });
        report.blockers.push(\`Meta App \${appId} is currently in Development Mode.\`);
      } else {
        report.signals.push({ type: 'APP_MODE', status: 'PASSED', data: appData });
      }
    }
  } catch (e: any) {
    report.signals.push({ type: 'APP_MODE', status: 'UNVERIFIABLE', error: e.message });
  }`;

const replacement = `  // Signal 3: App Mode Verification (Requires App Token or Admin rights)
  try {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      report.signals.push({ type: 'APP_MODE', status: 'EXTERNAL_UNVERIFIABLE', error: 'Missing META_APP_SECRET' });
      if (process.env.META_HUMAN_VERIFIED_APP_MODE_LIVE === 'true') {
         report.signals.push({ type: 'APP_MODE_HUMAN_VERIFIED', status: 'PASSED' });
      } else {
         report.blockers.push('App Mode is EXTERNAL_UNVERIFIABLE. Provide META_APP_SECRET or set META_HUMAN_VERIFIED_APP_MODE_LIVE=true to confirm manually.');
      }
    } else {
      const verifyToken = \`\${appId}|\${appSecret}\`;
      const appRes = await fetch(\`\${baseUrl}/\${appId}?fields=is_in_development_mode&access_token=\${verifyToken}\`);
      const appData = await appRes.json();
      if (appData.error) {
        report.signals.push({ type: 'APP_MODE', status: 'EXTERNAL_UNVERIFIABLE', error: appData.error });
        if (process.env.META_HUMAN_VERIFIED_APP_MODE_LIVE === 'true') {
           report.signals.push({ type: 'APP_MODE_HUMAN_VERIFIED', status: 'PASSED' });
        } else {
           report.blockers.push('App Mode is EXTERNAL_UNVERIFIABLE. App token failed. Set META_HUMAN_VERIFIED_APP_MODE_LIVE=true to bypass manually.');
        }
      } else {
        if (appData.is_in_development_mode) {
          report.signals.push({ type: 'APP_MODE', status: 'FAILED', data: appData });
          report.blockers.push(\`Meta App \${appId} is currently in Development Mode.\`);
        } else {
          report.signals.push({ type: 'APP_MODE', status: 'PASSED', data: appData });
        }
      }
    }
  } catch (e: any) {
    report.signals.push({ type: 'APP_MODE', status: 'UNVERIFIABLE', error: e.message });
    if (process.env.META_HUMAN_VERIFIED_APP_MODE_LIVE !== 'true') {
      report.blockers.push('App Mode is UNVERIFIABLE. Set META_HUMAN_VERIFIED_APP_MODE_LIVE=true to confirm manually.');
    }
  }`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Patched checkExternalMetaReadiness for APP_MODE');
} else {
  console.log('Target not found for APP_MODE patch');
}
