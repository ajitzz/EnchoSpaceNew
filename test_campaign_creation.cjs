const token = process.env.META_ACCESS_TOKEN;
const adAccountId = process.env.META_AD_ACCOUNT_ID;

async function run() {
  const campPayload = {
    access_token: token,
    name: 'Encho Space - Test Campaign',
    objective: 'OUTCOME_AWARENESS',
    special_ad_categories: ['HOUSING'],
    special_ad_category_country: ['US', 'IN'],
    is_adset_budget_sharing_enabled: false,
    buying_type: 'AUCTION',
    status: 'PAUSED'
  };

  const response = await fetch('https://graph.facebook.com/v19.0/act_' + adAccountId + '/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(campPayload)
  });
  
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}
run();
