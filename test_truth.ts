import 'dotenv/config';
import pg from 'pg';
import { CampaignControlCenterService } from './src/lib/campaignControlCenterService';
import { FailureIntelligenceService } from './src/lib/failureIntelligenceService';

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
      { role: 'host', isAdmin: false, userId: 1 }, // Host ID might be different, let's bypass auth check if we pass the right ID or just let it fail? No, getCampaignTruth checks if host_id === userId.
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
