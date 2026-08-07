const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const t = `            if (activeLeadFormId) {
               creativePayload.object_story_spec.link_data = {
                   link: destinationUrl,
                   message: adMessage,
                   name: adHeadline,
                   call_to_action: { type: 'LEARN_MORE', value: { link: destinationUrl } }
               };
            }`;

if (code.includes(t)) {
    code = code.replace(t, '');
    fs.writeFileSync('server.ts', code);
    console.log("Patched link_data successfully");
} else {
    console.log("Could not find link_data target");
}
