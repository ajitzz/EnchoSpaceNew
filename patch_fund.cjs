const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /\} catch \(razorpayErr: any\) \{\s+console\.error\('\[RAZORPAY ORDER FAILED\] Falling back to high-fidelity sandboxed billing simulator:', razorpayErr\);\s+\}\s+\}\s+const mockIntentId = `\$\{selectedGateway === 'stripe' \? 'pi_' : 'pay_'\}\$\{Math\.floor\(1000000 \+ Math\.random\(\) \* 9000000\)\}`;/g,
  `} catch (razorpayErr: any) {
        console.error('[RAZORPAY ORDER FAILED]', razorpayErr);
        return res.status(500).json({ success: false, message: 'PAYMENT_VERIFICATION_REQUIRED', error: razorpayErr.message });
      }
    } else {
        return res.status(501).json({ success: false, message: 'PAYMENT_NOT_IMPLEMENTED', error: 'Gateway not configured' });
    }
`
);

// We need to also fix stripe catch in this route around line 7875 probably. Let's check lines 7870-7900
