const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const lines = code.split('\n');
let startIdx = -1;
let endIdx = -1;

for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('} catch (error: any) {') && lines[i+1].includes('META ENGINE FAULT') && lines[i+4].includes('executeMetaRollback')) {
     startIdx = i;
     for(let j=i; j<i+20; j++) {
        if (lines[j].includes('return false;')) {
           endIdx = j;
           break;
        }
     }
     break;
  }
}

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `  } catch (error: any) {
    console.error(\`[META ENGINE FAULT] Campaign \${campaignId} failed.\`, error);
    
    // Phase 3: Rollback Engine
    await executeMetaRollback(rollbackState, correlationId);
    
    await pool.query(\`UPDATE meta_publishing_transactions SET publish_status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE id = $1\`, [txId]);
    await pool.query(\`UPDATE host_marketing_campaigns SET status = 'failed_publish', admin_feedback = $1 WHERE id = $2\`, [error.message, campaignId]);
    
    // Phase 13: Dead Letter Queue
    try {
      await pool.query(\`
        INSERT INTO meta_publishing_dlq (transaction_id, campaign_id, correlation_id, failure_stage, error_payload, recommended_action)
        VALUES ($1, $2, $3, $4, $5, $6)
      \`, [
        txId, 
        campaignId, 
        correlationId, 
        rollbackState.metaCreativeId ? 'AD_CREATION' : (rollbackState.metaAdSetId ? 'CREATIVE_CREATION' : (rollbackState.metaCampaignId ? 'ADSET_CREATION' : 'CAMPAIGN_CREATION')),
        JSON.stringify({ message: error.message, stack: error.stack }),
        'Review credentials and ad details. Use the Replay Engine to retry.'
      ]);
    } catch (dlqErr) {
      console.error('[META DLQ FAULT] Failed to write to DLQ:', dlqErr);
    }
    return false;`;
    
    lines.splice(startIdx, endIdx - startIdx + 1, replacement);
    fs.writeFileSync('server.ts', lines.join('\n'));
    console.log("Patched catch block.");
} else {
    console.log("Could not find catch block limits.");
}
