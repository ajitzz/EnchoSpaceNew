async function run() {
  const fetch = (await import('node-fetch')).default;
  const pageId = process.env.META_PAGE_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=access_token&access_token=${accessToken}`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run();
