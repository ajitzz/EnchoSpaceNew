const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// The app's existing UI and logic expects 'active' as the final successful state, not CAMPAIGN_LIVE.
// We will change CAMPAIGN_LIVE to 'active' in our state machine.
code = code.replace(/CAMPAIGN_LIVE/g, 'active');

// We also need to remove 'status = 'active',' from dispatchMetaCampaign because the state machine handles the final status update.
// Actually, it's safer to leave dispatchMetaCampaign to also set it to 'active' to ensure the exact same payload is used.
// Or we can just let dispatchMetaCampaign return true and the state machine will set it to 'active'.
// But dispatchMetaCampaign does the update. So the state machine's update to 'active' is redundant but fine.

fs.writeFileSync('server.ts', code);
console.log("Updated state machine to use 'active' instead of 'CAMPAIGN_LIVE'.");
