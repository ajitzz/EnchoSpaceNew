const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `
        if (endpointSecret) {
          // Note: If rawBody is not set, stringify req.body as standard fallback
          const rawBody = (req as any).rawBody || JSON.stringify(payload);
          event = stripe.webhooks.constructEvent(rawBody, stripeSig, endpointSecret);
        } else {
          console.error('[STRIPE WEBHOOK ERROR] STRIPE_WEBHOOK_SECRET is missing. Rejecting webhook to enforce strict signature validation.');
          return res.status(403).json({ error: 'Missing STRIPE_WEBHOOK_SECRET configuration.' });
        }
`;

code = code.replace(/if \(endpointSecret\) \{[\s\S]*?event = payload;\n        \}/m, replacement);

fs.writeFileSync('server.ts', code);
console.log('Stripe webhook patched.');
