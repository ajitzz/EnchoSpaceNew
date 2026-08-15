import dotenv from 'dotenv';
dotenv.config();

const META_ACCESS_TOKEN = process.env.META_API_TOKEN || process.env.META_ACCESS_TOKEN;
const META_GRAPH_VERSION = 'v20.0';

async function main() {
  console.log("=== FORENSIC META GRAPH API GET QUERY (READ-ONLY) ===");
  console.log("Token available:", Boolean(META_ACCESS_TOKEN));

  const metaCampaignId = '120249817491520673';
  const metaAdsetId = '120249817492850673';
  const metaAdId = '120249817496890673';

  try {
    // 1. Query Campaign
    console.log(`\n1. Fetching Meta Campaign ${metaCampaignId}...`);
    const campUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${metaCampaignId}?fields=id,name,status,effective_status,configured_status,buying_type,objective,issues_info,recommendations&access_token=${META_ACCESS_TOKEN}`;
    const campRes = await fetch(campUrl);
    const campData = await campRes.json();
    console.log("Campaign Response:", JSON.stringify(campData, null, 2));

    // 2. Query AdSet
    console.log(`\n2. Fetching Meta AdSet ${metaAdsetId}...`);
    const adsetUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${metaAdsetId}?fields=id,name,status,effective_status,configured_status,campaign_id,issues_info,optimization_goal,billing_event&access_token=${META_ACCESS_TOKEN}`;
    const adsetRes = await fetch(adsetUrl);
    const adsetData = await adsetRes.json();
    console.log("AdSet Response:", JSON.stringify(adsetData, null, 2));

    // 3. Query Ad
    console.log(`\n3. Fetching Meta Ad ${metaAdId}...`);
    const adUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${metaAdId}?fields=id,name,status,effective_status,configured_status,adset_id,creative,issues_info,recommendations&access_token=${META_ACCESS_TOKEN}`;
    const adRes = await fetch(adUrl);
    const adData = await adRes.json();
    console.log("Ad Response:", JSON.stringify(adData, null, 2));

    // 4. Query AdSet's Ads list
    console.log(`\n4. Fetching all Ads in AdSet ${metaAdsetId}...`);
    const adsInAdsetUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${metaAdsetId}/ads?fields=id,name,status,effective_status,configured_status,creative,issues_info&access_token=${META_ACCESS_TOKEN}`;
    const adsInAdsetRes = await fetch(adsInAdsetUrl);
    const adsInAdsetData = await adsInAdsetRes.json();
    console.log("All Ads in AdSet:", JSON.stringify(adsInAdsetData, null, 2));

    // 5. Query Insights
    console.log(`\n5. Fetching Campaign Insights for ${metaCampaignId}...`);
    const insightsUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${metaCampaignId}/insights?fields=impressions,clicks,spend,reach,actions,cpc,cpm,ctr&date_preset=maximum&access_token=${META_ACCESS_TOKEN}`;
    const insightsRes = await fetch(insightsUrl);
    const insightsData = await insightsRes.json();
    console.log("Insights Response:", JSON.stringify(insightsData, null, 2));

  } catch (err) {
    console.error("Meta Graph API query error:", err);
  }
}

main();
