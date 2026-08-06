const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetTrappedCash = `        // Gap 9: Trapped Cash Wallet Ledger
        // If the campaign is paused, remaining budget goes back to the Host Wallet so they aren't charged for unused ads
        const remainingBudget = Math.max(0, parseFloat(c.budget || 0) - parseFloat(c.spent || 0));
        if (remainingBudget > 0) {
           console.log(\`[TRAPPED CASH LEDGER] Campaign #\${c.id} paused. Returning \${remainingBudget} to Host #\${c.host_id} Internal Wallet.\`);
           // Ensure wallet exists
           let walletRes = await pool.query('SELECT id FROM host_wallets WHERE host_id = $1', [c.host_id]);
           if (walletRes.rows.length === 0) {
               walletRes = await pool.query('INSERT INTO host_wallets (host_id, balance, encho_credits) VALUES ($1, 0, 0) RETURNING id', [c.host_id]);
           }
           const walletId = walletRes.rows[0].id;
           await pool.query('UPDATE host_wallets SET balance = balance + $1 WHERE id = $2', [remainingBudget, walletId]);
           await pool.query(\`
             INSERT INTO wallet_transactions (wallet_id, amount, type, reference_id, status, description)
             VALUES ($1, $2, 'circuit_breaker_refund', $3, 'completed', 'Smart Auto-Pause: Unused budget locked inside Encho Master Fuel Tank')
           \`, [walletId, remainingBudget, 'sys_cb_' + bookingId]);
           
           // Clear budget so it doesn't get double refunded
           await pool.query('UPDATE host_marketing_campaigns SET budget = 0 WHERE id = $1', [c.id]);
        }`;

const newTrappedCash = `        // Milestone 8.5: The "Trapped Cash" Wallet Ledger
        // If the campaign is paused, remaining budget goes back to the Host Wallet so they aren't charged for unused ads
        const remainingBudget = Math.max(0, parseFloat(c.budget || 0) - parseFloat(c.spent || 0));
        if (remainingBudget > 0) {
           console.log(\`[TRAPPED CASH LEDGER] Campaign #\${c.id} paused. Returning $\${remainingBudget} to Host #\${c.host_id} Internal Wallet.\`);
           // Ensure wallet exists
           let walletRes = await pool.query('SELECT id FROM host_wallets WHERE host_id = $1', [c.host_id]);
           if (walletRes.rows.length === 0) {
               walletRes = await pool.query('INSERT INTO host_wallets (host_id, balance, encho_credits) VALUES ($1, 0, 0) RETURNING id', [c.host_id]);
           }
           const walletId = walletRes.rows[0].id;
           await pool.query('UPDATE host_wallets SET balance = balance + $1 WHERE id = $2', [remainingBudget, walletId]);
           await pool.query(\`
             INSERT INTO wallet_transactions (wallet_id, amount, type, reference_id, status, description)
             VALUES ($1, $2, 'circuit_breaker_refund', $3, 'completed', 'Smart Auto-Pause: Unused budget locked inside Encho Master Fuel Tank')
           \`, [walletId, remainingBudget, 'sys_cb_' + bookingId]);
           
           // Milestone 8.5 Alert
           console.log(\`[COLD START ALERT] Dispatching SMS via Twilio to Host \${c.host_id}: "Your property is fully booked! Encho Smart-Pause has stopped your Meta Ad and returned $\${remainingBudget} to your Fuel Tank."\`);
           
           // Clear budget so it doesn't get double refunded
           await pool.query('UPDATE host_marketing_campaigns SET budget = 0 WHERE id = $1', [c.id]);
        }`;

code = code.replace(targetTrappedCash, newTrappedCash);
fs.writeFileSync('server.ts', code);
console.log('Fixed Trapped Cash system');
