const fs = require('fs');

const file = 'server.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /\/\/ Phase 1 & 2: Idempotent Publishing & Transaction State Machine[\s\S]*?(?=\/\/ Phase 3: Rollback Engine State)/;

const replacement = `// Phase 1 & 2: Idempotent Publishing & Transaction State Machine
  let txId;
  let publishAttempt = 1;

  const claimClient = await pool.connect();
  try {
    await claimClient.query('BEGIN');
    
    await claimClient.query(
      \`INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status) 
       VALUES ($1, $2, $3, 'PRECHECK_RUNNING') 
       ON CONFLICT (idempotency_key) DO NOTHING\`,
      [campaignId, idempotencyKey, correlationId]
    );

    const txCheck = await claimClient.query(\`SELECT * FROM meta_publishing_transactions WHERE idempotency_key = $1 FOR UPDATE NOWAIT\`, [idempotencyKey]);
    
    if (txCheck.rows.length === 0) {
       throw new Error('Critical idempotency failure: Record not found after insert or conflict');
    }

    const tx = txCheck.rows[0];
    txId = tx.id;
    publishAttempt = tx.publish_attempt;

    if (tx.correlation_id !== correlationId) { // Existing record
      if (tx.publish_status === 'SUCCESS' || tx.publish_status === 'LIVE') {
        console.log(\`[META ENGINE] Campaign \${campaignId} already successfully published. Idempotency hit.\`);
        await claimClient.query('COMMIT');
        return true;
      }
      
      if (tx.publish_status === 'PRECHECK_RUNNING' || tx.publish_status === 'PUBLISHING') {
         const lastUpdate = new Date(tx.updated_at).getTime();
         const now = Date.now();
         if (now - lastUpdate < 5 * 60 * 1000) { // 5 minutes lease
           console.log(\`[META ENGINE] Campaign \${campaignId} is currently being published in another process.\`);
           await claimClient.query('ROLLBACK');
           return false;
         } else {
           console.log(\`[META ENGINE] Campaign \${campaignId} lease expired. Reclaiming.\`);
         }
      }
      
      publishAttempt++;
      await claimClient.query(
        \`UPDATE meta_publishing_transactions 
         SET publish_attempt = $1, publish_status = 'PRECHECK_RUNNING', updated_at = CURRENT_TIMESTAMP, correlation_id = $2 
         WHERE id = $3\`,
        [publishAttempt, correlationId, txId]
      );
    }

    await claimClient.query('COMMIT');
  } catch (error: any) {
    await claimClient.query('ROLLBACK');
    if (error.code === '55P03') { // lock_not_available
       console.log(\`[META ENGINE] Campaign \${campaignId} is locked by another concurrent dispatch process.\`);
       return false;
    }
    throw error;
  } finally {
    claimClient.release();
  }

  `;

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync(file, code);
  console.log('Patched successfully');
} else {
  console.log('Regex not matched!');
}
