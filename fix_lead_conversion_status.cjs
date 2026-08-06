const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetLeadConversion = `    // Increment campaign conversions count
    await pool.query(\`
      UPDATE host_marketing_campaigns
      SET accumulated_conversions = COALESCE(accumulated_conversions, 0) + 1
      WHERE id = $1
    \`, [campaignId]);`;

const newLeadConversion = `    // Increment campaign conversions count
    await pool.query(\`
      UPDATE host_marketing_campaigns
      SET accumulated_conversions = COALESCE(accumulated_conversions, 0) + 1
      WHERE id = $1
    \`, [campaignId]);

    // Update lead inquiry to CONVERTED
    if (leadId && leadId.startsWith('db_inquiry_')) {
      const realId = leadId.replace('db_inquiry_', '');
      await pool.query(
        "UPDATE lead_inquiries SET lead_intent_score = '🏆 CONVERTED' WHERE id = $1 AND host_id = $2",
        [realId, req.user?.id]
      );
    } else if (leadId && leadId.startsWith('db_lead_')) {
      const realId = leadId.replace('db_lead_', '');
      await pool.query(
        "UPDATE host_outreach_leads SET status = 'Booked' WHERE id = $1 AND host_id = $2",
        [realId, req.user?.id]
      );
    }`;

code = code.replace(targetLeadConversion, newLeadConversion);
fs.writeFileSync('server.ts', code);
console.log('Fixed Lead Conversion status update');
