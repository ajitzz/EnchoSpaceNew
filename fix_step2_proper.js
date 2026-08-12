import fs from 'fs';

const path = 'src/test/phase2_6_step2_multivariant.test.ts';
let content = fs.readFileSync(path, 'utf8');

// There's a mismatch with the variable names in the failing cleanup!
// Line 275: await pool.query('DELETE FROM meta_api_traces WHERE campaign_id = $1', [testCampaignId]);
// Line 276: await pool.query('DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [failingCampId]);
// Line 277: await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [failingCampId]);
// Line 275 is using testCampaignId instead of failingCampId, so the traces for failingCampId are never deleted!

content = content.replace(/await pool\.query\('DELETE FROM meta_api_traces WHERE campaign_id = \$1', \[testCampaignId\]\);\n\s*await pool\.query\('DELETE FROM meta_publishing_transactions WHERE campaign_id = \$1', \[failingCampId\]\);/g,
  "await pool.query('DELETE FROM meta_api_traces WHERE campaign_id = $1', [failingCampId]);\n      await pool.query('DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [failingCampId]);");

// Wait, let's just make it bulletproof
content = content.replace(/await pool\.query\('DELETE FROM meta_api_traces WHERE campaign_id = \$1', \[[a-zA-Z0-9_]+\]\);\n\s*await pool\.query\('DELETE FROM meta_publishing_transactions WHERE campaign_id = \$1', \[failingCampId\]\);/g,
  "await pool.query('DELETE FROM meta_api_traces WHERE campaign_id = $1', [failingCampId]);\n      await pool.query('DELETE FROM meta_publishing_transactions WHERE campaign_id = $1', [failingCampId]);");

// Line 62, 63: duplicate deletes. Clean them up.
content = content.replace(/await pool\.query\('DELETE FROM meta_api_traces WHERE campaign_id = \$1', \[testCampaignId\]\);\n\s*await pool\.query\('DELETE FROM meta_api_traces WHERE campaign_id = \$1', \[testCampaignId\]\);/g, "");

fs.writeFileSync(path, content);
console.log("Fixed properly");
