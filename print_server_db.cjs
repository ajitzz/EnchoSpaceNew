const http = require('http');
const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/seed-ajith',
  method: 'GET'
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Response:', data));
});
req.end();
