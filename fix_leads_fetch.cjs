const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetDbLeads = `    // Fetch persistent database leads from host_outreach_leads
    try {
      const dbLeadsRes = await pool.query(\`
        SELECT * FROM host_outreach_leads 
        WHERE campaign_id = $1 OR host_id = $2
        ORDER BY created_at DESC LIMIT 20
      \`, [id, req.user?.id]);`;

const newDbLeads = `    // Fetch persistent database leads from lead_inquiries
    try {
      const dbLeadsRes = await pool.query(\`
        SELECT * FROM lead_inquiries 
        WHERE campaign_id = $1 OR host_id = $2
        ORDER BY created_at DESC LIMIT 50
      \`, [id, req.user?.id]);
      
      for (const row of dbLeadsRes.rows) {
        leads.push({
          id: \`db_inquiry_\${row.id}\`,
          name: row.lead_name || 'Simulated Hot Lead',
          city: 'Metropolitan Metro Area', // Map this if available
          phone: '[REDACTED_BY_ENCHO_WALLED_GARDEN]',
          email: '[REDACTED_BY_ENCHO_WALLED_GARDEN]',
          intent_score: row.lead_intent_score || '🔥 HOT LEAD',
          source: row.lead_source || 'Meta / Google Ad Network',
          status: 'New Lead',
          last_active: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          touchpoints: [
            'Clicked Meta/Google Ad',
            \`Delivered to Walled Garden CRM for \${campaign.listing_title}\`
          ],
          attribution_trail: [
            'Clicked Ad',
            'Data Masked via Walled Garden Engine'
          ],
          message_history: [
            { timestamp: new Date(row.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), sender: 'Guest', text: row.masked_contact_info || row.raw_inquiry }
          ]
        });
      }
    } catch (dbErr) {
      console.warn('Failed to fetch persistent lead_inquiries:', dbErr);
    }
    
    // Fetch persistent database leads from host_outreach_leads
    try {
      const outreachLeadsRes = await pool.query(\`
        SELECT * FROM host_outreach_leads 
        WHERE campaign_id = $1 OR host_id = $2
        ORDER BY created_at DESC LIMIT 20
      \`, [id, req.user?.id]);`;

code = code.replace(targetDbLeads, newDbLeads);

// Also we need to fix `outreachLeadsRes` looping since I changed the variable name
const targetRowLoop = `      for (const row of dbLeadsRes.rows) {
        let msgHist = [];`;

const newRowLoop = `      for (const row of outreachLeadsRes.rows) {
        let msgHist = [];`;

code = code.replace(targetRowLoop, newRowLoop);

fs.writeFileSync('server.ts', code);
console.log('Fixed leads fetch');
