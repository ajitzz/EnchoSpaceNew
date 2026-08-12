const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `
app.post('/api/marketing/webhooks/meta-leads', async (req, res) => {
  console.log('[META WEBHOOK] Received Native Lead Generation Webhook payload.');
  
  // Phase 2L: Webhook Safety - Signature Verification
  const signature = req.headers['x-hub-signature-256'];
  const appSecret = process.env.META_APP_SECRET;
  
  if (appSecret && signature) {
    const payloadBuffer = JSON.stringify(req.body); // Ideally raw body, but fallback to stringified body
    const expectedSignature = 'sha256=' + crypto.createHmac('sha256', appSecret).update(payloadBuffer).digest('hex');
    
    // Using secure compare to prevent timing attacks
    if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        console.error('[META WEBHOOK] Invalid signature detected. Rejecting webhook.');
        return res.status(403).json({ error: 'Invalid signature' });
    }
  } else if (process.env.NODE_ENV === 'production') {
     console.error('[META WEBHOOK] Missing signature or APP SECRET in production. Rejecting.');
     return res.status(403).json({ error: 'Missing signature' });
  }

  try {
     const entries = req.body.entry;
`;

code = code.replace(/app\.post\('\/api\/marketing\/webhooks\/meta-leads', async \(req, res\) => \{\n  console\.log\('\[META WEBHOOK\] Received Native Lead Generation Webhook payload\.'\);\n  try \{/m, replacement);

fs.writeFileSync('server.ts', code);
console.log('Meta webhook patched.');
