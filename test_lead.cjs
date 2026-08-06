const fetch = require('node-fetch');

async function testAlert() {
  const res = await fetch('http://localhost:3000/api/marketing/internal/test-lead-alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_id: 1, listing_id: 1, message_id: 123 })
  });
  console.log(await res.text());
}
testAlert();
