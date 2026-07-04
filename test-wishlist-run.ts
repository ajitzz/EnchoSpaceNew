import jwt from 'jsonwebtoken';
const token = jwt.sign(
  { id: 1, email: 'admin@demo.com', name: 'Demo Data', role: 'admin' }, 
  process.env.JWT_SECRET || 'fallback_secret_key_12345', 
  { expiresIn: '24h' }
);
const url = 'http://localhost:3000/api/wishlists';

fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  .then(res => res.text().then(text => console.log(res.status, text)));
