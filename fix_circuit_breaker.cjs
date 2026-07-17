const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `              if (remainingBudget > 0) {
                // Trap the cash in Encho internal wallet
                await pool.query(
                  "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2", 
                  [remainingBudget, hostId]
                );
                
                await pool.query(
                  "INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES ($1, $2, $3, $4)",
                  [hostId, remainingBudget, 'refund', \`Trapped Cash Refund: Unused budget from Auto-paused Campaign #\${campaign.id}\`]
                );`;

const replacement = `              if (remainingBudget > 0) {
                // Trap the cash in Encho internal wallet
                let walletRes = await pool.query('SELECT id FROM host_wallets WHERE host_id = $1', [hostId]);
                if (walletRes.rows.length === 0) {
                   walletRes = await pool.query('INSERT INTO host_wallets (host_id, balance, encho_credits) VALUES ($1, 0, 0) RETURNING id', [hostId]);
                }
                const walletId = walletRes.rows[0].id;
                
                await pool.query(
                  "UPDATE host_wallets SET balance = balance + $1 WHERE id = $2", 
                  [remainingBudget, walletId]
                );
                
                await pool.query(
                  "INSERT INTO wallet_transactions (wallet_id, amount, type, description) VALUES ($1, $2, $3, $4)",
                  [walletId, remainingBudget, 'refund', \`Trapped Cash Refund: Unused budget from Auto-paused Campaign #\${campaign.id}\`]
                );`;

code = code.replace(target, replacement);

fs.writeFileSync('server.ts', code);
console.log('Fixed circuit breaker wallet reference');
