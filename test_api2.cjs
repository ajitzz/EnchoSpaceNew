const http = require('http');
http.get('http://localhost:3000/api/listings?city=', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Listings with city=:', data.substring(0, 500)));
});
