const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/keep-alive', // Just checking the server is up after these changes
  method: 'GET'
};

const req = http.request(options, res => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
