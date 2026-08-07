async function run() {
  const fetch = (await import('node-fetch')).default;
  const pageId = process.env.META_PAGE_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const formRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/leadgen_forms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      name: `Encho Lead Form Test ` + Date.now(),
      questions: [
        { type: 'FULL_NAME' },
        { type: 'EMAIL' },
        { type: 'PHONE' }
      ],
      privacy_policy: {
        url: `https://encho-space-chi.vercel.app/privacy`,
        link_text: 'Your privacy is protected under Encho Walled Garden Policy.'
      }
    })
  });
  const formData = await formRes.json();
  console.log(JSON.stringify(formData, null, 2));
}
run();
