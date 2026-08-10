async function run() {
  const token = process.env.META_ACCESS_TOKEN;
  const res = await fetch(`https://graph.facebook.com/v20.0/app?access_token=${token}`);
  console.log(await res.json());
}
run();
