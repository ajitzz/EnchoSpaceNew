const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /if \(endpointSecret\) \{[\s\S]*?console\.warn\('\[RAZORPAY WEBHOOK\] RAZORPAY_WEBHOOK_SECRET is missing\. Safely parsing payload structure\.\.\.'\);\n        \}/m;

const replacement = `if (endpointSecret) {
          const shasum = crypto.createHmac('sha256', endpointSecret);
          const rawPayload = (req as any).rawBody ? (req as any).rawBody.toString('utf-8') : JSON.stringify(payload);
          shasum.update(rawPayload);
          const digest = shasum.digest('hex');
          if (digest !== razorpaySig) {
            console.error('[RAZORPAY WEBHOOK] Webhook signature verification failed');
            return res.status(400).send('Invalid signature');
          }
        } else {
          console.error('[RAZORPAY WEBHOOK ERROR] RAZORPAY_WEBHOOK_SECRET is missing. Rejecting webhook to enforce strict signature validation.');
          return res.status(403).json({ error: 'Missing RAZORPAY_WEBHOOK_SECRET configuration.' });
        }`;

code = code.replace(regex, replacement);

fs.writeFileSync('server.ts', code);
console.log('Razorpay webhook patched.');
