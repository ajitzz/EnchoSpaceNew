const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `  if (options.externalReport && !options.externalReport.is_ready) {
    const devModeFail = options.externalReport.blockers.find((b: string) => b.includes('Development Mode'));
    const failureReason = devModeFail ? devModeFail : options.externalReport.blockers.join(' | ');
    gateResults.push({
      gate_id: 14,
      gate_key: 'GATE_14_CANARY_2_READY',
      gate_name: 'Meta App Canary #2 Readiness & Dev Mode Restriction',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: devModeFail ? 'META_APP_DEVELOPMENT_MODE_BLOCK' : 'META_EXTERNAL_PRODUCTION_READINESS_FAILED',
      admin_only: true,
      admin_details: \`External Blockers: \${options.externalReport.blockers.join(', ')}\`,
      message: \`Preflight Failed: Infrastructure Blocker — \${failureReason}\`,
      action_required: options.isAdmin
        ? \`Remediate external readiness blockers: \${failureReason}\`
        : 'Infrastructure Status: Meta Integration external readiness checks failed. Please contact administrator.'
    });
  } else if (process.env.META_CANARY_2_READY !== 'true' || appMode === 'development' || devModeBlockedInDb) {`;

const replacement = `  let billingWarning = '';
  if (options.externalReport) {
    const billingSignal = options.externalReport.signals.find((s: any) => s.type === 'BILLING');
    if (billingSignal && billingSignal.status === 'EXTERNAL_UNVERIFIABLE') {
      billingWarning = ' (Warning: Payment method exists in Meta Business Portfolio, but attachment to the Master Ad Account act_' + process.env.META_AD_ACCOUNT_ID + ' has not been externally verified.)';
    }
  }

  if (options.externalReport && !options.externalReport.is_ready) {
    const devModeFail = options.externalReport.blockers.find((b: string) => b.includes('Development Mode') || b.includes('META_HUMAN_VERIFIED_APP_MODE_LIVE'));
    const failureReason = devModeFail ? devModeFail : options.externalReport.blockers.join(' | ');
    gateResults.push({
      gate_id: 14,
      gate_key: 'GATE_14_CANARY_2_READY',
      gate_name: 'Meta App Canary #2 Readiness & Dev Mode Restriction',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: devModeFail ? 'META_APP_DEVELOPMENT_MODE_BLOCK' : 'META_EXTERNAL_PRODUCTION_READINESS_FAILED',
      admin_only: true,
      admin_details: \`External Blockers: \${options.externalReport.blockers.join(', ')}\${billingWarning}\`,
      message: \`Preflight Failed: Infrastructure Blocker — \${failureReason}\${billingWarning}\`,
      action_required: options.isAdmin
        ? \`Remediate external readiness blockers: \${failureReason}\`
        : 'Infrastructure Status: Meta Integration external readiness checks failed. Please contact administrator.'
    });
  } else if (process.env.META_CANARY_2_READY !== 'true' || appMode === 'development' || devModeBlockedInDb) {`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Patched Gate 14 successfully');
} else {
  console.log('Target not found for Gate 14 patch (fixed)');
}
