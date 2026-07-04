const https = require('https');
https.get('https://ais-dev-njsd4zzogdpl7w7padqunm-161944764333.asia-southeast1.run.app/api/listings?city=all', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    let listings = JSON.parse(data);
    res = listings.map(l => ({ id: l.id, title: l.title, price: l.price, rooms: l.rooms.map(r => r.price) }));
    console.log(JSON.stringify(res, null, 2));
  });
});
