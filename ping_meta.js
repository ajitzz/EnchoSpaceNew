const META_TOKEN = process.env.META_ACCESS_TOKEN || "EAATJsIN785YBSNAqz2ZA09tZCYiS7xtoZCnYSu0rxL0J4Pc0ZB41Aw3L5ZBdJ1lwmtLWKOpBHPD3HKUuGCat027lZA9PoTY0b4xEFZBf7ttWnIUSooBRTZBmg7Xr0buy8pIWNKJVTsi1sY747pkCpYZBA1iZBj33ZAPmCl8Vgr2SDzh3N2lSNPZBOCLJy0cdxHlptgZDZD";
const AD_ACCOUNT_ID = "act_1681483723153196";

async function pingMeta() {
  console.log("🚀 Pinging Meta Ads API to unlock Advanced Access...");
  
  try {
    // We request the campaigns list for the Ad Account. 
    // This specifically triggers the 'ads_management' and 'ads_read' permission usage.
    const url = `https://graph.facebook.com/v19.0/${AD_ACCOUNT_ID}/campaigns?access_token=${META_TOKEN}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok) {
      console.log("✅ SUCCESS! Meta has registered your API call.");
      console.log("Data returned:", JSON.stringify(data).substring(0, 100) + "...");
      console.log("\n🎯 NEXT STEP: Go refresh your Meta App Review page. The 'Request advanced access' button should now be clickable (it may take up to 30-60 mins for Meta's UI to sync, but usually it is instant).");
    } else {
      console.error("❌ FAILED:", data.error.message);
    }
  } catch (err) {
    console.error("Network Error:", err);
  }
}

pingMeta();
