const http = require('http');

// First let's get a listing id
const req1 = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/listings',
  method: 'GET'
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const listings = JSON.parse(data);
      if (listings.length > 0) {
        const id = listings[0].id;
        
        // Then get targeting recs
        const req2 = http.request({
          hostname: 'localhost',
          port: 3000,
          path: `/api/marketing/recommend-targeting?listing_id=${id}`,
          method: 'GET',
          headers: {
            'Authorization': `Bearer test-token`
          }
        }, res2 => {
          let data2 = '';
          res2.on('data', chunk => data2 += chunk);
          res2.on('end', () => {
            console.log(data2);
          });
        });
        req2.end();
      }
    } catch(e) {}
  });
});
req1.end();
