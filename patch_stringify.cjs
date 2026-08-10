const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `    // Update meta_publishing_transactions with full classification
    await pool.query(\`
      UPDATE meta_publishing_transactions 
      SET publish_status = $1, 
          failure_code = $2, 
          failure_category = $3, 
          failure_stage = $4, 
          rollback_status = $5,
          error_details = $6,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = $7
    \`, [finalTxStatus, classification.code_name, classification.category, stageName, rollbackStatus, JSON.stringify(rawErrorPayload), txId]);`;

const replacement = `    // Prevent circular reference crashes when persisting error
    const safeErrorPayload = (() => {
      try {
        return JSON.stringify(rawErrorPayload);
      } catch (e) {
        return JSON.stringify({ error: { message: rawErrorPayload?.message || 'Circular reference in error payload' }});
      }
    })();

    // Update meta_publishing_transactions with full classification
    await pool.query(\`
      UPDATE meta_publishing_transactions 
      SET publish_status = $1, 
          failure_code = $2, 
          failure_category = $3, 
          failure_stage = $4, 
          rollback_status = $5,
          error_details = $6,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = $7
    \`, [finalTxStatus, classification.code_name, classification.category, stageName, rollbackStatus, safeErrorPayload, txId]);`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Patched error_details stringify in server.ts');
} else {
  console.log('Target not found for stringify patch');
}
