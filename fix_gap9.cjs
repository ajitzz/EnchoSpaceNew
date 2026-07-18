const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target9 = `// Return budget logic (Gap 9 - Trapped Cash Wallet Ledger logic naturally follows from pausing, budget freezes).`;
const replacement9 = `// Gap 9: Trapped Cash Wallet Ledger
        // If the campaign is paused, remaining budget goes back to the Host Wallet so they aren't charged for unused ads
        const remainingBudget = Math.max(0, parseFloat(c.budget || 0) - parseFloat(c.spent || 0));
        if (remainingBudget > 0) {
           console.log(\`[TRAPPED CASH LEDGER] Campaign #\${c.id} paused. Returning \$\${remainingBudget} to Host #\${c.host_id} Internal Wallet.\`);
           // Ensure wallet exists
           let walletRes = await pool.query('SELECT id FROM host_wallets WHERE host_id = $1', [c.host_id]);
           if (walletRes.rows.length === 0) {
               walletRes = await pool.query('INSERT INTO host_wallets (host_id, balance, encho_credits) VALUES ($1, 0, 0) RETURNING id', [c.host_id]);
           }
           // Credit wallet
           await pool.query('UPDATE host_wallets SET balance = balance + $1 WHERE host_id = $2', [remainingBudget, c.host_id]);
           // Record transaction
           await pool.query(\`INSERT INTO wallet_transactions (wallet_id, amount, type, status, description) VALUES ($1, $2, 'refund', 'completed', $3)\`,
              [walletRes.rows[0].id, remainingBudget, \`Auto-pause refund for Campaign #\${c.id}\`]
           );
           // Zero out remaining budget on campaign
           await pool.query('UPDATE host_marketing_campaigns SET budget = spent WHERE id = $1', [c.id]);
        }`;

if(code.includes(target9)) {
  code = code.replace(target9, replacement9);
  fs.writeFileSync('server.ts', code);
  console.log('Gap 9 logic added to triggerSmartAutoPause.');
} else {
  console.log('Target for Gap 9 not found.');
}
