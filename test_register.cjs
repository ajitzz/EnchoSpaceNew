const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('Register Response:', data);
  });
});

req.write(JSON.stringify({name: 'Ajith', email: 'ajithsabzz@gmail.com', password: 'password123', role: 'admin'}));
req.end();
