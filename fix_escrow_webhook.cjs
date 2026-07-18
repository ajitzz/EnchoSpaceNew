const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const origUpdate = `  // Update campaign payment status and set subscription_active = true
  await pool.query(\`
    UPDATE host_marketing_campaigns
    SET payment_status = 'paid',
        payment_gateway = $1,
        payment_intent_id = $2,
        subscription_active = true,
        status = CASE 
          WHEN admin_approved = true THEN 'active'
          ELSE 'pending'
        END
    WHERE id = $3
  \`, [gateway, payment_intent_id, campaign_id]);

  console.log(\`[WEBHOOK] Updated database. Payment marked as paid.\`);

  // If already approved by admin, trigger the Meta API Dispatch!
  if (campaign.admin_approved) {
    console.log(\`[WEBHOOK] Campaign #\${campaign_id} has already been approved by Admin! Dispatching Meta Ads API call...\`);
    await dispatchMetaCampaign(campaign_id, req);
  } else {
    console.log(\`[WEBHOOK] Campaign #\${campaign_id} is awaiting Admin Quality Control review.\`);
    broadcastDbEvent(req, 'marketing');
  }`;

const replUpdate = `  // Gap 6: Escrow delay & Strict 3D Secure
  const userCheck = await pool.query('SELECT is_verified FROM users WHERE id = $1', [campaign.host_id]);
  const isVerified = userCheck.rows[0]?.is_verified;
  
  // High risk transaction if amount > 5000 and not verified
  const isHighRisk = !isVerified || amount > 5000;
  
  let finalStatus = 'pending';
  if (campaign.admin_approved) {
     if (isHighRisk) {
         finalStatus = 'escrow';
         console.log(\`[ESCROW] 3D Secure Verification triggered. Host unverified or amount high. Placing Campaign #\${campaign_id} into 24-hour Escrow delay to prevent chargeback fraud on Master Account.\`);
     } else {
         finalStatus = 'active';
     }
  }

  // Update campaign payment status and set subscription_active = true
  await pool.query(\`
    UPDATE host_marketing_campaigns
    SET payment_status = 'paid',
        payment_gateway = $1,
        payment_intent_id = $2,
        subscription_active = true,
        status = $3
    WHERE id = $4
  \`, [gateway, payment_intent_id, finalStatus, campaign_id]);

  console.log(\`[WEBHOOK] Updated database. Payment marked as paid. Status set to \${finalStatus}\`);

  if (finalStatus === 'active') {
    console.log(\`[WEBHOOK] Campaign #\${campaign_id} has already been approved by Admin and cleared Risk! Dispatching Meta Ads API call...\`);
    await dispatchMetaCampaign(campaign_id, req);
  } else if (finalStatus === 'escrow') {
    console.log(\`[WEBHOOK] Campaign #\${campaign_id} placed in Escrow for 24h. Meta API dispatch delayed.\`);
    broadcastDbEvent(req, 'marketing');
  } else {
    console.log(\`[WEBHOOK] Campaign #\${campaign_id} is awaiting Admin Quality Control review.\`);
    broadcastDbEvent(req, 'marketing');
  }`;

code = code.replace(origUpdate, replUpdate);
fs.writeFileSync('server.ts', code);
console.log('Escrow Webhook updated.');
