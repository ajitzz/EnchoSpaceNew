const accessToken = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
const rawAdAccountId = process.env.META_AD_ACCOUNT_ID;
const appId = process.env.META_APP_ID || '1347659864208278';
const baseUrl = process.env.META_BASE_URL || "https://graph.facebook.com/v20.0";
async function test() {
  console.log("Token:", accessToken ? "Present" : "Missing");
  console.log("Ad Account:", rawAdAccountId ? "Present" : "Missing");
  console.log("App ID:", appId);
  
  if (!accessToken || !rawAdAccountId) return;
  const cleanAdAccountId = rawAdAccountId.startsWith('act_') ? rawAdAccountId : `act_${rawAdAccountId}`;

  try {
    const tokenRes = await fetch(`${baseUrl}/me?fields=id,name&access_token=${accessToken}`);
    console.log("/me:", await tokenRes.json());
  } catch (e) {
    console.error("/me error:", e);
  }

  try {
    const adRes = await fetch(`${baseUrl}/${cleanAdAccountId}?fields=account_status,disable_reason&access_token=${accessToken}`);
    console.log("Ad Account:", await adRes.json());
  } catch (e) {
    console.error("Ad Account error:", e);
  }

  try {
    const appRes = await fetch(`${baseUrl}/${appId}?fields=is_in_development_mode&access_token=${accessToken}`);
    console.log("App Mode:", await appRes.json());
  } catch (e) {
    console.error("App Mode error:", e);
  }
}
test();
