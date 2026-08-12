const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// For Razorpay fallback:
code = code.replace(
  /\} catch \(rzpErr\) \{\s+console\.warn\('\[RAZORPAY CREATION WARN\] Using fallback simulation mode:', rzpErr\);\s+\}\s+\}\s+await client\.query\(\s+`UPDATE processed_payments[\s\S]*?isSimulated: true\s+\}\);/g,
  `} catch (rzpErr: any) {
            console.error('[RAZORPAY ERROR]', rzpErr);
            await client.query('ROLLBACK');
            return res.status(500).json({ error: 'PAYMENT_VERIFICATION_REQUIRED', message: rzpErr.message });
          }
        } else {
            await client.query('ROLLBACK');
            return res.status(501).json({ error: 'PAYMENT_NOT_IMPLEMENTED', message: 'Razorpay is not configured' });
        }`
);

// We need to also fix the const orderId declaration:
code = code.replace(
  /const orderId = `order_rzp_\$\{Date\.now\(\)\}_\$\{Math\.random\(\)\.toString\(36\)\.substring\(2, 7\)\}`;/g,
  ''
);

fs.writeFileSync('server.ts', code);
console.log("Payment RZP patched.");
