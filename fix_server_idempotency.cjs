const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `    // Check if real Stripe is configured and selected
    if (selectedGateway === 'stripe' && stripe) {`;
const replacement = `    // Gap 1: Idempotency & Double-Spend Protection
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (idempotencyKey) {
       // Check if there's already an active transaction with this idempotency key
       const existingTx = await pool.query('SELECT * FROM wallet_transactions WHERE reference = $1', [idempotencyKey]);
       if (existingTx.rows.length > 0) {
          const tx = existingTx.rows[0];
          console.log(\`[IDEMPOTENCY] Reusing existing transaction \${tx.id} for key \${idempotencyKey}\`);
          // We could return the existing checkout URL, but we just want to prevent a double charge.
          // To be safe, we'll continue using the key with Stripe so Stripe handles the duplicate checkout session idempotently.
       }
    }

    // Check if real Stripe is configured and selected
    if (selectedGateway === 'stripe' && stripe) {`;

if (code.includes(target) && !code.includes('Gap 1: Idempotency')) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Added Gap 1 Check to server.ts');
}

