const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const target = `      const res = await fetch('/api/marketing/wallet/refuel', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\` 
        },`;

const replacement = `      const idempotencyKey = \`refuel_\${Date.now()}_\${Math.random().toString(36).substring(7)}\`;
      const res = await fetch('/api/marketing/wallet/refuel', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`,
          'x-idempotency-key': idempotencyKey
        },`;

code = code.replace(target, replacement);

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Fixed idempotency in UI');
