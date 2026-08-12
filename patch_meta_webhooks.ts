import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

const middleware = `
// Phase 2.3: Cryptographically Secure Meta Webhook Middleware
function verifyMetaWebhook(req: any, res: any, next: any) {
  const signature = req.headers['x-hub-signature-256'];
  const appSecret = process.env.META_APP_SECRET;
  
  if (!signature || !appSecret) {
    console.error('[META WEBHOOK] Missing signature or APP SECRET. Rejecting.');
    return res.status(403).json({ error: 'Missing signature or configuration' });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    console.error('[META WEBHOOK ERROR] Missing raw body.');
    return res.status(403).json({ error: 'Missing raw body' });
  }

  try {
    const expectedSignature = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        console.error('[META WEBHOOK] Invalid signature detected. Rejecting webhook.');
        return res.status(403).json({ error: 'Invalid signature' });
    }
  } catch (err) {
      console.error('[META WEBHOOK ERROR] Signature verification crashed:', err);
      return res.status(403).json({ error: 'Invalid signature' });
  }
  
  next();
}

app.post('/api/webhooks/meta', verifyMetaWebhook, async (req, res) => {
`;

// Patch /api/webhooks/meta
content = content.replace(/app\.post\('\/api\/webhooks\/meta', async \(req, res\) => \{/, middleware);

// Patch /api/webhooks/ad-network
content = content.replace(/app\.post\('\/api\/webhooks\/ad-network', async \(req, res\) => \{/, 
  "app.post('/api/webhooks/ad-network', verifyMetaWebhook, async (req, res) => {");

// Patch /api/marketing/webhooks/meta-leads
const oldMetaLeadsRegex = /app\.post\('\/api\/marketing\/webhooks\/meta-leads', async \(req, res\) => \{[\s\S]*?try \{/;
const newMetaLeads = `app.post('/api/marketing/webhooks/meta-leads', verifyMetaWebhook, async (req, res) => {
  try {`;
content = content.replace(oldMetaLeadsRegex, newMetaLeads);

// Patch /api/marketing/meta/webhooks
const oldMetaWebhooksRegex = /app\.post\(\['\/api\/marketing\/meta\/webhooks', '\/api\/meta-webhooks'\], async \(req: Request, res: Response\) => \{[\s\S]*?res\.status\(200\)\.send\('EVENT_RECEIVED'\);/;

const newMetaWebhooks = `app.post(['/api/marketing/meta/webhooks', '/api/meta-webhooks'], verifyMetaWebhook, async (req: Request, res: Response) => {
  try {
    res.status(200).send('EVENT_RECEIVED');`;
content = content.replace(oldMetaWebhooksRegex, newMetaWebhooks);

fs.writeFileSync('server.ts', content);
console.log('Meta webhooks patched.');
