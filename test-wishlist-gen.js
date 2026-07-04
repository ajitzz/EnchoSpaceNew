const jwt = require('jsonwebtoken');

const token = jwt.sign(
  { id: 1, email: 'admin@demo.com', name: 'Demo Data', role: 'admin' }, 
  process.env.JWT_SECRET || 'fallback_secret_key_12345', 
  { expiresIn: '24h' }
);
console.log(token);
