const http = require('http');

setTimeout(() => {
  http.get('http://localhost:3000/api/seed-ajith', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Response:', data));
  }).on('error', err => console.error(err));
}, 2000);
