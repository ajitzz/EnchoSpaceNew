const fs = require('fs');
let code = fs.readFileSync('src/test/phase2_8_2_certification.test.ts', 'utf-8');
code = code.replace(
  "UPDATE host_marketing_campaigns SET external_status_verified_at = NULL WHERE id = $1;\n      UPDATE meta_publishing_transactions SET updated_at = NOW() - INTERVAL '1 hour' WHERE campaign_id = $1",
  "UPDATE host_marketing_campaigns SET external_status_verified_at = NULL WHERE id = $1`);\n    await pool.query(`UPDATE meta_publishing_transactions SET updated_at = NOW() - INTERVAL '1 hour' WHERE campaign_id = $1"
);
fs.writeFileSync('src/test/phase2_8_2_certification.test.ts', code);
