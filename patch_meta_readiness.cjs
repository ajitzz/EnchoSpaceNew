const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `  // Signal 3: App Mode Verification (Requires App Token or Admin rights)
  try {
    const appSecret = process.env.META_APP_SECRET;`;

const replacement = `  // Signal 4: Billing Readiness
  try {
    // Attempting to fetch billing_event or funding_source_details usually requires additional scopes or business manager access
    // Instead of failing the readiness check outright if we cannot verify it, we set it to EXTERNAL_UNVERIFIABLE
    const billingRes = await fetch(\`\${baseUrl}/\${cleanAdAccountId}?fields=funding_source_details,balance,amount_spent&access_token=\${accessToken}\`);
    const billingData = await billingRes.json();
    if (billingData.error) {
      report.signals.push({ type: 'BILLING', status: 'EXTERNAL_UNVERIFIABLE', error: billingData.error });
    } else {
      report.signals.push({ type: 'BILLING', status: 'EXTERNAL_UNVERIFIABLE', data: billingData });
    }
  } catch (e: any) {
    report.signals.push({ type: 'BILLING', status: 'EXTERNAL_UNVERIFIABLE', error: e.message });
  }

  // Signal 3: App Mode Verification (Requires App Token or Admin rights)
  try {
    const appSecret = process.env.META_APP_SECRET;`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Patched checkExternalMetaReadiness for BILLING signal');
} else {
  console.log('Target not found for checkExternalMetaReadiness patch');
}
