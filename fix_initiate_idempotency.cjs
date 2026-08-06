const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetIdempotency = `      if (targetGateway === 'internal_wallet') {
        let walletRes = await client.query('SELECT * FROM host_wallets WHERE host_id = $1 FOR UPDATE', [hostId]);`;

const newIdempotency = `      // Pre-insert into processed_payments to claim the idempotency key (Double-Spend Protection)
      await client.query(
        \`INSERT INTO processed_payments (idempotency_key, type, reference_id, amount, payment_gateway)
         VALUES ($1, 'campaign_funding_init', $2, $3, $4)\`,
        [idempotencyKey, String(campaign_id || ''), grossAmount, gateway || 'stripe']
      );

      if (targetGateway === 'internal_wallet') {
        let walletRes = await client.query('SELECT * FROM host_wallets WHERE host_id = $1 FOR UPDATE', [hostId]);`;

code = code.replace(targetIdempotency, newIdempotency);
fs.writeFileSync('server.ts', code);
console.log('Fixed Idempotency Insert');
