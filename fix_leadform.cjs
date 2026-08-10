const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const regex = /let activeLeadFormId = campaign\.meta_lead_form_id;[\s\S]*?\}[\s\S]*?\/\/ 1\. Create Campaign/;

const replacement = `// 1. Create Campaign`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('server.ts', content);
    console.log('Successfully removed mock lead form ID generation.');
} else {
    console.log('Target not found.');
}
