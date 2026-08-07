async function run() {
  const fetch = (await import('node-fetch')).default;
  const pageId = process.env.META_PAGE_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const formRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/leadgen_forms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      name: `Encho Lead Form Test`,
      questions: [
        { type: 'FULL_NAME', label: 'Full Name' },
        { type: 'EMAIL', label: 'Email' },
        { type: 'PHONE', label: 'Phone Number' }
      ],
      privacy_policy: {
        url: `https://encho-space-chi.vercel.app/privacy`,
        text: 'Your privacy is protected under Encho Walled Garden Policy.'
      },
      thank_you_screen: {
        title: 'Thank you for your reservation inquiry!',
        body: 'An Encho host specialist will connect with you via Encho Walled Garden CRM Inbox within 5 minutes.'
      }
    })
  });
  const formData = await formRes.json();
  console.log(JSON.stringify(formData, null, 2));
}
run();
