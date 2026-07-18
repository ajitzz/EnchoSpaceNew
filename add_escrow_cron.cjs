const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Gap 6: Escrow Processor Cron
const escrowCronCode = `
// Gap 6: Master Account Fraud Liability & Chargeback Escrow Processor
const processEscrowCampaigns = async () => {
  if (!isDbConfigured) return;
  try {
    const res = await pool.query(
      "SELECT id FROM host_marketing_campaigns WHERE status = 'escrow' AND updated_at <= CURRENT_TIMESTAMP - interval '24 hours'"
    );
    for (const row of res.rows) {
      console.log(\`[ESCROW CRON] 24-hour escrow period completed for Campaign #\${row.id}. Dispatching to Meta Ads...\`);
      await dispatchMetaCampaign(row.id, null);
    }
  } catch (err) {
    console.error('[ESCROW CRON ERROR]', err);
  }
};
setInterval(processEscrowCampaigns, 5 * 60 * 1000); // Check every 5 minutes

`;

// Insert the cron job near the end of the file, before the export default app;
const target = `export default app;`;
code = code.replace(target, escrowCronCode + target);

fs.writeFileSync('server.ts', code);
console.log('Escrow cron job added');
