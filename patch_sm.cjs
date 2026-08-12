const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /async function executeCampaignStateMachine\([\s\S]*?\/\/ ==========================================\n\/\/ Milestone 4: The Meta Gatekeeper \(AI AI\)/;

const newSM = `
// Milestone 3: The Campaign State Machine (Idempotent Launcher)
async function executeCampaignStateMachine(campaignId: number, triggerEvent: string, req: any) {
    try {
        console.log(\`[STATE MACHINE] Campaign #\${campaignId} | Event: \${triggerEvent}\`);
        
        // 1. Fetch current state with row lock to prevent race conditions
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const stateRes = await client.query('SELECT status, payment_status, admin_approved, host_id, budget, escrow_status FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaignId]);
            if (stateRes.rows.length === 0) throw new Error('Campaign not found');
            const campaign = stateRes.rows[0];
            
            // 2. State Transition Engine
            let nextState = campaign.status;
            let dispatchMeta = false;

            if (triggerEvent === 'PAYMENT_SUCCESS') {
                if (!campaign.admin_approved) {
                    console.log(\`[STATE MACHINE] Wait: Payment cleared, but AI/Admin approval pending.\`);
                    nextState = 'pending_approval';
                } else if (campaign.status === 'draft' || campaign.status === 'pending_approval' || campaign.status === 'PAYMENT_PENDING' || campaign.status === 'pending' || campaign.status === 'escrow') {
                    // Milestone 7: Master Account Fraud Liability & Escrow Delay
                    const userCheck = await client.query('SELECT is_verified FROM users WHERE id = $1', [campaign.host_id]);
                    const isVerifiedUser = userCheck.rows[0]?.is_verified;
                    const amount = Number(campaign.budget);
                    
                    const isHighRisk = !isVerifiedUser || amount > 5000;
                    
                    if (isHighRisk && campaign.escrow_status !== 'released') {
                        console.log(\`[ESCROW] 3D Secure Verification triggered. Placing Campaign into 24-hour Escrow.\`);
                        nextState = 'escrow';
                        
                        await client.query(\`
                            UPDATE host_marketing_campaigns 
                             SET escrow_status = 'holding',
                                 escrow_release_at = NOW() + INTERVAL '24 hours' 
                             WHERE id = $1
                        \`, [campaignId]);
                    } else {
                        console.log(\`[STATE MACHINE] Transitioning state: PAYMENT_SUCCESS -> ASSET_PREP\`);
                        nextState = 'ASSET_PREP';
                        dispatchMeta = true;
                    }
                } else if (['active', 'CAMPAIGN_LIVE', 'ASSET_PREP', 'META_API_PUSH'].includes(campaign.status)) { 
                    console.log(\`[STATE MACHINE] Idempotent Replay Protection: Campaign is already active or in pipeline. Ignoring.\`);
                }
            }

            if (nextState !== campaign.status) {
                await transitionCampaignState({
                    client,
                    campaignId,
                    from: campaign.status,
                    to: nextState,
                    reason: \`Triggered by \${triggerEvent}\`
                });
            }
            
            await client.query('COMMIT');

            // 3. Execution (Post-Commit)
            if (dispatchMeta) {
                console.log(\`[STATE MACHINE] Dispatching to Meta/Google\`);
                broadcastDbEvent(req, 'marketing'); // Notify UI of pipeline movement
                
                // Dispatch to Meta (handles its own internal state machine)
                await dispatchMetaCampaign(campaignId, req);
                await dispatchGoogleAdsCampaign(campaignId, req);
            }
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error(\`[STATE MACHINE FAULT] Campaign \${campaignId} | Event \${triggerEvent}: \`, err);
    }
}

// ==========================================
// Milestone 4: The Meta Gatekeeper (AI AI)
`;

code = code.replace(regex, newSM);
fs.writeFileSync('server.ts', code);
console.log('executeCampaignStateMachine patched.');
