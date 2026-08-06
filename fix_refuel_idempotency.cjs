const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const t = `    if (txRes.rows.length > 0) {
       txId = txRes.rows[0].id;
       if (txRes.rows[0].status === 'completed') {
          return res.status(400).json({ error: 'Transaction already completed' });
       }
    } else {
       const newTx = await pool.query(
         \`INSERT INTO wallet_transactions (wallet_id, amount, type, reference_id, status, description) 
          VALUES ($1, $2, 'refuel', $3, 'pending', $4) RETURNING id\`,
         [walletId, netAmount, idempotencyKey, \`Refuel Wallet: \${amount} (Fee: \${optimizationFee})\`]
       );
       txId = newTx.rows[0].id;
    }`;

const r = `    if (txRes.rows.length > 0) {
       txId = txRes.rows[0].id;
       if (txRes.rows[0].status === 'completed') {
          return res.status(400).json({ error: 'Transaction already completed' });
       }
    } else {
       try {
           const newTx = await pool.query(
             \`INSERT INTO wallet_transactions (wallet_id, amount, type, reference_id, status, description) 
              VALUES ($1, $2, 'refuel', $3, 'pending', $4) RETURNING id\`,
             [walletId, netAmount, idempotencyKey, \`Refuel Wallet: \${amount} (Fee: \${optimizationFee})\`]
           );
           txId = newTx.rows[0].id;
       } catch (err: any) {
           if (err.code === '23505') { // Unique constraint violation
               const existingTxRes = await pool.query('SELECT id, status FROM wallet_transactions WHERE reference_id = $1', [idempotencyKey]);
               if (existingTxRes.rows.length > 0) {
                   txId = existingTxRes.rows[0].id;
                   if (existingTxRes.rows[0].status === 'completed') {
                       return res.status(400).json({ error: 'Transaction already completed' });
                   }
               } else {
                   throw err;
               }
           } else {
               throw err;
           }
       }
    }`;

code = code.replace(t, r);
fs.writeFileSync('server.ts', code);
console.log('Fixed refuel idempotency check');
