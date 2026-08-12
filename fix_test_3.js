import fs from 'fs';

const path = 'src/test/phase2_6_step2_multivariant.test.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace both occurrences where the foreign key violation is happening
content = content.replace(/await pool\.query\('DELETE FROM host_marketing_campaigns WHERE id = \$1', \[testCampaignId\]\);/g, "await pool.query('DELETE FROM meta_api_traces WHERE campaign_id = $1', [testCampaignId]);\n      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);");

fs.writeFileSync(path, content);
console.log("Fixed step2");
