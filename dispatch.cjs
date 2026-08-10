const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin/dispatch-meta-campaign',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-debug-admin-override': 'true', // Assuming some auth bypass for admin
  }
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
});

req.on('error', console.error);
req.write(JSON.stringify({ campaignId: 112 }));
req.end();
