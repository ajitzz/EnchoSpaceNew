const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `          if (isUpdated) {
             await pool.query('UPDATE listings SET rooms = $1::jsonb WHERE id = $2', [JSON.stringify(rooms), listingId]);
          }
      }
    } catch(e) { console.error(e); }`;

const replacement = `          if (isUpdated) {
             await pool.query('UPDATE listings SET rooms = $1::jsonb WHERE id = $2', [JSON.stringify(rooms), listingId]);
          }

          // Gap 3: "Smart Auto-Pause" Circuit Breaker & Gap 9: "Trapped Cash" Wallet Ledger
          // If property gets a booking, automatically pause active ad campaigns for this listing.
          if (hostId) {
            const activeCampaigns = await pool.query(
              "SELECT id, budget, spent FROM host_marketing_campaigns WHERE listing_id = $1 AND status = 'active'", 
              [listingId]
            );
            
            for (const campaign of activeCampaigns.rows) {
              const remainingBudget = Math.max(0, parseFloat(campaign.budget || 0) - parseFloat(campaign.spent || 0));
              
              await pool.query(
                "UPDATE host_marketing_campaigns SET status = 'paused', admin_feedback = 'Auto-paused to prevent burning money on newly booked dates.' WHERE id = $1", 
                [campaign.id]
              );
              
              console.log(\`[SMART AUTO-PAUSE] Circuit breaker triggered. Meta Ad for Campaign #\${campaign.id} paused due to overlapping booking.\`);
              
              if (remainingBudget > 0) {
                // Trap the cash in Encho internal wallet
                await pool.query(
                  "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2", 
                  [remainingBudget, hostId]
                );
                
                await pool.query(
                  "INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES ($1, $2, $3, $4)",
                  [hostId, remainingBudget, 'refund', \`Trapped Cash Refund: Unused budget from Auto-paused Campaign #\${campaign.id}\`]
                );
                
                console.log(\`[TRAPPED CASH LEDGER] Credited \${remainingBudget} back to Host #\${hostId} Encho Wallet.\`);
              }
            }
          }
      }
    } catch(e) { console.error(e); }`;

code = code.replace(target, replacement);

fs.writeFileSync('server.ts', code);
console.log('Circuit breaker added');
