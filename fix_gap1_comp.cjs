const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetIdemp = `          'Idempotency-Key': \`\${showPayModal.id}-\${selectedGateway}-\${showPayModal.budget}-\${Math.floor(Date.now() / 10000)}\`
        },`;

if (code.includes(targetIdemp)) {
    console.log("Idempotency-Key header is present.");
} else {
    console.log("Idempotency-Key header is missing.");
}
