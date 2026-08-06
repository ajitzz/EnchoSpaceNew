const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetIdempotency2 = `        // Save idempotency record
        await client.query(
          \`INSERT INTO processed_payments (razorpay_payment_id, razorpay_order_id, idempotency_key, type, reference_id, payment_gateway, amount, currency)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)\`,
          [\`wtx_\${txInsert.rows[0].id}\`, \`worder_\${Date.now()}\`, idempotencyKey, 'campaign_funding', String(campaign_id || ''), 'internal_wallet', grossAmount, 'USD']
        );`;

const newIdempotency2 = `        // Update pre-inserted idempotency record
        await client.query(
          \`UPDATE processed_payments
           SET razorpay_payment_id = $1, razorpay_order_id = $2
           WHERE idempotency_key = $3\`,
          [\`wtx_\${txInsert.rows[0].id}\`, \`worder_\${Date.now()}\`, idempotencyKey]
        );`;

code = code.replace(targetIdempotency2, newIdempotency2);
fs.writeFileSync('server.ts', code);
console.log('Fixed Idempotency Wallet update');
