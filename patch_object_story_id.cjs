const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const t = `            creativePayload = {
              access_token: accessToken,
              name: \`Encho Creative - \${adHeadline}\`,
              object_story_spec: { page_id: pageId, link_data: linkDataSpec }
            };`;

const r = `            creativePayload = {
              access_token: accessToken,
              name: \`Encho Creative - \${adHeadline}\`,
              object_story_id: '554884541034223_122117125484725697'
            };`;

if (code.includes(t)) {
    code = code.replace(t, r);
    fs.writeFileSync('server.ts', code);
    console.log("Patched to use existing post ID successfully");
} else {
    console.log("Could not find target");
}
