const http = require('http');

// First let's get a listing id
const req1 = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/marketing/campaigns',
  method: 'GET',
  headers: {
    'Authorization': `Bearer test-token`
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const campaigns = JSON.parse(data);
      if (campaigns.length > 0) {
        const id = campaigns[0].id;
        
        // Then subscribe
        const req2 = http.request({
          hostname: 'localhost',
          port: 3000,
          path: `/api/marketing/campaigns/${id}/subscribe`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer test-token`
          }
        }, res2 => {
          let data2 = '';
          res2.on('data', chunk => data2 += chunk);
          res2.on('end', () => {
            console.log("Status:", res2.statusCode);
            console.log("Response:", data2);
          });
        });
        req2.write(JSON.stringify({ gateway: 'sandbox', amount: 100 }));
        req2.end();
      }
    } catch(e) {
      console.log(e);
    }
  });
});
req1.end();
