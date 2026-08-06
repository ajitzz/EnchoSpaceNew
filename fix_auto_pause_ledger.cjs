const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetAutoPause = `           // Record transaction with explicit double-entry audit type
           await pool.query(\`INSERT INTO wallet_transactions (wallet_id, amount, type, status, description) VALUES ($1, $2, 'campaign_cancellation_refund', 'completed', $3)\`,
              [walletRes.rows[0].id, remainingBudget, \`Auto-pause refund for Campaign #\${c.id}\`]
           );
           // Zero out remaining budget on campaign
           await pool.query('UPDATE host_marketing_campaigns SET budget = spent WHERE id = $1', [c.id]);`;

const newAutoPause = `           // Record transaction with explicit double-entry audit type
           const txInsert = await pool.query(\`INSERT INTO wallet_transactions (wallet_id, amount, type, status, description) VALUES ($1, $2, 'campaign_cancellation_refund', 'completed', $3) RETURNING id\`,
              [walletRes.rows[0].id, remainingBudget, \`Auto-pause refund for Campaign #\${c.id}\`]
           );
           
           // Double-entry ledger integration
           await recordLedgerTransaction(pool, {
              txRef: \`auto_pause_refund_\${c.id}_\${Date.now()}\`,
              eventType: 'TRAPPED_CASH_REFUND',
              description: \`Auto-pause refund for Campaign #\${c.id}\`,
              lines: [
                 { accountType: 'META_AD_ESCROW', entryType: 'DEBIT', amount: remainingBudget },
                 { accountType: 'HOST_WALLET', userId: c.host_id, entryType: 'CREDIT', amount: remainingBudget }
              ]
           }).catch(err => console.error('[LEDGER ERROR] Failed to record auto-pause refund:', err));

           // Zero out remaining budget on campaign
           await pool.query('UPDATE host_marketing_campaigns SET budget = spent WHERE id = $1', [c.id]);`;

code = code.replace(targetAutoPause, newAutoPause);
fs.writeFileSync('server.ts', code);
console.log('Fixed Auto Pause Ledger');
