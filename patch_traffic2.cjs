const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const t3 = `call_to_action: { type: 'SIGN_UP', value: { lead_gen_form_id: activeLeadFormId } }`;
const r3 = `call_to_action: { type: 'LEARN_MORE', value: { link: destinationUrl } }`;

const t4 = `call_to_action: { type: 'SIGN_UP', value: { lead_gen_form_id: activeLeadFormId || '999999999999999' } },`;
const r4 = `call_to_action: { type: 'LEARN_MORE', value: { link: destinationUrl } },`;

if (code.includes(t3)) {
    code = code.replace(t3, r3);
    code = code.replace(t4, r4);
    fs.writeFileSync('server.ts', code);
    console.log("Patched CTA successfully");
} else {
    console.log("Could not find CTA targets");
}
