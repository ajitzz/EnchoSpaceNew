import 'dotenv/config';
import pg from 'pg';
import { CampaignControlCenterService } from './src/lib/campaignControlCenterService';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const { rows } = await pool.query('SELECT host_id FROM host_marketing_campaigns WHERE id = 7107');
  const hostId = rows[0].host_id;
  
  const hostTruth = await CampaignControlCenterService.getCampaignTruth(
    7107, 
    { role: 'host', isAdmin: false, userId: hostId },
    pool
  );
  console.log("=== HOST TRUTH ===");
  console.log(JSON.stringify(hostTruth, null, 2));
  pool.end();
}
run();
