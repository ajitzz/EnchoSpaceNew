async function run() {
  const token = process.env.META_ACCESS_TOKEN;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  
  // Using an app token to debug the access token
  const appToken = `${appId}|${appSecret}`;
  
  const res = await fetch(`https://graph.facebook.com/v20.0/debug_token?input_token=${token}&access_token=${appToken}`);
  console.log(await res.json());
}
run();
