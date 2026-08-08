const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `  } catch (error: any) {
    console.error(\`[META ENGINE FAULT] Campaign \${campaignId} failed.\`, error);
    
    // Phase 3: Rollback Engine
    await executeMetaRollback(rollbackState, correlationId);
    
    await pool.query(\`UPDATE meta_publishing_transactions SET publish_status = 'FAILED', updated_at = CURRENT_TIMESTAMP WHERE id = $1\`, [txId]);
    await pool.query(\`UPDATE host_marketing_campaigns SET status = 'failed_publish', admin_feedback = $1 WHERE id = $2\`, [error.message, campaignId]);
    return false;
  }`;

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
    
    return false;
  }`;

if (code.includes(target)) {
   code = code.replace(target, replacement);
   fs.writeFileSync('server.ts', code);
   console.log("Patched catch block.");
} else {
   console.log("Target not found.");
}
