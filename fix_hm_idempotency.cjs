const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const target = `const res = await fetch(\`/api/marketing/campaigns/\${showPayModal.id}/subscribe\`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\` 
        },`;
const replacement = `const res = await fetch(\`/api/marketing/campaigns/\${showPayModal.id}/subscribe\`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`,
          'Idempotency-Key': \`\${showPayModal.id}-\${selectedGateway}-\${showPayModal.budget}-\${Math.floor(Date.now() / 10000)}\`
        },`;
        
if(code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('components/HostMarketing.tsx', code);
  console.log('Added Idempotency-Key header to HostMarketing.tsx');
} else {
  console.log('Target not found in HostMarketing.tsx');
}
