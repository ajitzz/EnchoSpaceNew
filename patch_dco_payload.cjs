const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `if (activeLeadFormId) {
               creativePayload.object_story_spec.link_data = {
                   call_to_action: { type: 'SIGN_UP', value: { lead_gen_form_id: activeLeadFormId } }
               };
            }`;

const replacement1 = `if (activeLeadFormId) {
               creativePayload.object_story_spec.link_data = {
                   link: destinationUrl,
                   message: adMessage,
                   name: adHeadline,
                   call_to_action: { type: 'SIGN_UP', value: { lead_gen_form_id: activeLeadFormId } }
               };
            }`;

if (code.includes(target1)) {
    code = code.replace(target1, replacement1);
    fs.writeFileSync('server.ts', code);
    console.log("Patched server.ts successfully");
} else {
    console.log("Could not find target block in server.ts");
}
