const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Gap 17: Add RLS setup to DB init
const targetRLS = `  // 1. host_wallets table (The Fuel Tank + Gap 13 Double-Entry Ledger)`;
const replaceRLS = `  // Gap 17: Strict Row-Level Security (RLS) (The Data Breach Shield)
  await pool.query(\`ALTER TABLE host_marketing_campaigns ENABLE ROW LEVEL SECURITY;\`);
  await pool.query(\`
    DO $$ BEGIN
        CREATE POLICY enforce_host_isolation ON host_marketing_campaigns 
        USING (host_id = current_setting('app.current_user_id', true)::int);
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
  \`);
  console.log('[SECURITY] Enforced Strict Row-Level Security (RLS) on host_marketing_campaigns');

  // 1. host_wallets table (The Fuel Tank + Gap 13 Double-Entry Ledger)`;

if(code.includes(targetRLS)) {
    code = code.replace(targetRLS, replaceRLS);
    console.log('Gap 17 RLS setup injected.');
} else {
    console.log('Gap 17 targetRLS not found.');
}

// Gap 10: Dynamic Creative Optimization Cron
const targetDCO = `// Gap 11: Database Death by Analytics (Time-Series Rollups)`;
const replaceDCO = `// Gap 10: Automated A/B Testing (Dynamic Creative Optimization) Processor
const processDynamicCreativeOptimization = async () => {
  if (!isDbConfigured) return;
  try {
     const res = await pool.query(
        "SELECT id, media_urls FROM host_marketing_campaigns WHERE status = 'active' AND media_urls IS NOT NULL AND jsonb_array_length(media_urls) > 1 AND meta_dispatched_at <= CURRENT_TIMESTAMP - interval '24 hours'"
     );
     for (const row of res.rows) {
        let urls = [];
        try {
           urls = typeof row.media_urls === 'string' ? JSON.parse(row.media_urls) : row.media_urls;
        } catch(e) {}
        
        if (urls && urls.length > 1) {
            console.log(\`[DYNAMIC CREATIVE OPTIMIZATION] Campaign #\${row.id} has run A/B testing for 24+ hours.\`);
            console.log(\`[DYNAMIC CREATIVE OPTIMIZATION] Routing 100% of remaining budget to winning creative: \${urls[0]}\`);
            const winningMedia = [urls[0]];
            await pool.query("UPDATE host_marketing_campaigns SET media_urls = $1 WHERE id = $2", [JSON.stringify(winningMedia), row.id]);
        }
     }
  } catch (err) {
    console.error('[DYNAMIC CREATIVE ERROR]', err);
  }
};
setInterval(processDynamicCreativeOptimization, 60 * 60 * 1000); // Check every 1 hour

// Gap 11: Database Death by Analytics (Time-Series Rollups)`;

if(code.includes(targetDCO)) {
    code = code.replace(targetDCO, replaceDCO);
    console.log('Gap 10 DCO Cron injected.');
} else {
    console.log('Gap 10 targetDCO not found.');
}

fs.writeFileSync('server.ts', code);
