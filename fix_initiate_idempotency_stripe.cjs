const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetIdempotency5 = `      await client.query(
        \`INSERT INTO processed_payments (razorpay_payment_id, razorpay_order_id, idempotency_key, type, reference_id, payment_gateway, amount, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)\`,
        [intentId, intentId, idempotencyKey, 'campaign_funding', String(campaign_id || ''), 'stripe', grossAmount, 'USD']
      );`;

const newIdempotency5 = `      await client.query(
        \`UPDATE processed_payments
         SET razorpay_payment_id = $1, razorpay_order_id = $2
         WHERE idempotency_key = $3\`,
        [intentId, intentId, idempotencyKey]
      );`;

code = code.replace(targetIdempotency5, newIdempotency5);
fs.writeFileSync('server.ts', code);
console.log('Fixed Idempotency Stripe update');
