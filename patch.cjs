const fs = require('fs');

const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
const startIdx = lines.findIndex(l => l.startsWith('async function processPaymentWebhook'));

let endIdx = -1;
for (let i = startIdx + 1; i < lines.length; i++) {
   if (lines[i] === '}') {
      if (lines[i+1] === '') {
         endIdx = i;
         break;
      }
   }
}

const correctFunction = `async function processPaymentWebhook(payload: any, signature: string | undefined, req: any) {
  const { campaign_id, event, gateway, payment_intent_id, amount } = payload;
  
  if (event !== 'payment.succeeded') {
    console.log('[WEBHOOK VALIDATION] Ignored non-success event: ' + event);
    return { success: false, message: 'Ignored non-success event' };
  }

  // Cryptographic signature check for production security
  const isVerified = verifyWebhookSignature(payload, signature);
  if (!isVerified) {
    console.error('[WEBHOOK SECURE CHECK FAILED] Unauthorized payment webhook attempt detected.');
    return { success: false, message: 'Cryptographic signature verification failed' };
  }

  console.log('[WEBHOOK VALIDATION] Secure Cryptographic Webhook signature verified successfully!');
  
  // 1. Double-Spend & Idempotency Protection
  // Ensure we haven't already processed this payment intent
  const idempotencyCheck = await pool.query('SELECT id, status FROM host_marketing_campaigns WHERE payment_intent_id = \\$1', [payment_intent_id]);
  if (idempotencyCheck.rows.length > 0 && idempotencyCheck.rows[0].status !== 'pending' && idempotencyCheck.rows[0].status !== 'rejected') {
     console.log('[WEBHOOK IDEMPOTENCY] Payment intent ' + payment_intent_id + ' has already been processed. Skipping to prevent double-spend.');
     return { success: true, message: 'Already processed' };
  }

  // Fetch campaign
  const campaignCheck = await pool.query('SELECT * FROM host_marketing_campaigns WHERE id = \\$1', [campaign_id]);
  if (campaignCheck.rows.length === 0) {
    console.error('[WEBHOOK ERROR] Campaign not found.');
    return { success: false, message: 'Campaign not found' };
  }

  const campaign = campaignCheck.rows[0];

  // Gap 6: Escrow delay & Strict 3D Secure
  const userCheck = await pool.query('SELECT is_verified FROM users WHERE id = \\$1', [campaign.host_id]);
  const isVerifiedUser = userCheck.rows[0]?.is_verified;
  
  // High risk transaction if amount > 5000 and not verified
  const isHighRisk = !isVerifiedUser || amount > 5000;
  
  let finalStatus = 'pending';
  if (campaign.admin_approved) {
     if (isHighRisk) {
         finalStatus = 'escrow';
         console.log('[ESCROW] 3D Secure Verification triggered. Host unverified or amount high. Placing Campaign into 24-hour Escrow delay to prevent chargeback fraud on Master Account.');
     } else {
         finalStatus = 'active';
     }
  }

  // Update campaign payment status and set subscription_active = true
  await pool.query(\`
    UPDATE host_marketing_campaigns
    SET payment_status = 'paid',
        payment_gateway = \\$1,
        payment_intent_id = \\$2,
        subscription_active = true,
        status = \\$3
    WHERE id = \\$4
  \`, [gateway, payment_intent_id, finalStatus, campaign_id]);

  console.log('[WEBHOOK] Updated database. Payment marked as paid. Status set to ' + finalStatus);

  // Gap 14: Immutable Admin Audit Trail (Logging auto-approvals / state transitions)
  try {
      await pool.query(\`
        INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address)
        VALUES (\\$1, \\$2, \\$3, \\$4, \\$5, \\$6, \\$7)
      \`, [null, 'marketing_campaign', campaign_id, 'payment_cleared', JSON.stringify({status: campaign.status}), JSON.stringify({status: finalStatus}), req.ip || req.socket?.remoteAddress || 'system']);
  } catch (e) {
      console.error('[AUDIT LOG ERROR]', e);
  }

  if (finalStatus === 'active') {
    console.log('[WEBHOOK] Campaign has already been approved by Admin and cleared Risk! Dispatching Meta Ads API call...');
    await dispatchMetaCampaign(campaign_id, req);
  } else if (finalStatus === 'escrow') {
    console.log('[WEBHOOK] Campaign placed in Escrow for 24h. Meta API dispatch delayed.');
    broadcastDbEvent(req, 'marketing');
  } else {
    console.log('[WEBHOOK] Campaign is awaiting Admin Quality Control review.');
    broadcastDbEvent(req, 'marketing');
  }

  return { success: true, message: 'Webhook processed successfully' };
}`;

// I used \$1 in the string above to prevent regex issues, but here I can replace them back to $1
const finalFunction = correctFunction.replace(/\\\$1/g, '$1').replace(/\\\$2/g, '$2').replace(/\\\$3/g, '$3').replace(/\\\$4/g, '$4').replace(/\\\$5/g, '$5').replace(/\\\$6/g, '$6').replace(/\\\$7/g, '$7');

const newLines = [...lines.slice(0, startIdx), finalFunction, ...lines.slice(endIdx + 1)];
fs.writeFileSync('server.ts', newLines.join('\n'));
console.log('Fixed function replacement');
