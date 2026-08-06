const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetStripe1 = `          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{`;

const newStripe1 = `          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            payment_method_options: { card: { request_three_d_secure: 'any' } },
            line_items: [{`;

code = code.split(targetStripe1).join(newStripe1);
fs.writeFileSync('server.ts', code);
console.log('Fixed 3D Secure');
