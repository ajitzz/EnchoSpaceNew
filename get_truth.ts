import 'dotenv/config';
import pg from 'pg';
import { CampaignControlCenterService } from './src/lib/campaignControlCenterService';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const adminTruth = await CampaignControlCenterService.getCampaignTruth(
      7107, 
      { role: 'admin', isAdmin: true, userId: 1 }, 
      pool
    );
    console.log("=== ADMIN TRUTH ===");
    console.log(JSON.stringify(adminTruth, null, 2));

    const hostTruth = await CampaignControlCenterService.getCampaignTruth(
      7107, 
      { role: 'host', isAdmin: false, userId: 51 }, // using real host id if needed, or 1 if it bypasses
      pool
    );
    console.log("=== HOST TRUTH ===");
    console.log(JSON.stringify(hostTruth, null, 2));
  } catch (e: any) {
    console.error("Error:", e.message);
  } finally {
    pool.end();
  }
}
run();
