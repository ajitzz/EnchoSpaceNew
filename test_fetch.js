import fetch from 'node-fetch'; // if available
// or just use native fetch if node 18+
async function test() {
  const res = await fetch('http://localhost:3000/api/marketing/campaigns');
  console.log(res.status);
  console.log(await res.text());
}
test();
