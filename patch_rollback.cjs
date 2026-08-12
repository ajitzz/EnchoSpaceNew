const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /export async function executeMetaRollback\([\s\S]*?async function broadcastDbEvent/m;
const newRollback = `
export async function executeMetaRollback(
  state: { metaCampaignId?: string; metaAdSetId?: string; metaCreativeId?: string; metaAdId?: string },
  correlationId: string,
  dbPool?: any
): Promise<{ success: boolean; details: string[] }> {
  const accessToken = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
  const details: string[] = [];

  if (!accessToken) {
    return { success: false, details: ['Missing Meta Access Token'] };
  }

  console.log(\`[META ROLLBACK ENGINE] Triggered for \${correlationId}. State:\`, state);

  let allSucceeded = true;

  // Phase 2J: Meta Object Ownership - Never delete. Only pause/archive.
  const archiveObject = async (objType: string, objId: string | undefined) => {
    if (!objId) return;
    try {
      const payload = {
        access_token: accessToken,
        status: 'PAUSED',
        name: \`[FAILED_ROLLBACK_\${correlationId}] \${objType}_\${objId}\`
      };
      
      const res = await fetch(\`\${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/\${objId}\`, {
        method: 'POST', // POST updates the object
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      const isSuccess = data.success === true || data.id === objId || res.status === 200 || (data.error && (data.error.code === 100 || data.error.code === 10));
      
      console.log(\`[META ROLLBACK] Archived \${objType} \${objId}:\`, data);
      details.push(\`\${objType} \${objId}: \${isSuccess ? 'Archived' : JSON.stringify(data)}\`);
      
      if (!isSuccess && res.status !== 404) {
        allSucceeded = false;
      }

      if (dbPool) {
        try {
          await dbPool.query(\`
            INSERT INTO meta_api_traces (
              campaign_id, correlation_id, step_name, request_payload, response_payload, response_status, execution_time_ms, attempt
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          \`, [
             null, correlationId, \`rollback_archive_\${objType.toLowerCase()}\`, JSON.stringify(payload), JSON.stringify(data), res.status, 0, 1
          ]);
        } catch (e) {
          // ignore trace insert failure
        }
      }
    } catch (e: any) {
      allSucceeded = false;
      console.error(\`[META ROLLBACK] Failed to archive \${objType} \${objId}:\`, e.message);
      details.push(\`\${objType} \${objId} archive failed: \${e.message}\`);
    }
  };

  // Reverse Cascade
  await archiveObject('AD', state.metaAdId);
  await archiveObject('CREATIVE', state.metaCreativeId); // Note: creatives can't always be renamed, but attempt is made
  await archiveObject('ADSET', state.metaAdSetId);
  await archiveObject('CAMPAIGN', state.metaCampaignId);

  return { success: allSucceeded, details };
}

export function broadcastDbEvent`;

code = code.replace(regex, newRollback);

fs.writeFileSync('server.ts', code);
console.log('Rollback patched to use archive instead of delete.');
