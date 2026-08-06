const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (idempotencyKey) {
       // Check if there's already an active transaction with this idempotency key
       const existingTx = await pool.query('SELECT * FROM wallet_transactions WHERE reference_id = $1', [idempotencyKey]);
       if (existingTx.rows.length > 0) {
          const tx = existingTx.rows[0];
          console.log(\`[IDEMPOTENCY] Reusing existing transaction \${tx.id} for key \${idempotencyKey}\`);
       }
    }`;

const replacement = `    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (idempotencyKey) {
       // Check if there's already an active transaction with this idempotency key
       const existingTx = await pool.query('SELECT * FROM wallet_transactions WHERE reference_id = $1', [idempotencyKey]);
       if (existingTx.rows.length > 0) {
          const tx = existingTx.rows[0];
          console.log(\`[IDEMPOTENCY] Reusing existing transaction \${tx.id} for key \${idempotencyKey}\`);
          
          if (tx.status === 'completed') {
             // Idempotent replay: already deducted and processed
             return res.json({ 
                success: true, 
                message: 'Campaign already subscribed and launched via idempotency replay.' 
             });
          }
       }
    }`;

code = code.replace(target, replacement);
fs.writeFileSync('server.ts', code);
console.log('Fixed idempotency logic');
