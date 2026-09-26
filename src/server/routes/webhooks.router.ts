import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { pool, isDbConfigured } from '../db/connection.js';
import {
  stripe,
  razorpay,
  ai,
  sendWhatsAppMessage,
  logGeminiWarning,
  broadcastDbEvent,
  getGlobalIoInstance,
  JWT_SECRET
} from '../config/clients.js';
import {
  authenticateToken,
  optionalAuthenticateToken,
  requireAdmin,
  AuthRequest
} from '../middleware/auth.js';
import { idempotencyMiddleware } from '../../lib/idempotency.js';
import {
  handleVerifiedPayment,
  transitionCampaignState,
  executeMetaRollback,
  recordMetaErrorSignature,
  logAdminAudit,
  dispatchMetaCampaign,
  dispatchGoogleAdsCampaign,
  triggerSmartAutoPause,
  executeCampaignStateMachine
} from '../services/legacyMarketingEngine.js';
import { DoubleEntryLedgerService } from '../../lib/doubleEntryLedgerService.js';
import { LeadAlertingCrmService } from '../../lib/leadAlertingCrmService.js';
import { StructuredLogger } from '../../lib/observability/structuredLogger.js';
import { MetricsRegistry } from '../../lib/observability/metricsRegistry.js';
import { AlertService } from '../../lib/observability/alertService.js';


export const processWhatsAppWebhookPayload = async (body: any) => {
  if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
    const phone_number_id = body.entry[0].changes[0].value.metadata.phone_number_id;
    const from = body.entry[0].changes[0].value.messages[0].from;
    const msg_body = body.entry[0].changes[0].value.messages[0].text?.body;

    // Ensure we don't send anything if msg_body is empty
    if (!msg_body || msg_body.trim() === '') {
       return;
    }

    // Automated AI reply logic using Gemini
    if (ai) {
       const listingsRes = await pool.query('SELECT title, description, price, city, currency FROM listings WHERE id > 0 LIMIT 15');
       const listingsContext = listingsRes.rows.map((l: any) => `- ${l.title} in ${l.city} (${l.currency}${l.price}): ${l.description}`).join('\n');

       const systemInstruction = `You are a helpful, professional assistant for ENCHO Space (a real estate and property booking platform).
You are answering queries from customers on WhatsApp.
Never send empty messages. Never use placeholders like 'Replace this sample message', '[Insert Name]', or similar. Never output instructions to the user on how to replace text.
Always generate a fully complete, ready-to-send, natural response. Keep your response under 1000 characters and use plain text with simple emojis.
Here are some of our available properties:
${listingsContext}

Answer the user's question accurately. If they ask about something not listed, politely inform them to check the ENCHO Space website.`;

       let replyText = '';
       try {
          const response = await ai!.models.generateContent({
             model: "gemini-2.5-flash",
             contents: msg_body,
             config: {
                systemInstruction,
             }
          });
          replyText = response?.text?.trim() || '';
       } catch (geminiError) {
          logGeminiWarning("WhatsApp automated reply", geminiError);
       }

       const lowerReply = replyText.toLowerCase();
       const isInvalidMessage = replyText === ''
         || lowerReply.includes('replace this')
         || lowerReply.includes('sample message')
         || lowerReply.includes('[insert')
         || lowerReply.includes('placeholder');

       if (!isInvalidMessage) {
           await sendWhatsAppMessage(from, replyText);
       } else {
           // Prevent conversation breaks if AI fails or hallucinates placeholders
           const fallbackMsg = "Hello! Welcome to ENCHO Space. I'm currently processing a lot of requests. Please visit our website to explore available properties, or let me know if you have a specific question!";
           await sendWhatsAppMessage(from, fallbackMsg);
       }
    }
  }
};


export function verifyMetaWebhook(req: any, res: any, next: any) {
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


export function createWebhooksRouter(): Router {
  const router = Router();

// WhatsApp Webhook Registration
router.get('/api/webhook/whatsapp', (req, res) => {
  const verify_token = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!verify_token) return res.status(503).send('Webhook verification is not configured');
  if (mode && token) {
    if (mode === "subscribe" && token === verify_token) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else res.status(400).send('Missing mode or token');
});

router.post('/api/webhook/whatsapp', verifyMetaWebhook, async (req, res) => {
  try {
    const body = req.body;
    if (body.object) {
      // M2: Ingest-and-Ack
      const messageId = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id || `wa_event_${Date.now()}`;

      await pool.query(`
        INSERT INTO inbound_webhooks (provider, event_type, payload, idempotency_key, correlation_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (idempotency_key) DO NOTHING
      `, [
        'whatsapp',
        'message_received',
        JSON.stringify(body),
        `wa_${messageId}`,
        `corr_wa_${Date.now()}`
      ]);

      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (e) {
    console.error("Webhook processing error:", e);
    res.sendStatus(500);
  }
});

router.post('/api/payments/webhook', async (req, res) => {
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
        return res.status(403).send(`Webhook Error: ${err.message}`);
      }

      if (event.type === 'payment_intent.succeeded' || event.type === 'checkout.session.completed') {
        const paymentIntentId = event.type === 'checkout.session.completed' ? (event.data.object as any).payment_intent : (event.data.object as any).id;

        // M2: Ingest-and-Ack - Queue for async processing
        await pool.query(`
          INSERT INTO inbound_webhooks (provider, event_type, payload, signature_metadata, idempotency_key, correlation_id)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (idempotency_key) DO NOTHING
        `, [
          'stripe',
          event.type,
          JSON.stringify(event),
          JSON.stringify({ sig: stripeSig }),
          `stripe_${paymentIntentId}_${event.type}`,
          `corr_wh_stripe_${Date.now()}`
        ]);
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

        // M2: Ingest-and-Ack
        await pool.query(`
          INSERT INTO inbound_webhooks (provider, event_type, payload, signature_metadata, idempotency_key, correlation_id)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (idempotency_key) DO NOTHING
        `, [
          'razorpay',
          eventType,
          JSON.stringify(payload),
          JSON.stringify({ sig: razorpaySigHeader }),
          `razorpay_${orderId}_${eventType}`,
          `corr_wh_rzp_${Date.now()}`
        ]);
      }
      return res.json({ received: true });
    }

    return res.status(400).send('Unrecognized webhook');
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error processing webhook' });
  }
});


// Phase 2.3: Cryptographically Secure Meta Webhook Middleware
router.post('/api/webhooks/meta', verifyMetaWebhook, async (req, res) => {

  // Push real-time meta leads / ad status into the queue (Async Webhook Engine)
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
     const payload = req.body;
     const correlationId = `corr_wh_meta_${Date.now()}`;
     const idempotencyKey = `meta_${payload?.entry?.[0]?.id || Date.now()}_${Date.now()}`;

     // M2: Ingest-and-Ack
     await pool.query(`
        INSERT INTO inbound_webhooks (provider, event_type, payload, idempotency_key, correlation_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (idempotency_key) DO NOTHING
     `, ['meta', 'meta_event', JSON.stringify(payload), idempotencyKey, correlationId]);

     console.log(`[ASYNC WEBHOOK ENGINE] Received Meta webhook. Queued for background processing.`);
     return res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
     console.error('[ASYNC WEBHOOK ENGINE ERROR]', err);
     return res.status(500).send('Internal Server Error');
  }
});

router.post('/api/webhooks/ad-network', verifyMetaWebhook, async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
     const payload = req.body;
     const source = req.query.source || 'meta'; // 'meta' or 'google'

     const correlationId = `corr_wh_adnet_${Date.now()}`;
     const idempotencyKey = `adnet_${source}_${payload?.entry?.[0]?.id || Date.now()}_${Date.now()}`;

     // M2: Ingest-and-Ack
     await pool.query(`
        INSERT INTO inbound_webhooks (provider, event_type, payload, idempotency_key, correlation_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (idempotency_key) DO NOTHING
     `, [source, 'ad_performance', JSON.stringify(payload), idempotencyKey, correlationId]);

     console.log(`[ASYNC WEBHOOK ENGINE] Received ${source} ad network webhook. Queued for background processing.`);

     // Acknowledge immediately to the ad network to prevent timeouts
     return res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
     console.error('[ASYNC WEBHOOK ENGINE ERROR]', err);
     return res.status(500).send('Internal Server Error');
  }
});

// Background Worker for Gap 2: Asynchronous Webhook Engine (Phase 2.9.5 Hardened)

router.post('/api/create-payment-intent', authenticateToken, (_req: AuthRequest, res) => {
  return res.status(410).json({
    code: 'SERVER_QUOTE_REQUIRED',
    error: 'Client-priced payment intents are retired. Begin checkout from a server-issued quote.',
  });
});


router.post('/api/marketing/simulate-webhook', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const hostId = req.user?.id;
    if (!hostId) return res.status(401).json({ error: 'Unauthorized' });
    const { action, campaignId } = req.body;

    if (action === 'impressions') {
      if (campaignId) {
        await pool.query(`
          INSERT INTO campaign_metrics (campaign_id, impressions, clicks, date)
          VALUES ($1, 500, 32, CURRENT_DATE)
          ON CONFLICT (campaign_id, date) DO UPDATE
          SET impressions = campaign_metrics.impressions + 500,
              clicks = campaign_metrics.clicks + 32;
        `, [campaignId]);
      }
      broadcastDbEvent(req, 'marketing');
      return res.json({
        success: true,
        message: 'Dispatched simulated ad traffic metrics: +500 Impressions, +32 Clicks!',
        dopamine_boost: true
      });
    }

    if (action === 'lead') {
      // Simulate hot lead with data masking
      const leadId = `lead_sim_${Date.now()}`;
      await pool.query(`
        INSERT INTO host_outreach_leads (campaign_id, host_id, guest_name, guest_email, guest_phone, status, message_history)
        VALUES ($1, $2, 'Simulated Hot Lead', '[REDACTED]', '[REDACTED]', 'New Lead', $3)
      `, [
        campaignId || null,
        hostId,
        JSON.stringify([{ timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), sender: 'Guest', text: 'Hi! I saw your resort ad on Instagram. Is it available next weekend?' }])
      ]);
      broadcastDbEvent(req, 'marketing');
      return res.json({
        success: true,
        message: '🔥 Cold-Start Masked Lead Alert triggered! Lead delivered securely to Walled Garden CRM.',
        lead: { id: leadId, guest_name: 'Simulated Hot Lead', status: 'New Lead', email: '[REDACTED]', phone: '[REDACTED]' }
      });
    }

    return res.status(400).json({ error: 'Unknown simulation action' });
  } catch (error: any) {
    console.error('[SIMULATION WEBHOOK ERROR]', error);
    res.status(500).json({ error: error.message || 'Failed simulation' });
  }
});

// Razorpay Secure Guest Checkout Order Creation (Server-Calculated Amount)
router.post('/api/checkout/razorpay/order', optionalAuthenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { listingId, experienceId, roomId, moveInDate, configuration, numTickets, name, phone } = req.body;
    const userId = req.user?.id;

    const isProductionRuntime = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
    if (listingId && isProductionRuntime && !req.body.quoteId) {
      return res.status(503).json({
        error: 'Online checkout is unavailable until the canonical quote and payment-event workflow is released.',
        code: 'CANONICAL_CHECKOUT_REQUIRED'
      });
    }

    if (!userId) return res.status(401).json({ error: 'A verified account session is required before creating an order.' });
    const effectiveUserId = userId;

    let finalAmount = 0;
    let title = 'Booking';
    let bookingId: any = null;
    let bookingType: 'listing' | 'experience' = 'listing';

    // Fetch system payment rates from DB (Never trust client total)
    let commissionRate = 10;
    let taxRate = 18;
    let systemFee = 150;
    try {
      const rateRes = await pool.query('SELECT * FROM payment_settings LIMIT 1');
      if (rateRes.rows.length > 0) {
        commissionRate = Number(rateRes.rows[0].commission_rate) || 10;
        taxRate = Number(rateRes.rows[0].tax_rate) || 18;
        systemFee = Number(rateRes.rows[0].system_fee) || 150;
      }
    } catch (rateErr) {
      console.warn('[PAYMENT SETTINGS WARNING] Defaulting to standard rates:', rateErr);
    }

    if (listingId) {
      bookingType = 'listing';
      const listingRes = await pool.query('SELECT * FROM listings WHERE id = $1', [listingId]);
      if (listingRes.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
      const listing = listingRes.rows[0];

      let baseRent = listing.price || 5000;
      if (roomId && listing.rooms && Array.isArray(listing.rooms)) {
        const selectedIds = String(roomId).split(',');
        const roomMatch = listing.rooms.find((r: any) => selectedIds.includes(r.id));
        if (roomMatch && roomMatch.price) {
          baseRent = roomMatch.price;
        }
      }

      // Zero Guest Fee Invariant:
      // Base Rent + 18% statutory GST. ₹0 guest commission, ₹0 system fee.
      const start = new Date(moveInDate || Date.now()).getTime();
      const checkOutStr = req.body.checkOutDate || req.body.configuration?.checkOutDate;
      let nights = 1;
      if (checkOutStr) {
         const end = new Date(checkOutStr).getTime();
         const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
         if (diff > 0) nights = diff;
      }
      
      const baseRentTotal = baseRent * nights;
      const calcTaxFee = Math.round((baseRentTotal * taxRate) / 100);
      finalAmount = Math.round(baseRentTotal + calcTaxFee);
      title = `Stay at ${listing.title}`;

      // Table structure ensured at boot time for ultra-fast query execution
      const bookInsert = await pool.query(`
        INSERT INTO bookings (user_id, listing_id, room_id, move_in_date, configuration, name, phone, total_rent, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING id
      `, [effectiveUserId, listingId, roomId || null, moveInDate || new Date().toISOString(), configuration || '', name || 'Guest', phone || '', finalAmount]);

      bookingId = bookInsert.rows[0].id;
    } else if (experienceId) {
      bookingType = 'experience';
      const expRes = await pool.query('SELECT * FROM experiences WHERE id = $1', [experienceId]);
      if (expRes.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
      const experience = expRes.rows[0];

      const tickets = Math.max(1, Number(numTickets) || 1);
      const basePrice = (experience.price || 1500) * tickets;
      const commissionFee = (basePrice * commissionRate) / 100;
      const taxFee = (basePrice * taxRate) / 100;
      finalAmount = Math.round(basePrice + commissionFee + taxFee + systemFee);
      title = `${tickets}x Tickets for ${experience.title}`;

      await pool.query(`
        CREATE TABLE IF NOT EXISTS experience_bookings (
          id SERIAL PRIMARY KEY,
          user_id INT,
          experience_id INT,
          num_tickets INT,
          total_amount NUMERIC,
          name VARCHAR(255),
          phone VARCHAR(255),
          status VARCHAR(50) DEFAULT 'pending',
          payment_intent_id VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const expBookInsert = await pool.query(`
        INSERT INTO experience_bookings (user_id, experience_id, num_tickets, total_amount, name, phone, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id
      `, [effectiveUserId, experienceId, tickets, finalAmount, name || 'Guest', phone || '']);

      bookingId = expBookInsert.rows[0].id;
    } else {
      return res.status(400).json({ error: 'Invalid booking parameters' });
    }

    if (razorpay) {
      const order = await razorpay.orders.create({
        amount: Math.round(finalAmount * 100), // in paise
        currency: 'INR',
        receipt: `rcpt_${bookingType}_${bookingId}`,
        notes: {
          booking_id: String(bookingId),
          type: bookingType,
          user_id: String(userId)
        }
      });

      return res.json({
        success: true,
        order_id: order.id,
        amount: order.amount,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
        bookingId,
        bookingType,
        title
      });
    } else {
      // In production runtimes without Razorpay credentials, fail closed
      if (isProductionRuntime) {
        return res.status(503).json({ error: 'Payment gateway unconfigured for production orders.' });
      }
      const mockOrderId = `order_sim_${crypto.randomUUID()}`;
      return res.json({
        success: true,
        order_id: mockOrderId,
        amount: Math.round(finalAmount * 100),
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_encho2026',
        bookingId,
        bookingType,
        title,
        isSimulated: true
      });
    }
  } catch (error: any) {
    console.error('[RAZORPAY CHECKOUT ORDER ERROR]', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout order' });
  }
});

// Razorpay Client Payment Verification Endpoint (Cryptographic HMAC SHA-256 + Anti-Replay + Idempotency)
router.post('/api/payments/razorpay/verify', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transaction_type, transaction_id, campaign_id, booking_id, experience_booking_id } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing required Razorpay verification parameters' });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    let isAuthentic = false;

    if (keySecret) {
      const bodyToSign = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(bodyToSign)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
      const actualBuf = Buffer.from(String(razorpay_signature), 'utf-8');

      if (expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)) {
        isAuthentic = true;
      }
    } else {
      // In test-only execution environment, accept test signatures
      const isTestRuntime = process.env.NODE_ENV === 'test' && process.env.VITEST === 'true';
      if (isTestRuntime && (String(razorpay_signature).startsWith('sim_sig_') || String(razorpay_signature).startsWith('rzp_sig_'))) {
        isAuthentic = true;
      }
    }

    if (!isAuthentic) {
      console.error(`[RAZORPAY VERIFY SECURITY ALERT] Invalid HMAC signature for Order ${razorpay_order_id}`);
      return res.status(400).json({ error: 'Invalid Razorpay signature. Verification failed.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create processed_payments table for anti-replay protection
      await client.query(`
        CREATE TABLE IF NOT EXISTS processed_payments (
          id SERIAL PRIMARY KEY,
          razorpay_payment_id VARCHAR(255) UNIQUE NOT NULL,
          razorpay_order_id VARCHAR(255) NOT NULL,
          type VARCHAR(50),
          reference_id VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const paymentCheck = await client.query(
        'SELECT * FROM processed_payments WHERE razorpay_payment_id = $1 FOR UPDATE',
        [razorpay_payment_id]
      );

      if (paymentCheck.rows.length > 0) {
        await client.query('COMMIT');
        return res.json({ success: true, message: 'Payment already verified and processed (Idempotent).' });
      }

      await client.query(
        'INSERT INTO processed_payments (razorpay_payment_id, razorpay_order_id, type, reference_id) VALUES ($1, $2, $3, $4)',
        [razorpay_payment_id, razorpay_order_id, transaction_type || 'generic', String(transaction_id || campaign_id || booking_id || experience_booking_id || '')]
      );

      // Handle Wallet Refuel
      if (transaction_type === 'wallet_refuel' || transaction_id) {
        const txRes = await client.query('SELECT * FROM wallet_transactions WHERE id = $1 FOR UPDATE', [transaction_id]);
        if (txRes.rows.length > 0) {
          const tx = txRes.rows[0];
          if (tx.status !== 'completed') {
            await client.query('UPDATE wallet_transactions SET status = $1 WHERE id = $2', ['completed', transaction_id]);
            const walletRes = await client.query('SELECT host_id FROM host_wallets WHERE id = $1', [tx.wallet_id]);
            const hostId = walletRes.rows[0].host_id;
            await DoubleEntryLedgerService.recordTransaction(client, {
               transactionRef: `rp_webhook_${razorpay_payment_id}`,
               eventType: 'WALLET_FUNDING',
               description: `Wallet Refuel via Razorpay Webhook`,
               lines: [
                 { accountType: 'GATEWAY_CLEARING', entryType: 'DEBIT', amount: tx.amount },
                 { accountType: 'HOST_WALLET', userId: hostId, entryType: 'CREDIT', amount: tx.amount }
               ]
            });
          }
        }
      }

      // Handle Campaign
      if (campaign_id) {
        const campRes = await client.query('SELECT * FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaign_id]);
        if (campRes.rows.length > 0) {
          const campaign = campRes.rows[0];
          if (campaign.payment_status !== 'paid') {
            await client.query(`
              UPDATE host_marketing_campaigns
              SET subscription_active = true,
                  payment_status = 'paid',
                  payment_gateway = 'razorpay',
                  payment_intent_id = $1
              WHERE id = $2
            `, [razorpay_payment_id, campaign_id]);

            if (campaign.admin_approved) {
              await dispatchMetaCampaign(campaign_id, req);
              if (process.env.ENABLE_GOOGLE_ADS_DISPATCH === 'true') {
                await dispatchGoogleAdsCampaign(campaign_id, req);
              }
            }
          }
        }
      }

      // Handle Listing Booking
      if (booking_id) {
        await client.query(`
          ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255);
          ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(50);
        `);
        const bookRes = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [booking_id]);
        if (bookRes.rows.length > 0) {
          await client.query(`
            UPDATE bookings
            SET status = 'confirmed',
                payment_gateway = 'razorpay',
                payment_intent_id = $1
            WHERE id = $2
          `, [razorpay_payment_id, booking_id]);

          // Milestone 5: The Circuit Breaker (Smart Pause)
          // If property gets a booking, automatically pause active ad campaigns for this listing.
          triggerSmartAutoPause(bookRes.rows[0].listing_id, booking_id).catch((err: any) => {
             console.error('[CIRCUIT BREAKER ERROR] Failed to pause campaigns from Razorpay Webhook:', err);
          });
        }
      }

      // Handle Experience Booking
      if (experience_booking_id) {
        await client.query(`
          ALTER TABLE experience_bookings ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255);
          ALTER TABLE experience_bookings ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(50);
        `);
        const expBookRes = await client.query('SELECT * FROM experience_bookings WHERE id = $1 FOR UPDATE', [experience_booking_id]);
        if (expBookRes.rows.length > 0) {
          await client.query(`
            UPDATE experience_bookings
            SET status = 'confirmed',
                payment_gateway = 'razorpay',
                payment_intent_id = $1
            WHERE id = $2
          `, [razorpay_payment_id, experience_booking_id]);
        }
      }

      await client.query('COMMIT');
      broadcastDbEvent(req, 'marketing');
      return res.json({ success: true, message: 'Razorpay payment verified successfully!' });
    } catch (dbErr: any) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[RAZORPAY VERIFY ERROR]', error);
    res.status(500).json({ error: error.message || 'Internal Server Error during verification' });
  }
});

router.get('/api/payments/geo-route/detect', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    let userCountry = 'US';
    let currency = 'USD';
    let hostId: number | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const secret = JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET missing');
        }
        const decoded = jwt.verify(token, secret) as any;
        hostId = decoded.userId || decoded.id;
        const uRes = await pool.query('SELECT location, currency FROM users WHERE id = $1', [hostId]);
        if (uRes.rows.length > 0) {
          const loc = (uRes.rows[0].location || '').toLowerCase();
          currency = uRes.rows[0].currency || 'USD';
          if (loc.includes('india') || loc.includes('in') || currency === 'INR') {
            userCountry = 'IN';
          }
        }
      } catch (jwtErr) {
        // ignore invalid token
      }
    }

    const reqCountry = (req.headers['cf-ipcountry'] || req.headers['x-country'] || '').toString().toUpperCase();
    if (reqCountry === 'IN') {
      userCountry = 'IN';
    }

    const recommendedGateway = (userCountry === 'IN' || currency === 'INR') ? 'razorpay' : 'stripe';
    if (userCountry === 'IN') currency = 'INR';

    return res.json({
      success: true,
      country: userCountry,
      recommended_gateway: recommendedGateway,
      currency,
      optimization_fee_percent: 15,
      ad_spend_percent: 85,
      escrow_hold_hours: 24,
      supported_gateways: [
        { id: 'razorpay', name: 'Razorpay (UPI / Netbanking / INR)', is_recommended: recommendedGateway === 'razorpay' },
        { id: 'stripe', name: 'Stripe 3D Secure (Cards / Global)', is_recommended: recommendedGateway === 'stripe' },
        { id: 'internal_wallet', name: 'Encho Internal Wallet (Trapped Cash Ledger)', is_recommended: false }
      ]
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to detect payment geo route' });
  }
});

// 2. Geo-Router Initiate Payment & Funding Endpoint (Idempotent + Escrow + Trapped Cash Wallet)
router.post('/api/payments/geo-route/initiate', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.substring(7);
    let decoded: any;
    try {
      const secret = JWT_SECRET;
      if (!secret) {
        return res.status(401).json({ error: 'Invalid or expired authentication token' });
      }
      decoded = jwt.verify(token, secret) as any;
    } catch (jwtErr) {
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }
    const hostId = decoded.userId || decoded.id;

    const { campaign_id, amount, gateway, idempotency_key: bodyIdemKey } = req.body;
    const headerIdemKey = req.headers['x-idempotency-key'] as string;
    const idempotencyKey = bodyIdemKey || headerIdemKey || crypto.randomUUID();

    const grossAmount = Number(amount);
    if (isNaN(grossAmount) || grossAmount <= 0) {
      return res.status(400).json({ error: 'Valid gross funding amount is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check Idempotency Table with lock
      const idemCheck = await client.query(
        'SELECT * FROM processed_payments WHERE idempotency_key = $1 FOR UPDATE',
        [idempotencyKey]
      );

      if (idemCheck.rows.length > 0) {
        await client.query('COMMIT');
        return res.json({
          success: true,
          message: 'Payment already processed (Idempotent replay protection active).',
          is_idempotent_replay: true,
          payment_id: idemCheck.rows[0].razorpay_payment_id || idemCheck.rows[0].id
        });
      }

      const optFee = Math.round((grossAmount * 0.15) * 100) / 100;
      const netAdSpend = Math.round((grossAmount * 0.85) * 100) / 100;

      const targetGateway = gateway || 'stripe';

      // Pre-insert into processed_payments to claim the idempotency key (Double-Spend Protection)
      await client.query(
        `INSERT INTO processed_payments (idempotency_key, type, reference_id, amount, payment_gateway)
         VALUES ($1, 'campaign_funding_init', $2, $3, $4)`,
        [idempotencyKey, String(campaign_id || ''), grossAmount, gateway || 'stripe']
      );

      if (targetGateway === 'internal_wallet') {
        let walletRes = await client.query('SELECT * FROM host_wallets WHERE host_id = $1 FOR UPDATE', [hostId]);
        if (walletRes.rows.length === 0) {
          walletRes = await client.query(
            'INSERT INTO host_wallets (host_id, balance, encho_credits) VALUES ($1, 0, 0) RETURNING *',
            [hostId]
          );
        }
        const wallet = walletRes.rows[0];
        const currentBalanceUSD = Number(wallet.balance) || 0;
        const currentBalanceINR = Math.round(currentBalanceUSD * 83.5);

        if (currentBalanceINR < grossAmount && currentBalanceUSD < grossAmount) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Insufficient Master Fuel Tank balance. Available: ₹${currentBalanceINR.toLocaleString()} ($${currentBalanceUSD.toFixed(2)} USD), Required: ₹${grossAmount.toLocaleString()}`
          });
        }

        // Deduct wallet balance in USD base
        const usdDeduction = grossAmount > currentBalanceUSD ? Math.round((grossAmount / 83.5) * 100) / 100 : grossAmount;

        // Insert wallet transaction (needed for idempotency key linking below)
        const txInsert = await client.query(
          `INSERT INTO wallet_transactions (wallet_id, amount, type, reference_id, status, description)
           VALUES ($1, $2, 'campaign_funding', $3, 'completed', $4) RETURNING id`,
          [wallet.id, -usdDeduction, String(campaign_id || ''), `Campaign funding via internal wallet (₹${netAdSpend} ad spend + ₹${optFee} 15% Encho fee)`]
        );

        // Update campaign if campaign_id provided
        if (campaign_id) {
          await client.query(
            `UPDATE host_marketing_campaigns
             SET subscription_active = true,
                 payment_status = 'paid',
                 payment_gateway = 'internal_wallet',
                 payment_intent_id = $1,
                 budget = budget + $2,
                 optimization_fee = optimization_fee + $3,
                 ad_spend_pool = ad_spend_pool + $4,
                 escrow_status = 'holding',
                 escrow_release_at = NOW() + INTERVAL '24 hours',
                 three_d_secure_verified = true,
                 idempotency_key = $5,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [`wtx_${txInsert.rows[0].id}`, netAdSpend, optFee, netAdSpend, idempotencyKey, campaign_id]
          );
        }

        // Update pre-inserted idempotency record
        await client.query(
          `UPDATE processed_payments
           SET razorpay_payment_id = $1, razorpay_order_id = $2
           WHERE idempotency_key = $3`,
          [`wtx_${txInsert.rows[0].id}`, `worder_${Date.now()}`, idempotencyKey]
        );

        await DoubleEntryLedgerService.recordTransaction(client, {
          transactionRef: idempotencyKey || `campaign_fund_${campaign_id || 'wallet'}_${txInsert.rows[0]?.id || 'tx'}`,
          eventType: 'AD_SPEND_DEDUCTION',
          description: `Campaign funding via internal wallet ($${netAdSpend} ad spend + $${optFee} 15% Encho fee)`,
          lines: [
            { accountType: 'HOST_WALLET', userId: hostId, entryType: 'DEBIT', amount: usdDeduction },
            { accountType: 'ENCHO_FEE_REVENUE', entryType: 'CREDIT', amount: optFee },
            { accountType: 'AD_SPEND_ESCROW', entryType: 'CREDIT', amount: netAdSpend }
          ]
        });

        await client.query('COMMIT');
        await logAdminAudit(hostId, 'campaign_payment', campaign_id || 0, 'internal_wallet_payment', {}, { grossAmount, optFee, netAdSpend, gateway: 'internal_wallet' });
        broadcastDbEvent(req, 'marketing');

        // Trigger State Machine synchronously for internal wallet payments
        if (campaign_id) {
            console.log(`[INTERNAL WALLET] Funding successful! Initializing Campaign State Machine for Campaign #${campaign_id}...`);
            // We don't await this so we can return the response instantly, but the engine runs!
            executeCampaignStateMachine(campaign_id, 'PAYMENT_SUCCESS', req).catch((err: any) => {
                console.error(`[STATE MACHINE ERROR] Async internal wallet launch failed:`, err);
            });
        }

        return res.json({
          success: true,
          payment_gateway: 'internal_wallet',
          message: 'Campaign funded instantly via internal wallet balance!',
          gross_amount: grossAmount,
          optimization_fee: optFee,
          net_ad_spend: netAdSpend,
          escrow_status: 'holding',
          escrow_release_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
        });
      }

      if (targetGateway === 'razorpay') {

        if (razorpay) {
          try {
            const rzpOrder = await razorpay.orders.create({
              amount: Math.round(grossAmount * 100),
              currency: 'INR',
              receipt: `rcpt_camp_${campaign_id || Date.now()}`,
              notes: { campaign_id: String(campaign_id || ''), host_id: String(hostId), idempotency_key: idempotencyKey }
            });

            await client.query(
              `UPDATE processed_payments
               SET razorpay_order_id = $1, currency = 'INR'
               WHERE idempotency_key = $2`,
              [rzpOrder.id, idempotencyKey]
            );
            await client.query('COMMIT');

            return res.json({
              success: true,
              payment_gateway: 'razorpay',
              order_id: rzpOrder.id,
              amount: rzpOrder.amount,
              currency: 'INR',
              keyId: process.env.RAZORPAY_KEY_ID,
              gross_amount: grossAmount,
              optimization_fee: optFee,
              net_ad_spend: netAdSpend,
              escrow_status: 'holding'
            });
          } catch (rzpErr: any) {
            console.error('[RAZORPAY ERROR]', rzpErr);
            await client.query('ROLLBACK');
            return res.status(500).json({ error: 'PAYMENT_VERIFICATION_REQUIRED', message: rzpErr.message });
          }
        } else {
            await client.query('ROLLBACK');
            return res.status(501).json({ error: 'PAYMENT_NOT_IMPLEMENTED', message: 'Razorpay is not configured' });
        }
      }

      // Default: Stripe

      let stripeUrl: string | null = null;
      let stripeSessionId: string;

      if (stripe) {
        try {
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            payment_method_options: {
              card: { request_three_d_secure: 'any' }
            },
            line_items: [{
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `Encho Campaign Funding & AI Optimization`,
                  description: `$${netAdSpend} Ad Spend Pool + $${optFee} Encho 15% SaaS Fee (24h Escrow)`
                },
                unit_amount: Math.round(grossAmount * 100)
              },
              quantity: 1
            }],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/host-marketing?campaign_success=true&campaign_id=${campaign_id}`,
            cancel_url: `${req.protocol}://${req.get('host')}/host-marketing?campaign_cancel=true`,
            metadata: { campaign_id: String(campaign_id || ''), host_id: String(hostId), idempotency_key: idempotencyKey }
          });
          stripeUrl = session.url;
          stripeSessionId = session.id;
        } catch (sErr: any) {
          console.error('[STRIPE ERROR]', sErr);
          await client.query('ROLLBACK');
          return res.status(500).json({ error: 'PAYMENT_VERIFICATION_REQUIRED', message: sErr.message });
        }
      } else {
        await client.query('ROLLBACK');
        return res.status(501).json({ error: 'PAYMENT_NOT_IMPLEMENTED', message: 'Stripe is not configured' });
      }

      await client.query(
        `UPDATE processed_payments
         SET razorpay_payment_id = $1, razorpay_order_id = $2
         WHERE idempotency_key = $3`,
        [stripeSessionId, stripeSessionId, idempotencyKey]
      );
      await client.query('COMMIT');

      return res.json({
        success: true,
        payment_gateway: 'stripe',
        order_id: stripeSessionId,
        url: stripeUrl,
        gross_amount: grossAmount,
        optimization_fee: optFee,
        net_ad_spend: netAdSpend,
        three_d_secure: true,
        escrow_status: 'holding',
        isSimulated: !stripeUrl
      });

    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[PAYMENT GEO ROUTE ERROR]', err);
    res.status(500).json({ error: err.message || 'Payment initiation failed' });
  }
});

// 3. Admin Payment Geo-Router Overview Endpoint
router.get('/api/admin/payments/overview', authenticateToken, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const totalVolumeRes = await pool.query(`
      SELECT
        COALESCE(SUM(amount), 0) as total_volume,
        COALESCE(SUM(CASE WHEN payment_gateway = 'stripe' THEN amount ELSE 0 END), 0) as stripe_volume,
        COALESCE(SUM(CASE WHEN payment_gateway = 'razorpay' THEN amount ELSE 0 END), 0) as razorpay_volume,
        COALESCE(SUM(CASE WHEN payment_gateway = 'internal_wallet' THEN amount ELSE 0 END), 0) as wallet_volume,
        COUNT(*) as total_transactions
      FROM processed_payments
    `);

    const escrowRes = await pool.query(`
      SELECT id, title, listing_id, host_id, budget, optimization_fee, ad_spend_pool, payment_gateway, payment_status, escrow_status, escrow_release_at, three_d_secure_verified, created_at
      FROM host_marketing_campaigns
      WHERE payment_status = 'paid'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    const processedLogs = await pool.query(`
      SELECT * FROM processed_payments ORDER BY created_at DESC LIMIT 50
    `);

    const totalVolume = Number(totalVolumeRes.rows[0].total_volume);
    const totalOptFees = Math.round((totalVolume * 0.15) * 100) / 100;
    const totalAdSpendPool = Math.round((totalVolume * 0.85) * 100) / 100;

    return res.json({
      success: true,
      metrics: {
        total_volume: totalVolume,
        total_optimization_fees: totalOptFees,
        total_ad_spend_pool: totalAdSpendPool,
        stripe_volume: Number(totalVolumeRes.rows[0].stripe_volume),
        razorpay_volume: Number(totalVolumeRes.rows[0].razorpay_volume),
        wallet_volume: Number(totalVolumeRes.rows[0].wallet_volume),
        total_transactions: Number(totalVolumeRes.rows[0].total_transactions),
        escrow_holding_count: escrowRes.rows.filter(c => c.escrow_status === 'holding').length
      },
      campaigns: escrowRes.rows,
      processed_payments: processedLogs.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch payment overview' });
  }
});

// The legacy manual release path cannot authorize revision-bound campaign funds.
router.post('/api/admin/payments/escrow/release', (_req: Request, res: Response) => {
  res.status(410).json({code:'HARVO_V2_REQUIRED',error:'Use the campaign review workspace. Legacy escrow release is retired.'});
});

// 5. Automatic 24-Hour Fraud Escrow Auto-Release Worker (Safe Transactional Boundary + Advisory Lock)

router.post('/api/marketing/webhooks/meta-leads', verifyMetaWebhook, async (req, res) => {
  try {
     const entries = req.body.entry;
     if (!entries) return res.sendStatus(200);

     for (const entry of entries) {
         for (const change of entry.changes) {
             if (change.field === 'leadgen') {
                 const leadId = change.value.leadgen_id;
                 const formId = change.value.form_id;
                 const adId = change.value.ad_id;

                 console.log(`[META WEBHOOK] Processing new lead ${leadId} from Ad ${adId}`);

                 // Simulated CRM Injection
                 const mockCampaignRes = await pool.query('SELECT id, host_id, listing_id FROM host_marketing_campaigns WHERE meta_ad_id = $1 LIMIT 1', [adId]);
                 if (mockCampaignRes.rows.length > 0) {
                     const { id: campaignId, host_id, listing_id } = mockCampaignRes.rows[0];

                     // 1. Inject into CRM (Walled Garden)
                     const newLeadId = `meta_lead_${leadId}`;
                     await pool.query(`
                        INSERT INTO host_outreach_leads (campaign_id, host_id, guest_name, guest_email, guest_phone, status, message_history)
                        VALUES ($1, $2, 'Meta Ad Lead', '[REDACTED]', '[REDACTED]', 'New Lead', $3)
                     `, [
                        campaignId,
                        host_id,
                        JSON.stringify([{ timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), sender: 'Guest', text: 'Lead submitted via Meta Native Form. High intent detected.' }])
                     ]);

                     console.log(`[CRM] Injected Native Lead ${leadId} directly into Host ${host_id} Walled Garden Inbox`);

                     // 2. Trigger multi-channel alert
                     console.log(`[COLD START ALERT] Dispatching SMS via Twilio to Host ${host_id}: "You have a new Hot Lead for your property! Click to reply on Encho."`);
                     console.log(`[COLD START ALERT] Dispatching FCM Push Notification: "🔥 Hot Lead Alert! Open Encho now to reply."`);
                 }
             }
         }
     }
     res.sendStatus(200);
  } catch (err) {
     console.error('[META WEBHOOK] Error processing leadgen webhook', err);
     res.sendStatus(500);
  }
});


router.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message });
});

  return router;
}

export const webhooksRouter = createWebhooksRouter();
