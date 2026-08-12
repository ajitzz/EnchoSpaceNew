const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// The new function definitions and the replaced dispatchMetaCampaign:

const newDispatchCode = `
// ==========================================
// Phase 2: Formal Campaign State Machine & Ledger
// ==========================================

async function transitionCampaignState({
  client,
  campaignId,
  from,
  to,
  reason,
  actorType = 'system',
  actorId = 'system',
  correlationId = null,
  transactionId = null
}: any) {
  // Validate from -> to transitions
  // A simple matrix of valid transitions can be enforced here
  const invalidTransitions = [
    { from: 'draft', to: 'active' },
    { from: 'failed', to: 'active' },
    { from: 'failed_publish', to: 'active' },
    { from: 'pending', to: 'active' }
  ];

  for (const rule of invalidTransitions) {
    if ((from && from === rule.from) && to === rule.to) {
      throw new Error(\`INVALID_STATE_TRANSITION: Cannot transition from \${from} to \${to}\`);
    }
  }

  // Update Campaign
  await client.query(
    "UPDATE host_marketing_campaigns SET status = $1, admin_feedback = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
    [to, reason || null, campaignId]
  );

  // Append Event
  await client.query(\`
    INSERT INTO meta_publishing_events (
      transaction_id, campaign_id, event_type, from_state, to_state, actor_type, actor_id, reason, correlation_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  \`, [
    transactionId, campaignId, \`STATE_TRANSITION_\${to.toUpperCase()}\`, from, to, actorType, actorId, reason, correlationId
  ]);
}

async function dispatchMetaCampaign(campaignId: number, req: any) {
  if (process.env.META_PUBLISHING_PAUSED === 'true') {
    console.error(\`[EMERGENCY KILL SWITCH] Publishing aborted for campaign #\${campaignId}: Meta publishing is paused.\`);
    throw new Error('EMERGENCY KILL SWITCH ACTIVE: Meta publishing dispatches are currently paused by platform administration.');
  }

  const correlationId = crypto.randomUUID();
  const idempotencyKey = \`publish_meta_camp_\${campaignId}\`;
  
  const client = await pool.connect();
  let txId = null;
  let publishAttempt = 1;

  try {
    await client.query('BEGIN');
    // Phase 1 & 2: Idempotent Publishing & Transaction State Machine with Concurrency Protection
    const txCheck = await client.query(\`SELECT * FROM meta_publishing_transactions WHERE idempotency_key = $1 FOR UPDATE NOWAIT\`, [idempotencyKey]);

    if (txCheck.rows.length > 0) {
      const tx = txCheck.rows[0];
      if (tx.publish_status === 'SUCCESS' || tx.publish_status === 'LIVE') {
        console.log(\`[META ENGINE] Campaign \${campaignId} already successfully published. Idempotency hit.\`);
        await client.query('ROLLBACK');
        client.release();
        return true;
      }
      if (tx.publish_status === 'PRECHECK_RUNNING' || tx.publish_status === 'PUBLISHING') {
         console.log(\`[META ENGINE] Campaign \${campaignId} is currently being published in another process.\`);
         await client.query('ROLLBACK');
         client.release();
         return false;
      }
      publishAttempt = tx.publish_attempt + 1;
      await client.query(\`UPDATE meta_publishing_transactions SET publish_attempt = $1, publish_status = 'PRECHECK_RUNNING', updated_at = CURRENT_TIMESTAMP WHERE id = $2\`, [publishAttempt, tx.id]);
      txId = tx.id;
    } else {
      const newTx = await client.query(\`INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status) VALUES ($1, $2, $3, 'PRECHECK_RUNNING') RETURNING id\`, [campaignId, idempotencyKey, correlationId]);
      txId = newTx.rows[0].id;
    }
    
    // Commit the lock to release FOR UPDATE and let other transactions see 'PRECHECK_RUNNING'
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    client.release();
    if (err.code === '55P03') {
        // NOWAIT lock failure -> Another process is currently executing dispatchMetaCampaign for this ID
        console.warn(\`[META ENGINE CONCURRENCY] Campaign \${campaignId} dispatch blocked - another worker holds the lock.\`);
        return false;
    }
    throw err;
  }

  const rollbackState: { metaCampaignId?: string, metaAdSetId?: string, metaCreativeId?: string, metaAdId?: string } = {};

  try {
    await client.query('BEGIN');
    const campaignResult = await client.query(\`
      SELECT c.*, l.title as listing_title, l.description as listing_desc, l.image_url as listing_image, l.city, l.amenities as listing_amenities
      FROM host_marketing_campaigns c
      LEFT JOIN listings l ON c.listing_id = l.id
      WHERE c.id = $1
    \`, [campaignId]);

    if (campaignResult.rows.length === 0) {
      throw new Error('Campaign not found');
    }
    
    const campaign = campaignResult.rows[0];

    // Check runtime configuration boundaries
    if (!process.env.META_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
      throw new Error('META_APP_CONFIGURATION_ERROR: Meta access token or ad account ID is missing.');
    }

    await transitionCampaignState({
      client,
      campaignId,
      from: campaign.status,
      to: 'PRECHECK_RUNNING',
      correlationId,
      transactionId: txId
    });
    await client.query('COMMIT');

    await runMetaPreflightEngine(campaignId, pool, { correlationId });

    await client.query('BEGIN');
    await client.query(\`UPDATE meta_publishing_transactions SET publish_status = 'PUBLISHING', updated_at = CURRENT_TIMESTAMP WHERE id = $1\`, [txId]);
    await transitionCampaignState({
      client,
      campaignId,
      from: 'PRECHECK_RUNNING',
      to: 'META_API_PUSH',
      correlationId,
      transactionId: txId
    });
    await client.query('COMMIT');

    // Centralized Meta Graph Abstraction
    const accessToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    const cleanAdAccountId = adAccountId.startsWith('act_') ? adAccountId : \`act_\${adAccountId}\`;
    const pageId = process.env.META_PAGE_ID || "454559287733479";
    const adHeadline = campaign.title || campaign.listing_title || 'Stay at our beautiful property';
    let feedDescription = campaign.feed_description || campaign.description || campaign.listing_desc || 'Book your stay today!';
    const sanitizedDescription = feedDescription.replace(/【.*?】/g, '').trim();
    const destinationUrl = \`https://app.enchospace.com/listing/\${campaign.listing_id}\`;

    const executeMetaRequest = async (stepName: string, url: string, payload: any, maxRetries = 3) => {
      let attempt = 0;
      let delayMs = 1000;
      while (attempt < maxRetries) {
        attempt++;
        const startTime = Date.now();
        try {
          // Exclude large binary data from traces
          const safePayload = stepName.includes('adimage') ? { ...payload, bytes: '[BASE64_IMAGE_DATA]' } : payload;
          await pool.query(\`INSERT INTO meta_api_traces (campaign_id, correlation_id, step_name, request_payload, attempt) VALUES ($1, $2, $3, $4, $5)\`, [campaign.id, correlationId, stepName, JSON.stringify(safePayload), attempt]);

          const isMultipart = stepName.includes('adimage');
          let fetchOptions: RequestInit;

          if (isMultipart) {
            const formData = new FormData();
            formData.append('access_token', payload.access_token);
            const byteString = atob(payload.bytes);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            formData.append('bytes', new Blob([ab], { type: 'image/jpeg' }), 'listing_image.jpg');
            fetchOptions = { method: 'POST', body: formData as any };
          } else {
            fetchOptions = {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            };
          }

          const response = await fetch(url, fetchOptions);
          const data = await response.json();
          const executionTime = Date.now() - startTime;

          await pool.query(\`UPDATE meta_api_traces SET response_payload = $1, response_status = $2, execution_time_ms = $3 WHERE campaign_id = $4 AND correlation_id = $5 AND step_name = $6 AND attempt = $7\`, [JSON.stringify(data), response.status, executionTime, campaign.id, correlationId, stepName, attempt]);

          if (data.error) {
            const errorClassification = classifyMetaError(data.error);
            if (errorClassification.retryable && attempt < maxRetries) {
              const jitter = Math.random() * 500;
              await new Promise(r => setTimeout(r, delayMs + jitter));
              delayMs *= 2; // exponential backoff
              continue;
            }
            const errObj: any = new Error(data.error?.message || JSON.stringify(data.error) || \`\${stepName} failed\`);
            errObj.metaData = data;
            throw errObj;
          }
            
          console.log(\`[META TRACE \${correlationId}] SUCCESS: \${stepName} in \${executionTime}ms\`);
          return data;
        } catch (e: any) {
          if (attempt === maxRetries || e.message.includes('Preflight Failed')) {
            throw e;
          }
          const jitter = Math.random() * 500;
          await new Promise(r => setTimeout(r, delayMs + jitter));
          delayMs *= 2;
        }
      }
      throw new Error(\`Max retries reached for \${stepName}\`);
    };

    // 1. Create Campaign
    const campPayload = {
        access_token: accessToken,
        name: \`Encho Space - \${adHeadline} (Campaign #\${campaign.id})\`,
        objective: 'OUTCOME_AWARENESS',
        special_ad_categories: ['HOUSING'],
        special_ad_category_country: ['US', 'IN'],
        is_adset_budget_sharing_enabled: false,
        buying_type: 'AUCTION',
        status: 'PAUSED'
    };
    const campData = await executeMetaRequest('campaign_creation', \`\${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/\${cleanAdAccountId}/campaigns\`, campPayload);
    rollbackState.metaCampaignId = campData.id;
    await pool.query(\`UPDATE meta_publishing_transactions SET meta_campaign_id = $1 WHERE id = $2\`, [campData.id, txId]);

    // 2. Create Ad Set
    const adSetPayload: any = {
      access_token: accessToken,
      name: \`AdSet - \${adHeadline}\`,
      campaign_id: rollbackState.metaCampaignId,
      daily_budget: Math.max(10000, Math.floor(Number(campaign.budget || 100) * 100)),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'REACH',
      promoted_object: { page_id: pageId },
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: { geo_locations: { countries: ['US', 'IN'] } },
      status: 'PAUSED'
    };
    const adSetData = await executeMetaRequest('adset_creation', \`\${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/\${cleanAdAccountId}/adsets\`, adSetPayload);
    rollbackState.metaAdSetId = adSetData.id;
    await pool.query(\`UPDATE meta_publishing_transactions SET meta_adset_id = $1 WHERE id = $2\`, [adSetData.id, txId]);

    // 3. Upload Images
    let squareHash = '';
    let imgBase64 = '';
    if (campaign.listing_image || (campaign.media_urls && campaign.media_urls.length > 0)) {
       const imgUrl = campaign.listing_image || campaign.media_urls[0];
       const imgRes = await fetch(imgUrl);
       if (imgRes.ok) {
          const imgBuffer = await imgRes.arrayBuffer();
          imgBase64 = Buffer.from(imgBuffer).toString('base64');
       } else {
          throw new Error('Failed to fetch listing image from URL: ' + imgUrl);
       }
    } else {
       throw new Error('No listing image available for Meta Campaign');
    }
    
    const sqUpload = await executeMetaRequest('adimage_upload_square', \`\${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/\${cleanAdAccountId}/adimages\`, {
        access_token: accessToken, bytes: imgBase64 
    });
    
    if (sqUpload && sqUpload.images) {
      squareHash = Object.values(sqUpload.images)[0].hash;
    } else {
      throw new Error('Meta Image Upload failed to return a valid hash');
    }

    // 4. Create Creative
    const creativePayload = {
      access_token: accessToken,
      name: \`Creative - \${adHeadline}\`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          image_hash: squareHash,
          link: destinationUrl,
          message: sanitizedDescription,
          name: adHeadline,
          description: feedDescription,
          call_to_action: { type: 'BOOK_TRAVEL', value: { link: destinationUrl } }
        }
      }
    };
    const creativeData = await executeMetaRequest('creative_creation', \`\${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/\${cleanAdAccountId}/adcreatives\`, creativePayload);
    rollbackState.metaCreativeId = creativeData.id;
    await pool.query(\`UPDATE meta_publishing_transactions SET meta_creative_id = $1 WHERE id = $2\`, [creativeData.id, txId]);

    // 5. Create Ad
    const adPayload = {
      access_token: accessToken,
      name: \`Ad - \${adHeadline}\`,
      adset_id: rollbackState.metaAdSetId,
      creative: { creative_id: rollbackState.metaCreativeId },
      status: 'PAUSED' // Must explicitly unpause by admin later
    };
    const adData = await executeMetaRequest('ad_creation', \`\${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/\${cleanAdAccountId}/ads\`, adPayload);
    rollbackState.metaAdId = adData.id;
    await pool.query(\`UPDATE meta_publishing_transactions SET meta_ad_id = $1 WHERE id = $2\`, [adData.id, txId]);

    // 6. DB Commit
    await client.query('BEGIN');
    await client.query(\`
      UPDATE host_marketing_campaigns 
       SET meta_campaign_id = $1, meta_adset_id = $2, meta_creative_id = $3, meta_ad_id = $4, meta_dispatched_at = CURRENT_TIMESTAMP
      WHERE id = $5
    \`, [rollbackState.metaCampaignId, rollbackState.metaAdSetId, rollbackState.metaCreativeId, rollbackState.metaAdId, campaignId]);
    await client.query(\`UPDATE meta_publishing_transactions SET publish_status = 'SUCCESS', updated_at = CURRENT_TIMESTAMP WHERE id = $1\`, [txId]);
    await transitionCampaignState({
      client,
      campaignId,
      from: 'META_API_PUSH',
      to: 'active',
      correlationId,
      transactionId: txId
    });
    await client.query('COMMIT');
    client.release();

    broadcastDbEvent(req, 'marketing');
    return true;

  } catch (error: any) {
    console.error(\`[META ENGINE FAULT] Campaign \${campaignId} failed.\`, error);
    
    const rawErrorPayload = error.metaData || error.response || { error: { message: error.message, diagnosticReport: error.diagnosticReport } };
    const classification = classifyMetaError(rawErrorPayload);

    // Phase 3: Trigger explicit reverse cascade rollback
    const rollbackRes = await executeMetaRollback(rollbackState, correlationId, pool);

    let finalTxStatus = 'FAILED_PUBLISH';
    let rollbackStatus = 'NOT_REQUIRED';
    const hasCreatedObjects = !!(rollbackState.metaCampaignId || rollbackState.metaAdSetId || rollbackState.metaCreativeId || rollbackState.metaAdId);

    if (hasCreatedObjects) {
      rollbackStatus = rollbackRes.success ? 'SUCCESS' : 'FAILED';
      finalTxStatus = rollbackRes.success ? 'ROLLBACK_SUCCESS' : 'ROLLBACK_FAILED';
    }

    const stageName = rollbackState.metaCreativeId
      ? 'AD_CREATION'
      : (rollbackState.metaAdSetId ? 'CREATIVE_CREATION' : (rollbackState.metaCampaignId ? 'ADSET_CREATION' : 'CAMPAIGN_CREATION'));

    const safeErrorPayload = (() => {
      try { return JSON.stringify(rawErrorPayload); }
      catch (e) { return JSON.stringify({ error: { message: rawErrorPayload?.message || 'Circular reference' }}); }
    })();

    await client.query('BEGIN');
    await client.query(\`
      UPDATE meta_publishing_transactions 
       SET publish_status = $1, failure_code = $2, failure_category = $3, failure_stage = $4, rollback_status = $5, error_details = $6, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $7
    \`, [finalTxStatus, classification.code_name, classification.category, stageName, rollbackStatus, safeErrorPayload, txId]);

    const feedbackMsg = \`\${classification.user_title}: \${classification.recommended_action || classification.action_required || ''}\`;
    
    // Check current status before failure update
    const cRes = await client.query('SELECT status FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaignId]);
    const currentStatus = cRes.rows[0]?.status || 'unknown';

    await transitionCampaignState({
      client,
      campaignId,
      from: currentStatus,
      to: 'failed_publish',
      reason: feedbackMsg,
      correlationId,
      transactionId: txId
    });
    await client.query('COMMIT');
    client.release();

    try {
      await pool.query(\`
        INSERT INTO meta_publishing_dlq (
          transaction_id, campaign_id, correlation_id, failure_stage, failure_code, requires_human_action, error_payload, recommended_action
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      \`, [txId, campaignId, correlationId, stageName, classification.code_name, classification.requires_human_action, JSON.stringify(rawErrorPayload), classification.action_required]);
    } catch (dlqErr) {
      console.error('[META DLQ FAULT]', dlqErr);
    }
    
    broadcastDbEvent(req, 'marketing');
    return false;
  }
}
`;

code = code.replace(/async function dispatchMetaCampaign\([\s\S]*?\n\nasync function dispatchGoogleAdsCampaign/m, newDispatchCode + '\n\nasync function dispatchGoogleAdsCampaign');

fs.writeFileSync('server.ts', code);
console.log("Dispatch successfully patched.");
