const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const r = await pool.query("SELECT meta_sync_logs FROM host_marketing_campaigns WHERE id = 17");
  const logs = r.rows[0].meta_sync_logs.steps;
  const req = logs.find(l => l.step === 'creative_creation').request;
  const token = req.access_token; // wait, it says REDACTED in logs!
  
  // I need to get the actual token from the system_settings or from the user DB
  const userR = await pool.query("SELECT meta_access_token FROM users WHERE id = (SELECT host_id FROM host_marketing_campaigns WHERE id = 17)");
  const realToken = userR.rows[0].meta_access_token;
  
  if (realToken) {
     const pageId = '554884541034223';
     const fetch = (await import('node-fetch')).default;
     const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/leadgen_forms?access_token=${realToken}`);
     const data = await res.json();
     console.log(JSON.stringify(data, null, 2));
  } else {
     console.log("No real token found");
  }
  pool.end();
}
run();
