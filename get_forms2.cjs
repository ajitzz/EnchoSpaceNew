const { Pool } = require('pg');

async function run() {
  const realToken = process.env.META_ACCESS_TOKEN;
  if (realToken) {
     const pageId = process.env.META_PAGE_ID || '554884541034223';
     const fetch = (await import('node-fetch')).default;
     const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/leadgen_forms?access_token=${realToken}`);
     const data = await res.json();
     console.log(JSON.stringify(data, null, 2));
  } else {
     console.log("No real token found");
  }
}
run();
