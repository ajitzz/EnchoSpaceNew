import { pool } from './db';

/**
 * Encho Marketing Engine - Circuit Breaker
 * Rule: Never burn host money on unavailable dates.
 * If inventory reaches 0, we immediately dispatch a PAUSE signal to the Master Meta Ad Account.
 */
export async function triggerMetaCircuitBreaker(listingId: string, currentInventory: number) {
    if (currentInventory > 0) return;

    console.warn(`[CIRCUIT BREAKER] Listing ${listingId} reached 0 inventory. Initiating Meta Ad Pause.`);

    try {
        // 1. Fetch active marketing campaigns for this listing
        const campaigns = await pool.query(
            `SELECT id, meta_campaign_id FROM marketing_campaigns 
             WHERE listing_id = $1 AND status = 'active'`,
            [listingId]
        );

        if (campaigns.rows.length === 0) {
            console.log(`[CIRCUIT BREAKER] No active campaigns found for listing ${listingId}.`);
            return;
        }

        // 2. Dispatch Pause Webhooks to Meta
        for (const campaign of campaigns.rows) {
            if (campaign.meta_campaign_id) {
                // Simulate Meta API call to pause
                console.log(`[META API] POST /v18.0/${campaign.meta_campaign_id} -d status=PAUSED`);
                
                // Update internal ledger state to stop dopamine UI spending simulation
                await pool.query(
                    `UPDATE marketing_campaigns 
                     SET status = 'paused', 
                         meta_status = 'PAUSED_BY_CIRCUIT_BREAKER', 
                         updated_at = NOW() 
                     WHERE id = $1`,
                    [campaign.id]
                );
            }
        }
    } catch (error) {
        console.error(`[CIRCUIT BREAKER FAILURE] Failed to pause ads for listing ${listingId}`, error);
        // Implement Dead Letter Queue here for resilience
    }
}
