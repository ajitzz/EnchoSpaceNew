import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

// 1. Remove processPaymentWebhook (it's between 7354 and 7441)
content = content.replace(/async function processPaymentWebhook[\s\S]*?return \{ success: true, message: 'Webhook processed successfully' \};\n\}/, '');

// 2. Rewrite /api/payments/webhook
const newPaymentWebhook = `// Public Webhook route for payment gateways
app.post('/api/payments/webhook', async (req, res) => {
  try {
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      console.error('[WEBHOOK ERROR] Missing raw body.');
      return res.status(403).send('Missing raw body');
    }

    const stripeSig = req.headers['stripe-signature'] as string;
    const razorpaySigHeader = req.headers['x-razorpay-signature'] as string;

    if (stripeSig && stripe) {
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!endpointSecret) return res.status(403).json({ error: 'Missing STRIPE_WEBHOOK_SECRET' });

      let event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, stripeSig, endpointSecret);
      } catch (err: any) {
        return res.status(403).send(\`Webhook Error: \${err.message}\`);
      }

      if (event.type === 'payment_intent.succeeded' || event.type === 'checkout.session.completed') {
        const paymentIntentId = event.type === 'checkout.session.completed' ? (event.data.object as any).payment_intent : (event.data.object as any).id;
        const metadata = (event.data.object as any).metadata || {};
        await handleVerifiedPayment(metadata.transaction_id, metadata.campaign_id, paymentIntentId, 'stripe', req);
      }
      return res.json({ received: true });
    } 
    else if (razorpaySigHeader) {
      const endpointSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!endpointSecret) return res.status(403).json({ error: 'Missing RAZORPAY_WEBHOOK_SECRET' });

      try {
        const expectedSignature = crypto.createHmac('sha256', endpointSecret).update(rawBody).digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(razorpaySigHeader, 'hex'))) {
            return res.status(403).send('Invalid signature');
        }
      } catch (err) {
          return res.status(403).send('Invalid signature');
      }

      const payload = JSON.parse(rawBody.toString('utf-8'));
      const eventType = payload.event;
      if (eventType === 'order.paid' || eventType === 'payment.captured') {
        const orderId = payload.payload?.payment?.entity?.order_id || payload.payload?.order?.entity?.id || payload.order_id;
        const notes = payload.payload?.payment?.entity?.notes || payload.payload?.order?.entity?.notes || {};
        await handleVerifiedPayment(notes.transaction_id, notes.campaign_id, orderId, 'razorpay', req);
      }
      return res.json({ received: true });
    }
    
    return res.status(400).send('Unrecognized webhook');
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error processing webhook' });
  }
});

async function handleVerifiedPayment(txId: any, campaignId: any, paymentIntentId: any, gateway: string, req: any) {
  if (txId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const txCheck = await client.query('SELECT * FROM wallet_transactions WHERE id = $1 AND status = $2 FOR UPDATE', [txId, 'pending']);
      if (txCheck.rows.length > 0) {
        const tx = txCheck.rows[0];
        await client.query('UPDATE wallet_transactions SET status = $1 WHERE id = $2', ['completed', txId]);
        await client.query('UPDATE host_wallets SET balance = balance + $1 WHERE id = $2', [tx.amount, tx.wallet_id]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } else {
    let campaignIdToUse = campaignId;
    if (!campaignIdToUse && paymentIntentId) {
      const dbCheck = await pool.query('SELECT id FROM host_marketing_campaigns WHERE payment_intent_id = $1', [paymentIntentId]);
      if (dbCheck.rows.length > 0) campaignIdToUse = dbCheck.rows[0].id;
    }

    if (campaignIdToUse) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const check = await client.query('SELECT * FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaignIdToUse]);
        if (check.rows.length > 0) {
            const campaign = check.rows[0];
            if (campaign.payment_status !== 'paid') {
                await client.query(\`
                  UPDATE host_marketing_campaigns 
                  SET subscription_active = true, payment_status = 'paid', payment_gateway = $1, payment_intent_id = $2, active_slide_index = 0
                  WHERE id = $3
                \`, [gateway, paymentIntentId, campaignIdToUse]);
                
                const actorClient = { ip: req.ip, userAgent: gateway };
                if (campaign.admin_approved) {
                    await transitionCampaignState({ campaignId: campaignIdToUse, expectedCurrentState: campaign.status, to: 'active', reason: 'PAYMENT_SUCCESS', actorType: 'webhook', client });
                } else {
                    await transitionCampaignState({ campaignId: campaignIdToUse, expectedCurrentState: campaign.status, to: 'pending_approval', reason: 'PAYMENT_SUCCESS', actorType: 'webhook', client });
                }
            }
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
  }
}`;

content = content.replace(/app\.post\('\/api\/payments\/webhook', async \(req, res\) => \{[\s\S]*?\n\}\);/, newPaymentWebhook);

fs.writeFileSync('server.ts', content);
console.log('Payment webhook patched.');
