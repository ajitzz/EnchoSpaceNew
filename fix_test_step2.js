import fs from 'fs';

const path = 'src/test/phase2_6_step2_multivariant.test.ts';
let content = fs.readFileSync(path, 'utf8');

// The error happens in both afterAll and in the specific test's finally block
// Let's replace the problematic DELETE statements

// 1. in afterAll block around line 66
// "await pool.query('DELETE FROM listings WHERE id = $1', [testListingId]);"
// But wait, the error is: update or delete on table "host_marketing_campaigns" violates foreign key constraint "meta_api_traces_campaign_id_fkey" on table "meta_api_traces"
// This means we are trying to delete from host_marketing_campaigns, but there are still rows in meta_api_traces pointing to it!
// Oh, the constraint is meta_api_traces_campaign_id_fkey on table meta_api_traces.
// But wait, the error actually occurred on line 66 for afterAll, which means it happened DURING the deletion of host_marketing_campaigns or listings?
// "violates foreign key constraint "meta_api_traces_campaign_id_fkey" on table "meta_api_traces""
// This means we need to ensure ALL meta_api_traces are deleted BEFORE deleting host_marketing_campaigns.
// We thought we did that, but maybe there's another campaign_id variable?

content = content.replace(/await pool\.query\('DELETE FROM host_marketing_campaigns WHERE id = \$1', \[testCampaignId\]\);/g, "await pool.query('DELETE FROM meta_api_traces WHERE campaign_id = $1', [testCampaignId]);\n      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [testCampaignId]);");

// Let's also check for any other campaign ids
content = content.replace(/await pool\.query\('DELETE FROM host_marketing_campaigns WHERE id = \$1', \[campaignId\]\);/g, "await pool.query('DELETE FROM meta_api_traces WHERE campaign_id = $1', [campaignId]);\n      await pool.query('DELETE FROM host_marketing_campaigns WHERE id = $1', [campaignId]);");

fs.writeFileSync(path, content);
console.log("Fixed");
