const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetIdempotency3 = `            await client.query(
              \`INSERT INTO processed_payments (razorpay_order_id, idempotency_key, type, reference_id, payment_gateway, amount, currency)
               VALUES ($1, $2, $3, $4, $5, $6, $7)\`,
              [rzpOrder.id, idempotencyKey, 'campaign_funding', String(campaign_id || ''), 'razorpay', grossAmount, 'INR']
            );`;

const newIdempotency3 = `            await client.query(
              \`UPDATE processed_payments
               SET razorpay_order_id = $1, currency = 'INR'
               WHERE idempotency_key = $2\`,
              [rzpOrder.id, idempotencyKey]
            );`;

const targetIdempotency4 = `        await client.query(
          \`INSERT INTO processed_payments (razorpay_order_id, idempotency_key, type, reference_id, payment_gateway, amount, currency)
           VALUES ($1, $2, $3, $4, $5, $6, $7)\`,
          [orderId, idempotencyKey, 'campaign_funding', String(campaign_id || ''), 'razorpay', grossAmount, 'INR']
        );`;

const newIdempotency4 = `        await client.query(
          \`UPDATE processed_payments
           SET razorpay_order_id = $1, currency = 'INR'
           WHERE idempotency_key = $2\`,
          [orderId, idempotencyKey]
        );`;

code = code.replace(targetIdempotency3, newIdempotency3);
code = code.replace(targetIdempotency4, newIdempotency4);
fs.writeFileSync('server.ts', code);
console.log('Fixed Idempotency RZP update');
