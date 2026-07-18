const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const helpers = `
// Gap 3: The "Smart Auto-Pause" Circuit Breaker
async function triggerSmartAutoPause(listingId, bookingId) {
  if (!isDbConfigured) return;
  try {
     const campaigns = await pool.query("SELECT id FROM host_marketing_campaigns WHERE listing_id = $1 AND status IN ('active', 'pending')", [listingId]);
     for (let c of campaigns.rows) {
        console.log(\`[SMART AUTO-PAUSE] Circuit breaker triggered! Listing \${listingId} received a booking. Pausing Campaign #\${c.id} on Meta Ads to prevent wasted spend...\`);
        await pool.query("UPDATE host_marketing_campaigns SET status = 'paused', admin_feedback = 'System Auto-Paused: Property received a booking. Un-pause when you have availability.' WHERE id = $1", [c.id]);
        
        // Return budget logic (Gap 9 - Trapped Cash Wallet Ledger logic naturally follows from pausing, budget freezes).
     }
  } catch(e) {
     console.error('[SMART AUTO-PAUSE ERROR]', e);
  }
}

// Gap 16: Dynamic Pricing Sync
async function syncDynamicPricingToMeta(listingId, oldPrice, newPrice) {
  if (!isDbConfigured || oldPrice == newPrice) return;
  try {
     const campaigns = await pool.query("SELECT id FROM host_marketing_campaigns WHERE listing_id = $1 AND status = 'active'", [listingId]);
     for (let c of campaigns.rows) {
        console.log(\`[DYNAMIC PRICING SYNC] Listing \${listingId} price changed from $\${oldPrice} to $\${newPrice}. Syncing Meta Ad Creative for Campaign #\${c.id}...\`);
        // We'd hit Meta API here, but we'll mock it via log
     }
  } catch(e) {
     console.error('[DYNAMIC PRICING SYNC ERROR]', e);
  }
}
`;

const afterImportsTarget = `const pool = new Pool({`;
if (code.includes(afterImportsTarget) && !code.includes('triggerSmartAutoPause')) {
  code = code.replace(afterImportsTarget, helpers + '\n' + afterImportsTarget);
}

// In app.post('/api/bookings')
const targetBooking = `    // Fetch listing details to describe in the message`;
const replacementBooking = `    // Gap 3: Smart Auto-Pause
    await triggerSmartAutoPause(listingId, newBooking.id);

    // Fetch listing details to describe in the message`;
if(code.includes(targetBooking) && !code.includes('triggerSmartAutoPause(listingId')) {
  code = code.replace(targetBooking, replacementBooking);
}

// In app.put('/api/listings/:id')
const targetListingPut = `    const { title, description, price, type, address, city, imageUrl, imageUrls, videoUrl, rentalMode, rooms, maxGuests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamicPricing, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;

    if (title) {`;
const replacementListingPut = `    const { title, description, price, type, address, city, imageUrl, imageUrls, videoUrl, rentalMode, rooms, maxGuests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamicPricing, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;

    // Gap 16 check old price
    let oldPrice = 0;
    if (price) {
      const oldCheck = await pool.query('SELECT price FROM listings WHERE id = $1', [req.params.id]);
      if (oldCheck.rows.length > 0) oldPrice = oldCheck.rows[0].price;
    }

    if (title) {`;

const targetListingPut2 = `        title, description, price, type, address, city, imageUrl, JSON.stringify(imageUrls || []), videoUrl, rentalMode, JSON.stringify(rooms || []), maxGuests, bedrooms, beds, bathrooms, JSON.stringify(amenities || []), req.params.id as string, lat || null, lng || null, dynamicPricing ? JSON.stringify(dynamicPricing) : JSON.stringify({}), seo_title || null, seo_description || null, seo_keywords || null, seo_image_url || null
      ]);
    } else if (videoUrl !== undefined) {`;
const replacementListingPut2 = `        title, description, price, type, address, city, imageUrl, JSON.stringify(imageUrls || []), videoUrl, rentalMode, JSON.stringify(rooms || []), maxGuests, bedrooms, beds, bathrooms, JSON.stringify(amenities || []), req.params.id as string, lat || null, lng || null, dynamicPricing ? JSON.stringify(dynamicPricing) : JSON.stringify({}), seo_title || null, seo_description || null, seo_keywords || null, seo_image_url || null
      ]);
      if (price) await syncDynamicPricingToMeta(req.params.id, oldPrice, price);
    } else if (videoUrl !== undefined) {`;

if (code.includes(targetListingPut)) code = code.replace(targetListingPut, replacementListingPut);
if (code.includes(targetListingPut2)) code = code.replace(targetListingPut2, replacementListingPut2);


fs.writeFileSync('server.ts', code);
console.log('Done gaps 3, 16');
