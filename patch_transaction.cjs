const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `
      try {
        // 1. Create Campaign
        const campRes = await fetch(\`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/campaigns\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            name: \`Encho Space - \${adHeadline} (Campaign #\${campaign.id})\`,
            objective: 'OUTCOME_LEADS', // Milestone 8.3: Native Lead Forms
            special_ad_categories: ['HOUSING'],
            special_ad_category_country: Array.from(new Set(targetCountries)),
            is_adset_budget_sharing_enabled: false,
            buying_type: 'AUCTION',
            status: 'PAUSED'
          })
        });
        const campData = await campRes.json();
        syncLogs.steps.push({ step: 'campaign_creation', status: campRes.status, response: campData });
        if (!campRes.ok || !campData.id) {
            throw new Error(campData.error?.message || JSON.stringify(campData.error) || 'Campaign creation failed');
        }
        metaCampaignId = campData.id;
        console.log(\`[META API SUCCESS] Live Meta Campaign created: \${metaCampaignId}\`);

        // 2. Create Ad Set with age_min: 18, age_max: 65, genders: [1, 2] (HOUSING Special Category Rule)
        const adSetPayload: any = {
          access_token: accessToken,
          name: adsetSpecifications.adset_name,
          campaign_id: metaCampaignId,
          daily_budget: adsetSpecifications.daily_budget,
          billing_event: adsetSpecifications.billing_event,
          optimization_goal: adsetSpecifications.optimization_goal,
          bid_strategy: adsetSpecifications.bid_strategy,
          targeting: adsetSpecifications.targeting,
          status: 'PAUSED'
        };
        const adSetRes = await fetch(\`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/adsets\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(adSetPayload)
        });
        const adSetData = await adSetRes.json();
        syncLogs.steps.push({ step: 'adset_creation', status: adSetRes.status, response: adSetData });
        
        if (!adSetRes.ok || !adSetData.id) {
           throw new Error(adSetData.error?.message || JSON.stringify(adSetData.error) || 'AdSet creation failed');
        }
        metaAdSetId = adSetData.id;
        console.log(\`[META API SUCCESS] Live AdSet created: \${metaAdSetId}\`);

        // 3. Upload Dynamic Asset Pipeline Variants to Meta (DCO & Asset Prep)
        const uploadedHashes = { square: '', vertical: '', landscape: '' };
        console.log(\`[META API DISPATCH] Uploading 1:1, 9:16, 16:9 image variants to Meta...\`);
        const uploadVariant = async (url) => {
           if (!url || url.includes('unsplash.com')) return null; // Skip placeholder uploads in sandbox
           try {
             const imgFetch = await fetch(url);
             if (!imgFetch.ok) return null;
             const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());
             const uploadRes = await fetch(\`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/adimages\`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ access_token: accessToken, bytes: imgBuffer.toString('base64') })
             });
             const uploadData = await uploadRes.json();
             if (uploadData.images) {
                return (Object.values(uploadData.images)[0])?.hash || null;
             }
           } catch(e) { console.warn('AdImage upload failed', e.message); }
           return null;
        };

        const [sqHash, vHash, lHash] = await Promise.all([
           uploadVariant(squareUrl),
           uploadVariant(verticalUrl),
           uploadVariant(landscapeUrl)
        ]);

        if (sqHash) uploadedHashes.square = sqHash;
        if (vHash) uploadedHashes.vertical = vHash;
        if (lHash) uploadedHashes.landscape = lHash;
        syncLogs.steps.push({ step: 'adimage_upload_pipeline', response: uploadedHashes });

        // We'll use Asset Feed Spec for Dynamic Creative Optimization (DCO) to map 1:1 to feed, 9:16 to stories, 16:9 to instream
        const assetFeedImages = [];
        if (uploadedHashes.square) assetFeedImages.push({ hash: uploadedHashes.square });
        if (uploadedHashes.vertical) assetFeedImages.push({ hash: uploadedHashes.vertical });
        if (uploadedHashes.landscape) assetFeedImages.push({ hash: uploadedHashes.landscape });

        let creativePayload;
        if (assetFeedImages.length > 0) {
            creativePayload = {
              access_token: accessToken,
              name: \`Encho DCO Master Engine - \${adHeadline}\`,
              object_story_spec: { page_id: pageId },
              asset_feed_spec: {
                images: assetFeedImages,
                bodies: [
                  { text: adMessage },
                  { text: \`Escape to \${campaign.listing_city || 'paradise'}. \${adMessage.substring(0, 100)}...\` }
                ],
                titles: [
                  { text: adHeadline },
                  { text: \`Reserve \${adHeadline} Direct\` }
                ],
                descriptions: [
                  { text: feedDescription },
                  { text: 'Tap to view exclusive availability.' }
                ],
                call_to_action_types: ['SIGN_UP', 'BOOK_TRAVEL', 'LEARN_MORE'],
                link_urls: [{ website_url: destinationUrl }]
              }
            };
            
            if (activeLeadFormId) {
               creativePayload.object_story_spec.link_data = {
                   call_to_action: { type: 'SIGN_UP', value: { lead_gen_form_id: activeLeadFormId } }
               };
            }
            if (igAccountId && igAccountId !== 'your_instagram_account_id_here') {
                creativePayload.object_story_spec.instagram_actor_id = igAccountId;
            }
        } else {
            const linkDataSpec: any = {
              link: destinationUrl,
              message: adMessage,
              name: adHeadline,
              call_to_action: { type: 'SIGN_UP', value: { lead_gen_form_id: activeLeadFormId || '999999999999999' } },
              picture: imageUrl
            };
            creativePayload = {
              access_token: accessToken,
              name: \`Encho Creative - \${adHeadline}\`,
              object_story_spec: { page_id: pageId, link_data: linkDataSpec }
            };
            if (igAccountId && igAccountId !== 'your_instagram_account_id_here') {
                creativePayload.object_story_spec.instagram_actor_id = igAccountId;
            }
        }

        const creativeRes = await fetch(\`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/adcreatives\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creativePayload)
        });
        const creativeData = await creativeRes.json();
        syncLogs.steps.push({ step: 'creative_creation', status: creativeRes.status, response: creativeData });
        if (!creativeRes.ok || !creativeData.id) {
           throw new Error(creativeData.error?.message || JSON.stringify(creativeData.error) || 'Creative creation failed');
        }
        metaCreativeId = creativeData.id;
        console.log(\`[META API SUCCESS] Creative created: \${metaCreativeId}\`);

        // 4. Create Live Ad attached to AdSet & Creative
        const adRes = await fetch(\`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/ads\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            name: \`Encho Ad - \${adHeadline}\`,
            adset_id: metaAdSetId,
            creative: { creative_id: metaCreativeId },
            status: 'PAUSED'
          })
        });
        const adData = await adRes.json();
        syncLogs.steps.push({ step: 'ad_creation', status: adRes.status, response: adData });

        if (!adRes.ok || !adData.id) {
           throw new Error(adData.error?.message || JSON.stringify(adData.error) || 'Ad creation failed');
        }
        metaAdId = adData.id;
        console.log(\`[META API SUCCESS] Live Meta Ad created: \${metaAdId}\`);

      } catch (fatalErr: any) {
        console.error('[META API FATAL] Pipeline failed:', fatalErr.message);
        syncLogs.steps.push({ step: 'fatal_error', error: fatalErr.message });
      }

      // Inspect syncLogs for any Meta API rejections or policy errors
`;

const startIndex = code.indexOf('try {\n        // 1. Create Campaign');
const endIndex = code.indexOf('// Inspect syncLogs for any Meta API rejections or policy errors');
if (startIndex !== -1 && endIndex !== -1) {
    code = code.substring(0, startIndex) + replacement.trim() + '\n\n      // Inspect syncLogs for any Meta API rejections or policy errors\n' + code.substring(endIndex + '// Inspect syncLogs for any Meta API rejections or policy errors'.length + 1);
    
    // Also remove the finalId assignments
    code = code.replace(/const finalCampaignId =.*$/gm, '');
    code = code.replace(/const finalAdSetId =.*$/gm, '');
    code = code.replace(/const finalCreativeId =.*$/gm, '');
    code = code.replace(/const finalAdId =.*$/gm, '');
    
    // Update the database update query to use the actual variables
    code = code.replace(/finalCampaignId,/g, 'metaCampaignId,');
    code = code.replace(/finalAdSetId,/g, 'metaAdSetId,');
    code = code.replace(/finalCreativeId,/g, 'metaCreativeId,');
    code = code.replace(/finalAdId,/g, 'metaAdId,');

    fs.writeFileSync('server.ts', code);
    console.log("Patched successfully");
} else {
    console.log("Could not find start/end indices");
}

