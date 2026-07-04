const http = require('http');
http.get('http://localhost:3000/api/listings', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Listings response:', data.substring(0, 1000)));
});
