async function run() {
  const fetch = (await import('node-fetch')).default;
  const pageId = process.env.META_PAGE_ID;
  const accessToken = "EAATJsIN785YBSDNxo2QOTZAIarl6tzeyByTXbmzZA2tJFyDD88RNO64JRaUPg93VstbEISDluQEV4EBxtmN4OPLWrXdgna5RGfSZCiChPsvSu7OqUZA5AArzZBXv1kitUgfhmll1pLMNDBPZC2J3V1EZBLZBmTkFZC18mjaiF2hxqMqlSTtHiwSjYpZAQH7Up6i2ghrCe8IBPO";
  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/leadgen_forms?access_token=${accessToken}`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run();
