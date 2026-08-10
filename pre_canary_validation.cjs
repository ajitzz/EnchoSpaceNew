const https = require('https');
require('dotenv').config({ override: true });

async function fetchMeta(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function run() {
  const token = process.env.META_ACCESS_TOKEN;
  const appId = process.env.META_APP_ID;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  
  console.log("=== RUNTIME CONFIG ===");
  console.log("META_APP_ID:", appId);
  console.log("META_APP_MODE:", process.env.META_APP_MODE);
  console.log("META_CANARY_2_READY:", process.env.META_CANARY_2_READY);
  console.log("META_AD_ACCOUNT_ID:", adAccountId);
  console.log("META_APP_SECRET IS SET:", !!process.env.META_APP_SECRET);

  console.log("\n=== TOKEN FORENSICS ===");
  const debugTokenUrl = `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`;
  const tokenData = await fetchMeta(debugTokenUrl);
  console.log(JSON.stringify(tokenData.data, null, 2));

  console.log("\n=== AD ACCOUNT FORENSICS ===");
  const cleanAdAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const adAccountUrl = `https://graph.facebook.com/v20.0/${cleanAdAccountId}?fields=id,name,account_status,disable_reason,currency,timezone_name,funding_source_details,owner,spend_cap,amount_spent&access_token=${token}`;
  const adAccountData = await fetchMeta(adAccountUrl);
  console.log(JSON.stringify(adAccountData, null, 2));
}

run().catch(console.error);
