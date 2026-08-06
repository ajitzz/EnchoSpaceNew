const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetCron = `      console.log(\`[ESCROW CRON] 24-hour escrow period completed for Campaign #\${row.id}. Dispatching to Meta Ads...\`);
      await dispatchMetaCampaign(row.id, null);          
      await dispatchGoogleAdsCampaign(row.id, null);`;

const newCron = `      console.log(\`[ESCROW CRON] 24-hour escrow period completed for Campaign #\${row.id}. Releasing Escrow & continuing pipeline.\`);
      await pool.query(\`
        UPDATE host_marketing_campaigns 
        SET escrow_status = 'released', status = 'ASSET_PREP', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      \`, [row.id]);
      
      // We manually dispatch here since it skipped the State Machine originally
      await dispatchMetaCampaign(row.id, { protocol: 'https', get: () => 'localhost' });          
      await dispatchGoogleAdsCampaign(row.id, { protocol: 'https', get: () => 'localhost' });`;

code = code.replace(targetCron, newCron);
fs.writeFileSync('server.ts', code);
console.log('Fixed Escrow Exec');
