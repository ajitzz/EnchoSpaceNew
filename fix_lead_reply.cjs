const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetLeadReply = `    // Walled Garden CRM: Append host replies to the lead inquiry history
    if (leadId && leadId.startsWith('db_inquiry_')) {
      const realId = leadId.replace('db_inquiry_', '');
      await pool.query(
        \`UPDATE lead_inquiries 
         SET raw_inquiry = raw_inquiry || chr(10) || 'Host Reply: ' || $1,
             masked_contact_info = masked_contact_info || chr(10) || 'Host Reply: ' || $1,
             is_read = true 
         WHERE id = $2 AND host_id = $3\`,
        [message_text, realId, req.user?.id]
      );`;

const newLeadReply = `    // Walled Garden CRM: Append host replies to the lead inquiry history
    const { sanitized: masked_message_text } = maskContactInfo(message_text);

    if (leadId && leadId.startsWith('db_inquiry_')) {
      const realId = leadId.replace('db_inquiry_', '');
      await pool.query(
        \`UPDATE lead_inquiries 
         SET raw_inquiry = raw_inquiry || chr(10) || 'Host Reply: ' || $1,
             masked_contact_info = masked_contact_info || chr(10) || 'Host Reply: ' || $2,
             is_read = true 
         WHERE id = $3 AND host_id = $4\`,
        [message_text, masked_message_text, realId, req.user?.id]
      );`;

code = code.replace(targetLeadReply, newLeadReply);

const targetLeadReply2 = `msgHist.push({ timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), sender: 'Host', text: message_text });`;
const newLeadReply2 = `msgHist.push({ timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), sender: 'Host', text: masked_message_text });`;
code = code.replace(targetLeadReply2, newLeadReply2);

fs.writeFileSync('server.ts', code);
console.log('Fixed Lead Reply Masking');
