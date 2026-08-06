const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetStripeWebhook = `          const campaignId = sessionOrIntent.metadata?.campaign_id;
          const txId = sessionOrIntent.metadata?.transaction_id;`;

const newStripeWebhook = `          const campaignId = sessionOrIntent.metadata?.campaign_id;
          const txId = sessionOrIntent.metadata?.transaction_id;
          const bookingId = sessionOrIntent.metadata?.booking_id;`;

const targetStripeWebhook2 = `              if (campaign.admin_approved) {
                console.log(\`[STRIPE WEBHOOK] Campaign #\${campaignId} already approved by Admin! Initializing State Machine Pipeline...\`);
                await executeCampaignStateMachine(campaignId, 'PAYMENT_SUCCESS', req);
              } else {
                console.log(\`[STRIPE WEBHOOK] Campaign #\${campaignId} is awaiting Admin Quality Control review.\`);
                broadcastDbEvent(req, 'marketing');
              }
            }
          }`;

const newStripeWebhook2 = `              if (campaign.admin_approved) {
                console.log(\`[STRIPE WEBHOOK] Campaign #\${campaignId} already approved by Admin! Initializing State Machine Pipeline...\`);
                await executeCampaignStateMachine(campaignId, 'PAYMENT_SUCCESS', req);
              } else {
                console.log(\`[STRIPE WEBHOOK] Campaign #\${campaignId} is awaiting Admin Quality Control review.\`);
                broadcastDbEvent(req, 'marketing');
              }
            }
          } else if (bookingId) {
            console.log(\`[STRIPE WEBHOOK SUCCESS] Received real checkout success for Booking #\${bookingId}.\`);
            const bookRes = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
            if (bookRes.rows.length > 0) {
              await pool.query(\`
                UPDATE bookings
                SET status = 'confirmed',
                    payment_intent_id = $1
                WHERE id = $2
              \`, [sessionOrIntent.id, bookingId]);
              
              // Milestone 5: The Circuit Breaker (Smart Pause)
              // If property gets a booking, automatically pause active ad campaigns for this listing.
              triggerSmartAutoPause(bookRes.rows[0].listing_id, bookingId).catch(err => {
                 console.error('[CIRCUIT Breaker ERROR] Failed to pause campaigns from Stripe Webhook:', err);
              });
            }
          }`;

code = code.replace(targetStripeWebhook, newStripeWebhook);
code = code.replace(targetStripeWebhook2, newStripeWebhook2);
fs.writeFileSync('server.ts', code);
console.log('Fixed Stripe');
