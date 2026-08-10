const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const regex = /c\.meta_campaign_id \|\| 'act_mock_' \+ c\.id/g;
const replacement = `c.meta_campaign_id`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('server.ts', content);
    console.log('Successfully removed act_mock_ from circuit breaker.');
} else {
    console.log('Target not found.');
}
