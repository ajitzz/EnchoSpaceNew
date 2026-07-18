const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `export default app;`;
const replacement = `
// Gap 11: Database Death by Analytics (Time-Series Rollups)
const runAnalyticsRollup = async () => {
  if (!isDbConfigured) return;
  try {
     console.log('[ANALYTICS ROLLUP] Aggregating raw ad metrics into lightweight time-series table...');
     await pool.query(\`
       INSERT INTO campaign_analytics_rollups (campaign_id, date, impressions, clicks, spent)
       SELECT 
         id as campaign_id, 
         CURRENT_DATE as date, 
         accumulated_impressions as impressions, 
         accumulated_clicks as clicks, 
         accumulated_spent as spent
       FROM host_marketing_campaigns
       WHERE status = 'active'
       ON CONFLICT (campaign_id, date, platform) DO UPDATE 
       SET impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, spent = EXCLUDED.spent;
     \`);
  } catch (err) {
    console.error('[ANALYTICS ROLLUP ERROR]', err);
  }
};
setInterval(runAnalyticsRollup, 15 * 60 * 1000); // 15 mins

export default app;`;

if(code.includes(target) && !code.includes('runAnalyticsRollup')) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Gap 11 Added');
}

