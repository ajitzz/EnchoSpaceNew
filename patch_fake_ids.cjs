const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /const metaCampaignId = row\.meta_campaign_id \|\| \(\['active', 'CAMPAIGN_LIVE'\]\.includes\(row\.status\) \? `act_8849203_camp_\$\{row\.id\}` : null\);/g,
  'const metaCampaignId = row.meta_campaign_id || null;'
);
code = code.replace(
  /const metaAdSetId = row\.meta_adset_id \|\| \(\['active', 'CAMPAIGN_LIVE'\]\.includes\(row\.status\) \? `act_adset_\$\{row\.id \* 101\}` : null\);/g,
  'const metaAdSetId = row.meta_adset_id || null;'
);
code = code.replace(
  /const metaCreativeId = row\.meta_creative_id \|\| \(\['active', 'CAMPAIGN_LIVE'\]\.includes\(row\.status\) \? `act_creative_\$\{row\.id \* 202\}` : null\);/g,
  'const metaCreativeId = row.meta_creative_id || null;'
);
code = code.replace(
  /const metaAdId = row\.meta_ad_id \|\| \(\['active', 'CAMPAIGN_LIVE'\]\.includes\(row\.status\) \? `act_ad_\$\{row\.id \* 303\}` : null\);/g,
  'const metaAdId = row.meta_ad_id || null;'
);

// Lines 4614-4615
code = code.replace(
  /const simAdSet = campaign\.meta_adset_id \|\| `act_adset_\$\{Math\.floor\(100000000 \+ Math\.random\(\)\*900000000\)\}`;/g,
  'const simAdSet = campaign.meta_adset_id || null;'
);
code = code.replace(
  /const simAd = campaign\.meta_ad_id \|\| `act_ad_\$\{Math\.floor\(100000000 \+ Math\.random\(\)\*900000000\)\}`;/g,
  'const simAd = campaign.meta_ad_id || null;'
);

// We should also replace the variables `simAdSet` and `simAd` used subsequently, wait let's grep lines around 4614
fs.writeFileSync('server.ts', code);
console.log("Fake IDs patched.");
