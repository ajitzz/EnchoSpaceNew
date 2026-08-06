const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetStatusLogic1 = `        leads.push({
          id: \`db_inquiry_\${row.id}\`,
          name: row.lead_name || 'Simulated Hot Lead',
          city: 'Metropolitan Metro Area', // Map this if available
          phone: '[REDACTED_BY_ENCHO_WALLED_GARDEN]',
          email: '[REDACTED_BY_ENCHO_WALLED_GARDEN]',
          intent_score: row.lead_intent_score || '🔥 HOT LEAD',
          source: row.lead_source || 'Meta / Google Ad Network',
          status: 'New Lead',`;

const newStatusLogic1 = `        leads.push({
          id: \`db_inquiry_\${row.id}\`,
          name: row.lead_name || 'Simulated Hot Lead',
          city: 'Metropolitan Metro Area', // Map this if available
          phone: '[REDACTED_BY_ENCHO_WALLED_GARDEN]',
          email: '[REDACTED_BY_ENCHO_WALLED_GARDEN]',
          intent_score: row.lead_intent_score || '🔥 HOT LEAD',
          source: row.lead_source || 'Meta / Google Ad Network',
          status: row.lead_intent_score === '🏆 CONVERTED' ? 'Booked' : 'New Lead',`;

const targetStatusLogic2 = `                leads.push({
          id: \`db_lead_\${row.id}\`,
          name: row.guest_name || row.owner_name || 'Simulated Hot Lead',
          city: row.location || 'Metropolitan Metro Area',`;

const newStatusLogic2 = `                leads.push({
          id: \`db_lead_\${row.id}\`,
          name: row.guest_name || row.owner_name || 'Simulated Hot Lead',
          city: row.location || 'Metropolitan Metro Area',
          status: row.status || 'New Lead',`;

code = code.replace(targetStatusLogic1, newStatusLogic1);
code = code.replace(targetStatusLogic2, newStatusLogic2);
fs.writeFileSync('server.ts', code);
console.log('Fixed Lead Fetching status');
