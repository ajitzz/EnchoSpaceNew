const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target13 = `  // Persist the computed metrics and update calculation epoch
  await pool.query(\`
    UPDATE host_marketing_campaigns`;

const replacement13 = `  // Gap 13: Meta Over-Spend Liability (Double-Entry Ledger) Persistence
  if (enchoOverspend > 0) {
      console.log(\`[DOUBLE-ENTRY LEDGER] Campaign #\${row.id} overspent by $\${enchoOverspend.toFixed(2)}. Absorbing into Encho Corporate Liability Ledger to protect Host Wallet.\`);
      await pool.query(\`
         CREATE TABLE IF NOT EXISTS meta_overspend_ledger (
            id SERIAL PRIMARY KEY,
            campaign_id INT,
            host_id INT,
            overspend_amount DECIMAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         );
      \`);
      await pool.query(\`
         INSERT INTO meta_overspend_ledger (campaign_id, host_id, overspend_amount) 
         VALUES ($1, $2, $3)
      \`, [row.id, row.host_id, enchoOverspend]);
  }

  // Persist the computed metrics and update calculation epoch
  await pool.query(\`
    UPDATE host_marketing_campaigns`;

if (code.includes(target13)) {
  code = code.replace(target13, replacement13);
  fs.writeFileSync('server.ts', code);
  console.log('Gap 13 added.');
} else {
  console.log('Target for Gap 13 not found.');
}

