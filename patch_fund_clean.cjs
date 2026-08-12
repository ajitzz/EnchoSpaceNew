const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /\} catch \(razorpayErr: any\) \{[\s\S]*?payment_intent_id: mockIntentId\s+\}\);\s+\} catch \(error\) \{/g;
code = code.replace(regex, `} catch (razorpayErr: any) {
        console.error('[RAZORPAY ORDER FAILED]', razorpayErr);
        return res.status(500).json({ success: false, message: 'PAYMENT_VERIFICATION_REQUIRED', error: razorpayErr.message });
      }
    } else {
      return res.status(501).json({ success: false, message: 'PAYMENT_NOT_IMPLEMENTED', error: 'Gateway not configured' });
    }
  } catch (error) {`);

fs.writeFileSync('server.ts', code);
console.log("Mock funding simulator purged.");
