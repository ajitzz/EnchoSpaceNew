const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const anchor = "const newBooking = result.rows[0];";
const newLogic = `    const newBooking = result.rows[0];
    newBooking.id = String(newBooking.id);
    newBooking.listing_id = String(newBooking.listing_id);
    
    // Milestone 5: The Circuit Breaker (Smart Pause)
    // Kick off background job to pause campaigns.
    triggerSmartAutoPause(listingId, newBooking.id).catch(err => {
      console.error('[CIRCUIT BREAKER ERROR] Failed to pause campaigns:', err);
    });
`;

if (code.includes(anchor)) {
    code = code.replace(anchor, newLogic);
    fs.writeFileSync('server.ts', code);
    console.log("Circuit Breaker integrated into booking engine.");
} else {
    console.log("Could not find booking anchor.");
}
