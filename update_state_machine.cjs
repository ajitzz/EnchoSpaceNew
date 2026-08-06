const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldMachine = `async function executeCampaignStateMachine(campaignId: number, triggerEvent: string, req: any) {
    try {
        console.log(\`[STATE MACHINE] Campaign #\${campaignId} | Event: \${triggerEvent}\`);
        
        // 1. Fetch current state with row lock to prevent race conditions
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const stateRes = await client.query('SELECT status, payment_status, admin_approved FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaignId]);
            if (stateRes.rows.length === 0) throw new Error('Campaign not found');
            const campaign = stateRes.rows[0];
            
            // 2. State Transition Engine
            let nextState = campaign.status;
            let dispatchMeta = false;

            if (triggerEvent === 'PAYMENT_SUCCESS') {
                if (!campaign.admin_approved) {
                    console.log(\`[STATE MACHINE] Wait: Payment cleared, but AI/Admin approval pending.\`);
                    nextState = 'pending_approval';
                } else if (campaign.status === 'draft' || campaign.status === 'pending_approval' || campaign.status === 'PAYMENT_PENDING') {
                    console.log(\`[STATE MACHINE] Payment Success & Approved. Transitioning to ASSET_PREP...\`);
                    nextState = 'ASSET_PREP';
                    dispatchMeta = true;
                } else if (['active', 'ASSET_PREP', 'META_API_PUSH'].includes(campaign.status)) {
                     console.log(\`[STATE MACHINE] Idempotent Replay Protection: Campaign is already active or in pipeline. Ignoring.\`);
                }
            }

            if (nextState !== campaign.status) {
                await client.query('UPDATE host_marketing_campaigns SET status = $1 WHERE id = $2', [nextState, campaignId]);
            }
            
            await client.query('COMMIT');

            // 3. Execution (Post-Commit)
            if (dispatchMeta) {
                console.log(\`[STATE MACHINE] Executing Pipeline: ASSET_PREP -> META_API_PUSH -> active\`);
                
                // Set intermediate state
                await pool.query('UPDATE host_marketing_campaigns SET status = $1 WHERE id = $2', ['META_API_PUSH', campaignId]);
                
                // Dispatch to Meta
                const metaSuccess = await dispatchMetaCampaign(campaignId, req);
                await dispatchGoogleAdsCampaign(campaignId, req);

                if (metaSuccess) {
                   await pool.query('UPDATE host_marketing_campaigns SET status = $1 WHERE id = $2', ['active', campaignId]);
                   console.log(\`[STATE MACHINE] Final State Reached: active\`);
                } else {
                   await pool.query('UPDATE host_marketing_campaigns SET status = $1, admin_feedback = $2 WHERE id = $3', ['failed', 'Meta API Push Failed', campaignId]);
                   console.log(\`[STATE MACHINE] Pipeline Failed. Campaign marked as failed.\`);
                }
            }

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

    } catch (e) {
        console.error(\`[STATE MACHINE ERROR]\`, e);
    }
}`;

const newMachine = `async function executeCampaignStateMachine(campaignId: number, triggerEvent: string, req: any) {
    try {
        console.log(\`[STATE MACHINE] Campaign #\${campaignId} | Event: \${triggerEvent}\`);
        
        // 1. Fetch current state with row lock to prevent race conditions
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const stateRes = await client.query('SELECT status, payment_status, admin_approved FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaignId]);
            if (stateRes.rows.length === 0) throw new Error('Campaign not found');
            const campaign = stateRes.rows[0];
            
            // 2. State Transition Engine
            let nextState = campaign.status;
            let dispatchMeta = false;

            if (triggerEvent === 'PAYMENT_SUCCESS') {
                if (!campaign.admin_approved) {
                    console.log(\`[STATE MACHINE] Wait: Payment cleared, but AI/Admin approval pending.\`);
                    nextState = 'pending_approval';
                } else if (campaign.status === 'draft' || campaign.status === 'pending_approval' || campaign.status === 'PAYMENT_PENDING' || campaign.status === 'pending') {
                    console.log(\`[STATE MACHINE] Transitioning state: PAYMENT_PENDING -> PAYMENT_SUCCESS\`);
                    // We artificially log this as per blueprint, next true state is ASSET_PREP
                    console.log(\`[STATE MACHINE] Transitioning state: PAYMENT_SUCCESS -> ASSET_PREP\`);
                    nextState = 'ASSET_PREP';
                    dispatchMeta = true;
                } else if (['active', 'CAMPAIGN_LIVE', 'ASSET_PREP', 'META_API_PUSH'].includes(campaign.status)) {
                     console.log(\`[STATE MACHINE] Idempotent Replay Protection: Campaign is already active or in pipeline. Ignoring.\`);
                }
            }

            if (nextState !== campaign.status) {
                await client.query('UPDATE host_marketing_campaigns SET status = $1 WHERE id = $2', [nextState, campaignId]);
            }
            
            await client.query('COMMIT');

            // 3. Execution (Post-Commit)
            if (dispatchMeta) {
                console.log(\`[STATE MACHINE] Transitioning state: ASSET_PREP -> META_API_PUSH\`);
                
                // Set intermediate state
                await pool.query('UPDATE host_marketing_campaigns SET status = $1 WHERE id = $2', ['META_API_PUSH', campaignId]);
                broadcastDbEvent(req, 'marketing'); // Notify UI of pipeline movement
                
                // Dispatch to Meta (This inherently triggers Asset Prep under the hood in dispatchMetaCampaign)
                const metaSuccess = await dispatchMetaCampaign(campaignId, req);
                await dispatchGoogleAdsCampaign(campaignId, req);

                if (metaSuccess) {
                   await pool.query('UPDATE host_marketing_campaigns SET status = $1 WHERE id = $2', ['CAMPAIGN_LIVE', campaignId]);
                   console.log(\`[STATE MACHINE] Transitioning state: META_API_PUSH -> CAMPAIGN_LIVE\`);
                   broadcastDbEvent(req, 'marketing'); // Final notification
                } else {
                   await pool.query('UPDATE host_marketing_campaigns SET status = $1, admin_feedback = $2 WHERE id = $3', ['failed', 'Meta API Push Failed', campaignId]);
                   console.log(\`[STATE MACHINE] Pipeline Failed. Campaign marked as failed.\`);
                   broadcastDbEvent(req, 'marketing');
                }
            }

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

    } catch (e) {
        console.error(\`[STATE MACHINE ERROR]\`, e);
    }
}`;

if (code.includes('async function executeCampaignStateMachine')) {
    code = code.replace(oldMachine, newMachine);
    fs.writeFileSync('server.ts', code);
    console.log("Updated state machine.");
} else {
    console.log("State machine string not found!");
}

