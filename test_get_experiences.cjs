const jwt = require('jsonwebtoken');

async function test() {
  const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
  const token = jwt.sign({ id: 1, role: 'admin', email: 'ajithsabzz@gmail.com' }, JWT_SECRET, { expiresIn: '7d' });
  const res = await fetch('http://localhost:3000/api/experiences?host_id=1', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(res.status);
  const data = await res.json();
  console.log('Length:', data.length);
  if (data.error) console.log(data);
}
test();
