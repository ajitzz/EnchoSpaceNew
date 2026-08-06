const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetCalendar = `    // Process each date
    for (const date_string of dates) {
      await pool.query(\`
        INSERT INTO calendar_prices (listing_id, date_string, price, offer_id, status)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (listing_id, date_string)
        DO UPDATE SET price = $3, offer_id = $4, status = $5
      \`, [listingId, date_string, price, offer_id || null, status || 'available']);
    }
    res.json({ message: 'Updated successfully' });`;

const newCalendar = `    // Process each date
    for (const date_string of dates) {
      await pool.query(\`
        INSERT INTO calendar_prices (listing_id, date_string, price, offer_id, status)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (listing_id, date_string)
        DO UPDATE SET price = $3, offer_id = $4, status = $5
      \`, [listingId, date_string, price, offer_id || null, status || 'available']);
    }
    
    // Milestone 5: The Circuit Breaker (Smart Pause) for manual calendar blocks
    if (status === 'blocked' || status === 'booked') {
        triggerSmartAutoPause(listingId, \`MANUAL_BLOCK_\${Date.now()}\`).catch(err => {
            console.error('[CIRCUIT BREAKER ERROR] Failed to pause campaigns from manual block:', err);
        });
    }
    
    res.json({ message: 'Updated successfully' });`;

code = code.replace(targetCalendar, newCalendar);
fs.writeFileSync('server.ts', code);
console.log('Fixed Calendar Circuit Breaker');
