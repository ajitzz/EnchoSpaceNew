const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `          metadata: {
            campaign_id: String(campaign.id),
          },
        });`;

const replacement = `          metadata: {
            campaign_id: String(campaign.id),
          },
        }, idempotencyKey ? { idempotencyKey } : undefined);`;

if(code.includes(target)) {
   code = code.replace(target, replacement);
   fs.writeFileSync('server.ts', code);
   console.log('Stripe Idempotency applied to line 3320.');
} else {
   console.log('Target not found for Stripe.');
}

