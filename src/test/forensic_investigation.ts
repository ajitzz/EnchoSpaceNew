import pg from 'pg';
import dotenv from 'dotenv';
import { CampaignControlCenterService } from '../lib/campaignControlCenterService.js';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  console.log("=== FORENSIC INVESTIGATION: CAMPAIGN 7105 DEEP DIVE ===");
  try {
    const cRes = await pool.query(`SELECT * FROM host_marketing_campaigns WHERE id = 7105`);
    const campaign = cRes.rows[0];
    console.log("Campaign 7105 DB Row:", {
      id: campaign.id,
      title: campaign.title,
      status: campaign.status,
      admin_approved: campaign.admin_approved,
      meta_campaign_id: campaign.meta_campaign_id,
      meta_adset_id: campaign.meta_adset_id,
      meta_ad_id: campaign.meta_ad_id,
      meta_status: campaign.meta_status,
      meta_effective_status: campaign.meta_effective_status,
      meta_review_status: campaign.meta_review_status,
      external_status_verified_at: campaign.external_status_verified_at,
      external_status_verification_source: campaign.external_status_verification_source,
      insights_synced_at: campaign.insights_synced_at,
      accumulated_impressions: campaign.accumulated_impressions,
      accumulated_clicks: campaign.accumulated_clicks,
      accumulated_spent: campaign.accumulated_spent
    });

    const variantsRes = await pool.query(`SELECT * FROM campaign_creative_variants WHERE campaign_id = 7105`);
    console.log("\nVariants for 7105:", variantsRes.rows);

    const snapshotsRes = await pool.query(`SELECT * FROM variant_meta_snapshots WHERE variant_id IN (SELECT id FROM campaign_creative_variants WHERE campaign_id = 7105)`);
    console.log("\nSnapshots for 7105:", snapshotsRes.rows);

    const txRes = await pool.query(`SELECT * FROM meta_publishing_transactions WHERE campaign_id = 7105`);
    console.log("\nTransactions for 7105:", txRes.rows);

    console.log("\n--- TRUTH PROJECTION FOR ADMIN ---");
    const adminTruth = await CampaignControlCenterService.getCampaignTruth(7105, { userId: 1, role: 'admin', isAdmin: true }, pool);
    console.log("Admin Operational State:", adminTruth.derived_operational_state);
    console.log("Admin Meta External State:", adminTruth.meta_external_state);
    console.log("Admin Drift:", { has_drift: adminTruth.meta_external_state.has_drift, drift_details: adminTruth.meta_external_state.drift_details });

    console.log("\n--- TRUTH PROJECTION FOR HOST ---");
    const hostTruth = await CampaignControlCenterService.getCampaignTruth(7105, { userId: campaign.host_id, role: 'host' }, pool);
    console.log("Host Operational Status:", hostTruth.operational_status);
    console.log("Host Operational Status Info:", hostTruth.operational_status_info);
    console.log("Host Friendly Delivery State:", hostTruth.friendly_delivery_state);
    console.log("Host Escrow Display:", hostTruth.financial_safety.escrow_state_display);
    console.log("Host Timeline:", hostTruth.timeline);

  } catch (err) {
    console.error("Forensic deep dive error:", err);
  } finally {
    await pool.end();
  }
}

main();

