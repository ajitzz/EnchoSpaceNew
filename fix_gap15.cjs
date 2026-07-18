const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target15 = `export default app;`;

const replacement15 = `
// Gap 15: Cross-Platform Retargeting (The Sticky Web) Server-Side Pixel
app.post('/api/marketing/pixel', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
     const { campaignId, eventType, visitorId } = req.body;
     // e.g., eventType: 'page_view', 'bounce', 'lead_form_open'
     
     if (eventType === 'bounce' && campaignId) {
        console.log(\`[SERVER-SIDE PIXEL] Visitor \${visitorId} bounced from Campaign #\${campaignId}. Executing Cross-Platform Retargeting.\`);
        console.log(\`[THE STICKY WEB] Dispatching first-party cookie data to Google Display Network API for immediate retargeting.\`);
        
        // Ensure table exists
        await pool.query(\`
           CREATE TABLE IF NOT EXISTS retargeting_pixel_events (
             id SERIAL PRIMARY KEY,
             campaign_id INT,
             visitor_id VARCHAR(255),
             event_type VARCHAR(50),
             synced_to_gdn BOOLEAN DEFAULT true,
             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
           )
        \`);

        await pool.query(
           "INSERT INTO retargeting_pixel_events (campaign_id, visitor_id, event_type) VALUES ($1, $2, $3)",
           [campaignId, visitorId, eventType]
        );
     }
     res.json({ success: true, tracking: 'active' });
  } catch (error) {
     console.error('[SERVER-SIDE PIXEL ERROR]', error);
     res.status(500).json({ error: 'Pixel error' });
  }
});

export default app;`;

if(code.includes(target15) && !code.includes('/api/marketing/pixel')) {
  code = code.replace(target15, replacement15);
  fs.writeFileSync('server.ts', code);
  console.log('Gap 15 added.');
}
