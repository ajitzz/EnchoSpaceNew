const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetBookingConfirm = `      // Handle Listing Booking
      if (booking_id) {
        const bookRes = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [booking_id]);
        if (bookRes.rows.length > 0) {
          await client.query(\`
            UPDATE bookings
            SET status = 'confirmed',
                payment_intent_id = $1
            WHERE id = $2
          \`, [razorpay_payment_id, booking_id]);
        }
      }`;

const newBookingConfirm = `      // Handle Listing Booking
      if (booking_id) {
        const bookRes = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [booking_id]);
        if (bookRes.rows.length > 0) {
          await client.query(\`
            UPDATE bookings
            SET status = 'confirmed',
                payment_intent_id = $1
            WHERE id = $2
          \`, [razorpay_payment_id, booking_id]);
          
          // Milestone 5: The Circuit Breaker (Smart Pause)
          // If property gets a booking, automatically pause active ad campaigns for this listing.
          triggerSmartAutoPause(bookRes.rows[0].listing_id, booking_id).catch(err => {
             console.error('[CIRCUIT BREAKER ERROR] Failed to pause campaigns from Razorpay Webhook:', err);
          });
        }
      }`;

code = code.replace(targetBookingConfirm, newBookingConfirm);
fs.writeFileSync('server.ts', code);
console.log('Fixed Razorpay');
