const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const cleanup = `    newBooking.id = String(newBooking.id);
    newBooking.listing_id = String(newBooking.listing_id);
    
    // Milestone 5: The Circuit Breaker (Smart Pause)
    // Kick off background job to pause campaigns.
    triggerSmartAutoPause(listingId, newBooking.id).catch(err => {
      console.error('[CIRCUIT BREAKER ERROR] Failed to pause campaigns:', err);
    });

    newBooking.id = String(newBooking.id);
    newBooking.listing_id = String(newBooking.listing_id);`;
    
const replacement = `    newBooking.id = String(newBooking.id);
    newBooking.listing_id = String(newBooking.listing_id);
    
    // Milestone 5: The Circuit Breaker (Smart Pause)
    // Kick off background job to pause campaigns.
    triggerSmartAutoPause(listingId, newBooking.id).catch(err => {
      console.error('[CIRCUIT BREAKER ERROR] Failed to pause campaigns:', err);
    });`;

if (code.includes(cleanup)) {
    code = code.replace(cleanup, replacement);
    fs.writeFileSync('server.ts', code);
    console.log("Cleanup done.");
}
