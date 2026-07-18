const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `  // Gap 17: Strict Row-Level Security (RLS) (The Data Breach Shield)
  await pool.query(\`ALTER TABLE host_marketing_campaigns ENABLE ROW LEVEL SECURITY;\`);
  await pool.query(\`
    DO $$ BEGIN
        CREATE POLICY enforce_host_isolation ON host_marketing_campaigns 
        USING (host_id = current_setting('app.current_user_id', true)::int);
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
  \`);
  console.log('[SECURITY] Enforced Strict Row-Level Security (RLS) on host_marketing_campaigns');`;

if (code.includes(target)) {
    code = code.replace(target, '');
    fs.writeFileSync('server.ts', code);
    console.log('Removed redundant Gap 17 code.');
} else {
    console.log('Target not found.');
}
