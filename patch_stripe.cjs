const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /\} catch \(sErr\) \{\s+console\.warn\('\[STRIPE SESSION CREATION WARN\] Using fallback simulation session:', sErr\);\s+\}\s+\}\s+await client\.query\(/g,
  `} catch (sErr: any) {
          console.error('[STRIPE ERROR]', sErr);
          await client.query('ROLLBACK');
          return res.status(500).json({ error: 'PAYMENT_VERIFICATION_REQUIRED', message: sErr.message });
        }
      } else {
        await client.query('ROLLBACK');
        return res.status(501).json({ error: 'PAYMENT_NOT_IMPLEMENTED', message: 'Stripe is not configured' });
      }
      
      await client.query(`
);

code = code.replace(
  /const intentId = `pi_stripe_\$\{Date\.now\(\)\}_\$\{Math\.random\(\)\.toString\(36\)\.substring\(2, 7\)\}`;/g,
  ''
);

code = code.replace(
  /\[intentId, intentId, idempotencyKey\]/g,
  `[session.id, session.id, idempotencyKey]`
);

code = code.replace(
  /order_id: intentId,/g,
  `order_id: session.id,`
);

code = code.replace(
  /url: stripeUrl \|\| `\$\{req\.protocol\}:\/\/\$\{req\.get\('host'\)\}\/host-marketing\?campaign_success=true&campaign_id=\$\{campaign_id\}`/g,
  `url: stripeUrl`
);


fs.writeFileSync('server.ts', code);
console.log("Stripe mock patched.");
