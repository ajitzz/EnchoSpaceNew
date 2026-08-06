const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetLine = "broadcastDbEvent(req, 'marketing');";
const replaceBlock = `
        broadcastDbEvent(req, 'marketing');

        // Trigger State Machine synchronously for internal wallet payments
        if (campaign_id) {
            console.log(\`[INTERNAL WALLET] Funding successful! Initializing Campaign State Machine for Campaign #\${campaign_id}...\`);
            executeCampaignStateMachine(campaign_id, 'PAYMENT_SUCCESS', req).catch(err => {
                console.error(\`[STATE MACHINE ERROR] Async internal wallet launch failed:\`, err);
            });
        }
`;

if (code.includes(targetLine)) {
    // Only replace the one in the internal_wallet block...
    // Let's make it more specific
    const searchString = `        await logAdminAudit(hostId, 'campaign_payment', campaign_id || 0, 'internal_wallet_payment', {}, { grossAmount, optFee, netAdSpend, gateway: 'internal_wallet' });
        broadcastDbEvent(req, 'marketing');

        return res.json({
          success: true,`;
          
    const replacement = `        await logAdminAudit(hostId, 'campaign_payment', campaign_id || 0, 'internal_wallet_payment', {}, { grossAmount, optFee, netAdSpend, gateway: 'internal_wallet' });
        broadcastDbEvent(req, 'marketing');

        // Trigger State Machine synchronously for internal wallet payments
        if (campaign_id) {
            console.log(\`[INTERNAL WALLET] Funding successful! Initializing Campaign State Machine for Campaign #\${campaign_id}...\`);
            // We don't await this so we can return the response instantly, but the engine runs!
            executeCampaignStateMachine(campaign_id, 'PAYMENT_SUCCESS', req).catch(err => {
                console.error(\`[STATE MACHINE ERROR] Async internal wallet launch failed:\`, err);
            });
        }

        return res.json({
          success: true,`;
          
    if (code.includes(searchString)) {
       code = code.replace(searchString, replacement);
       fs.writeFileSync('server.ts', code);
       console.log("Internal wallet state machine integration fixed!");
    } else {
       console.log("Could not find precise search string for internal wallet");
    }
}
