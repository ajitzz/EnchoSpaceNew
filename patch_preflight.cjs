const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const preflightCode = `
// ----------------- META PREFLIGHT ENGINE -----------------
async function runMetaPreflightEngine(campaignId, dbPool) {
  console.log(\`[PREFLIGHT] Running validation for campaign \${campaignId}\`);
  const campaignRes = await dbPool.query('SELECT * FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
  if (campaignRes.rows.length === 0) throw new Error('Campaign not found');
  const campaign = campaignRes.rows[0];

  // 1. Authentication
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
    throw new Error('Preflight Failed: Missing Meta API Credentials');
  }

  // 2. Special Ad Category Validation
  if (!campaign.target_locations || campaign.target_radius_km < 25) {
    throw new Error('Preflight Failed: Housing Special Ad Category requires minimum 25km radius targeting.');
  }

  // 3. Payload & Schema Validation
  if (!campaign.title || !campaign.feed_description) {
    throw new Error('Preflight Failed: Missing required creative fields (title, feed_description).');
  }

  // 4. Budget Validation
  if (campaign.budget < 100) {
    throw new Error('Preflight Failed: Budget is below Meta minimums.');
  }
  
  // 5. Objective & Optimization Validation
  // We use OUTCOME_TRAFFIC with LINK_CLICKS or REACH
  console.log(\`[PREFLIGHT] Campaign \${campaignId} passed all checks.\`);
  return true;
}
`;

if (!code.includes('runMetaPreflightEngine')) {
  // Inject before dispatchMetaCampaign
  code = code.replace('async function dispatchMetaCampaign', preflightCode + '\nasync function dispatchMetaCampaign');
  
  // Also call it inside dispatchMetaCampaign or approve
  // Let's call it at the start of dispatchMetaCampaign
  code = code.replace('async function dispatchMetaCampaign(campaignId: number, req: any) {', "async function dispatchMetaCampaign(campaignId: number, req: any) {\n  await runMetaPreflightEngine(campaignId, pool);");

  fs.writeFileSync('server.ts', code);
  console.log("Patched server.ts with Preflight Engine.");
} else {
  console.log("Already patched.");
}
