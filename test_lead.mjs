import fetch from 'node-fetch';

async function testAlert() {
  const res = await fetch('http://localhost:3000/api/marketing/internal/simulate-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: 'lead', ad_id: 1, mock_lead_id: 'L123' })
  });
  console.log(await res.text());
}
testAlert();
