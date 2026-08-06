const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetCron = `    const res = await pool.query(
      "SELECT id FROM host_marketing_campaigns WHERE status = 'escrow' AND updated_at <= CURRENT_TIMESTAMP - interval '24 hours'"
    );`;

const newCron = `    const res = await pool.query(
      "SELECT id FROM host_marketing_campaigns WHERE status = 'escrow' AND escrow_status = 'holding' AND escrow_release_at <= CURRENT_TIMESTAMP"
    );`;

code = code.replace(targetCron, newCron);
fs.writeFileSync('server.ts', code);
console.log('Fixed Escrow Cron');
