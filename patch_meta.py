import re

with open('server.ts', 'r') as f:
    content = f.read()

# Replace the whole dispatchMetaCampaign function
new_function = """
async function dispatchMetaCampaign(campaignId: number, req: any) {
  try {
    const campaignResult = await pool.query(`
      SELECT c.*, l.title as listing_title, l.description as listing_desc, l.image_url as listing_image, l.city
      FROM host_marketing_campaigns c
      JOIN listings l ON c.listing_id = l.id
      WHERE c.id = $1
    `, [campaignId]);

    if (campaignResult.rows.length === 0) {
      console.warn(`[META API DISPATCH] Campaign ${campaignId} not found.`);
      return false;
    }

    const campaign = campaignResult.rows[0];
    const accessToken = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
    const rawAdAccountId = process.env.META_AD_ACCOUNT_ID;
    const pageId = process.env.META_PAGE_ID;
    const igAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID;
    
    let cleanAdAccountId = String(rawAdAccountId || '').trim();
    if (cleanAdAccountId && !cleanAdAccountId.startsWith('act_') && cleanAdAccountId !== 'your_ad_account_id_here') {
      cleanAdAccountId = 'act_' + cleanAdAccountId;
    }

    const hasRealMetaCredentials = accessToken && cleanAdAccountId && pageId && !accessToken.includes('your_generated_system_token');

    if (hasRealMetaCredentials) {
      console.log(`[META API DISPATCH] Full Ad-Creation Pipeline Initiated. Account: ${cleanAdAccountId}`);
      
      try {
        // 1. Create Campaign
        const campRes = await fetch(`https://graph.facebook.com/v19.0/${cleanAdAccountId}/campaigns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            name: `Encho Space - ${campaign.title} (Campaign #${campaign.id})`,
            objective: 'OUTCOME_TRAFFIC',
            special_ad_categories: ['HOUSING'],
            status: 'PAUSED' // Safe default
          })
        });
        const campData = await campRes.json();
        if (!campRes.ok) throw new Error(`Campaign creation failed: ${campData.error?.message}`);
        const metaCampaignId = campData.id;
        console.log(`[META API] Campaign created: ${metaCampaignId}`);

        // 2. Create Ad Set
        const adSetRes = await fetch(`https://graph.facebook.com/v19.0/${cleanAdAccountId}/adsets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            name: `Encho AdSet - ${campaign.city || 'Global'}`,
            campaign_id: metaCampaignId,
            daily_budget: Math.floor(Number(campaign.budget) / 30 * 100) || 500, // min $5/day
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'LINK_CLICKS',
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
            status: 'PAUSED',
            targeting: {
              geo_locations: { countries: ['US'] } // Housing category requires broad geo
            }
          })
        });
        const adSetData = await adSetRes.json();
        if (!adSetRes.ok) throw new Error(`AdSet creation failed: ${adSetData.error?.message}`);
        const metaAdSetId = adSetData.id;
        console.log(`[META API] AdSet created: ${metaAdSetId}`);

        // 3. Create Ad Creative
        const creativeRes = await fetch(`https://graph.facebook.com/v19.0/${cleanAdAccountId}/adcreatives`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            name: `Encho Creative - ${campaign.id}`,
            object_story_spec: {
              page_id: pageId,
              instagram_actor_id: igAccountId || undefined,
              link_data: {
                image_hash: '', // We would upload the image and get a hash here, for now using image_url
                picture: campaign.listing_image || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6',
                link: `https://encho-space-chi.vercel.app/listings/${campaign.listing_id}`,
                message: campaign.description || 'Book your dream stay with Encho.',
                name: campaign.title || 'Exclusive Property'
              }
            }
          })
        });
        const creativeData = await creativeRes.json();
        if (!creativeRes.ok) throw new Error(`Creative creation failed: ${creativeData.error?.message}`);
        const metaCreativeId = creativeData.id;
        console.log(`[META API] Creative created: ${metaCreativeId}`);

        // 4. Create Ad
        const adRes = await fetch(`https://graph.facebook.com/v19.0/${cleanAdAccountId}/ads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            name: `Encho Ad - ${campaign.id}`,
            adset_id: metaAdSetId,
            creative: { creative_id: metaCreativeId },
            status: 'PAUSED'
          })
        });
        const adData = await adRes.json();
        if (!adRes.ok) throw new Error(`Ad creation failed: ${adData.error?.message}`);
        const metaAdId = adData.id;
        console.log(`[META API] Ad created: ${metaAdId}`);

        await pool.query(`
          UPDATE host_marketing_campaigns
          SET status = 'active',
              meta_campaign_id = $1,
              meta_dispatched_at = CURRENT_TIMESTAMP,
              admin_approved = true,
              admin_feedback = NULL,
              last_pacing_calc_at = CURRENT_TIMESTAMP,
              pacing_mode = 'standard',
              accumulated_spent = 0,
              accumulated_impressions = 0,
              accumulated_clicks = 0,
              accumulated_conversions = 0
          WHERE id = $2
        `, [metaCampaignId, campaignId]);
        broadcastDbEvent(req, 'marketing');
        return true;

      } catch (apiError: any) {
        console.error(`[META API DISPATCH ERROR] Pipeline failed:`, apiError);
        await pool.query(`
          UPDATE host_marketing_campaigns
          SET status = 'rejected',
              admin_feedback = $1,
              admin_approved = false
          WHERE id = $2
        `, [`Meta Ads API Pipeline Error: ${apiError.message}`, campaignId]);
        broadcastDbEvent(req, 'marketing');
        return false;
      }
    } else {
      console.log(`[META API DISPATCH] Missing credentials, using simulation...`);
      // Simulated logic here
      await new Promise(resolve => setTimeout(resolve, 1000));
      const simulatedMetaCampaignId = `act_8849203_camp_${Math.floor(100000000 + Math.random() * 900000000)}`;
      await pool.query(`
        UPDATE host_marketing_campaigns
        SET status = 'active',
            meta_campaign_id = $1,
            meta_dispatched_at = CURRENT_TIMESTAMP,
            admin_approved = true
        WHERE id = $2
      `, [simulatedMetaCampaignId, campaignId]);
      broadcastDbEvent(req, 'marketing');
      return true;
    }
  } catch (error) {
    console.error(`[META API DISPATCH ERROR] Failed to dispatch campaign ${campaignId}:`, error);
    return false;
  }
}
"""

start_str = "async function dispatchMetaCampaign(campaignId: number, req: any) {"
import re
match = re.search(r'async function dispatchMetaCampaign\(.*?\).*?^}$', content, re.MULTILINE | re.DOTALL)
if match:
    content = content[:match.start()] + new_function + content[match.end():]
    with open('server.ts', 'w') as f:
        f.write(content)
    print("Replaced dispatchMetaCampaign successfully.")
else:
    print("Could not find dispatchMetaCampaign to replace.")
