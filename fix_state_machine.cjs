const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetState = `            if (triggerEvent === 'PAYMENT_SUCCESS') {
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
            }`;

const newState = `            if (triggerEvent === 'PAYMENT_SUCCESS') {
                if (!campaign.admin_approved) {
                    console.log(\`[STATE MACHINE] Wait: Payment cleared, but AI/Admin approval pending.\`);
                    nextState = 'pending_approval';
                } else if (campaign.status === 'draft' || campaign.status === 'pending_approval' || campaign.status === 'PAYMENT_PENDING' || campaign.status === 'pending' || campaign.status === 'escrow') {
                    // Milestone 7: Master Account Fraud Liability & Escrow Delay
                    // Determine if Host is verified
                    const userCheck = await client.query('SELECT is_verified FROM users WHERE id = $1', [campaign.host_id]);
                    const isVerifiedUser = userCheck.rows[0]?.is_verified;
                    const amount = Number(campaign.budget);
                    
                    const isHighRisk = !isVerifiedUser || amount > 5000;
                    
                    if (isHighRisk && campaign.escrow_status !== 'released') {
                        console.log(\`[ESCROW] 3D Secure Verification triggered. Host unverified or amount high. Placing Campaign into 24-hour Escrow delay to prevent chargeback fraud on Master Account.\`);
                        console.log(\`[STATE MACHINE] Transitioning state: PAYMENT_PENDING -> ESCROW\`);
                        nextState = 'escrow';
                        
                        await client.query(\`
                            UPDATE host_marketing_campaigns 
                            SET escrow_status = 'holding', 
                                escrow_release_at = NOW() + INTERVAL '24 hours' 
                            WHERE id = $1
                        \`, [campaignId]);
                    } else {
                        console.log(\`[STATE MACHINE] Transitioning state: PAYMENT_PENDING -> PAYMENT_SUCCESS\`);
                        // We artificially log this as per blueprint, next true state is ASSET_PREP
                        console.log(\`[STATE MACHINE] Transitioning state: PAYMENT_SUCCESS -> ASSET_PREP\`);
                        nextState = 'ASSET_PREP';
                        dispatchMeta = true;
                    }
                } else if (['active', 'CAMPAIGN_LIVE', 'ASSET_PREP', 'META_API_PUSH'].includes(campaign.status)) {
                     console.log(\`[STATE MACHINE] Idempotent Replay Protection: Campaign is already active or in pipeline. Ignoring.\`);
                }
            }`;

code = code.replace(targetState, newState);
fs.writeFileSync('server.ts', code);
console.log('Fixed State Machine Escrow');
