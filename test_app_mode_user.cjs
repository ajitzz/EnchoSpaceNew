async function run() {
  const token = process.env.META_ACCESS_TOKEN;
  const res = await fetch(`https://graph.facebook.com/v20.0/1347659864208278?fields=is_in_development_mode&access_token=${token}`);
  console.log(await res.json());
}
run();
