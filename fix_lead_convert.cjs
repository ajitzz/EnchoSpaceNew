const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetLeadConvert = `    const newBooking = bookingResult.rows[0];

    // Increment campaign conversions count
    await pool.query(\`
      UPDATE host_marketing_campaigns
      SET accumulated_conversions = COALESCE(accumulated_conversions, 0) + 1
      WHERE id = $1
    \`, [campaignId]);`;

const newLeadConvert = `    const newBooking = bookingResult.rows[0];

    // Milestone 5: The Circuit Breaker (Smart Pause)
    triggerSmartAutoPause(campaign.listing_id, newBooking.id).catch(err => {
      console.error('[CIRCUIT BREAKER ERROR] Failed to pause campaigns from Lead Convert:', err);
    });

    // Increment campaign conversions count
    await pool.query(\`
      UPDATE host_marketing_campaigns
      SET accumulated_conversions = COALESCE(accumulated_conversions, 0) + 1
      WHERE id = $1
    \`, [campaignId]);`;

code = code.replace(targetLeadConvert, newLeadConvert);
fs.writeFileSync('server.ts', code);
console.log('Fixed Lead Convert');
