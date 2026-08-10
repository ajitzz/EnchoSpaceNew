async function run() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const verifyToken = `${appId}|${appSecret}`;
  const res = await fetch(`https://graph.facebook.com/v20.0/${appId}?fields=is_in_development_mode&access_token=${verifyToken}`);
  console.log(await res.json());
}
run();
