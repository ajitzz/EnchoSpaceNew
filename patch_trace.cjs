const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `
    const hasRealMetaCredentials = accessToken && cleanAdAccountId && pageId && !accessToken.includes('your_generated_system_token');

    if (hasRealMetaCredentials) {
      console.log(\`[META API DISPATCH] Full 3-Tier Ad Pipeline Initiated. Account: \${cleanAdAccountId}\`);
      const syncLogs: any = { steps: [] };
      const correlationId = 'pub_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      
      let metaCampaignId: string | null = null;
      let metaAdSetId: string | null = null;
      let metaCreativeId: string | null = null;
      let metaAdId: string | null = null;
      const nowIso = new Date().toISOString();

      const executeMetaRequest = async (stepName, endpoint, payload) => {
        const startTime = Date.now();
        const redactedPayload = { ...payload, access_token: 'REDACTED' };
        if (redactedPayload.bytes) redactedPayload.bytes = 'REDACTED_BASE64_IMAGE';
        
        console.log(\`[META TRACE \${correlationId}] Step: \${stepName} | POST \${endpoint} | Payload:\`, JSON.stringify(redactedPayload));
        
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        const executionTime = Date.now() - startTime;
        
        const logEntry = {
          step: stepName,
          endpoint,
          correlationId,
          request: redactedPayload,
          status: res.status,
          response: data,
          executionTimeMs: executionTime
        };
        
        syncLogs.steps.push(logEntry);
        
        if (!res.ok || data.error) {
          console.error(\`[META TRACE \${correlationId}] FAILED: \${stepName} | Status: \${res.status} | Trace ID: \${data.error?.fbtrace_id} | Error:\`, JSON.stringify(data.error));
          throw new Error(data.error?.message || JSON.stringify(data.error) || \`\${stepName} failed\`);
        }
        
        console.log(\`[META TRACE \${correlationId}] SUCCESS: \${stepName} in \${executionTime}ms\`);
        return data;
      };

      try {
        // Preflight Validation
        console.log(\`[META TRACE \${correlationId}] Running Pre-flight Validations...\`);
        if (!cleanAdAccountId) throw new Error('Preflight Failed: Missing Ad Account ID');
        if (!pageId) throw new Error('Preflight Failed: Missing Page ID');
        if (!activeLeadFormId) throw new Error('Preflight Failed: Missing Lead Form ID');
        if (targetCountries.length === 0) throw new Error('Preflight Failed: Missing target countries');
        if (Number(campaign.budget) < 1) throw new Error('Preflight Failed: Invalid budget');
        
        // Validate Image
        try {
          const imgCheck = await fetch(imageUrl, { method: 'HEAD' });
          if (!imgCheck.ok) throw new Error(\`Image URL inaccessible (\${imgCheck.status})\`);
        } catch(e) {
          throw new Error(\`Preflight Failed: \${e.message}\`);
        }
        console.log(\`[META TRACE \${correlationId}] Pre-flight Validations Passed.\`);

        // 1. Create Campaign
        const campPayload = {
            access_token: accessToken,
            name: \`Encho Space - \${adHeadline} (Campaign #\${campaign.id})\`,
            objective: 'OUTCOME_LEADS', // Milestone 8.3: Native Lead Forms
            special_ad_categories: ['HOUSING'],
            special_ad_category_country: Array.from(new Set(targetCountries)),
            is_adset_budget_sharing_enabled: false,
            buying_type: 'AUCTION',
            status: 'PAUSED'
        };
        const campData = await executeMetaRequest('campaign_creation', \`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/campaigns\`, campPayload);
        metaCampaignId = campData.id;

        // 2. Create Ad Set
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
        const adSetData = await executeMetaRequest('adset_creation', \`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/adsets\`, adSetPayload);
        metaAdSetId = adSetData.id;

        // 3. Upload Images
        const uploadedHashes = { square: '', vertical: '', landscape: '' };
        console.log(\`[META TRACE \${correlationId}] Uploading 1:1, 9:16, 16:9 variants...\`);
        const uploadVariant = async (url, formatName) => {
           if (!url || url.includes('unsplash.com')) return null;
           try {
             const imgFetch = await fetch(url);
             if (!imgFetch.ok) return null;
             const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());
             const uploadData = await executeMetaRequest(\`adimage_upload_\${formatName}\`, \`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/adimages\`, {
               access_token: accessToken, 
               bytes: imgBuffer.toString('base64') 
             });
             if (uploadData.images) {
                return (Object.values(uploadData.images)[0])?.hash || null;
             }
           } catch(e) { console.warn(\`\${formatName} image upload failed:\`, e.message); }
           return null;
        };

        const [sqHash, vHash, lHash] = await Promise.all([
           uploadVariant(squareUrl, 'square'),
           uploadVariant(verticalUrl, 'vertical'),
           uploadVariant(landscapeUrl, 'landscape')
        ]);

        if (sqHash) uploadedHashes.square = sqHash;
        if (vHash) uploadedHashes.vertical = vHash;
        if (lHash) uploadedHashes.landscape = lHash;
        syncLogs.steps.push({ step: 'adimage_upload_pipeline', correlationId, response: uploadedHashes });

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

        const creativeData = await executeMetaRequest('creative_creation', \`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/adcreatives\`, creativePayload);
        metaCreativeId = creativeData.id;

        // 4. Create Live Ad attached to AdSet & Creative
        const adPayload = {
            access_token: accessToken,
            name: \`Encho Ad - \${adHeadline}\`,
            adset_id: metaAdSetId,
            creative: { creative_id: metaCreativeId },
            status: 'PAUSED'
        };
        const adData = await executeMetaRequest('ad_creation', \`https://graph.facebook.com/v19.0/\${cleanAdAccountId}/ads\`, adPayload);
        metaAdId = adData.id;

      } catch (fatalErr: any) {
        console.error('[META API FATAL] Pipeline failed:', fatalErr.message);
        syncLogs.steps.push({ step: 'fatal_error', error: fatalErr.message, correlationId: syncLogs.steps[0]?.correlationId });
      }

`;

const startIndex = code.indexOf("const hasRealMetaCredentials = accessToken && cleanAdAccountId && pageId && !accessToken.includes('your_generated_system_token');");
const endIndex = code.indexOf('// Inspect syncLogs for any Meta API rejections or policy errors');
if (startIndex !== -1 && endIndex !== -1) {
    code = code.substring(0, startIndex) + replacement.trim() + '\n\n      // Inspect syncLogs for any Meta API rejections or policy errors\n' + code.substring(endIndex + '// Inspect syncLogs for any Meta API rejections or policy errors'.length + 1);
    fs.writeFileSync('server.ts', code);
    console.log("Patched successfully");
} else {
    console.log("Could not find start/end indices");
}

