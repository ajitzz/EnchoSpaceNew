const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
const rzp = lines.findIndex(l => l.includes("app.post('/api/payments/razorpay/webhook'"));
if (rzp !== -1) {
    console.log(lines.slice(rzp + 45, rzp + 70).join('\n'));
}
