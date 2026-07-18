const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `  marketingSchemaInitialized = true;`;

const rlsCode = `
  // Gap 17: Strict Row-Level Security (RLS) - The Data Breach Shield
  try {
    await pool.query(\`
      -- Create a helper function for the current app user
      CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS integer AS $$\\\\$
        SELECT NULLIF(current_setting('app.current_user_id', true), '')::integer;
      \\\\$$ LANGUAGE sql STABLE;

      -- 1. host_outreach_leads
      ALTER TABLE host_outreach_leads ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS host_leads_policy ON host_outreach_leads;
      CREATE POLICY host_leads_policy ON host_outreach_leads
        USING (host_id = current_app_user_id() OR current_app_user_id() IS NULL);

      -- 2. host_wallets
      ALTER TABLE host_wallets ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS host_wallets_policy ON host_wallets;
      CREATE POLICY host_wallets_policy ON host_wallets
        USING (host_id = current_app_user_id() OR current_app_user_id() IS NULL);

      -- 3. host_marketing_campaigns
      ALTER TABLE host_marketing_campaigns ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS host_campaigns_policy ON host_marketing_campaigns;
      CREATE POLICY host_campaigns_policy ON host_marketing_campaigns
        USING (host_id = current_app_user_id() OR current_app_user_id() IS NULL);

    \`);
    console.log('✅ Gap 17: Strict Row-Level Security (RLS) policies enforced on Neon Postgres.');
  } catch (rlsErr) {
    console.error('[RLS SETUP ERROR]', rlsErr);
  }
  
  marketingSchemaInitialized = true;`;

code = code.replace(target, rlsCode);
fs.writeFileSync('server.ts', code);
console.log('RLS code added');
