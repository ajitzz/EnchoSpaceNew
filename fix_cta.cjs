const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  "call_to_action: { type: 'BOOK_TRAVEL', value: { lead_gen_form_id: activeLeadFormId, link: destinationUrl } }",
  "call_to_action: { type: 'BOOK_TRAVEL', value: { link: destinationUrl } }"
);
fs.writeFileSync('server.ts', content);
console.log('Removed lead_gen_form_id');
