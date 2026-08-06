const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetMsg = `    // Simulate verified WhatsApp Business API and SMS gateway dispatches
    console.log(\`[COMMUNICATION BRIDGE] Dispatched ad-lead direct touch message to \${leadId}\`);
    console.log(\`[COMMUNICATION BRIDGE] Content: "\${message_text}" via Template: \${template_name || 'custom'}\`);`;

const newMsg = `    // Walled Garden CRM: Append host replies to the lead inquiry history
    if (leadId && leadId.startsWith('db_inquiry_')) {
      const realId = leadId.replace('db_inquiry_', '');
      await pool.query(
        \`UPDATE lead_inquiries 
         SET raw_inquiry = raw_inquiry || chr(10) || 'Host Reply: ' || $1,
             masked_contact_info = masked_contact_info || chr(10) || 'Host Reply: ' || $1,
             is_read = true 
         WHERE id = $2 AND host_id = $3\`,
        [message_text, realId, req.user?.id]
      );
    } else if (leadId && leadId.startsWith('db_lead_')) {
       const realId = leadId.replace('db_lead_', '');
       const dbLeadRes = await pool.query('SELECT message_history FROM host_outreach_leads WHERE id = $1 AND host_id = $2', [realId, req.user?.id]);
       if (dbLeadRes.rows.length > 0) {
           let msgHist = [];
           try {
               msgHist = typeof dbLeadRes.rows[0].message_history === 'string' 
                   ? JSON.parse(dbLeadRes.rows[0].message_history) 
                   : (dbLeadRes.rows[0].message_history || []);
           } catch (e) { msgHist = []; }
           
           msgHist.push({ timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), sender: 'Host', text: message_text });
           await pool.query('UPDATE host_outreach_leads SET message_history = $1 WHERE id = $2 AND host_id = $3', [JSON.stringify(msgHist), realId, req.user?.id]);
       }
    }

    // Simulate verified WhatsApp Business API and SMS gateway dispatches
    console.log(\`[COMMUNICATION BRIDGE] Dispatched ad-lead direct touch message to \${leadId}\`);
    console.log(\`[COMMUNICATION BRIDGE] Content: "\${message_text}" via Template: \${template_name || 'custom'}\`);`;

code = code.replace(targetMsg, newMsg);
fs.writeFileSync('server.ts', code);
console.log('Fixed Lead Messages sync');
