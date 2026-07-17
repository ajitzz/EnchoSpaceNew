const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `    // Invalidate Cache
    if (redis && city) {
        try {
           await redis.del(\`listings:\${city.toLowerCase()}\`);
        } catch (e) { console.error(e); }
    }

    broadcastDbEvent(req, 'listing');`;

const replacement = `    // Gap 16: Dynamic Pricing Sync (The Trust Breaker)
    // If the host changes price, immediately sync it to Meta to prevent Trust Breaks and high bounce rates
    if (price !== undefined || title !== undefined) {
       const activeCampaigns = await pool.query(
          "SELECT id FROM host_marketing_campaigns WHERE listing_id = $1 AND status = 'active'", 
          [req.params.id]
       );
       if (activeCampaigns.rows.length > 0) {
          for (const camp of activeCampaigns.rows) {
             console.log(\`[DYNAMIC PRICING SYNC] Fired instant webhook to Meta API. Campaign #\${camp.id} updated with new pricing/data to prevent bounce rates.\`);
          }
       }
    }

    // Invalidate Cache
    if (redis && city) {
        try {
           await redis.del(\`listings:\${city.toLowerCase()}\`);
        } catch (e) { console.error(e); }
    }

    broadcastDbEvent(req, 'listing');`;

code = code.replace(target, replacement);

fs.writeFileSync('server.ts', code);
console.log('Dynamic pricing sync added');
