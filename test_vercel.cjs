const https = require('https');
https.get('https://encho-enterprises-whats-app-leads-h.vercel.app/api/experiences', (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log(data.substring(0, 500)));
});
