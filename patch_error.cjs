const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

// Fix the catch block
content = content.replace(
`    const rawErrorPayload = error.metaData || error.response || { error: { message: error.message } };
    const classification = classifyMetaError(rawErrorPayload);

    // Phase 3: Trigger explicit reverse cascade rollback
    const rollbackRes = await executeMetaRollback(rollbackState, correlationId, pool);

    let finalTxStatus = 'FAILED_PUBLISH';
    let rollbackStatus = 'NOT_REQUIRED';
    const hasCreatedObjects = !!(rollbackState.metaCampaignId || rollbackState.metaAdSetId || rollbackState.metaCreativeId || rollbackState.metaAdId);
    if (hasCreatedObjects) {
      rollbackStatus = rollbackRes.success ? 'SUCCESS' : 'FAILED';
      finalTxStatus = rollbackRes.success ? 'ROLLBACK_SUCCESS' : 'ROLLBACK_FAILED';
    }

    const stageName = rollbackState.metaCreativeId
      ? 'AD_CREATION'
      : (rollbackState.metaAdSetId ? 'CREATIVE_CREATION' : (rollbackState.metaCampaignId ? 'ADSET_CREATION' : 'CAMPAIGN_CREATION'));

    // Prevent circular reference crashes when persisting error
    const rawErrorPayload = error.metaData || error.response || { error: { message: error.message, diagnosticReport: error.diagnosticReport } };
    const classification = classifyMetaError(rawErrorPayload);
      } catch (e) {
        return JSON.stringify({ error: { message: rawErrorPayload?.message || 'Circular reference in error payload' }});
      }
    })();`,
`    const rawErrorPayload = error.metaData || error.response || { error: { message: error.message, diagnosticReport: error.diagnosticReport } };
    const classification = classifyMetaError(rawErrorPayload);

    // Phase 3: Trigger explicit reverse cascade rollback
    const rollbackRes = await executeMetaRollback(rollbackState, correlationId, pool);

    let finalTxStatus = 'FAILED_PUBLISH';
    let rollbackStatus = 'NOT_REQUIRED';
    const hasCreatedObjects = !!(rollbackState.metaCampaignId || rollbackState.metaAdSetId || rollbackState.metaCreativeId || rollbackState.metaAdId);
    if (hasCreatedObjects) {
      rollbackStatus = rollbackRes.success ? 'SUCCESS' : 'FAILED';
      finalTxStatus = rollbackRes.success ? 'ROLLBACK_SUCCESS' : 'ROLLBACK_FAILED';
    }

    const stageName = rollbackState.metaCreativeId
      ? 'AD_CREATION'
      : (rollbackState.metaAdSetId ? 'CREATIVE_CREATION' : (rollbackState.metaCampaignId ? 'ADSET_CREATION' : 'CAMPAIGN_CREATION'));

    // Prevent circular reference crashes when persisting error
    const safeErrorPayload = (() => {
      try {
        return JSON.stringify(rawErrorPayload);
      } catch (e) {
        return JSON.stringify({ error: { message: rawErrorPayload?.message || 'Circular reference in error payload' }});
      }
    })();`
);

// Now patch classifyMetaError
const targetCode = `export function classifyMetaError(data: any): MetaErrorClassification {
  const e = data?.error || data;
  const code = Number(e?.code || 0);
  const subcode = Number(e?.error_subcode || 0);
  const msg = String(e?.message || e?.error_user_msg || (typeof data === 'string' ? data : '')).toLowerCase();`;

const replacement = `export function classifyMetaError(data: any): MetaErrorClassification {
  const e = data?.error || data;
  const code = Number(e?.code || 0);
  const subcode = Number(e?.error_subcode || 0);
  const msg = String(e?.message || e?.error_user_msg || (typeof data === 'string' ? data : '')).toLowerCase();

  if (msg.includes('preflight failed') || e?.diagnosticReport) {
    const diagnosticReport = e?.diagnosticReport;
    const firstBlocker = diagnosticReport?.gate_results?.find((g: any) => g.status === 'FAILED' && g.severity === 'BLOCKER');
    
    return {
      code_name: firstBlocker?.failure_code || 'PREFLIGHT_VALIDATION_FAILED',
      category: 'PREFLIGHT',
      severity: 'BLOCKER',
      user_title: 'Preflight Safety Check Failed',
      user_message: 'The campaign was blocked by Encho AI internal safety gates before reaching Meta.',
      technical_message: e?.message || msg,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: false,
      recommended_action: firstBlocker?.action_required || 'Review Preflight Diagnostics in Admin Console.'
    };
  }`;

content = content.replace(targetCode, replacement);

fs.writeFileSync('server.ts', content);
