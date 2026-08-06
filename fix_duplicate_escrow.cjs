const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetWorker = `// 5. Automatic 24-Hour Fraud Escrow Auto-Release Worker
setInterval(async () => {
  try {
    const expiredEscrows = await pool.query(
      \`SELECT id, admin_approved FROM host_marketing_campaigns 
       WHERE escrow_status = 'holding' AND escrow_release_at <= CURRENT_TIMESTAMP\`
    );
    for (const c of expiredEscrows.rows) {
      await pool.query(
        \`UPDATE host_marketing_campaigns 
         SET escrow_status = 'released', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1\`,
        [c.id]
      );
      console.log(\`[ESCROW WORKER] 24-Hour Fraud Escrow expired and auto-released for Campaign #\${c.id}\`);
      if (c.admin_approved) {
        await dispatchMetaCampaign(c.id, { protocol: 'https', get: () => 'localhost' } as any);
        await dispatchGoogleAdsCampaign(c.id, { protocol: 'https', get: () => 'localhost' } as any);
      }
    }
  } catch (workerErr) {
    console.error('[ESCROW WORKER ERROR]', workerErr);
  }
}, 60000);`;

code = code.replace(targetWorker, '');
fs.writeFileSync('server.ts', code);
console.log('Removed duplicate escrow worker');
