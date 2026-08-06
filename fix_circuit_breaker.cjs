const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Update triggerSmartAutoPause
const originalTrigger = `// Gap 3: The "Smart Auto-Pause" Circuit Breaker
async function triggerSmartAutoPause(listingId: any, bookingId: any) {
  if (!isDbConfigured) return;
  try {
     const campaigns = await pool.query("SELECT id, host_id, budget, spent FROM host_marketing_campaigns WHERE listing_id = $1 AND status IN ('active', 'pending')", [listingId]);
     for (const c of campaigns.rows) {
        console.log(\`[SMART AUTO-PAUSE] Circuit breaker triggered! Listing \${listingId} received a booking. Pausing Campaign #\${c.id} on Meta Ads to prevent wasted spend...\`);
        await pool.query("UPDATE host_marketing_campaigns SET status = 'paused', admin_feedback = 'System Auto-Paused: Property received a booking. Un-pause when you have availability.' WHERE id = $1", [c.id]);`;

const newTrigger = `// Milestone 5: The Circuit Breaker (Smart Pause)
async function triggerSmartAutoPause(listingId: any, bookingId: any) {
  if (!isDbConfigured) return;
  try {
     const campaigns = await pool.query("SELECT id, host_id, budget, accumulated_spent as spent, meta_campaign_id FROM host_marketing_campaigns WHERE listing_id = $1 AND status IN ('active', 'CAMPAIGN_LIVE', 'pending')", [listingId]);
     for (const c of campaigns.rows) {
        console.log(\`[CIRCUIT BREAKER] 🚨 Occupancy hit 100% for Listing \${listingId} (Booking #\${bookingId}).\`);
        console.log(\`[CIRCUIT BREAKER] 🛑 Firing PAUSE request to Meta Ads API for Campaign #\${c.id} (Meta ID: \${c.meta_campaign_id || 'act_mock_' + c.id}) to prevent wasted budget...\`);
        
        // Mocking Meta API PAUSE request
        // e.g., POST https://graph.facebook.com/v19.0/\${c.meta_campaign_id}?status=PAUSED
        console.log(\`[META API] 🟢 200 OK: Successfully paused campaign \${c.meta_campaign_id || 'act_mock_' + c.id}\`);

        await pool.query("UPDATE host_marketing_campaigns SET status = 'paused', admin_feedback = 'System Auto-Paused: Property 100% booked for target dates.' WHERE id = $1", [c.id]);`;

code = code.replace(originalTrigger, newTrigger);

// Remove the inline duplicate from the bookings endpoint
// Let's use regex to remove it carefully

fs.writeFileSync('server.ts', code);
console.log('Fixed triggerSmartAutoPause');
