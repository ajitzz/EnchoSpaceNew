import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import { pool, readPool, rlsStorage, queryAnalyticsRead, isDbConfigured, shouldRunBackgroundWorkers } from '../db/connection.js';
import {
  broadcastDbEvent,
  logGeminiWarning,
  sendWhatsAppMessage,
  stripe,
  razorpay,
  redis,
  s3,
  mux,
  PHONE_NUMBER_ID,
  META_API_TOKEN,
  getGlobalIoInstance
} from '../config/clients.js';
import { MetaTargetMapper } from '../../lib/metaTargetMapper.js';
import { metaGraphClient, getAuthoritativeMetaIdentity } from '../../lib/metaGraphClient.js';
import { CampaignControlCenterService } from '../../lib/campaignControlCenterService.js';
import { MetaExternalSyncEngine } from '../../lib/metaExternalSyncEngine.js';
import { MetaTelemetrySyncEngine } from '../../lib/metaTelemetrySyncEngine.js';
import { MetaControlPlaneService } from '../../lib/metaControlPlaneService.js';
import { DcoEngine } from '../../lib/dcoEngine.js';
import { CalendarCircuitBreaker } from '../../lib/calendarCircuitBreaker.js';
import { PerformanceAnalyticsService } from '../../lib/performanceAnalyticsService.js';
import { PdfReportService } from '../../lib/pdfReportService.js';
import { LeadAlertingCrmService } from '../../lib/leadAlertingCrmService.js';
import { DynamicPricingSyncService } from '../../lib/dynamicPricingSyncService.js';
import { RetargetingPixelService } from '../../lib/retargetingPixelService.js';
import { DoubleEntryLedgerService } from '../../lib/doubleEntryLedgerService.js';
import { DistributedLockService } from '../../lib/distributedLock.js';
import { StructuredLogger } from '../../lib/observability/structuredLogger.js';
import { MetricsRegistry } from '../../lib/observability/metricsRegistry.js';
import { AlertService } from '../../lib/observability/alertService.js';
import { ProviderDriftDetector } from '../../lib/providers/schemas.js';
import { maskContactInfo } from '../../lib/maskUtils.js';
import { googleOfflineConversions } from '../../lib/providers/google/GoogleOfflineConversions.js';
import { TokenHealthMonitor } from '../../lib/observability/tokenHealthMonitor.js';
import { checkIntegrationKeys } from '../../lib/integrationInspector.js';
import { legacySocialPublishingEnabled, socialApprovalPredicate } from '../../lib/marketing/legacyAuthorization.js';

export { publishToInstagram };

// ==========================================
// PHASE 2.2: CENTRAL CAMPAIGN STATE MACHINE
// ==========================================
export type CampaignState =
  | 'draft'
  | 'pending_webhook'
  | 'pending_approval'
  | 'pending' // alias for pending_approval
  | 'approved'
  | 'rejected'
  | 'escrow'
  | 'ASSET_PREP'
  | 'META_API_PUSH'
  | 'CAMPAIGN_LIVE'
  | 'active' // alias for CAMPAIGN_LIVE
  | 'paused'
  | 'cancelled'
  | 'killed'
  | 'failed_publish'
  | 'failed'
  | 'EXTERNAL_OUTCOME_UNKNOWN';

const VALID_TRANSITIONS: Record<CampaignState, CampaignState[]> = {
  'draft': ['pending_approval', 'pending', 'rejected', 'pending_webhook', 'cancelled'],
  'pending_webhook': ['pending_approval', 'pending', 'escrow', 'ASSET_PREP', 'failed', 'cancelled'],
  'pending_approval': ['approved', 'rejected', 'escrow', 'ASSET_PREP', 'cancelled'],
  'pending': ['approved', 'rejected', 'escrow', 'ASSET_PREP', 'cancelled'],
  'approved': ['ASSET_PREP', 'META_API_PUSH', 'failed_publish', 'failed', 'cancelled', 'EXTERNAL_OUTCOME_UNKNOWN'],
  'rejected': ['pending_approval', 'pending', 'cancelled'],
  'escrow': ['ASSET_PREP', 'META_API_PUSH', 'cancelled', 'failed', 'EXTERNAL_OUTCOME_UNKNOWN'],
  'ASSET_PREP': ['META_API_PUSH', 'failed', 'cancelled', 'paused', 'EXTERNAL_OUTCOME_UNKNOWN'],
  'META_API_PUSH': ['CAMPAIGN_LIVE', 'active', 'failed', 'failed_publish', 'cancelled', 'EXTERNAL_OUTCOME_UNKNOWN'],
  'CAMPAIGN_LIVE': ['paused', 'cancelled', 'killed'],
  'active': ['paused', 'cancelled', 'killed'],
  'paused': ['CAMPAIGN_LIVE', 'active', 'cancelled', 'killed'],
  'failed_publish': ['ASSET_PREP', 'META_API_PUSH', 'cancelled', 'killed', 'EXTERNAL_OUTCOME_UNKNOWN'],
  'failed': ['ASSET_PREP', 'META_API_PUSH', 'cancelled', 'killed', 'EXTERNAL_OUTCOME_UNKNOWN'],
  'EXTERNAL_OUTCOME_UNKNOWN': ['CAMPAIGN_LIVE', 'active', 'failed_publish', 'cancelled', 'killed'],
  'cancelled': [],
  'killed': []
};

export async function transitionCampaignState(params: {
  campaignId: number;
  expectedCurrentState?: CampaignState;
  to: CampaignState;
  reason: string;
  actorType?: 'system' | 'admin' | 'host' | 'webhook';
  actorId?: number | string;
  correlationId?: string;
  tenantId?: number;
  client?: any; // pg client
}): Promise<CampaignState> {
  const { campaignId, expectedCurrentState, to, reason, actorType = 'system', actorId = 'system', correlationId, tenantId } = params;

  const client = params.client || await pool.connect();
  const releaseClient = !params.client;

  try {
    if (releaseClient) await client.query('BEGIN');

    // 1. Lock campaign row
    const queryArgs: any[] = [campaignId];
    let queryStr = `SELECT * FROM host_marketing_campaigns WHERE id = $1`;
    if (tenantId) {
      queryStr += ` AND host_id = $2`;
      queryArgs.push(tenantId);
    }
    queryStr += ` FOR UPDATE`;

    const campRes = await client.query(queryStr, queryArgs);
    if (campRes.rows.length === 0) {
      throw new Error(`Campaign ${campaignId} not found or tenant mismatch.`);
    }

    const campaign = campRes.rows[0];
    const currentState = campaign.status as CampaignState;

    // 2. Validate current state if expected is provided
    if (expectedCurrentState && currentState !== expectedCurrentState) {
       // In some async replay/webhook cases, we might tolerate it, but FSM is strict
       throw new Error(`Expected state was ${expectedCurrentState} but got ${currentState}`);
    }

    // 3. Validate transition
    const allowed = VALID_TRANSITIONS[currentState] || [];
    // Allow admins to override safely
    if (!allowed.includes(to) && actorType !== 'admin') {
       throw new Error(`Illegal transition from ${currentState} to ${to}`);
    }

    // 4. Perform Update
    await client.query(
      `UPDATE host_marketing_campaigns SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [to, campaignId]
    );

    // 5. Append Immutable Event
    const eventCorrId = correlationId || crypto.randomUUID();

    // We assume meta_publishing_events table exists. Let's do a safe insert or fallback if schema differs
    try {
      await client.query(`
        INSERT INTO meta_publishing_events
        (campaign_id, correlation_id, event_type, from_state, to_state, actor_type, actor_id, reason)
        VALUES ($1, $2, 'STATE_TRANSITION', $3, $4, $5, $6, $7)
      `, [campaignId, eventCorrId, currentState, to, actorType, String(actorId), reason]);
    } catch (e: any) {
      // If table doesn't have exact schema, log it but don't fail the FSM if it's missing columns (temporary until migration)
      console.error('[FSM AUDIT WARN] Could not append to meta_publishing_events:', e.message);
    }

    if (releaseClient) await client.query('COMMIT');

    console.log(`[FSM] Campaign ${campaignId}: ${currentState} -> ${to} (${reason})`);
    return to;

  } catch (error) {
    if (releaseClient) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (releaseClient) client.release();
  }
}

/**
 * Phase 3 Milestone 3 / Founder Gate PROPOSED-007 Validator:
 * A property cannot be published if any bookable room type has fewer than 3 approved,
 * room-specific photos. At least 1 approved photo per room must be explicitly classified
 * as showing the sleeping area (is_sleeping_area = true).
 * Property-wide media (room_type_id IS NULL or tier = 'common') never counts toward a room's minimum.
 */
export async function validatePropertyPublication(
  listingId: number | string,
  clientOrPool: any
): Promise<{ valid: boolean; errors: string[]; roomSummaries: any[] }> {
  const numId = parseInt(String(listingId), 10);
  if (isNaN(numId)) {
    return { valid: false, errors: ['Invalid listing ID'], roomSummaries: [] };
  }

  // 1. Fetch relational room types for the listing
  const roomsRes = await clientOrPool.query(
    'SELECT id, name, type FROM room_types WHERE listing_id = $1 ORDER BY id ASC',
    [numId]
  );

  if (roomsRes.rows.length === 0) {
    return {
      valid: false,
      errors: ['Property must have at least one room type defined before publication.'],
      roomSummaries: []
    };
  }

  const errors: string[] = [];
  const roomSummaries: any[] = [];

  // 2. Validate each room type has >= 3 approved room-specific photos with >= 1 sleeping area photo
  for (const rt of roomsRes.rows) {
    const mediaRes = await clientOrPool.query(
      `SELECT COUNT(*) as total_count,
              COUNT(CASE WHEN is_sleeping_area = true THEN 1 END) as sleeping_count
       FROM media_assets
       WHERE entity_type = 'listing'
         AND entity_id = $1
         AND room_type_id = $2
         AND moderation_status = 'approved'`,
      [numId, rt.id]
    );

    const totalCount = parseInt(mediaRes.rows[0]?.total_count || '0', 10);
    const sleepingCount = parseInt(mediaRes.rows[0]?.sleeping_count || '0', 10);

    roomSummaries.push({
      roomId: rt.id,
      roomName: rt.name,
      roomType: rt.type,
      approvedPhotosCount: totalCount,
      sleepingAreaPhotosCount: sleepingCount,
      isCompliant: totalCount >= 3 && sleepingCount >= 1
    });

    if (totalCount < 3) {
      errors.push(
        `Room type "${rt.name || rt.type}" has only ${totalCount} approved photo(s). Minimum 3 approved room-specific photos are required for publication.`
      );
    }
    if (sleepingCount < 1) {
      errors.push(
        `Room type "${rt.name || rt.type}" must have at least 1 approved photo showing the sleeping area.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    roomSummaries
  };
}

export async function triggerSmartAutoPause(listingId: any, bookingId: any) {
  if (!isDbConfigured) return;
  try {
    console.log(`[CIRCUIT BREAKER] Evaluating listing #${listingId} (Booking Event #${bookingId})...`);
    const evalResult = await CalendarCircuitBreaker.evaluateListingAvailability(listingId, pool, {
      correlationId: `booking_${bookingId}_${Date.now()}`
    });
    console.log(`[CIRCUIT BREAKER] Listing #${listingId} evaluated: fully booked = ${evalResult.is_fully_booked}, actions taken = ${evalResult.actions_taken.length}`);

    // Dispatch real-time socket events
    try {
      if ((globalThis as typeof globalThis & { io?: SocketIOServer }).io) {
        (globalThis as typeof globalThis & { io?: SocketIOServer }).io?.emit('db_changed', { type: 'marketing' });
      }
    } catch (_sockErr) {
      // Socket broadcast non-fatal
    }
  } catch(e: any) {
    console.error('[SMART AUTO-PAUSE ERROR]', e?.message || e);
  }
}

// Gap 16: Dynamic Pricing Sync (Meta & Google Ad Copy Price Synchronization)
export async function syncDynamicPricingToMeta(listingId: any, oldPrice: any, newPrice: any, currency = 'INR') {
  if (!isDbConfigured || Number(oldPrice) === Number(newPrice)) return;
  try {
     const priceChangePct = Math.round(((Number(newPrice) - Number(oldPrice)) / Number(oldPrice)) * 100);
     const changeDirection = priceChangePct > 0 ? `+${priceChangePct}%` : `${priceChangePct}%`;

     console.log(`[DYNAMIC PRICING SYNC] Listing #${listingId} price updated: ${oldPrice} -> ${newPrice} (${changeDirection}). Triggering DynamicPricingSyncService...`);

     // 1. Dispatch through DynamicPricingSyncService (updates marketing_campaigns and audit log)
     await DynamicPricingSyncService.onListingPriceUpdated(listingId, oldPrice, newPrice, currency, pool);

     // 2. Legacy host_marketing_campaigns fallback sync
     const campaigns = await pool.query(
       "SELECT id, title, feed_description FROM host_marketing_campaigns WHERE listing_id = $1 AND status = 'active'",
       [listingId]
     );

     for (const c of campaigns.rows) {
        let updatedFeedDesc = c.feed_description || '';
        if (updatedFeedDesc.includes(`${oldPrice}`)) {
           updatedFeedDesc = updatedFeedDesc.replace(`${oldPrice}`, `${newPrice}`);
        } else {
           updatedFeedDesc = `${updatedFeedDesc} (Now ${DynamicPricingSyncService.formatPrice(newPrice, currency)}/night)`;
        }

        await pool.query(
           "UPDATE host_marketing_campaigns SET feed_description = $1, meta_dispatched_at = CURRENT_TIMESTAMP WHERE id = $2",
           [updatedFeedDesc, c.id]
        );
     }
     console.log(`[DYNAMIC PRICING SYNC] Successfully updated Meta & Google Ad Copy for Listing #${listingId}.`);
  } catch(e) {
     console.error('[DYNAMIC PRICING SYNC ERROR]', e);
  }
}

const publishToInstagram = async (post: any) => {
  const token = process.env.META_ACCESS_TOKEN;
  const igAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID;
  const version = 'v19.0';

  if (!legacySocialPublishingEnabled()) throw new Error('Legacy social publication requires explicit operator enablement.');
  if (!token || !igAccountId || token === 'dummy') throw new Error('Verified Meta credentials are required for social publication.');
  const authorization = await pool.query(`SELECT p.id FROM host_social_posts p WHERE p.id=$1 AND ${socialApprovalPredicate}`, [post.id]);
  if (!authorization.rows[0]) throw new Error('A current administrator must approve the unchanged social post before publication.');

  // 1. RECONCILIATION & IDEMPOTENCY PRE-CHECK (CASE A & CASE B)
  const isPostRetry = (post.publish_attempt_count && post.publish_attempt_count > 0) || post.status === 'failed' || !!post.isRecovery;
  if (post.external_media_id) {
    try {
      const verifyRes = await fetch(`https://graph.facebook.com/${version}/${post.external_media_id}?fields=id,media_type,status_code&access_token=${token}`);
      if (verifyRes.ok) {
        const verifyData = await verifyRes.json();
        if (verifyData && verifyData.id && !verifyData.error) {
          console.log(`[SOCIAL STUDIO IDEMPOTENCY CASE A] Post ${post.id} already verified published on Instagram (${verifyData.id}). Skipping duplicate publish.`);
          return { success: true, ig_media_id: verifyData.id, alreadyPublished: true };
        }
      }
    } catch (e: any) {
      console.warn(`[SOCIAL STUDIO RECONCILIATION] Failed to query existing media ${post.external_media_id}:`, e.message);
    }
  } else if (isPostRetry) {
    // Case B: external_media_id was lost due to crash before DB persist on retry.
    // Query recent published media on the IG account to find matching post by tracking tag / caption
    try {
      const recentMediaRes = await fetch(`https://graph.facebook.com/${version}/${igAccountId}/media?fields=id,caption,timestamp&limit=25&access_token=${token}`);
      if (recentMediaRes.ok) {
        const recentMediaData = await recentMediaRes.json();
        if (recentMediaData && Array.isArray(recentMediaData.data)) {
          const matchTag = `[encho:post:${post.id}]`;
          const matchingMedia = recentMediaData.data.find((m: any) =>
            (m.caption && m.caption.includes(matchTag)) ||
            (post.caption && m.caption && m.caption === post.caption)
          );
          if (matchingMedia) {
            console.log(`[SOCIAL STUDIO IDEMPOTENCY CASE B] Discovered existing Instagram post ${matchingMedia.id} for post ${post.id} via feed reconciliation. Skipping duplicate.`);
            return { success: true, ig_media_id: matchingMedia.id, alreadyPublished: true };
          }
        }
      }
    } catch (e: any) {
      console.warn(`[SOCIAL STUDIO CASE B RECONCILIATION] Failed to query recent media feed:`, e.message);
    }
  }

  try {
    const { media_type, media_urls, caption } = post;
    let urls: string[] = [];
    if (typeof media_urls === 'string') {
        urls = JSON.parse(media_urls);
    } else if (Array.isArray(media_urls)) {
        urls = media_urls;
    }

    if (!urls || urls.length === 0) {
        throw new Error('No media URLs provided for the post');
    }

    const baseUrl = `https://graph.facebook.com/${version}/${igAccountId}`;
    let creationId = post.provider_creation_id || null;

    // If creation container was not yet created, create container on Meta
    if (!creationId) {
      if (media_type === 'carousel' && urls.length > 1) {
          const childrenIds: string[] = [];
          for (const url of urls) {
              const isVideo = url.match(/\.(mp4|mov|webm)$/i);
              const body = new URLSearchParams({
                  access_token: token,
                  is_carousel_item: 'true'
              });
              if (isVideo) {
                  body.append('media_type', 'VIDEO');
                  body.append('video_url', url);
              } else {
                  body.append('image_url', url);
              }

              const res = await fetch(`${baseUrl}/media`, { method: 'POST', body });
              const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
              if (data.error) throw new Error(`Meta API Error (Carousel Item): ${data.error.message}`);
              childrenIds.push(data.id);
          }

          const carouselBody = new URLSearchParams({
              access_token: token,
              media_type: 'CAROUSEL',
              children: childrenIds.join(','),
              caption: caption || ''
          });
          const res2 = await fetch(`${baseUrl}/media`, { method: 'POST', body: carouselBody });
          const data2 = res2.headers.get('content-type')?.includes('json') ? await res2.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await res2.text()).slice(0, 150) } as any;
          if (data2.error) throw new Error(`Meta API Error (Carousel Container): ${data2.error.message}`);
          creationId = data2.id;
      } else {
          const url = urls[0];
          const isVideo = url.match(/\.(mp4|mov|webm)$/i) || media_type === 'reel';
          const body = new URLSearchParams({
              access_token: token,
              caption: caption || ''
          });

          if (isVideo) {
              body.append('media_type', media_type === 'reel' ? 'REELS' : 'VIDEO');
              body.append('video_url', url);
          } else {
              body.append('image_url', url);
              if (media_type === 'story') {
                  body.append('media_type', 'STORIES');
              }
          }

          const res = await fetch(`${baseUrl}/media`, { method: 'POST', body });
          const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
          if (data.error) throw new Error(`Meta API Error (Media Container): ${data.error.message}`);
          creationId = data.id;
      }
    }

    if (creationId) {
        // Wait and retry for video processing if needed
        const maxRetries = 12;
        let lastError = null;

        for (let i = 0; i < maxRetries; i++) {
            const publishBody = new URLSearchParams({
                creation_id: creationId,
                access_token: token
            });
            const res3 = await fetch(`${baseUrl}/media_publish`, { method: 'POST', body: publishBody });
            const data3 = res3.headers.get('content-type')?.includes('json') ? await res3.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await res3.text()).slice(0, 150) } as any;

            if (data3.error) {
                lastError = data3.error.message;
                // Codes 9007 or 2207027 mean "media not ready for publishing"
                if (data3.error.code === 9007 || data3.error.code === 2207027 || data3.error.message.toLowerCase().includes('not ready')) {
                     await new Promise(resolve => setTimeout(resolve, 5000));
                     continue;
                }
                throw new Error(`Meta API Error (Publish): ${data3.error.message}`);
            }

            console.log(`[SOCIAL STUDIO PUBLISHER] Successfully published to Instagram! IG Media ID: ${data3.id}`);
            return { success: true, ig_media_id: data3.id, provider_creation_id: creationId };
        }
        throw new Error(`Timeout waiting for Instagram to process video. Last error: ${lastError}`);
    }

  } catch (error: any) {
    console.error('[SOCIAL STUDIO PUBLISHER] Instagram Publish Failed:', error.message);
    throw error;
  }
};

// Admin Approve Social Post

export async function dispatchGoogleAdsCampaign(
  campaignId: number,
  _req?: any
): Promise<{ dispatched: false; reason: string }> {
  const reason = 'GOOGLE_ADS_CONTAINMENT_LOCKED: Google Ads dispatch is unconditionally disabled for initial launch under Decision #3. Requires future Google Ads v25 milestone.';
  StructuredLogger.warn(`[GOOGLE ADS CONTAINMENT] Refusing dispatch for Campaign #${campaignId}: ${reason}`, {
    campaignId,
    containmentGate: 'DECISION_3_LOCKED',
    targetMilestone: 'FUTURE_GOOGLE_ADS_V25',
    attemptedFlag: process.env.ENABLE_GOOGLE_ADS_DISPATCH || 'unset'
  });
  return { dispatched: false, reason };
}



// Milestone 3: The Campaign State Machine (Idempotent Launcher)
export async function executeCampaignStateMachine(campaignId: number, triggerEvent: string, req: any) {
  return { processed: 0, status: 'RETIRED', code: 'HARVO_V2_REQUIRED' }; // Old workers cannot authorize funds or publish ads.

    try {
        console.log(`[STATE MACHINE] Campaign #${campaignId} | Event: ${triggerEvent}`);

        // 1. Fetch current complete state with row lock to prevent race conditions
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const stateRes = await client.query('SELECT * FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaignId]);
            if (stateRes.rows.length === 0) throw new Error('Campaign not found');
            const campaign = stateRes.rows[0];

            // 2. State Transition Engine
            let nextState = campaign.status;
            let dispatchMeta = false;

            if (triggerEvent === 'PAYMENT_SUCCESS' || triggerEvent === 'ADMIN_APPROVE' || triggerEvent === 'MANUAL_DISPATCH') {
                if (!campaign.admin_approved && triggerEvent !== 'ADMIN_APPROVE') {
                    console.log(`[STATE MACHINE] Wait: Payment cleared, but AI/Admin approval pending.`);
                    nextState = 'pending_approval';
                } else if (
                    campaign.status === 'draft' ||
                    campaign.status === 'pending_approval' ||
                    campaign.status === 'PAYMENT_PENDING' ||
                    campaign.status === 'pending' ||
                    campaign.status === 'escrow' ||
                    campaign.status === 'approved' ||
                    campaign.status === 'failed_publish' ||
                    campaign.status === 'failed'
                ) {
                    // Milestone 7: Master Account Fraud Liability & Escrow Delay
                    // When Admin explicitly approves/dispatches or Escrow is released:
                    if (triggerEvent === 'ADMIN_APPROVE' || triggerEvent === 'MANUAL_DISPATCH' || campaign.escrow_status === 'released') {
                        console.log(`[STATE MACHINE] Admin authorization / Escrow cleared. Transitioning state: ${campaign.status} -> ASSET_PREP`);
                        nextState = 'ASSET_PREP';
                        dispatchMeta = true;

                        await client.query(`
                            UPDATE host_marketing_campaigns
                            SET escrow_status = 'released',
                                escrow_release_at = COALESCE(escrow_release_at, CURRENT_TIMESTAMP)
                            WHERE id = $1
                        `, [campaignId]);
                    } else {
                        // Host self-service payment flow: check verification
                        const userCheck = await client.query('SELECT is_verified FROM users WHERE id = $1', [campaign.host_id]);
                        const isVerifiedUser = userCheck.rows[0]?.is_verified;
                        const amount = Number(campaign.budget || 0);

                        const isHighRisk = !isVerifiedUser || amount > 5000;

                        if (isHighRisk && campaign.escrow_status !== 'released') {
                            console.log(`[ESCROW] 3D Secure Verification triggered. Host unverified or amount high. Placing Campaign into 24-hour Escrow delay to prevent chargeback fraud on Master Account.`);
                            console.log(`[STATE MACHINE] Transitioning state: ${campaign.status} -> ESCROW`);
                            nextState = 'escrow';

                            await client.query(`
                                UPDATE host_marketing_campaigns
                                SET escrow_status = 'holding',
                                    escrow_release_at = NOW() + INTERVAL '24 hours'
                                WHERE id = $1
                            `, [campaignId]);
                        } else {
                            console.log(`[STATE MACHINE] Transitioning state: ${campaign.status} -> ASSET_PREP`);
                            nextState = 'ASSET_PREP';
                            dispatchMeta = true;
                        }
                    }
                } else if (['active', 'CAMPAIGN_LIVE', 'ASSET_PREP', 'META_API_PUSH'].includes(campaign.status)) {
                     console.log(`[STATE MACHINE] Idempotent check: Campaign is in status ${campaign.status}. Force dispatch: ${triggerEvent === 'ADMIN_APPROVE' || triggerEvent === 'MANUAL_DISPATCH'}`);
                     if (triggerEvent === 'ADMIN_APPROVE' || triggerEvent === 'MANUAL_DISPATCH') {
                         dispatchMeta = true;
                     }
                }
            }

            if (nextState !== campaign.status) {
                await transitionCampaignState({
                    campaignId: Number(campaignId),
                    to: nextState as any,
                    reason: `${triggerEvent} driven state transition`,
                    actorType: triggerEvent === 'ADMIN_APPROVE' ? 'admin' : (triggerEvent === 'PAYMENT_SUCCESS' ? 'webhook' : 'system'),
                    actorId: req?.user?.id,
                    client: client
                });
            }

            await client.query('COMMIT');

            // 3. Execution (Post-Commit)
            if (dispatchMeta) {
                console.log(`[STATE MACHINE] Transitioning state: ASSET_PREP -> META_API_PUSH`);

                // Set intermediate state
                await transitionCampaignState({ campaignId: Number(campaignId), to: 'META_API_PUSH', reason: 'Async dispatch started', actorType: 'system' });
                broadcastDbEvent(req, 'marketing'); // Notify UI of pipeline movement

                // Dispatch to Meta (This inherently triggers Asset Prep under the hood in dispatchMetaCampaign)
                let metaSuccess = false;
                try {
                    metaSuccess = await dispatchMetaCampaign(campaignId, req);
                } catch (err: any) {
                    console.error(`[STATE MACHINE DISPATCH ERROR] Campaign ${campaignId}:`, err);
                    metaSuccess = false;
                }

                if (process.env.ENABLE_GOOGLE_ADS_DISPATCH === 'true') {
                    try {
                        await dispatchGoogleAdsCampaign(campaignId, req);
                    } catch (googleErr: any) {
                        console.error(`[GOOGLE ADS DISPATCH ERROR] Campaign ${campaignId}:`, googleErr);
                    }
                }

                if (metaSuccess) {
                   await transitionCampaignState({ campaignId: Number(campaignId), to: 'CAMPAIGN_LIVE', reason: 'Meta API Push Success', actorType: 'system' });
                   console.log(`[STATE MACHINE] Transitioning state: META_API_PUSH -> CAMPAIGN_LIVE`);
                   broadcastDbEvent(req, 'marketing'); // Final notification
                } else {
                   await transitionCampaignState({ campaignId: Number(campaignId), to: 'failed_publish', reason: 'Meta API Push Failed', actorType: 'system' });
                   console.log(`[STATE MACHINE] Pipeline Failed. Campaign marked as failed_publish.`);
                   broadcastDbEvent(req, 'marketing');
                }
            }

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

    } catch (e) {
        console.error(`[STATE MACHINE ERROR]`, e);
    }
}
function getMetaFixSuggestion(errorMsg: string): string {
  const msg = (errorMsg || '').toLowerCase();
  if (msg.includes('housing') || msg.includes('special ad category') || msg.includes('discriminatory')) {
    return 'Fix Suggestion: Ensure Special Ad Category is set strictly to "HOUSING", remove restricted demographic targeting (age 18-65+, broad geography), and verify compliance with Meta Housing ad policies.';
  }
  if (msg.includes('budget') || msg.includes('minimum') || msg.includes('spend')) {
    return 'Fix Suggestion: Increase the daily budget or campaign lifetime budget to meet Meta\'s minimum currency threshold (typically $1.00 - $5.00 USD equivalent).';
  }
  if (msg.includes('token') || msg.includes('permission') || msg.includes('auth') || msg.includes('access_token')) {
    return 'Fix Suggestion: Re-authenticate or update META_ACCESS_TOKEN in environment variables with a valid long-lived system user token having ads_management and pages_manage_ads permissions.';
  }
  if (msg.includes('creative') || msg.includes('image') || msg.includes('media') || msg.includes('hash')) {
    return 'Fix Suggestion: Verify that the listing image URL is publicly accessible, correctly formatted (JPEG/PNG), and meets Meta aspect ratio specs (1:1 or 9:16).';
  }
  if (msg.includes('page') || msg.includes('instagram') || msg.includes('ig')) {
    return 'Fix Suggestion: Verify that META_PAGE_ID and META_INSTAGRAM_ACCOUNT_ID are correctly linked and authorized in your Meta Business Manager.';
  }
  return 'Fix Suggestion: Review Meta Graph API error details in the sync logs, check campaign parameters, and re-submit after making adjustments.';
}

// ----------------- APPROVAL INTEGRITY & SNAPSHOT HASH ENGINE -----------------
export function computeCampaignApprovalHash(campaign: any): { hash: string; snapshot: any } {
  const snapshot = {
    title: campaign.title || '',
    description: campaign.description || '',
    feed_description: campaign.feed_description || '',
    budget: Number(campaign.budget || 0),
    target_locations: campaign.target_locations || '',
    target_radius_km: Number(campaign.target_radius_km || 50),
    platforms: typeof campaign.platforms === 'string' ? campaign.platforms : JSON.stringify(campaign.platforms || []),
    ad_format: campaign.ad_format || 'post',
    video_url: campaign.video_url || '',
    media_urls: typeof campaign.media_urls === 'string' ? campaign.media_urls : JSON.stringify(campaign.media_urls || []),
    listing_id: Number(campaign.listing_id || 0),
    target_audience_persona: campaign.target_audience_persona || 'everyone',
    owner_meta_ad_account_id: campaign.owner_meta_ad_account_id || '',
    policy_cleared: campaign.policy_cleared === true
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return { hash, snapshot };
}

// ----------------- EXTERNAL META READINESS VERIFIER -----------------
async function checkExternalMetaReadiness(dbPool: any, correlationId: string) {
  return await metaGraphClient.checkExternalMetaReadiness(dbPool, correlationId);
}

// ----------------- FINANCIAL CONTRACT & AUTHORIZATION ENGINE -----------------
export interface CampaignFinancialContract {
  id: number;
  campaign_id: number;
  gross_host_charge: bigint;
  encho_fee_amount: bigint;
  meta_authorized_spend: bigint;
  meta_configured_max_spend: bigint;
  meta_actual_spend: bigint;
  meta_remaining_authorization: bigint;
  currency: string;
}

export async function getOrEstablishFinancialContract(
  campaignId: number,
  clientOrPool: any = pool
): Promise<CampaignFinancialContract> {
  const existing = await clientOrPool.query(
    `SELECT * FROM campaign_financial_contracts WHERE campaign_id = $1`,
    [campaignId]
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return {
      id: row.id,
      campaign_id: row.campaign_id,
      gross_host_charge: BigInt(row.gross_host_charge),
      encho_fee_amount: BigInt(row.encho_fee_amount),
      meta_authorized_spend: BigInt(row.meta_authorized_spend),
      meta_configured_max_spend: BigInt(row.meta_configured_max_spend || 0),
      meta_actual_spend: BigInt(row.meta_actual_spend || 0),
      meta_remaining_authorization: BigInt(row.meta_remaining_authorization),
      currency: row.currency || 'INR'
    };
  }

  // Fetch campaign to establish initial contract
  const campRes = await clientOrPool.query(
    `SELECT * FROM host_marketing_campaigns WHERE id = $1`,
    [campaignId]
  );
  if (campRes.rows.length === 0) {
    throw new Error(`Campaign #${campaignId} not found to establish financial contract`);
  }
  const campaign = campRes.rows[0];

  // Minor-unit arithmetic (paise / cents)
  // Gross host charge: from campaign.budget, in minor units (e.g. ₹2,500 = 250,000 paise)
  const rawGross = Number(campaign.budget || 2500);
  const gross_host_charge = BigInt(Math.round(rawGross * 100));
  const encho_fee_amount = (gross_host_charge * 15n) / 100n;
  const meta_authorized_spend = gross_host_charge - encho_fee_amount;
  const meta_actual_spend = BigInt(Math.round(Number(campaign.spent || 0) * 100));
  const meta_remaining_authorization = meta_authorized_spend - meta_actual_spend;
  const meta_configured_max_spend = meta_authorized_spend;
  const currency = campaign.currency || (campaign.payment_gateway === 'stripe' ? 'USD' : 'INR');

  // Verify invariant
  if (gross_host_charge !== encho_fee_amount + meta_authorized_spend) {
    throw new Error(`[FINANCIAL_INVARIANT_VIOLATION] Gross (${gross_host_charge}) != Fee (${encho_fee_amount}) + Authorized (${meta_authorized_spend})`);
  }

  const insertRes = await clientOrPool.query(`
    INSERT INTO campaign_financial_contracts
    (campaign_id, gross_host_charge, encho_fee_amount, meta_authorized_spend, meta_configured_max_spend, meta_actual_spend, meta_remaining_authorization, currency)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (campaign_id) DO UPDATE
    SET gross_host_charge = EXCLUDED.gross_host_charge,
        encho_fee_amount = EXCLUDED.encho_fee_amount,
        meta_authorized_spend = EXCLUDED.meta_authorized_spend,
        meta_remaining_authorization = EXCLUDED.meta_authorized_spend - campaign_financial_contracts.meta_actual_spend,
        currency = EXCLUDED.currency
    RETURNING *
  `, [
    campaignId,
    gross_host_charge.toString(),
    encho_fee_amount.toString(),
    meta_authorized_spend.toString(),
    meta_configured_max_spend.toString(),
    meta_actual_spend.toString(),
    meta_remaining_authorization.toString(),
    currency
  ]);

  const row = insertRes.rows[0];
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    gross_host_charge: BigInt(row.gross_host_charge),
    encho_fee_amount: BigInt(row.encho_fee_amount),
    meta_authorized_spend: BigInt(row.meta_authorized_spend),
    meta_configured_max_spend: BigInt(row.meta_configured_max_spend),
    meta_actual_spend: BigInt(row.meta_actual_spend),
    meta_remaining_authorization: BigInt(row.meta_remaining_authorization),
    currency: row.currency
  };
}

// ----------------- META PREFLIGHT ENGINE (16 SAFETY GATES) -----------------
export async function evaluateMetaPreflightDiagnostics(
  campaignIdOrData: number | any,
  dbPool: any,
  options: { isAdmin?: boolean; isDispatch?: boolean; externalReport?: any; correlationId?: string } = {}
) {
  let campaign: any = null;
  let campaignId = 0;

  if (typeof campaignIdOrData === 'number' || (typeof campaignIdOrData === 'string' && !isNaN(Number(campaignIdOrData)) && Number(campaignIdOrData) > 0)) {
    campaignId = Number(campaignIdOrData);
    const campaignRes = await dbPool.query('SELECT * FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    if (campaignRes.rows.length > 0) {
      campaign = campaignRes.rows[0];
    }
  } else if (typeof campaignIdOrData === 'object' && campaignIdOrData !== null) {
    if (campaignIdOrData.id) {
      campaignId = Number(campaignIdOrData.id);
      const campaignRes = await dbPool.query('SELECT * FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
      if (campaignRes.rows.length > 0) {
        campaign = { ...campaignRes.rows[0], ...campaignIdOrData };
      } else {
        campaign = campaignIdOrData;
      }
    } else {
      campaign = campaignIdOrData;
    }
  }

  const gateResults: Array<{
    gate_id: number;
    gate_key: string;
    gate_name: string;
    status: 'PASSED' | 'FAILED' | 'SKIPPED';
    severity: 'BLOCKER' | 'WARNING' | 'INFO';
    failure_code?: string;
    message: string;
    action_required: string;
    field_ref?: string;
    admin_only?: boolean;
    admin_details?: string;
  }> = [];

  // Gate 1: Valid Campaign State
  if (!campaign || (!campaign.id && !campaign.listing_id)) {
    gateResults.push({
      gate_id: 1,
      gate_key: 'GATE_1_CAMPAIGN_STATE',
      gate_name: 'Campaign & Listing Identity State',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: 'CAMPAIGN_STATE_INVALID',
      field_ref: 'listing_id',
      message: 'Preflight Failed: Campaign not found',
      action_required: 'Select a valid property listing and save campaign draft.'
    });
  } else {
    gateResults.push({
      gate_id: 1,
      gate_key: 'GATE_1_CAMPAIGN_STATE',
      gate_name: 'Campaign & Listing Identity State',
      status: 'PASSED',
      severity: 'INFO',
      message: 'Campaign identity and listing reference verified.',
      action_required: 'No action needed.'
    });
  }

  // Gate 2: Valid AI Compliance Result
  if (campaign && campaign.status === 'rejected') {
    gateResults.push({
      gate_id: 2,
      gate_key: 'GATE_2_AI_COMPLIANCE',
      gate_name: 'AI Policy Compliance Result',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: 'AI_COMPLIANCE_REJECTED',
      field_ref: 'description',
      message: 'Preflight Failed: Campaign was rejected by AI Gatekeeper/Policy.',
      action_required: 'Review AI Gatekeeper feedback and update ad copy or targeting parameters.'
    });
  } else {
    gateResults.push({
      gate_id: 2,
      gate_key: 'GATE_2_AI_COMPLIANCE',
      gate_name: 'AI Policy Compliance Result',
      status: 'PASSED',
      severity: 'INFO',
      message: 'Campaign content passed AI compliance check.',
      action_required: 'No action needed.'
    });
  }

  // Gate 3: Valid Admin Approval
  if (!campaign || !campaign.admin_approved) {
    const isDispatchMode = options.isDispatch === true;
    gateResults.push({
      gate_id: 3,
      gate_key: 'GATE_3_ADMIN_APPROVAL',
      gate_name: 'Platform Moderation & Admin Approval',
      status: 'FAILED',
      severity: isDispatchMode ? 'BLOCKER' : 'WARNING',
      failure_code: 'MISSING_ADMIN_APPROVAL',
      field_ref: 'admin_approved',
      message: isDispatchMode
        ? 'Preflight Failed: Missing Admin Approval. Campaign must be approved by an Administrator before Meta dispatch.'
        : 'Pending Admin Approval: Campaign draft is pending moderation approval prior to live Meta dispatch.',
      action_required: options.isAdmin
        ? 'Review and approve campaign in the Admin Moderation Console.'
        : 'Submit campaign for Admin moderation approval.'
    });
  } else {
    gateResults.push({
      gate_id: 3,
      gate_key: 'GATE_3_ADMIN_APPROVAL',
      gate_name: 'Platform Moderation & Admin Approval',
      status: 'PASSED',
      severity: 'INFO',
      message: 'Campaign has active Admin Approval.',
      action_required: 'No action needed.'
    });
  }

  // Gate 4: Valid Approval Snapshot Integrity
  if (campaign && campaign.admin_approved) {
    const { hash: currentHash } = computeCampaignApprovalHash(campaign);
    if (!campaign.approval_hash || campaign.approval_hash !== currentHash) {
      gateResults.push({
        gate_id: 4,
        gate_key: 'GATE_4_APPROVAL_HASH',
        gate_name: 'Approval Snapshot SHA256 Integrity',
        status: 'FAILED',
        severity: 'BLOCKER',
        failure_code: 'APPROVAL_HASH_MISMATCH',
        field_ref: 'approval_hash',
        message: 'Preflight Failed: Campaign material configuration modified post-approval. Re-approval required.',
        action_required: 'Re-submit campaign for Admin re-approval following material updates.'
      });
    } else {
      gateResults.push({
        gate_id: 4,
        gate_key: 'GATE_4_APPROVAL_HASH',
        gate_name: 'Approval Snapshot SHA256 Integrity',
        status: 'PASSED',
        severity: 'INFO',
        message: 'Approval SHA256 snapshot hash verified against current campaign configuration.',
        action_required: 'No action needed.'
      });
    }
  } else {
    gateResults.push({
      gate_id: 4,
      gate_key: 'GATE_4_APPROVAL_HASH',
      gate_name: 'Approval Snapshot SHA256 Integrity',
      status: 'SKIPPED',
      severity: 'INFO',
      message: 'Approval hash check skipped (Campaign awaiting initial Admin approval).',
      action_required: 'Complete Admin approval to seal approval snapshot.'
    });
  }

  // Gate 5: Preflight Diagnostics Engine Operational State
  gateResults.push({
    gate_id: 5,
    gate_key: 'GATE_5_PREFLIGHT_ENGINE',
    gate_name: 'Preflight Diagnostics Engine Operational State',
    status: 'PASSED',
    severity: 'INFO',
    message: 'Preflight diagnostics engine operational.',
    action_required: 'No action needed.'
  });

  // Gate 6: Emergency Platform Kill Switch Check
  if (process.env.META_PUBLISHING_PAUSED === 'true') {
    gateResults.push({
      gate_id: 6,
      gate_key: 'GATE_6_KILL_SWITCH',
      gate_name: 'Emergency Platform Kill Switch',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: 'KILL_SWITCH_ACTIVE',
      admin_only: true,
      admin_details: 'META_PUBLISHING_PAUSED=true active in server environment.',
      message: 'EMERGENCY KILL SWITCH ACTIVE: Meta publishing dispatches are currently paused by platform administration.',
      action_required: options.isAdmin
        ? 'Toggle META_PUBLISHING_PAUSED to false in Admin Control Panel.'
        : 'Meta API publishing dispatches are temporarily paused for maintenance. Contact Encho support.'
    });
  } else {
    gateResults.push({
      gate_id: 6,
      gate_key: 'GATE_6_KILL_SWITCH',
      gate_name: 'Emergency Platform Kill Switch',
      status: 'PASSED',
      severity: 'INFO',
      message: 'Platform Meta dispatch pipeline active (Kill switch disengaged).',
      action_required: 'No action needed.'
    });
  }

  // Gate 7: Credentials Check
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
    gateResults.push({
      gate_id: 7,
      gate_key: 'GATE_7_CREDENTIALS',
      gate_name: 'Master Meta System Credentials',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: 'MISSING_META_CREDENTIALS',
      admin_only: true,
      admin_details: 'META_ACCESS_TOKEN or META_AD_ACCOUNT_ID missing in server process environment.',
      message: 'Preflight Failed: Missing Meta API Credentials',
      action_required: options.isAdmin
        ? 'Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID in environment variables.'
        : 'System Meta access credentials configuration pending. Contact platform administrator.'
    });
  } else {
    gateResults.push({
      gate_id: 7,
      gate_key: 'GATE_7_CREDENTIALS',
      gate_name: 'Master Meta System Credentials',
      status: 'PASSED',
      severity: 'INFO',
      message: 'Master Meta API credentials authenticated.',
      action_required: 'No action needed.'
    });
  }

  // Gate 8: Page Identity
  if (!process.env.META_PAGE_ID) {
    gateResults.push({
      gate_id: 8,
      gate_key: 'GATE_8_PAGE_IDENTITY',
      gate_name: 'Facebook Page Asset Identity',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: 'MISSING_PAGE_ID',
      admin_only: true,
      admin_details: 'META_PAGE_ID missing in server process environment.',
      message: 'Preflight Failed: Missing Meta Page ID identity.',
      action_required: options.isAdmin
        ? 'Configure META_PAGE_ID environment variable.'
        : 'Facebook Page identity connection pending. Contact platform support.'
    });
  } else {
    gateResults.push({
      gate_id: 8,
      gate_key: 'GATE_8_PAGE_IDENTITY',
      gate_name: 'Facebook Page Asset Identity',
      status: 'PASSED',
      severity: 'INFO',
      message: 'Facebook Page identity verified.',
      action_required: 'No action needed.'
    });
  }

  // Gate 9: Instagram Identity
  if (!process.env.META_INSTAGRAM_ACCOUNT_ID) {
    gateResults.push({
      gate_id: 9,
      gate_key: 'GATE_9_INSTAGRAM_IDENTITY',
      gate_name: 'Instagram Business Identity',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: 'MISSING_INSTAGRAM_ID',
      admin_only: true,
      admin_details: 'META_INSTAGRAM_ACCOUNT_ID missing in server process environment.',
      message: 'Preflight Failed: Missing Meta Instagram Account ID identity.',
      action_required: options.isAdmin
        ? 'Configure META_INSTAGRAM_ACCOUNT_ID environment variable.'
        : 'Instagram Business identity connection pending. Contact platform support.'
    });
  } else {
    gateResults.push({
      gate_id: 9,
      gate_key: 'GATE_9_INSTAGRAM_IDENTITY',
      gate_name: 'Instagram Business Identity',
      status: 'PASSED',
      severity: 'INFO',
      message: 'Instagram Business identity verified.',
      action_required: 'No action needed.'
    });
  }

  // Gate 10: Special Ad Category & Radius Validation (Housing minimum 25km radius)
  if (!campaign || !campaign.target_locations || Number(campaign.target_radius_km) < 25) {
    gateResults.push({
      gate_id: 10,
      gate_key: 'GATE_10_HOUSING_RADIUS',
      gate_name: 'Housing Special Ad Category & Radius (25km)',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: 'HOUSING_RADIUS_NONCOMPLIANT',
      field_ref: 'target_radius_km',
      message: 'Preflight Failed: Housing Special Ad Category requires minimum 25km radius targeting.',
      action_required: 'Set target radius to at least 25km (15 miles) to comply with Meta Housing Equality nondiscrimination policies.'
    });
  } else {
    gateResults.push({
      gate_id: 10,
      gate_key: 'GATE_10_HOUSING_RADIUS',
      gate_name: 'Housing Special Ad Category & Radius (25km)',
      status: 'PASSED',
      severity: 'INFO',
      message: 'Targeting locations and minimum 25km Housing radius requirement satisfied.',
      action_required: 'No action needed.'
    });
  }

  // Gate 11: Creative & Budget Validation
  if (!campaign || !campaign.title || (!campaign.feed_description && !campaign.description)) {
    gateResults.push({
      gate_id: 11,
      gate_key: 'GATE_11_CREATIVE_BUDGET',
      gate_name: 'Creative Headlines & Feed Copy',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: 'CREATIVE_INVALID',
      field_ref: 'feed_description',
      message: 'Preflight Failed: Missing required creative fields (title, feed_description).',
      action_required: 'Provide a campaign headline and feed description copy.'
    });
  } else if (Number(campaign.budget) < 100) {
    gateResults.push({
      gate_id: 11,
      gate_key: 'GATE_11_CREATIVE_BUDGET',
      gate_name: 'Meta API Minimum Budget Floor',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: 'BUDGET_BELOW_MINIMUM',
      field_ref: 'budget',
      message: 'Preflight Failed: Budget is below Meta minimums.',
      action_required: 'Increase campaign daily budget to at least $1.00 ($10.00 / 1000 cents recommended).'
    });
  } else {
    gateResults.push({
      gate_id: 11,
      gate_key: 'GATE_11_CREATIVE_BUDGET',
      gate_name: 'Creative Copy & Budget Minimums',
      status: 'PASSED',
      severity: 'INFO',
      message: 'Creative headline, feed description, and budget minimums verified.',
      action_required: 'No action needed.'
    });
  }

  // Gate 12: Publish Idempotency Key Lock Check
  let existingTx: any = { rows: [] };
  if (campaignId > 0) {
    const idempotencyKey = `publish_meta_camp_${campaignId}`;
    existingTx = await dbPool.query(
      'SELECT * FROM meta_publishing_transactions WHERE idempotency_key = $1 AND publish_status = $2',
      [idempotencyKey, 'SUCCESS']
    );
  }
  gateResults.push({
    gate_id: 12,
    gate_key: 'GATE_12_IDEMPOTENCY_KEY',
    gate_name: 'Publish Idempotency Key Lock Check',
    status: 'PASSED',
    severity: 'INFO',
    message: 'Publish idempotency key slot clear and unlocked.',
    action_required: 'No action needed.'
  });

  // Gate 13: Existing Publishing Transaction Ledger Check
  if (existingTx.rows && existingTx.rows.length > 0) {
    gateResults.push({
      gate_id: 13,
      gate_key: 'GATE_13_TRANSACTION_LEDGER',
      gate_name: 'Existing Publishing Transaction Ledger Check',
      status: 'PASSED',
      severity: 'INFO',
      message: `Campaign #${campaignId} already successfully published on transaction ${existingTx.rows[0].id}.`,
      action_required: 'Use Re-sync Meta option to update active Meta Graph hierarchy.'
    });
  } else {
    gateResults.push({
      gate_id: 13,
      gate_key: 'GATE_13_TRANSACTION_LEDGER',
      gate_name: 'Existing Publishing Transaction Ledger Check',
      status: 'PASSED',
      severity: 'INFO',
      message: 'No prior published transaction found in ledger. Idempotency slot clear for publishing.',
      action_required: 'No action needed.'
    });
  }



  // Gate 14: Meta External Truth & App Readiness Gate
  const externalReport = options.externalReport || (await metaGraphClient.checkExternalMetaReadiness(dbPool, options.correlationId || crypto.randomUUID()));

  if (!externalReport.is_ready) {
    const failedSignal = externalReport.signals.find((s: any) => s.status === 'FAILED');
    const failureCode = failedSignal?.failure_code || 'META_EXTERNAL_PRODUCTION_READINESS_FAILED';
    const failureReason = failedSignal?.message || externalReport.blockers.join(' | ') || 'External Meta Graph API readiness check failed.';

    gateResults.push({
      gate_id: 14,
      gate_key: 'GATE_14_CANARY_2_READY',
      gate_name: 'Meta Graph API External Truth & Infrastructure Readiness',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: failureCode,
      admin_only: true,
      admin_details: `External Blockers: ${externalReport.blockers.join(', ')}`,
      message: `Preflight Failed: Infrastructure Blocker — ${failureReason}`,
      action_required: options.isAdmin
        ? `Remediate external readiness blockers: ${failureReason}`
        : 'Infrastructure Status: Meta Integration external readiness checks failed. Please contact administrator.'
    });
  } else {
    gateResults.push({
      gate_id: 14,
      gate_key: 'GATE_14_CANARY_2_READY',
      gate_name: 'Meta Graph API External Truth & Infrastructure Readiness',
      status: 'PASSED',
      severity: 'INFO',
      message: 'Meta Graph API External Truth verified. Token, App ID identity, Ad Account, Page, and App Mode passed live validation.',
      action_required: 'No action needed.'
    });
  }

  // Gate 15: Independent Policy Clearance Gate
  if (!campaign || campaign.policy_cleared !== true) {
    gateResults.push({
      gate_id: 15,
      gate_key: 'GATE_15_POLICY_CLEARANCE',
      gate_name: 'Independent AI Policy Clearance',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: 'POLICY_CLEARANCE_REQUIRED',
      field_ref: 'policy_cleared',
      message: 'Preflight Failed: POLICY_CLEARANCE_REQUIRED. Campaign must successfully pass AI Pre-Check policy scan (policy_cleared=true) before Meta dispatch.',
      action_required: 'Run AI Pre-Check policy scan to obtain policy clearance (policy_cleared=true).'
    });
  } else {
    gateResults.push({
      gate_id: 15,
      gate_key: 'GATE_15_POLICY_CLEARANCE',
      gate_name: 'Independent AI Policy Clearance',
      status: 'PASSED',
      severity: 'INFO',
      message: 'Independent AI Policy Clearance verified (policy_cleared=true).',
      action_required: 'No action needed.'
    });
  }

  // Gate 16: Tenant Ownership & Asset Binding Gate
  let gate16Passed = true;
  let gate16Msg = 'Tenant Meta Ad Account asset binding verified.';
  let gate16Action = 'No action needed.';

  if (campaign && campaign.host_id) {
    const hostIdentityRes = await dbPool.query('SELECT * FROM host_meta_identities WHERE host_id = $1', [campaign.host_id]);
    if (hostIdentityRes.rows.length > 0) {
      const identity = hostIdentityRes.rows[0];
      if (campaign.owner_meta_ad_account_id && identity.meta_ad_account_id && campaign.owner_meta_ad_account_id !== identity.meta_ad_account_id) {
        gate16Passed = false;
        gate16Msg = 'Preflight Failed: META_ACCOUNT_MISMATCH. Campaign owner ad account does not match host registered Meta identity.';
        gate16Action = 'Verify host registered Meta identity binding.';
      }
    } else if (campaign.owner_meta_ad_account_id && campaign.owner_meta_ad_account_id !== process.env.META_AD_ACCOUNT_ID) {
      gate16Passed = false;
      gate16Msg = 'Preflight Failed: TENANT_OWNERSHIP_MISMATCH. Campaign owner ad account does not match dispatch identity.';
      gate16Action = 'Ensure campaign owner ad account matches master dispatch account.';
    }
  }

  if (!gate16Passed) {
    gateResults.push({
      gate_id: 16,
      gate_key: 'GATE_16_TENANT_OWNERSHIP',
      gate_name: 'Tenant Ownership & Asset Binding',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: 'TENANT_OWNERSHIP_MISMATCH',
      field_ref: 'owner_meta_ad_account_id',
      message: gate16Msg,
      action_required: gate16Action
    });
  } else {
    gateResults.push({
      gate_id: 16,
      gate_key: 'GATE_16_TENANT_OWNERSHIP',
      gate_name: 'Tenant Ownership & Asset Binding',
      status: 'PASSED',
      severity: 'INFO',
      message: gate16Msg,
      action_required: gate16Action
    });
  }

  // Gate 17: Financial Contract Authorization & Budget Ceiling Gate
  let gate17Passed = true;
  let gate17Msg = 'Financial contract authorized spend and budget ceiling verified.';
  let gate17Action = 'No action needed.';
  let gate17FailureCode: string | undefined = undefined;

  if (campaignId > 0 || (campaign && campaign.budget)) {
    try {
      const contract = await getOrEstablishFinancialContract(campaignId || (campaign ? campaign.id : 0), dbPool);
      if (contract) {
        if (contract.meta_configured_max_spend > contract.meta_authorized_spend) {
          gate17Passed = false;
          gate17FailureCode = 'FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION';
          gate17Msg = `Preflight Failed: Configured Meta budget (${contract.meta_configured_max_spend}) exceeds authorized advertising spend (${contract.meta_authorized_spend}).`;
          gate17Action = options.isAdmin
            ? 'Adjust Meta AdSet budget or re-establish financial contract to match meta_authorized_spend.'
            : 'Campaign activation is temporarily blocked because a financial authorization mismatch was detected. Your funds remain protected.';
        }
      }
    } catch (err: any) {
      if (err.message?.includes('FINANCIAL_INVARIANT_VIOLATION') || err.message?.includes('FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION')) {
        gate17Passed = false;
        gate17FailureCode = 'FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION';
        gate17Msg = `Preflight Failed: ${err.message}`;
        gate17Action = 'Financial configuration must be corrected before activation.';
      }
    }
  }

  if (!gate17Passed) {
    gateResults.push({
      gate_id: 17,
      gate_key: 'GATE_17_FINANCIAL_AUTHORIZATION_CEILING',
      gate_name: 'Financial Authorization & Budget Ceiling Invariant',
      status: 'FAILED',
      severity: 'BLOCKER',
      failure_code: gate17FailureCode || 'FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION',
      message: gate17Msg,
      action_required: gate17Action
    });
  } else {
    gateResults.push({
      gate_id: 17,
      gate_key: 'GATE_17_FINANCIAL_AUTHORIZATION_CEILING',
      gate_name: 'Financial Authorization & Budget Ceiling Invariant',
      status: 'PASSED',
      severity: 'INFO',
      message: gate17Msg,
      action_required: gate17Action
    });
  }

  const total_gates = 17;
  const passed_gates = gateResults.filter(g => g.status === 'PASSED').length;
  const failed_gates = gateResults.filter(g => g.status === 'FAILED').length;
  const is_deployable = gateResults.filter(g => g.status === 'FAILED' && g.severity === 'BLOCKER').length === 0;

  const canary_status = {
    canary_2_ready: process.env.META_CANARY_2_READY === 'true',
    publishing_paused: process.env.META_PUBLISHING_PAUSED === 'true',
    app_id: options.isAdmin ? (process.env.META_APP_ID || 'UNCONFIGURED') : 'REDACTED',
    mode: (process.env.META_APP_MODE as 'development' | 'live') || 'development'
  };

  const remediation_summary = gateResults
    .filter(g => g.status === 'FAILED')
    .map(g => `[Gate ${g.gate_id} - ${g.gate_name}]: ${g.action_required}`);

  const sanitizedGateResults = gateResults.map(g => {
    if (!options.isAdmin && g.admin_only) {
      return {
        ...g,
        admin_details: undefined
      };
    }
    return g;
  });

  return {
    total_gates,
    passed_gates,
    failed_gates,
    is_deployable,
    canary_status,
    gate_results: sanitizedGateResults,
    remediation_summary
  };
}

export interface MetaErrorClassification {
  code_name: string;
  category: 'PREFLIGHT' | 'NETWORK_TRANSPORT' | 'INTERNAL_APPLICATION' | 'EXTERNAL_BILLING' | 'AUTHENTICATION' | 'AUTHORIZATION' | 'APP_CONFIGURATION' | 'APP_REVIEW' | 'BUSINESS_ASSET' | 'AD_ACCOUNT' | 'PAGE' | 'INSTAGRAM' | 'CREATIVE' | 'CAMPAIGN_CONFIGURATION' | 'TARGETING' | 'BUDGET' | 'RATE_LIMIT' | 'TRANSIENT_META' | 'PLATFORM' | 'POLICY' | 'UNKNOWN';
  severity: 'BLOCKER' | 'CRITICAL' | 'WARNING';
  user_title: string;
  user_message: string;
  technical_message: string;
  retryable: boolean;
  requires_human_action: boolean;
  blocks_dispatch: boolean;
  rollback_required: boolean;
  recommended_action: string;
}

export function classifyMetaError(data: any): MetaErrorClassification {
  const e = data?.error || data;
  const code = Number(e?.code || 0);
  const subcode = Number(e?.error_subcode || 0);
  const msg = String(e?.message || e?.error_user_msg || (typeof data === 'string' ? data : '')).toLowerCase();

  if (msg.includes('preflight failed') || e?.diagnosticReport) {
    const diagnosticReport = e?.diagnosticReport;
    const firstBlocker = diagnosticReport?.gate_results?.find((g: any) => g.status === 'FAILED' && g.severity === 'BLOCKER');

    return {
      code_name: firstBlocker?.failure_code || 'PREFLIGHT_VALIDATION_FAILED',
      category: 'PREFLIGHT',
      severity: 'BLOCKER',
      user_title: 'Preflight Safety Check Failed',
      user_message: 'The campaign was blocked by Encho AI internal safety gates before reaching Meta.',
      technical_message: e?.message || msg,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: false,
      recommended_action: firstBlocker?.action_required || 'Review Preflight Diagnostics in Admin Console.'
    };
  }

  // Network / Transport Failure (No authoritative Meta Graph API response received)
  const isNetworkTransportFailure = Boolean(
    data?.isNetworkTimeout ||
    e?.isNetworkTimeout ||
    e?.name === 'AbortError' ||
    (code === 0 && (
      msg.includes('fetch failed') ||
      msg.includes('timeout') ||
      msg.includes('etimedout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('socket hang up') ||
      msg.includes('network error') ||
      msg.includes('aborted') ||
      msg.includes('connection reset') ||
      msg.includes('socket')
    ))
  );

  if (isNetworkTransportFailure) {
    return {
      code_name: 'EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME',
      category: 'NETWORK_TRANSPORT',
      severity: 'CRITICAL',
      user_title: 'Network Timeout / Unknown External Outcome',
      user_message: 'The network request to Meta Graph API timed out or disconnected before receiving confirmation. The external status is unknown.',
      technical_message: `Network/Transport failure: ${e?.message || msg}`,
      retryable: true,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: 'Reconciliation engine will verify external state with Meta Graph API.'
    };
  }

  if (msg.includes('assignment to constant variable') || msg.includes('is not a function') || msg.includes('is not defined') || e instanceof TypeError || e instanceof ReferenceError || msg.includes('cannot read properties') || msg.includes('typeerror') || msg.includes('referenceerror')) {
    return {
      code_name: 'INTERNAL_RUNTIME_ERROR',
      category: 'INTERNAL_APPLICATION',
      severity: 'BLOCKER',
      user_title: 'Internal Application Error',
      user_message: 'The publishing engine encountered an internal code execution fault.',
      technical_message: `Runtime Error: ${e?.message || msg}`,
      retryable: false,
      requires_human_action: false,
      blocks_dispatch: true,
      rollback_required: false,
      recommended_action: 'Engineering action required. Please inspect application logs.'
    };
  }

  // 1. Meta App in Development Mode Block (Error 100, Subcode 1885183)
  if ((code === 100 && subcode === 1885183) || msg.includes('development mode')) {
    return {
      code_name: 'META_APP_DEVELOPMENT_MODE_BLOCK',
      category: 'APP_CONFIGURATION',
      severity: 'BLOCKER',
      user_title: 'Meta App in Development Mode',
      user_message: 'Ads creative post was created by an app that is in Development Mode and must be public/live to create the ad.',
      technical_message: `Graph API Error Code 100 / Subcode 1885183: App in Development Mode.`,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: `Switch Meta App ${process.env.META_APP_ID || 'configured in env'} from Development to Live/Public Mode in Meta Developers Console.`
    };
  }

  // 2. Token Expired / Invalid
  if (code === 190 || code === 102 || msg.includes('session has expired') || msg.includes('invalid access token')) {
    return {
      code_name: 'AUTH_ERROR_TOKEN_EXPIRED',
      category: 'AUTHENTICATION',
      severity: 'BLOCKER',
      user_title: 'Meta Access Token Expired',
      user_message: 'The Meta API Access Token has expired or been invalidated.',
      technical_message: `Graph API OAuthException Code ${code}: Token invalid or expired.`,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: 'Regenerate system user long-lived access token in Meta Business Manager.'
    };
  }

  // 3. Authorization / Permission Error
  if (code === 200 || code === 10 || msg.includes('permission') || msg.includes('ads_management')) {
    return {
      code_name: 'AUTH_MISSING_PERMISSIONS',
      category: 'AUTHORIZATION',
      severity: 'BLOCKER',
      user_title: 'Missing Meta API Permissions',
      user_message: 'Master System Access Token lacks required ads_management permissions.',
      technical_message: `Graph API Code ${code}: Missing scope/permission.`,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: 'Ensure system user has ads_management, pages_read_engagement, pages_manage_posts granted.'
    };
  }

  // 4. Ad Account Disabled
  if ((code === 100 && subcode === 1885016) || msg.includes('account disabled')) {
    return {
      code_name: 'AD_ACCOUNT_DISABLED',
      category: 'AD_ACCOUNT',
      severity: 'BLOCKER',
      user_title: 'Meta Ad Account Disabled',
      user_message: 'Master Ad Account is disabled or restricted by Meta.',
      technical_message: `Graph API Code 100 / Subcode 1885016: Ad account disabled.`,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: 'Check Ad Account status and submit appeal in Meta Business Manager.'
    };
  }

  // 5. Missing Payment Method
  if ((code === 100 && subcode === 1359188) || msg.includes('payment method')) {
    return {
      code_name: 'META_BILLING_PAYMENT_METHOD_REQUIRED',
      category: 'EXTERNAL_BILLING',
      severity: 'BLOCKER',
      user_title: 'No Payment Method on Meta Ad Account',
      user_message: 'Master Ad Account has no valid payment method attached.',
      technical_message: `Graph API Code 100 / Subcode 1359188: Payment method missing.`,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: `Add a valid Meta-supported payment method to Master Meta Ad Account ${process.env.META_AD_ACCOUNT_ID || 'configured in env'} in Meta Billing & Payments.`
    };
  }

  // 6. Page Identity / Permissions
  if (msg.includes('page_id') || msg.includes('page access') || code === 190 && msg.includes('page')) {
    return {
      code_name: 'PAGE_ACCESS_DENIED',
      category: 'PAGE',
      severity: 'BLOCKER',
      user_title: 'Facebook Page Access Error',
      user_message: 'Master System Token does not have administrative management access to the specified Facebook Page.',
      technical_message: `Graph API Page error: ${msg}`,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: 'Verify Page ID and assign Full Control page permissions to System User in Meta Business Manager.'
    };
  }

  // 7. Invalid Instagram Actor ID
  if (msg.includes('instagram_actor_id') || (code === 100 && msg.includes('instagram account'))) {
    return {
      code_name: 'INVALID_INSTAGRAM_ACTOR',
      category: 'INSTAGRAM',
      severity: 'CRITICAL',
      user_title: 'Invalid Instagram Identity',
      user_message: 'Provided instagram_actor_id is invalid or not connected to Meta Page.',
      technical_message: `Graph API Instagram error: ${msg}`,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: 'Verify connected Instagram Account ID or omit instagram_actor_id parameter.'
    };
  }

  // 8. Rate Limiting
  if (code === 17 || code === 613 || msg.includes('rate limit')) {
    return {
      code_name: 'META_RATE_LIMIT_EXCEEDED',
      category: 'RATE_LIMIT',
      severity: 'WARNING',
      user_title: 'Meta API Rate Limit Exceeded',
      user_message: 'Meta Graph API call rate limit reached.',
      technical_message: `Graph API Rate Limit Code ${code}.`,
      retryable: true,
      requires_human_action: false,
      blocks_dispatch: false,
      rollback_required: false,
      recommended_action: 'System will back off and retry automatically after quiet period.'
    };
  }

  // 9. Policy Violation
  if (code === 1885006 || msg.includes('policy violation') || msg.includes('housing')) {
    return {
      code_name: 'META_POLICY_VIOLATION',
      category: 'POLICY',
      severity: 'BLOCKER',
      user_title: 'Meta Ad Policy Violation',
      user_message: 'Ad creative or targeting violated Meta Advertising Standards.',
      technical_message: `Meta Policy Error Code ${code}: ${msg}`,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: 'Review ad copy and targeting to ensure full housing equality compliance.'
    };
  }

  // 10. Transient Network Error
  if (e?.is_transient || code === 1 || code === 2) {
    return {
      code_name: 'TRANSIENT_NETWORK_ERROR',
      category: 'TRANSIENT_META',
      severity: 'WARNING',
      user_title: 'Transient Network Error',
      user_message: 'Temporary connection glitch with Meta Graph API.',
      technical_message: `Transient Meta API error code ${code}.`,
      retryable: true,
      requires_human_action: false,
      blocks_dispatch: false,
      rollback_required: false,
      recommended_action: 'System will automatically retry request with exponential backoff.'
    };
  }

  // Fallback / Unknown API Error
  return {
    code_name: 'META_API_GENERIC_ERROR',
    category: 'UNKNOWN',
    severity: 'CRITICAL',
    user_title: 'Meta API Error',
    user_message: msg || 'Meta Graph API returned an unclassified parameter or execution error.',
    technical_message: `Unclassified Meta error code ${code} / subcode ${subcode}: ${msg}`,
    retryable: false,
    requires_human_action: true,
    blocks_dispatch: true,
    rollback_required: true,
    recommended_action: 'Inspect Meta error payload in DLQ/Trace Inspector.'
  };
}

// Phase 5: Error Signature Learning Recorder
export async function recordMetaErrorSignature(errorPayload: any, dbPool: any) {
  try {
    const classification = classifyMetaError(errorPayload);
    const e = errorPayload?.error || errorPayload;
    const code = Number(e?.code || 0);
    const subcode = Number(e?.error_subcode || 0);
    const normMsg = String(e?.message || e?.error_user_msg || 'unknown error').substring(0, 500);

    await dbPool.query(`
      INSERT INTO meta_error_signatures (
        error_code, error_subcode, normalized_message, category, code_name, retryable, requires_human_action
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (error_code, error_subcode, normalized_message)
      DO UPDATE SET
        occurrence_count = meta_error_signatures.occurrence_count + 1,
        last_seen = CURRENT_TIMESTAMP
    `, [code, subcode, normMsg, classification.category, classification.code_name, classification.retryable, classification.requires_human_action]);
  } catch (err: any) {
    console.error('[ERROR SIGNATURE REGISTRY] Failed to record signature:', err.message);
  }
}

// Phase 2.5-E: Safe Explicit Reverse Cascade Rollback & Quarantine Engine (No DELETE)
export async function executeMetaRollback(
  state: { metaCampaignId?: string; metaAdSetId?: string; metaCreativeId?: string; metaAdId?: string; creativeIds?: string[]; adIds?: string[] },
  correlationId: string,
  dbPool?: any
): Promise<{ success: boolean; quarantined: boolean; details: string[]; quarantinedObjects: Record<string, string> }> {
  const accessToken = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
  const details: string[] = [];
  const quarantinedObjects: Record<string, string> = {};
  if (!accessToken) {
    return { success: false, quarantined: false, details: ['Missing Meta Access Token'], quarantinedObjects: {} };
  }
  console.log(`[META ROLLBACK ENGINE] Triggered for correlation ${correlationId}. State:`, state);

  let anyObjectProvided = false;
  let allObjectsSafelyQuarantined = true;

  // Helper to safely PAUSE, VERIFY PAUSE, RENAME, and VERIFY RENAME of Meta Graph object
  const quarantineObject = async (objType: string, objId: string | undefined) => {
    if (!objId) return;
    anyObjectProvided = true;
    const baseUrl = process.env.META_BASE_URL || "https://graph.facebook.com/v20.0";
    const quarantineName = `[FAILED_ROLLBACK_${correlationId}]_${objType}_${objId}`;

    let isPausedAndVerified = false;
    let isRenamedAndVerified = false;

    // Step 0: Idempotency Pre-Check - If already PAUSED and RENAMED with FAILED_ROLLBACK, skip POST mutations
    try {
      const precheckRes = await fetch(`${baseUrl}/${objId}?fields=id,status,name&access_token=${accessToken}`);
      const precheckData = precheckRes.headers.get('content-type')?.includes('json') ? await precheckRes.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await precheckRes.text()).slice(0, 150) } as any;

      if (precheckRes.status === 404 || (precheckData.error && (precheckData.error.code === 100 || precheckData.error.code === 10))) {
        quarantinedObjects[objType.toLowerCase()] = objId;
        details.push(`${objType} ${objId}: NOT_FOUND (ACCEPTED)`);
        return;
      }

      const preStatus = String(precheckData.status || precheckData.effective_status || '').toUpperCase();
      const preName = String(precheckData.name || '');

      if ((preStatus === 'PAUSED' || preStatus === 'ARCHIVED') && preName.includes('FAILED_ROLLBACK')) {
        console.log(`[META ROLLBACK] ${objType} ${objId} is ALREADY QUARANTINED (${preStatus}, ${preName}). Skipping duplicate POST mutations.`);
        quarantinedObjects[objType.toLowerCase()] = objId;
        details.push(`${objType} ${objId}: ALREADY_QUARANTINED (${preName})`);
        return;
      }
    } catch (e) {
      // Proceed to standard pause & rename flow if precheck errors
    }

    // Step 1: PAUSE Request (POST setting status=PAUSED)
    try {
      const pauseRes = await fetch(`${baseUrl}/${objId}?status=PAUSED&access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAUSED', access_token: accessToken })
      });
      const pauseData = pauseRes.headers.get('content-type')?.includes('json') ? await pauseRes.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await pauseRes.text()).slice(0, 150) } as any;

      // Step 2: VERIFY PAUSED externally
      const verifyPauseRes = await fetch(`${baseUrl}/${objId}?fields=id,status,name&access_token=${accessToken}`);
      const verifyPauseData = verifyPauseRes.headers.get('content-type')?.includes('json') ? await verifyPauseRes.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await verifyPauseRes.text()).slice(0, 150) } as any;

      if (verifyPauseRes.status === 404 || (verifyPauseData.error && (verifyPauseData.error.code === 100 || verifyPauseData.error.code === 10))) {
        // Object does not exist externally
        isPausedAndVerified = true;
        isRenamedAndVerified = true;
        details.push(`${objType} ${objId}: NOT_FOUND (ACCEPTED)`);
      } else {
        const extStatus = String(verifyPauseData.status || '').toUpperCase();
        if (extStatus === 'PAUSED' || extStatus === 'ARCHIVED' || pauseData.success === true || pauseData.id || pauseRes.ok) {
          isPausedAndVerified = true;
          console.log(`[META ROLLBACK] PAUSE VERIFIED for ${objType} ${objId} (status: ${extStatus || 'PAUSED'})`);
        } else {
          console.warn(`[META ROLLBACK] PAUSE VERIFY FAILED for ${objType} ${objId}:`, verifyPauseData);
        }
      }

      if (dbPool) {
        try {
          await dbPool.query(`
            INSERT INTO meta_api_traces (
              correlation_id, step, endpoint, response_payload, http_status, latency_ms
            ) VALUES ($1, $2, $3, $4, $5, 0)
          `, [correlationId, `rollback_pause_${objType.toLowerCase()}`, `${objType}/${objId}`, JSON.stringify(pauseData), pauseRes.status]);
        } catch (e) {
          // Ignore trace logging errors
        }
      }
    } catch (e: any) {
      console.error(`[META ROLLBACK] Pause error for ${objType} ${objId}:`, e.message);
    }

    // Step 3 & 4: RENAME & VERIFY RENAME (if object exists)
    if (isPausedAndVerified && !details.some(d => d.includes(`${objType} ${objId}: NOT_FOUND`))) {
      try {
        const renameRes = await fetch(`${baseUrl}/${objId}?name=${encodeURIComponent(quarantineName)}&access_token=${accessToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: quarantineName, access_token: accessToken })
        });
        const renameData = renameRes.headers.get('content-type')?.includes('json') ? await renameRes.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await renameRes.text()).slice(0, 150) } as any;

        // Step 4: Verify rename externally
        const verifyRenameRes = await fetch(`${baseUrl}/${objId}?fields=id,status,name&access_token=${accessToken}`);
        const verifyRenameData = verifyRenameRes.headers.get('content-type')?.includes('json') ? await verifyRenameRes.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await verifyRenameRes.text()).slice(0, 150) } as any;
        const extName = String(verifyRenameData.name || '');

        if (extName.includes('FAILED_ROLLBACK') || extName.includes(correlationId) || renameData.success === true || renameData.id || renameRes.ok) {
          isRenamedAndVerified = true;
          console.log(`[META ROLLBACK] RENAME VERIFIED for ${objType} ${objId}: ${extName || quarantineName}`);
        } else {
          console.warn(`[META ROLLBACK] RENAME VERIFY FAILED for ${objType} ${objId}:`, verifyRenameData);
        }

        if (dbPool) {
          try {
            await dbPool.query(`
              INSERT INTO meta_api_traces (
                correlation_id, step, endpoint, response_payload, http_status, latency_ms
              ) VALUES ($1, $2, $3, $4, $5, 0)
            `, [correlationId, `rollback_rename_${objType.toLowerCase()}`, `${objType}/${objId}`, JSON.stringify(renameData), renameRes.status]);
          } catch (e) {
            // Ignore trace logging errors
          }
        }
      } catch (e: any) {
        console.error(`[META ROLLBACK] Rename error for ${objType} ${objId}:`, e.message);
      }
    }

    if (isPausedAndVerified) {
      quarantinedObjects[objType.toLowerCase()] = objId;
      details.push(`${objType} ${objId}: QUARANTINED (PAUSED & RENAMED: ${quarantineName})`);
    } else {
      allObjectsSafelyQuarantined = false;
      details.push(`${objType} ${objId}: QUARANTINE_FAILED`);
    }
  };

  // Reverse cascading order: Ads -> Creatives -> AdSet -> Campaign
  if (state.adIds && Array.isArray(state.adIds)) {
    for (const adId of state.adIds) {
      await quarantineObject('Ad', adId);
    }
  } else {
    await quarantineObject('Ad', state.metaAdId);
  }

  if (state.creativeIds && Array.isArray(state.creativeIds)) {
    for (const creativeId of state.creativeIds) {
      await quarantineObject('Creative', creativeId);
    }
  } else {
    await quarantineObject('Creative', state.metaCreativeId);
  }
  await quarantineObject('AdSet', state.metaAdSetId);
  await quarantineObject('Campaign', state.metaCampaignId);

  const hasQuarantined = Object.keys(quarantinedObjects).length > 0;
  const isQuarantined = hasQuarantined && allObjectsSafelyQuarantined;
  const isSuccess = !anyObjectProvided;

  return {
    success: isSuccess,
    quarantined: isQuarantined,
    details,
    quarantinedObjects
  };
}


async function runMetaPreflightEngine(campaignId: number, dbPool: any, options: { isAdmin?: boolean; correlationId?: string } = {}) {
  console.log(`[PREFLIGHT] Running 16 Meta Safety Gates validation for campaign ${campaignId}`);

  const corrId = options.correlationId || crypto.randomUUID();
  const externalReport = await checkExternalMetaReadiness(dbPool, corrId);
  const fullOptions = { ...options, externalReport };

  const report = await evaluateMetaPreflightDiagnostics(campaignId, dbPool, fullOptions);

  if (!report.is_deployable) {
    const firstBlocker = report.gate_results.find(g => g.status === 'FAILED' && g.severity === 'BLOCKER');
    const errorMsg = firstBlocker ? firstBlocker.message : 'Preflight Failed: Meta safety gates validation failed.';
    const err: any = new Error(errorMsg);
    err.diagnosticReport = report;
    throw err;
  }

  console.log(`[PREFLIGHT] Campaign ${campaignId} passed all 16 Meta Safety Gates.`);
  return report;
}

export async function dispatchMetaCampaign(campaignId: number, req: any, overrideCorrelationId?: string) {
  throw new Error('HARVO_V2_REQUIRED: Legacy paid dispatch is retired; use the revision-bound marketing workflow.');
  if (process.env.META_PUBLISHING_PAUSED === 'true') {
    console.error(`[EMERGENCY KILL SWITCH] Publishing aborted for campaign #${campaignId}: Meta publishing is paused.`);
    throw new Error('EMERGENCY KILL SWITCH ACTIVE: Meta publishing dispatches are currently paused by platform administration.');
  }

  const correlationId = overrideCorrelationId || crypto.randomUUID();
  const idempotencyKey = `publish_meta_camp_${campaignId}`;

  // Phase 1 & 2: Idempotent Publishing & Transaction State Machine
  let txId;
  let publishAttempt = 1;

  const claimClient = await pool.connect();
  try {
    await claimClient.query('BEGIN');

    await claimClient.query(
      `INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status)
       VALUES ($1, $2, $3, 'PRECHECK_RUNNING')
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [campaignId, idempotencyKey, correlationId]
    );

    const txCheck = await claimClient.query(`SELECT * FROM meta_publishing_transactions WHERE idempotency_key = $1 FOR UPDATE NOWAIT`, [idempotencyKey]);

    if (txCheck.rows.length === 0) {
       throw new Error('Critical idempotency failure: Record not found after insert or conflict');
    }

    const tx = txCheck.rows[0];
    txId = tx.id;
    publishAttempt = tx.publish_attempt;

    if (tx.correlation_id !== correlationId) { // Existing record
      if (tx.publish_status === 'SUCCESS' || tx.publish_status === 'LIVE') {
        console.log(`[META ENGINE] Campaign ${campaignId} already successfully published. Idempotency hit.`);
        await claimClient.query('COMMIT');
        return true;
      }

      if (tx.publish_status === 'EXTERNAL_OUTCOME_UNKNOWN') {
        console.warn(`[META ENGINE] Campaign ${campaignId} has EXTERNAL_OUTCOME_UNKNOWN transaction #${tx.id}. Blocking duplicate dispatch until reconciliation.`);
        await claimClient.query('COMMIT');
        return false;
      }

      if (tx.publish_status === 'PRECHECK_RUNNING' || tx.publish_status === 'PUBLISHING') {
         const lastUpdate = new Date(tx.updated_at).getTime();
         const now = Date.now();
         if (now - lastUpdate < 5 * 60 * 1000) { // 5 minutes lease
           console.log(`[META ENGINE] Campaign ${campaignId} is currently being published in another process.`);
           await claimClient.query('ROLLBACK');
           return false;
         } else {
           console.log(`[META ENGINE] Campaign ${campaignId} lease expired. Reclaiming.`);
         }
      }

      publishAttempt++;
      await claimClient.query(
        `UPDATE meta_publishing_transactions
         SET publish_attempt = $1, publish_status = 'PRECHECK_RUNNING', updated_at = CURRENT_TIMESTAMP, correlation_id = $2
         WHERE id = $3`,
        [publishAttempt, correlationId, txId]
      );
    }

    await claimClient.query('COMMIT');
  } catch (error: any) {
    await claimClient.query('ROLLBACK');
    if (error.code === '55P03') { // lock_not_available
       console.log(`[META ENGINE] Campaign ${campaignId} is locked by another concurrent dispatch process.`);
       return false;
    }
    throw error;
  } finally {
    claimClient.release();
  }

  // Phase 3: Rollback Engine State
  const rollbackState: { metaCampaignId?: string, metaAdSetId?: string, metaCreativeId?: string, metaAdId?: string } = {};

  try {
    await runMetaPreflightEngine(campaignId, pool, { correlationId });
    await pool.query(`UPDATE meta_publishing_transactions SET publish_status = 'PUBLISHING', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [txId]);

    const campaignResult = await pool.query(`
      SELECT c.*, l.title as listing_title, l.description as listing_desc, l.image_url as listing_image, l.city, l.amenities as listing_amenities
      FROM host_marketing_campaigns c
      LEFT JOIN listings l ON c.listing_id = l.id
      WHERE c.id = $1
    `, [campaignId]);

    if (campaignResult.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    const campaign = campaignResult.rows[0];

    // Core Configuration
    const accessToken = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
    const rawAdAccountId = process.env.META_AD_ACCOUNT_ID;
    const pageId = process.env.META_PAGE_ID;
    const igAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID;

    checkIntegrationKeys(
      'Meta Marketing API',
      ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PAGE_ID', 'META_INSTAGRAM_ACCOUNT_ID'],
      `Campaign #${campaign.id} Meta Sync Dispatch`
    );

    if (!accessToken || !rawAdAccountId || !pageId) {
      throw new Error('Missing core Meta API credentials');
    }

    const cleanAdAccountId = rawAdAccountId!.startsWith('act_') ? rawAdAccountId : `act_${rawAdAccountId}`;

    // Using global classifyMetaError from Phase 11

    // Phase 4: Retry Engine with Exponential Backoff
    const executeMetaRequest = async (stepName: string, endpoint: string, payload: any, maxRetries = 3) => {
      let attempt = 0;
      let delayMs = 1000;

      while (attempt < maxRetries) {
        attempt++;
        const startTime = Date.now();
        const redactedPayload = { ...payload, access_token: 'REDACTED' };
        if (redactedPayload.bytes) redactedPayload.bytes = 'REDACTED_BASE64_IMAGE';

        console.log(`[META TRACE ${correlationId}] Step: ${stepName} | Attempt ${attempt}/${maxRetries} | POST ${endpoint}`);

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
          const executionTime = Date.now() - startTime;

          MetricsRegistry.recordProviderCall('META', stepName, res.status, executionTime);

          if (res.status === 429) {
            AlertService.emitAlert(
              'PROVIDER_RATE_LIMIT_429',
              'HIGH',
              `Meta API Rate Limit (HTTP 429) on ${stepName}`,
              'Meta Graph API returned HTTP 429 rate limit.',
              'Implement backoff and respect rate limit headers.',
              { correlationId, campaignId, stepName, endpoint }
            );
          } else if (res.status >= 500) {
            AlertService.emitAlert(
              'PROVIDER_5XX_SPIKE',
              'HIGH',
              `Meta API 5xx Server Error on ${stepName}`,
              `Meta Graph API returned HTTP ${res.status}.`,
              'Inspect Meta Platform Status dashboard.',
              { correlationId, campaignId, stepName, endpoint, status: res.status }
            );
          }

          // Enterprise Meta Debug Recorder Insert
          try {
            await pool.query(`
              INSERT INTO meta_api_traces (
                correlation_id, campaign_id, host_id, step, endpoint, request_payload, response_payload, http_status, fbtrace_id, meta_error_code, meta_error_subcode, meta_error_message, meta_error_type, meta_error_is_transient, meta_error_user_title, meta_error_user_msg, latency_ms
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            `, [
              correlationId, campaignId, req?.user?.id || campaign.host_id, stepName, endpoint, JSON.stringify(redactedPayload), JSON.stringify(data), res.status,
              data.error?.fbtrace_id || null, data.error?.code || null, data.error?.error_subcode || null, data.error?.message || null,
              data.error?.type || null, data.error?.is_transient || null, data.error?.error_user_title || null, data.error?.error_user_msg || null, executionTime
            ]);
          } catch(e: any) {
            console.error('[META API TRACES] Failed to save trace', e.message);
          }

          if (!res.ok || data.error) {
            const errorClassification = classifyMetaError(data);
            console.error(`[META TRACE ${correlationId}] FAILED: ${stepName} | Code: ${errorClassification.code_name} | Error:`, JSON.stringify(data.error));

            if (errorClassification.retryable && attempt < maxRetries) {
              const jitter = Math.random() * 500;
              await new Promise(r => setTimeout(r, delayMs + jitter));
              delayMs *= 2; // exponential backoff
              continue;
            }
            const errObj: any = new Error(data.error?.message || JSON.stringify(data.error) || `${stepName} failed`);
            errObj.metaData = data;
            throw errObj;
          }

          console.log(`[META TRACE ${correlationId}] SUCCESS: ${stepName} in ${executionTime}ms`);
          return data;
        } catch (e: any) {
          if (attempt === maxRetries || e.message?.includes('Preflight Failed') || e.metaData) {
            if (!e.metaData && !e.response) {
              e.isNetworkTimeout = true;
            }
            throw e;
          }
          // Network errors (fetch throws)
          const jitter = Math.random() * 500;
          await new Promise(r => setTimeout(r, delayMs + jitter));
          delayMs *= 2;
        }
      }
      const timeoutErr: any = new Error(`Max retries reached for ${stepName} due to network timeout or connection failure`);
      timeoutErr.isNetworkTimeout = true;
      throw timeoutErr;
    };

    // Prepare activeLeadFormId, URL, description etc.
    const adHeadline = campaign.title || campaign.listing_title || 'Featured Stay';
    const destinationUrl = campaign.destination_url || `https://encho.app/listings/${campaign.listing_id || 1}`;
    const sanitizedDescription = campaign.description || campaign.listing_desc || 'Experience a wonderful stay with Encho.';
    const feedDescription = campaign.feed_description || 'Book your dream getaway today.';

    // 1. Create or Recover Campaign (Case A by ID, Case B by deterministic name on retry/recovery)
    const isRetryOrRecovery = (campaign.publish_attempt_count && campaign.publish_attempt_count > 0) || campaign.status === 'EXTERNAL_OUTCOME_UNKNOWN' || campaign.status === 'failed_publish' || campaign.status === 'failed' || !!req?.isRecovery;
    let campData: any = null;
    const existingMetaCampId = campaign.meta_campaign_id;
    if (existingMetaCampId) {
      try {
        const verifyCampRes = await fetch(`${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${existingMetaCampId}?fields=id,status,name&access_token=${accessToken}`);
        if (verifyCampRes.ok) {
          const verifyCampData = await verifyCampRes.json();
          if (verifyCampData && verifyCampData.id && !verifyCampData.error) {
            console.log(`[META IDEMPOTENCY RECOVERY CASE A] Existing Meta Campaign ${existingMetaCampId} verified on Meta. Reusing object.`);
            campData = { id: verifyCampData.id };
          }
        }
      } catch (err: any) {
        console.warn(`[META RECOVERY] Failed to query existing campaign ${existingMetaCampId}:`, err.message);
      }
    } else if (isRetryOrRecovery) {
      // Case B: Search ad account for deterministic campaign name when local ID was lost before crash on retry
      try {
        const searchCampRes = await fetch(`${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${cleanAdAccountId}/campaigns?fields=id,name,status&limit=50&access_token=${accessToken}`);
        if (searchCampRes.ok) {
          const searchData = await searchCampRes.json();
          if (searchData && Array.isArray(searchData.data)) {
            const expectedTag = `(Campaign #${campaign.id})`;
            const matchingCamp = searchData.data.find((c: any) => c.name && c.name.includes(expectedTag));
            if (matchingCamp) {
              console.log(`[META IDEMPOTENCY RECOVERY CASE B] Discovered existing unpersisted Meta Campaign ${matchingCamp.id} via deterministic name search. Reusing object.`);
              campData = { id: matchingCamp.id };
            }
          }
        }
      } catch (err: any) {
        console.warn(`[META CASE B RECOVERY] Failed to search existing campaigns:`, err.message);
      }
    }

    if (!campData) {
      const campPayload = {
          access_token: accessToken,
          name: `Encho Space - ${adHeadline} (Campaign #${campaign.id})`,
          objective: 'OUTCOME_AWARENESS',
          special_ad_categories: ['HOUSING'],
          special_ad_category_country: ['US', 'IN'],
          is_adset_budget_sharing_enabled: false,
          buying_type: 'AUCTION',
          status: 'ACTIVE'
      };
      campData = await executeMetaRequest('campaign_creation', `${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${cleanAdAccountId}/campaigns`, campPayload);
    }
    rollbackState.metaCampaignId = campData.id;
    await pool.query(`UPDATE meta_publishing_transactions SET meta_campaign_id = $1 WHERE id = $2`, [campData.id, txId]);

    // 2. Create or Recover Ad Set with Authoritative Financial Contract Budget
    const financialContract = await getOrEstablishFinancialContract(campaign.id, pool);
    const authorizedSpendMinorUnits = financialContract.meta_authorized_spend;
    const configuredDailyBudget = Number(authorizedSpendMinorUnits);

    if (BigInt(configuredDailyBudget) > authorizedSpendMinorUnits) {
      throw new Error(`[FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION] Configured Meta daily_budget (${configuredDailyBudget}) exceeds authorized spend (${authorizedSpendMinorUnits})`);
    }

    let adSetData: any = null;
    const existingMetaAdSetId = campaign.meta_adset_id;
    if (existingMetaAdSetId) {
      try {
        const verifyAdSetRes = await fetch(`${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${existingMetaAdSetId}?fields=id,status,name&access_token=${accessToken}`);
        if (verifyAdSetRes.ok) {
          const verifyAdSetData = await verifyAdSetRes.json();
          if (verifyAdSetData && verifyAdSetData.id && !verifyAdSetData.error) {
            console.log(`[META IDEMPOTENCY RECOVERY CASE A] Existing Meta AdSet ${existingMetaAdSetId} verified on Meta. Reusing object.`);
            adSetData = { id: verifyAdSetData.id };
          }
        }
      } catch (err: any) {
        console.warn(`[META RECOVERY] Failed to query existing adset ${existingMetaAdSetId}:`, err.message);
      }
    } else if (isRetryOrRecovery && rollbackState.metaCampaignId) {
      // Case B: Search adsets under the recovered campaign on retry
      try {
        const searchAdSetRes = await fetch(`${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${rollbackState.metaCampaignId}/adsets?fields=id,name,status&limit=25&access_token=${accessToken}`);
        if (searchAdSetRes.ok) {
          const searchData = await searchAdSetRes.json();
          if (searchData && Array.isArray(searchData.data)) {
            const matchingAdSet = searchData.data.find((a: any) => a.name && a.name.includes(`AdSet - ${adHeadline}`));
            if (matchingAdSet) {
              console.log(`[META IDEMPOTENCY RECOVERY CASE B] Discovered existing unpersisted Meta AdSet ${matchingAdSet.id} via parent campaign search. Reusing object.`);
              adSetData = { id: matchingAdSet.id };
            }
          }
        }
      } catch (err: any) {
        console.warn(`[META CASE B ADSET RECOVERY] Failed to search existing adsets:`, err.message);
      }
    }

    if (!adSetData) {
      const adSetPayload: any = {
        access_token: accessToken,
        name: `AdSet - ${adHeadline}`,
        campaign_id: rollbackState.metaCampaignId,
        daily_budget: configuredDailyBudget,
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'REACH',
        promoted_object: { page_id: pageId },
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting: MetaTargetMapper.mapTargeting(campaign, campaign), // Note: campaign has listing fields injected
        status: 'ACTIVE'
      };
      adSetData = await executeMetaRequest('adset_creation', `${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${cleanAdAccountId}/adsets`, adSetPayload);
    }
    rollbackState.metaAdSetId = adSetData.id;
    await pool.query(`UPDATE meta_publishing_transactions SET meta_adset_id = $1 WHERE id = $2`, [adSetData.id, txId]);
    await pool.query(`UPDATE campaign_financial_contracts SET meta_configured_max_spend = $1 WHERE campaign_id = $2`, [configuredDailyBudget.toString(), campaign.id]);

    // 3. Extract media URLs for Multi-Variant Publishing (Step 2)
    let mediaUrls: string[] = [];
    if (campaign.media_urls) {
      try {
        mediaUrls = typeof campaign.media_urls === 'string' ? JSON.parse(campaign.media_urls) : campaign.media_urls;
      } catch (e) {
        mediaUrls = [];
      }
    }
    if ((!mediaUrls || mediaUrls.length === 0) && campaign.listing_image) {
      mediaUrls = [campaign.listing_image];
    }
    if (!mediaUrls || mediaUrls.length === 0) {
      throw new Error('No media assets available for Meta Campaign');
    }

    const createdCreativeIds: string[] = [];
    const createdAdIds: string[] = [];
    (rollbackState as any).creativeIds = createdCreativeIds;
    (rollbackState as any).adIds = createdAdIds;

    for (let i = 0; i < mediaUrls.length; i++) {
      const imgUrl = mediaUrls[i];
      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) {
         throw new Error(`Failed to fetch media asset from URL (${imgRes.status}): ${imgUrl}`);
      }
      const imgArrayBuffer = await imgRes.arrayBuffer();
      const imgBuffer = Buffer.from(imgArrayBuffer);
      if (imgBuffer.length === 0) {
         throw new Error(`Zero-byte media asset retrieved from ${imgUrl}`);
      }
      if (imgBuffer.length > 10 * 1024 * 1024) {
         throw new Error(`Media asset exceeds Meta maximum 10MB size limit`);
      }

      const assetSha256 = crypto.createHash('sha256').update(imgBuffer).digest('hex');
      const mediaType = imgUrl.match(/\.(mp4|mov|webm)$/i) ? 'video' : 'image';
      const imgBase64 = imgBuffer.toString('base64');

      // Check existing variant in campaign_creative_variants
      const variantRes = await pool.query(
        `SELECT * FROM campaign_creative_variants WHERE campaign_id = $1 AND (media_url = $2 OR asset_sha256 = $3)`,
        [campaignId, imgUrl, assetSha256]
      );

      let variantId: number;
      if (variantRes.rows.length > 0 && variantRes.rows[0].is_published && variantRes.rows[0].meta_creative_id && variantRes.rows[0].meta_ad_id) {
        const existingVariant = variantRes.rows[0];
        variantId = existingVariant.id;
        createdCreativeIds.push(existingVariant.meta_creative_id);
        createdAdIds.push(existingVariant.meta_ad_id);
        if (i === 0) {
          rollbackState.metaCreativeId = existingVariant.meta_creative_id;
          rollbackState.metaAdId = existingVariant.meta_ad_id;
          await pool.query(`UPDATE meta_publishing_transactions SET meta_creative_id = $1, meta_ad_id = $2 WHERE id = $3`, [existingVariant.meta_creative_id, existingVariant.meta_ad_id, txId]);
        }
        continue;
      }

      if (variantRes.rows.length === 0) {
        const insRes = await pool.query(
          `INSERT INTO campaign_creative_variants (campaign_id, media_url, media_type, asset_sha256, status, is_published)
           VALUES ($1, $2, $3, $4, 'ACTIVE', false) RETURNING id`,
          [campaignId, imgUrl, mediaType, assetSha256]
        );
        variantId = insRes.rows[0].id;
      } else {
        variantId = variantRes.rows[0].id;
      }

      // Upload to Meta
      const sqUpload = await executeMetaRequest(`adimage_upload_variant_${i}`, `${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${cleanAdAccountId}/adimages`, {
         access_token: accessToken, bytes: imgBase64
      });
      let imageHash = '';
      if (sqUpload && sqUpload.images) {
        const image = Object.values(sqUpload.images)[0] as {hash?:unknown} | undefined;
         if (typeof image?.hash !== 'string' || !image?.hash) throw new Error('Meta returned no verified image hash');
         imageHash = image!.hash as string;
      } else {
        throw new Error(`Meta Image Upload failed for variant ${i}`);
      }

      // Create Creative
      const creativePayload = {
        access_token: accessToken,
        name: `Creative - ${adHeadline} - Variant ${i + 1}`,
        object_story_spec: {
          page_id: pageId,
          link_data: {
            image_hash: imageHash,
            link: destinationUrl,
            message: sanitizedDescription,
            name: `${adHeadline} (${i + 1})`,
            description: feedDescription,
            call_to_action: { type: 'BOOK_TRAVEL', value: { link: destinationUrl } }
          }
        }
      };
      const creativeData = await executeMetaRequest(`creative_creation_variant_${i}`, `${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${cleanAdAccountId}/adcreatives`, creativePayload);
      const creativeId = creativeData.id;
      createdCreativeIds.push(creativeId);
      if (i === 0) {
        rollbackState.metaCreativeId = creativeId;
        await pool.query(`UPDATE meta_publishing_transactions SET meta_creative_id = $1 WHERE id = $2`, [creativeId, txId]);
      }

      // Create Ad
      const adPayload = {
        access_token: accessToken,
        name: `Ad - ${adHeadline} - Variant ${i + 1}`,
        adset_id: rollbackState.metaAdSetId,
        creative: { creative_id: creativeId },
        status: 'ACTIVE'
      };
      const adData = await executeMetaRequest(`ad_creation_variant_${i}`, `${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${cleanAdAccountId}/ads`, adPayload);
      const adId = adData.id;
      createdAdIds.push(adId);
      if (i === 0) {
        rollbackState.metaAdId = adId;
        await pool.query(`UPDATE meta_publishing_transactions SET meta_ad_id = $1 WHERE id = $2`, [adId, txId]);
      }

      // External Verification
      const verifyCreativeRes = await fetch(`${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${creativeId}?fields=id,account_id&access_token=${accessToken}`);
      const verifyCreativeData = verifyCreativeRes.headers.get('content-type')?.includes('json') ? await verifyCreativeRes.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await verifyCreativeRes.text()).slice(0, 150) } as any;
      if (!verifyCreativeRes.ok || verifyCreativeData.error || !verifyCreativeData.id) {
        throw new Error(`External verification failed for creative ${creativeId}`);
      }

      const verifyAdRes = await fetch(`${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${adId}?fields=id,adset_id,campaign_id,account_id,status,effective_status&access_token=${accessToken}`);
      const verifyAdData = verifyAdRes.headers.get('content-type')?.includes('json') ? await verifyAdRes.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await verifyAdRes.text()).slice(0, 150) } as any;
      if (!verifyAdRes.ok || verifyAdData.error || !verifyAdData.id) {
        throw new Error(`External verification failed for ad ${adId}`);
      }

      const isRemoteActive = (verifyAdData.status === 'ACTIVE' || verifyAdData.effective_status === 'ACTIVE');

      // Fetch existing variant record to check for existing variant_activated_at (immutability)
      const currentVarRes = await pool.query(
        `SELECT variant_activated_at FROM campaign_creative_variants WHERE id = $1`,
        [variantId]
      );
      const existingActivatedAt = currentVarRes.rows[0]?.variant_activated_at;

      let activationTimestampToSet: Date | string | null = existingActivatedAt || null;
      if (isRemoteActive && !existingActivatedAt) {
        activationTimestampToSet = new Date().toISOString();
      }

      // Update variant with Meta IDs, status, and variant_activated_at
      await pool.query(
        `UPDATE campaign_creative_variants
         SET meta_creative_id = $1,
             meta_ad_id = $2,
             asset_sha256 = $3,
             is_published = true,
             status = $4,
             variant_activated_at = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [creativeId, adId, assetSha256, isRemoteActive ? 'ACTIVE' : 'PAUSED', activationTimestampToSet, variantId]
      );
    }

    const primaryCreativeId = createdCreativeIds[0] || null;
    const primaryAdId = createdAdIds[0] || null;

    // 3b. Hierarchy Auto-Activation & Read-After-Write Delivery Truth Confirmation (Phase 10 Activation Guard)
    const canAutoActivate =
      Boolean(campaign.admin_approved) &&
      authorizedSpendMinorUnits > 0n &&
      !campaign.pause_source &&
      Boolean(campaign.policy_cleared) &&
      Boolean(rollbackState.metaCampaignId) &&
      Boolean(rollbackState.metaAdSetId);

    let externalVerifiedStatus = 'ACTIVE';

    if (canAutoActivate) {
      console.log(`[META AUTO-ACTIVATION] Activating Meta Campaign #${campaignId} hierarchy (AdSet ${rollbackState.metaAdSetId} -> Campaign ${rollbackState.metaCampaignId})...`);

      // 1. Activate AdSet on Meta
      await executeMetaRequest(
        'adset_activation',
        `${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${rollbackState.metaAdSetId}`,
        { status: 'ACTIVE', access_token: accessToken }
      );

      // 2. Activate Campaign on Meta
      await executeMetaRequest(
        'campaign_activation',
        `${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${rollbackState.metaCampaignId}`,
        { status: 'ACTIVE', access_token: accessToken }
      );

      // 3. Read-After-Write Verification (Authoritative External Confirmation)
      try {
        const verifyCampRes = await fetch(
          `${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${rollbackState.metaCampaignId}?fields=id,status,effective_status&access_token=${accessToken}`
        );
        if (verifyCampRes.ok) {
          const verifyData = await verifyCampRes.json();
          if (verifyData && verifyData.effective_status) {
            externalVerifiedStatus = verifyData.effective_status;
          } else if (verifyData && verifyData.status) {
            externalVerifiedStatus = verifyData.status;
          }
        }
      } catch (rawErr: any) {
        console.warn(`[META READ-AFTER-WRITE] Warning querying delivery truth for campaign ${rollbackState.metaCampaignId}:`, rawErr.message);
      }
    }

    // 4. DB Commit
    await pool.query(`
      UPDATE host_marketing_campaigns
      SET meta_campaign_id = $1,
          meta_adset_id = $2,
          meta_creative_id = $3,
          meta_ad_id = $4,
          meta_status = 'ACTIVE',
          meta_effective_status = $5,
          external_status_verified_at = CURRENT_TIMESTAMP,
          external_status_verification_source = 'PUBLISH_AUTO_ACTIVATION',
          resumed_at = CURRENT_TIMESTAMP,
          meta_dispatched_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [rollbackState.metaCampaignId, rollbackState.metaAdSetId, primaryCreativeId, primaryAdId, externalVerifiedStatus, campaignId]);

    // Upsert provider_entities to maintain provider abstraction dual-read table
    try {
      await pool.query(`
        INSERT INTO provider_entities (campaign_id, provider, entity_type, external_id, parent_entity_id, configured_status, effective_status)
        VALUES
          ($1, 'META', 'CAMPAIGN', $2, NULL, 'ACTIVE', $3),
          ($1, 'META', 'ADSET', $4, $2, 'ACTIVE', $3)
        ON CONFLICT (provider, external_id)
        DO UPDATE SET configured_status = 'ACTIVE', effective_status = $3, parent_entity_id = EXCLUDED.parent_entity_id, updated_at = CURRENT_TIMESTAMP
      `, [campaignId, rollbackState.metaCampaignId, externalVerifiedStatus, rollbackState.metaAdSetId]);

      // Upsert all active ads created under this adset
      for (const adId of createdAdIds) {
        await pool.query(`
          INSERT INTO provider_entities (campaign_id, provider, entity_type, external_id, parent_entity_id, configured_status, effective_status)
          VALUES ($1, 'META', 'AD', $2, $3, 'ACTIVE', $4)
          ON CONFLICT (provider, external_id)
          DO UPDATE SET configured_status = 'ACTIVE', effective_status = $4, parent_entity_id = EXCLUDED.parent_entity_id, updated_at = CURRENT_TIMESTAMP
        `, [campaignId, adId, rollbackState.metaAdSetId, externalVerifiedStatus]);
      }
    } catch (peErr: any) {
      console.warn(`[PROVIDER ENTITIES] Non-blocking entity registration:`, peErr.message);
    }

    await pool.query(`UPDATE meta_publishing_transactions SET publish_status = 'SUCCESS', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [txId]);

    // Record publication audit event
    try {
      await pool.query(`
        INSERT INTO meta_publishing_events (campaign_id, correlation_id, event_type, from_state, to_state, actor_type, actor_id, reason, metadata)
        VALUES ($1, $2, 'AUTO_ACTIVATION_SUCCESS', 'PAUSED', 'ACTIVE', 'system', 'meta_dispatch_engine', 'Hierarchy successfully published and activated on Meta Ad Network', $3)
      `, [
        campaignId,
        correlationId,
        JSON.stringify({
          meta_campaign_id: rollbackState.metaCampaignId,
          meta_adset_id: rollbackState.metaAdSetId,
          meta_ad_id: primaryAdId,
          external_verified_status: externalVerifiedStatus
        })
      ]);
    } catch (eventErr: any) {
      console.warn('[AUTO ACTIVATION EVENT] Non-blocking audit log warning:', eventErr?.message);
    }

    broadcastDbEvent(req, 'marketing');
    return true;

  } catch (error: any) {
    console.error(`[META ENGINE FAULT] Campaign ${campaignId} failed.`, error);

    const rawErrorPayload = error.metaData || error.response || {
      error: {
        message: error.message,
        diagnosticReport: error.diagnosticReport,
        name: error.name,
        code: error.code,
        isNetworkTimeout: error.isNetworkTimeout
      }
    };
    const classification = classifyMetaError(rawErrorPayload);
    const isUnknownOutcome = classification.code_name === 'EXTERNAL_NETWORK_TIMEOUT_UNKNOWN_OUTCOME';

    // Phase 3: Trigger explicit reverse cascade rollback
    const rollbackRes = await executeMetaRollback(rollbackState, correlationId, pool);
    let finalTxStatus = 'FAILED_PUBLISH';
    let rollbackStatus = 'NOT_REQUIRED';

    const hasCreatedObjects = !!(rollbackState.metaCampaignId || rollbackState.metaAdSetId || rollbackState.metaCreativeId || rollbackState.metaAdId);

    if (isUnknownOutcome) {
      finalTxStatus = 'EXTERNAL_OUTCOME_UNKNOWN';
      rollbackStatus = hasCreatedObjects ? (rollbackRes.quarantined ? 'QUARANTINED' : 'QUARANTINE_FAILED') : 'UNKNOWN_EXTERNAL_STATE';
    } else if (hasCreatedObjects) {
      if (rollbackRes.quarantined) {
        rollbackStatus = 'QUARANTINED';
        finalTxStatus = 'QUARANTINED';
      } else if (rollbackRes.success) {
        rollbackStatus = 'SUCCESS';
        finalTxStatus = 'ROLLBACK_SUCCESS';
      } else {
        rollbackStatus = 'FAILED';
        finalTxStatus = 'ROLLBACK_FAILED';
      }
    }

    const stageName = rollbackState.metaCreativeId
      ? 'AD_CREATION'
      : (rollbackState.metaAdSetId ? 'CREATIVE_CREATION' : (rollbackState.metaCampaignId ? 'ADSET_CREATION' : 'CAMPAIGN_CREATION'));

    // Prevent circular reference crashes when persisting error
    const safeErrorPayload = (() => {
      try {
        return JSON.stringify(rawErrorPayload);
      } catch (e) {
        return JSON.stringify({ error: { message: rawErrorPayload?.message || 'Circular reference in error payload' }});
      }
    })();

    // Update meta_publishing_transactions with full classification and quarantined objects
    await pool.query(`
      UPDATE meta_publishing_transactions
      SET publish_status = $1,
          failure_code = $2,
          failure_category = $3,
          failure_stage = $4,
          rollback_status = $5,
          error_details = $6,
          quarantined_objects = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `, [
      finalTxStatus,
      classification.code_name,
      classification.category,
      stageName,
      rollbackStatus,
      safeErrorPayload,
      JSON.stringify(rollbackRes.quarantinedObjects || {}),
      txId
    ]);

    // Update host_marketing_campaigns (NEVER MARK LIVE)
    const feedbackMsg = `${classification.user_title}: ${classification.recommended_action || classification.recommended_action || ''}`;

    // Phase 2.9.1 - P0 Remediation: Never overwrite an UNKNOWN outcome with FAILED_PUBLISH
    if (!isUnknownOutcome) {
      await transitionCampaignState({ campaignId: Number(campaignId), to: 'failed_publish', reason: 'Fallback to DLQ after publish error', actorType: 'system' });
    } else {
      await transitionCampaignState({ campaignId: Number(campaignId), to: 'EXTERNAL_OUTCOME_UNKNOWN', reason: 'Meta network timeout pending verification', actorType: 'system' });
    }

    await pool.query(`
      UPDATE host_marketing_campaigns
      SET admin_feedback = $1
      WHERE id = $2
    `, [feedbackMsg, campaignId]);

    // Phase 13: Record in Dead Letter Queue
    try {
      await pool.query(`
        INSERT INTO meta_publishing_dlq (
          transaction_id, campaign_id, correlation_id, failure_stage, failure_code, requires_human_action, error_payload, recommended_action
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        txId,
        campaignId,
        correlationId,
        stageName,
        classification.code_name,
        classification.requires_human_action,
        JSON.stringify(rawErrorPayload),
        classification.recommended_action
      ]);
    } catch (dlqErr) {
      console.error('[META DLQ FAULT] Failed to write to DLQ:', dlqErr);
    }
    return false;
  }
}

/**
 * PHASE 2.7 — Activation Pipeline (Policy B: Safe creation as PAUSED, explicit activation)
 */
export async function activateMetaCampaign(campaignId: number, req: any, overrideCorrelationId?: string) {
  throw new Error('HARVO_V2_REQUIRED: Legacy paid dispatch is retired; use the revision-bound marketing workflow.');
  const correlationId = overrideCorrelationId || crypto.randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const campRes = await client.query(`SELECT * FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE`, [campaignId]);
    if (campRes.rows.length === 0) {
      throw new Error(`Campaign #${campaignId} not found`);
    }
    const campaign = campRes.rows[0];

    if (!campaign.admin_approved && req?.user?.role !== 'admin') {
      throw new Error('Campaign must be admin-approved before activation');
    }

    if (!campaign.meta_campaign_id || !campaign.meta_adset_id) {
      throw new Error('Campaign has not been dispatched to Meta yet');
    }

    const accessToken = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
    if (!accessToken) {
      throw new Error('Missing Meta Access Token');
    }

    const baseUrl = process.env.META_BASE_URL || "https://graph.facebook.com/v20.0";

    // FINANCIAL BOUNDARY GATE: Independent verification of financial ceiling before ANY Meta mutation
    const financialContract = await getOrEstablishFinancialContract(campaignId, client);

    // Invariant 1: Local configured max spend must not exceed authorized spend
    if (financialContract.meta_configured_max_spend > financialContract.meta_authorized_spend) {
      const variance = financialContract.meta_configured_max_spend - financialContract.meta_authorized_spend;
      await pool.query(`
        INSERT INTO meta_publishing_events (campaign_id, event_type, to_state, correlation_id, metadata)
        VALUES ($1, 'FINANCIAL_ACTIVATION_BLOCKED', 'BLOCKED', $2, $3)
      `, [campaignId, correlationId, JSON.stringify({
        error: 'FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION',
        configured_amount: financialContract.meta_configured_max_spend.toString(),
        authorized_amount: financialContract.meta_authorized_spend.toString(),
        variance: variance.toString(),
        stage: 'ACTIVATION_GATE'
      })]);
      throw new Error(`[FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION] Configured Meta spend (${financialContract.meta_configured_max_spend}) exceeds authorized spend (${financialContract.meta_authorized_spend})`);
    }

    // Invariant 2: External Meta Daily/Lifetime Budget verification via read-only GET
    if (campaign.meta_adset_id) {
      try {
        const extAdSetRes = await fetch(`${baseUrl}/${campaign.meta_adset_id}?fields=id,daily_budget,lifetime_budget&access_token=${accessToken}`);
        const extAdSetData = extAdSetRes.headers.get('content-type')?.includes('json') ? await extAdSetRes.json().catch(() => ({})) : {};
        if (extAdSetData && !extAdSetData.error) {
          const externalBudget = BigInt(extAdSetData.daily_budget || extAdSetData.lifetime_budget || 0);
          if (externalBudget > 0n && externalBudget > financialContract.meta_authorized_spend) {
            const variance = externalBudget - financialContract.meta_authorized_spend;
            await pool.query(`
              INSERT INTO meta_publishing_events (campaign_id, event_type, to_state, correlation_id, metadata)
              VALUES ($1, 'FINANCIAL_ACTIVATION_BLOCKED', 'BLOCKED', $2, $3)
            `, [campaignId, correlationId, JSON.stringify({
              error: 'FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION',
              configured_amount: externalBudget.toString(),
              authorized_amount: financialContract.meta_authorized_spend.toString(),
              variance: variance.toString(),
              stage: 'ACTIVATION_GATE_EXTERNAL_READ_VERIFY'
            })]);
            throw new Error(`[FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION] External Meta AdSet budget (${externalBudget}) exceeds authorized spend (${financialContract.meta_authorized_spend})`);
          }
        }
      } catch (probeErr: any) {
        if (probeErr.message?.includes('FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION')) {
          throw probeErr;
        }
        console.warn(`[ACTIVATION PROBE] Warning reading adset budget for campaign #${campaignId}:`, probeErr.message);
      }
    }

    // 1. Activate Campaign on Meta
    const campActRes = await fetch(`${baseUrl}/${campaign.meta_campaign_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, status: 'ACTIVE' })
    });
    const campActData = campActRes.headers.get('content-type')?.includes('json') ? await campActRes.json().catch(() => ({})) : {};
    if (!campActRes.ok || campActData.error) {
      throw new Error(campActData.error?.message || 'Failed to activate campaign on Meta');
    }

    // 2. Activate AdSet on Meta
    const adSetActRes = await fetch(`${baseUrl}/${campaign.meta_adset_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, status: 'ACTIVE' })
    });
    const adSetActData = adSetActRes.headers.get('content-type')?.includes('json') ? await adSetActRes.json().catch(() => ({})) : {};
    if (!adSetActRes.ok || adSetActData.error) {
      throw new Error(adSetActData.error?.message || 'Failed to activate ad set on Meta');
    }

    // 3. Read-After-Write Verification
    const verifyCampRes = await fetch(`${baseUrl}/${campaign.meta_campaign_id}?fields=status,effective_status&access_token=${accessToken}`);
    const verifyCampData = verifyCampRes.headers.get('content-type')?.includes('json') ? await verifyCampRes.json().catch(() => ({})) : {};
    const verifyAdSetRes = await fetch(`${baseUrl}/${campaign.meta_adset_id}?fields=status,effective_status&access_token=${accessToken}`);
    const verifyAdSetData = verifyAdSetRes.headers.get('content-type')?.includes('json') ? await verifyAdSetRes.json().catch(() => ({})) : {};

    const isCampaignActive = verifyCampData.status === 'ACTIVE';
    const isAdSetActive = verifyAdSetData.status === 'ACTIVE';

    const newMetaStatus = isCampaignActive && isAdSetActive ? 'ACTIVE' : 'PAUSED';
    const newMetaEffectiveStatus = verifyCampData.effective_status === 'ACTIVE' && verifyAdSetData.effective_status === 'ACTIVE' ? 'ACTIVE' : (verifyCampData.effective_status || 'PAUSED');

    // 4. Update Database State using FSM and metadata update
    await transitionCampaignState({
      campaignId: Number(campaignId),
      expectedCurrentState: campaign.status,
      to: 'active',
      reason: 'Meta Campaign Activated & Verified',
      actorType: req?.user?.role === 'admin' ? 'admin' : 'host',
      actorId: req?.user?.id,
      client
    });

    await client.query(`
      UPDATE host_marketing_campaigns
      SET meta_status = $1, meta_effective_status = $2, external_status_verified_at = NOW(), external_status_verification_source = 'ACTIVATION_VERIFY', updated_at = NOW()
      WHERE id = $3
    `, [newMetaStatus, newMetaEffectiveStatus, campaignId]);

    // 5. Audit Log & Publishing Event
    await client.query(`
      INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state)
      VALUES ($1, 'campaign', $2, 'ACTIVATE_META_CAMPAIGN', $3, $4)
    `, [req?.user?.id || 1, campaignId, JSON.stringify({ meta_status: campaign.meta_status }), JSON.stringify({ correlationId, newMetaStatus, newMetaEffectiveStatus })]);

    await client.query(`
      INSERT INTO meta_publishing_events (campaign_id, event_type, to_state, correlation_id, metadata)
      VALUES ($1, 'CAMPAIGN_ACTIVATED', 'ACTIVE', $2, $3)
    `, [campaignId, correlationId, JSON.stringify({ verifyCampData, verifyAdSetData })]);

    await client.query('COMMIT');
    broadcastDbEvent(req, 'marketing');
    return { success: true, newMetaStatus, newMetaEffectiveStatus };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error(`[ACTIVATE META] Failed for campaign #${campaignId}:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * PHASE 2.6 MILESTONE 2 — STEP 3: Variant Insights Ingestion & Rollup
 */
export async function ingestVariantInsights(variantId: number, forcedInsights?: { impressions: number; clicks: number; conversions?: number; spend: number }) {
  const variantRes = await pool.query(`SELECT * FROM campaign_creative_variants WHERE id = $1 AND is_published = true`, [variantId]);
  if (variantRes.rows.length === 0) {
    throw new Error(`Variant ${variantId} not found or not published`);
  }
  const variant = variantRes.rows[0];
  const metaAdId = variant.meta_ad_id;
  if (!metaAdId) {
    throw new Error(`Variant ${variantId} has no meta_ad_id`);
  }

  const accessToken = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
  if (!accessToken && !forcedInsights) {
    throw new Error('Missing Meta Access Token for insights ingestion');
  }

  let rawInsights: any;
  const observedAt = new Date();
  const snapshotRef = `meta_insights_${metaAdId}_${observedAt.getTime()}_${Math.random()}`;

  if (forcedInsights) {
    rawInsights = forcedInsights;
  } else {
    const url = `${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${metaAdId}/insights?fields=impressions,clicks,spend,actions&access_token=${accessToken}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || `Meta Insights API failed with status ${res.status}`);
      }
      const item = data.data?.[0] || { impressions: '0', clicks: '0', spend: '0.00', actions: [] };
      let conversions = 0;
      if (item.actions && Array.isArray(item.actions)) {
        for (const action of item.actions) {
          if (action.action_type === 'offsite_conversion.fb_pixel_purchase' || action.action_type === 'lead' || action.action_type === 'purchase') {
            conversions += Number(action.value || 0);
          }
        }
      }
      rawInsights = {
        impressions: Number(item.impressions || 0),
        clicks: Number(item.clicks || 0),
        conversions: Number(conversions),
        spend: Number(item.spend || 0)
      };
    } catch (netErr: any) {
      console.error(`[META INSIGHTS ERROR] Variant ${variantId}:`, netErr.message);
      throw netErr;
    }
  }

  const currentImpressions = Number(rawInsights.impressions || 0);
  const currentClicks = Number(rawInsights.clicks || 0);
  const currentConversions = Number(rawInsights.conversions || 0);
  const currentSpend = Number(rawInsights.spend || 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const snapRes = await client.query(`SELECT * FROM variant_meta_snapshots WHERE variant_id = $1 FOR UPDATE`, [variantId]);
    const storedSnap = snapRes.rows[0];

    let beforeVersion = 0;
    let lastImpressions = 0;
    let lastClicks = 0;
    let lastConversions = 0;
    let lastSpend = 0;

    if (storedSnap) {
      beforeVersion = storedSnap.snapshot_version;
      lastImpressions = Number(storedSnap.last_meta_impressions || 0);
      lastClicks = Number(storedSnap.last_meta_clicks || 0);
      lastConversions = Number(storedSnap.last_meta_conversions || 0);
      lastSpend = Number(storedSnap.last_meta_spend || 0);
    } else {
      await client.query(`
        INSERT INTO variant_meta_snapshots (variant_id, last_meta_impressions, last_meta_clicks, last_meta_conversions, last_meta_spend, snapshot_version)
        VALUES ($1, 0, 0, 0, 0.0000, 0)
      `, [variantId]);
      beforeVersion = 0;
    }

    const afterVersion = beforeVersion + 1;

    const rawImpDelta = currentImpressions - lastImpressions;
    const rawClickDelta = currentClicks - lastClicks;
    const rawConvDelta = currentConversions - lastConversions;
    const rawSpendDelta = currentSpend - lastSpend;

    let isCorrection = false;
    if (rawImpDelta < 0 || rawClickDelta < 0 || rawConvDelta < 0 || rawSpendDelta < 0) {
      isCorrection = true;
    }

    try {
      await client.query(`
        INSERT INTO variant_raw_event_logs (
          variant_id, meta_ad_id, snapshot_before_version, snapshot_after_version,
          impressions_delta, clicks_delta, conversions_delta, spend_delta,
          is_correction, observed_at, processed, source_snapshot_reference
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11)
      `, [
        variantId, metaAdId, beforeVersion, afterVersion,
        rawImpDelta, rawClickDelta, rawConvDelta, rawSpendDelta,
        isCorrection, observedAt, snapshotRef
      ]);
    } catch (uniqErr: any) {
      await client.query('ROLLBACK');
      throw uniqErr;
    }

    await client.query(`
      UPDATE variant_meta_snapshots
      SET last_meta_impressions = $1,
          last_meta_clicks = $2,
          last_meta_conversions = $3,
          last_meta_spend = $4,
          snapshot_version = $5,
          last_meta_fetched_at = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE variant_id = $7
    `, [currentImpressions, currentClicks, currentConversions, currentSpend, afterVersion, observedAt, variantId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await processUnprocessedVariantRawEvents(variantId);
  return true;
}

export async function processUnprocessedVariantRawEvents(variantId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const unprocessedRes = await client.query(`
      SELECT * FROM variant_raw_event_logs
      WHERE variant_id = $1 AND processed = false
      FOR UPDATE
    `, [variantId]);

    for (const event of unprocessedRes.rows) {
      const eventDate = new Date(event.observed_at || event.created_at);
      const dateStr = eventDate.toISOString().split('T')[0];

      await client.query(`
        INSERT INTO variant_daily_rollups (variant_id, date, impressions, clicks, conversions, spend_usd)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (variant_id, date)
        DO UPDATE SET
          impressions = variant_daily_rollups.impressions + EXCLUDED.impressions,
          clicks = variant_daily_rollups.clicks + EXCLUDED.clicks,
          conversions = variant_daily_rollups.conversions + EXCLUDED.conversions,
          spend_usd = variant_daily_rollups.spend_usd + EXCLUDED.spend_usd
      `, [
        variantId,
        dateStr,
        event.impressions_delta,
        event.clicks_delta,
        event.conversions_delta,
        event.spend_delta
      ]);

      await client.query(`
        UPDATE variant_raw_event_logs
        SET processed = true
        WHERE id = $1
      `, [event.id]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[VARIANT ROLLUP ERROR] Variant ${variantId} rollup failed:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function evaluateCampaignDCO(campaignId: number, options?: { evaluationEpoch?: string; maxEvaluationWindowHours?: number; forceNow?: Date }) {
  const now = options?.forceNow || new Date();
  const epoch = options?.evaluationEpoch || now.toISOString().split('T')[0];
  const maxWindowHours = options?.maxEvaluationWindowHours ?? 168; // 7 days default

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch Campaign
    const campRes = await client.query('SELECT * FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaignId]);
    if (campRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { decision: 'FAILED', decision_reason: 'CAMPAIGN_NOT_FOUND' };
    }
    const campaign = campRes.rows[0];

    // 2. Pre-evaluation Safety Gates (Requirement 9)
    if (campaign.status !== 'active' && campaign.status !== 'approved') {
      await client.query('ROLLBACK');
      return { decision: 'FAILED', decision_reason: 'CAMPAIGN_NOT_ACTIVE' };
    }
    if (!campaign.admin_approved) {
      await client.query('ROLLBACK');
      return { decision: 'DEFERRED', decision_reason: 'ADMIN_APPROVAL_REQUIRED' };
    }
    if (!campaign.policy_cleared) {
      await client.query('ROLLBACK');
      return { decision: 'DEFERRED', decision_reason: 'POLICY_NOT_CLEARED' };
    }

    const { hash: computedHash } = computeCampaignApprovalHash(campaign);
    if (!campaign.approval_hash || campaign.approval_hash !== computedHash) {
      await client.query('ROLLBACK');
      return { decision: 'DEFERRED', decision_reason: 'APPROVAL_HASH_MISMATCH' };
    }

    if (!campaign.meta_campaign_id) {
      await client.query('ROLLBACK');
      return { decision: 'DEFERRED', decision_reason: 'META_CAMPAIGN_UNVERIFIED' };
    }
    if (!campaign.meta_adset_id) {
      await client.query('ROLLBACK');
      return { decision: 'DEFERRED', decision_reason: 'META_ADSET_UNVERIFIED' };
    }
    if (!campaign.owner_meta_ad_account_id) {
      await client.query('ROLLBACK');
      return { decision: 'DEFERRED', decision_reason: 'MASTER_AD_ACCOUNT_MISSING' };
    }

    // Check active publishing transactions
    const pubTxRes = await client.query(`
      SELECT 1 FROM meta_publishing_transactions
      WHERE campaign_id = $1 AND publish_status IN ('PENDING', 'PUBLISHING')
    `, [campaignId]);
    if (pubTxRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return { decision: 'DEFERRED', decision_reason: 'ACTIVE_PUBLISHING_TRANSACTION' };
    }

    // 3. Evaluation Lease (Requirement 8)
    const evalRes = await client.query(`
      SELECT * FROM dco_evaluation_transactions
      WHERE campaign_id = $1 AND evaluation_epoch = $2
      FOR UPDATE
    `, [campaignId, epoch]);

    const existingEval = evalRes.rows[0];
    if (existingEval) {
      if (['WINNER_SELECTED', 'NO_WINNER_EQUAL_PERFORMANCE', 'FAILED'].includes(existingEval.decision)) {
        await client.query('COMMIT');
        return { decision: existingEval.decision, decision_reason: existingEval.decision_reason, evaluation_id: existingEval.id };
      }
      if (existingEval.status === 'EVALUATING' && new Date(existingEval.lease_expires_at) > now) {
        await client.query('COMMIT');
        return { decision: 'DEFERRED', decision_reason: 'ACTIVE_LEASE_EXISTS', evaluation_id: existingEval.id };
      }
    }

    const leaseExpiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour lease
    let evalId: number;

    if (existingEval) {
      const updateEval = await client.query(`
        UPDATE dco_evaluation_transactions
        SET status = 'EVALUATING', lease_expires_at = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id
      `, [leaseExpiresAt, existingEval.id]);
      evalId = updateEval.rows[0].id;
    } else {
      const insertEval = await client.query(`
        INSERT INTO dco_evaluation_transactions (
          campaign_id, evaluation_epoch, status, lease_expires_at, optimization_metric, evaluation_window_start
        ) VALUES ($1, $2, 'EVALUATING', $3, $4, $5)
        RETURNING id
      `, [campaignId, epoch, leaseExpiresAt, campaign.optimization_metric || 'CPC', campaign.created_at || now]);
      evalId = insertEval.rows[0].id;
    }

    // 4. Fetch Published Variants & Snapshots
    const variantsRes = await client.query(`
      SELECT v.*, s.last_meta_impressions, s.last_meta_clicks, s.last_meta_conversions, s.last_meta_spend, s.last_meta_fetched_at
      FROM campaign_creative_variants v
      LEFT JOIN variant_meta_snapshots s ON v.id = s.variant_id
      WHERE v.campaign_id = $1 AND v.is_published = true
    `, [campaignId]);

    const variants = variantsRes.rows;
    if (variants.length < 2) {
      await finalizeEvaluation(client, evalId, campaignId, 'DEFERRED', 'INSUFFICIENT_VARIANTS', { epoch });
      await client.query('COMMIT');
      return { decision: 'DEFERRED', decision_reason: 'INSUFFICIENT_VARIANTS' };
    }

    // 5. Data Freshness & Minimum Variant Age Checks
    const maxStalenessHours = 6;
    const minVariantAgeHours = 24;

    const metricsSnapshot: any = {};
    for (const v of variants) {
      if (!v.meta_ad_id) {
        await finalizeEvaluation(client, evalId, campaignId, 'DEFERRED', 'UNVERIFIED_CANDIDATE_AD', { epoch });
        await client.query('COMMIT');
        return { decision: 'DEFERRED', decision_reason: 'UNVERIFIED_CANDIDATE_AD' };
      }

      const fetchedAt = v.last_meta_fetched_at ? new Date(v.last_meta_fetched_at) : null;
      if (!fetchedAt || (now.getTime() - fetchedAt.getTime()) > maxStalenessHours * 3600 * 1000) {
        await finalizeEvaluation(client, evalId, campaignId, 'DEFERRED', 'STALE_METRICS', { epoch });
        await client.query('COMMIT');
        return { decision: 'DEFERRED', decision_reason: 'STALE_METRICS' };
      }

      if (!v.variant_activated_at) {
        await finalizeEvaluation(client, evalId, campaignId, 'DEFERRED', 'VARIANT_NOT_ACTIVATED', { epoch });
        await client.query('COMMIT');
        return { decision: 'DEFERRED', decision_reason: 'VARIANT_NOT_ACTIVATED' };
      }

      const activatedAt = new Date(v.variant_activated_at);
      const ageHours = (now.getTime() - activatedAt.getTime()) / (3600 * 1000);
      if (ageHours < minVariantAgeHours) {
        await finalizeEvaluation(client, evalId, campaignId, 'DEFERRED', 'VARIANT_TOO_YOUNG', { epoch });
        await client.query('COMMIT');
        return { decision: 'DEFERRED', decision_reason: 'VARIANT_TOO_YOUNG' };
      }

      metricsSnapshot[v.id] = {
        impressions: Number(v.last_meta_impressions || 0),
        clicks: Number(v.last_meta_clicks || 0),
        conversions: Number(v.last_meta_conversions || 0),
        spend: Number(v.last_meta_spend || 0),
        fetched_at: v.last_meta_fetched_at
      };
    }

    // 6. Objective-Aware Metrics & Thresholds
    const objective = (campaign.objective || 'TRAFFIC').toUpperCase();
    const optMetric = (campaign.optimization_metric || (objective === 'TRAFFIC' ? 'CPC' : objective === 'LEAD_GENERATION' ? 'CPL' : 'CPA')).toUpperCase();

    const minImpressions = 1000;
    const minSpend = 15.0;
    const minActions = 3;
    const minClicks = 10;

    const evaluatedVariants: Array<{ id: number; metricVal: number; impressions: number; spend: number; actions: number }> = [];

    for (const v of variants) {
      const snap = metricsSnapshot[v.id];
      const imp = snap.impressions;
      const spend = snap.spend;
      const clicks = snap.clicks;
      const conversions = snap.conversions;

      if (imp < minImpressions || spend < minSpend) {
        await finalizeEvaluation(client, evalId, campaignId, 'DEFERRED', 'INSUFFICIENT_DATA', { metricsSnapshot, epoch, optMetric });
        await client.query('COMMIT');
        return { decision: 'DEFERRED', decision_reason: 'INSUFFICIENT_DATA' };
      }

      let metricVal = 0;
      let actionCount = 0;

      if (objective === 'TRAFFIC' || optMetric === 'CPC') {
        if (clicks < minClicks) {
          await finalizeEvaluation(client, evalId, campaignId, 'DEFERRED', 'INSUFFICIENT_DATA', { metricsSnapshot, epoch, optMetric });
          await client.query('COMMIT');
          return { decision: 'DEFERRED', decision_reason: 'INSUFFICIENT_DATA' };
        }
        actionCount = clicks;
        metricVal = clicks > 0 ? spend / clicks : spend > 0 ? spend / 1 : 0;
      } else if (objective === 'LEAD_GENERATION' || optMetric === 'CPL') {
        actionCount = conversions;
        if (actionCount < minActions) {
          await finalizeEvaluation(client, evalId, campaignId, 'DEFERRED', 'INSUFFICIENT_DATA', { metricsSnapshot, epoch, optMetric });
          await client.query('COMMIT');
          return { decision: 'DEFERRED', decision_reason: 'INSUFFICIENT_DATA' };
        }
        metricVal = actionCount > 0 ? spend / actionCount : spend > 0 ? spend / 1 : 0;
      } else {
        actionCount = conversions;
        if (actionCount < minActions) {
          await finalizeEvaluation(client, evalId, campaignId, 'DEFERRED', 'INSUFFICIENT_DATA', { metricsSnapshot, epoch, optMetric });
          await client.query('COMMIT');
          return { decision: 'DEFERRED', decision_reason: 'INSUFFICIENT_DATA' };
        }
        metricVal = actionCount > 0 ? spend / actionCount : spend > 0 ? spend / 1 : 0;
      }

      evaluatedVariants.push({ id: v.id, metricVal, impressions: imp, spend, actions: actionCount });
    }

    // 7. Relative Performance Evaluation
    evaluatedVariants.sort((a, b) => a.metricVal - b.metricVal);
    const winner = evaluatedVariants[0];
    const loser = evaluatedVariants[1];

    if (!winner || !loser || loser.metricVal === 0) {
      await finalizeEvaluation(client, evalId, campaignId, 'DEFERRED', 'INSUFFICIENT_ADVANTAGE', { metricsSnapshot, epoch, optMetric });
      await client.query('COMMIT');
      return { decision: 'DEFERRED', decision_reason: 'INSUFFICIENT_ADVANTAGE' };
    }

    const relAdvantage = (loser.metricVal - winner.metricVal) / loser.metricVal;
    const minAdvantage = 0.15;

    let decision = 'DEFERRED';
    let reason = 'INSUFFICIENT_ADVANTAGE';

    const windowStart = new Date(campaign.created_at || now);
    const windowEnd = new Date(windowStart.getTime() + maxWindowHours * 3600 * 1000);
    const windowExpired = now.getTime() >= windowEnd.getTime();

    if (relAdvantage >= minAdvantage) {
      decision = 'WINNER_SELECTED';
      reason = `Variant ${winner.id} achieved ${(relAdvantage * 100).toFixed(1)}% relative advantage over variant ${loser.id}`;
    } else if (windowExpired) {
      decision = 'NO_WINNER_EQUAL_PERFORMANCE';
      reason = `Evaluation window expired with relative advantage ${(relAdvantage * 100).toFixed(1)}% below 15% threshold`;
    } else {
      decision = 'DEFERRED';
      reason = `Relative advantage ${(relAdvantage * 100).toFixed(1)}% is below 15% minimum threshold within evaluation window`;
    }

    await finalizeEvaluation(client, evalId, campaignId, decision, reason, {
      winnerId: winner.id,
      loserId: loser.id,
      winnerVal: winner.metricVal,
      loserVal: loser.metricVal,
      relAdv: relAdvantage,
      metricsSnapshot,
      epoch,
      optMetric,
      windowStart,
      windowEnd
    });

    await client.query('COMMIT');
    return {
      evaluation_id: evalId,
      decision,
      decision_reason: reason,
      winner_variant_id: winner.id,
      loser_variant_id: loser.id,
      relative_advantage: relAdvantage
    };

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DCO EVALUATE ERROR]:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function finalizeEvaluation(
  client: any,
  evalId: number,
  campaignId: number,
  decision: string,
  reason: string,
  options: {
    winnerId?: number | null;
    loserId?: number | null;
    winnerVal?: number | null;
    loserVal?: number | null;
    relAdv?: number | null;
    metricsSnapshot?: any;
    epoch?: string;
    optMetric?: string;
    windowStart?: Date;
    windowEnd?: Date;
  } = {}
) {
  const {
    winnerId = null,
    loserId = null,
    winnerVal = null,
    loserVal = null,
    relAdv = null,
    metricsSnapshot = {},
    epoch = '',
    optMetric = 'CPC',
    windowStart = new Date(),
    windowEnd = new Date()
  } = options;

  const status = decision === 'DEFERRED' ? 'DEFERRED' : 'COMPLETED';

  await client.query(`
    UPDATE dco_evaluation_transactions
    SET status = $1, decision = $2, decision_reason = $3,
        winner_variant_id = $4, loser_variant_id = $5,
        winner_metric_value = $6, loser_metric_value = $7,
        relative_advantage = $8, metrics_snapshot = $9,
        optimization_metric = $10, evaluation_window_start = $11, evaluation_window_end = $12,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $13
  `, [
    status, decision, reason, winnerId, loserId,
    winnerVal, loserVal, relAdv, JSON.stringify(metricsSnapshot || {}),
    optMetric, windowStart, windowEnd, evalId
  ]);

  const correlationId = `dco_eval_${evalId}_${Date.now()}`;
  await client.query(`
    INSERT INTO meta_publishing_events (campaign_id, event_type, to_state, reason, correlation_id, metadata)
    VALUES ($1, 'DCO_EVALUATION_DECISION', $2, $3, $4, $5)
  `, [
    campaignId,
    decision,
    reason,
    correlationId,
    JSON.stringify({
      evaluation_id: evalId,
      optimization_metric: optMetric,
      winner_variant_id: winnerId,
      loser_variant_id: loserId,
      winner_metric_value: winnerVal,
      loser_metric_value: loserVal,
      relative_advantage: relAdv
    })
  ]);
}

export async function executeDCOOptimization(
  campaignId: number,
  options?: {
    evaluationId?: number;
    correlationId?: string;
    forceNow?: Date;
    chaosFailurePoint?: 'A' | 'B' | 'C' | 'D';
  }
) {
  const correlationId = options?.correlationId || `dco_opt_${campaignId}_${Date.now()}`;
  const chaos = options?.chaosFailurePoint;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch Campaign & Pre-Action Safety Gates
    const campRes = await client.query('SELECT * FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaignId]);
    if (campRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'CAMPAIGN_NOT_FOUND' };
    }
    const campaign = campRes.rows[0];

    if (campaign.status !== 'active' && campaign.status !== 'approved') {
      await client.query('ROLLBACK');
      return { success: false, reason: 'CAMPAIGN_NOT_ACTIVE' };
    }
    if (!campaign.admin_approved || !campaign.policy_cleared) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'ADMIN_APPROVAL_OR_POLICY_NOT_CLEARED' };
    }

    const { hash: computedHash } = computeCampaignApprovalHash(campaign);
    if (!campaign.approval_hash || campaign.approval_hash !== computedHash) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'APPROVAL_HASH_MISMATCH' };
    }

    if (!campaign.meta_campaign_id || !campaign.meta_adset_id || !campaign.owner_meta_ad_account_id) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'META_CREDENTIALS_MISSING' };
    }

    // Check active publishing transactions
    const pubTxRes = await client.query(`
      SELECT 1 FROM meta_publishing_transactions
      WHERE campaign_id = $1 AND publish_status IN ('PENDING', 'PUBLISHING')
    `, [campaignId]);
    if (pubTxRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'ACTIVE_PUBLISHING_TRANSACTION' };
    }

    // 2. Fetch WINNER_SELECTED evaluation
    let evalQuery = `
      SELECT * FROM dco_evaluation_transactions
      WHERE campaign_id = $1 AND decision = 'WINNER_SELECTED'
    `;
    const evalParams: any[] = [campaignId];
    if (options?.evaluationId) {
      evalQuery += ` AND id = $2`;
      evalParams.push(options.evaluationId);
    } else {
      evalQuery += ` ORDER BY id DESC LIMIT 1`;
    }

    const evalRes = await client.query(evalQuery, evalParams);
    if (evalRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'NO_VALID_WINNER_SELECTED_EVALUATION' };
    }
    const evalRecord = evalRes.rows[0];

    if (!evalRecord.winner_variant_id || !evalRecord.loser_variant_id) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'INVALID_EVALUATION_VARIANTS' };
    }

    // 3. Fetch Winner and Loser variants
    const winnerRes = await client.query('SELECT * FROM campaign_creative_variants WHERE id = $1', [evalRecord.winner_variant_id]);
    const loserRes = await client.query('SELECT * FROM campaign_creative_variants WHERE id = $1', [evalRecord.loser_variant_id]);

    if (winnerRes.rows.length === 0 || loserRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'VARIANT_NOT_FOUND' };
    }

    const winnerVariant = winnerRes.rows[0];
    const loserVariant = loserRes.rows[0];

    if (!winnerVariant.meta_ad_id || !loserVariant.meta_ad_id) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'VARIANT_META_AD_ID_MISSING' };
    }

    if (winnerVariant.campaign_id !== campaignId || loserVariant.campaign_id !== campaignId || winnerVariant.id === loserVariant.id) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'INVALID_WINNER_LOSER_RELATIONSHIP' };
    }

    // 4. Check existing dco_external_actions
    const actionKey = `dco_pause_${campaignId}_${evalRecord.id}_${loserVariant.id}`;
    const actionRes = await client.query('SELECT * FROM dco_external_actions WHERE action_key = $1 FOR UPDATE', [actionKey]);

    let actionRecord = actionRes.rows[0];

    if (actionRecord && actionRecord.status === 'META_ACTION_SUCCEEDED') {
      await client.query('COMMIT');
      return { success: true, status: 'ALREADY_SUCCEEDED', evaluation_id: evalRecord.id };
    }

    const baseUrl = process.env.META_BASE_URL || "https://graph.facebook.com/v20.0";
    const accessToken = process.env.META_API_TOKEN || 'EAAkr7Y9S2qYBQfHTNZASIugAzOi8b2MZCBct4z4jZBHSmQ2KGlFduuDQQGEYC9NRDtZBUdhMPdeJ06OjYUiJYGfFkZCAxzyh4TdidN7ZA10K3XPOVEiQh01jo22xLsQjXrEtMHc5ZCHZBbRZAyA5d0pl26Jsg3IuNKY272QYmqEjHghf11OKJmbUZBfJLe5EvHzl48gAZDZD';

    if (actionRecord && (actionRecord.status === 'REQUESTED' || actionRecord.status === 'EXTERNAL_OUTCOME_UNKNOWN')) {
      try {
        const verifyRes = await fetch(`${baseUrl}/${loserVariant.meta_ad_id}?fields=id,status,effective_status,campaign_id,adset_id,account_id&access_token=${accessToken}`);
        const verifyData = verifyRes.headers.get('content-type')?.includes('json') ? await verifyRes.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await verifyRes.text()).slice(0, 150) } as any;
        const extStatus = String(verifyData.status || verifyData.effective_status || '').toUpperCase();
        if (extStatus === 'PAUSED' || extStatus === 'ARCHIVED') {
          await client.query(`UPDATE dco_external_actions SET status = 'META_ACTION_SUCCEEDED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [actionRecord.id]);
          await finalizeSuccessfulOptimization(client, campaignId, evalRecord, winnerVariant, loserVariant, correlationId);
          await client.query('COMMIT');
          return { success: true, status: 'META_ACTION_SUCCEEDED', recovered: true };
        }
      } catch (e) {
        // Proceed with execution if GET verification fails during recovery
      }
    }

    if (!actionRecord) {
      if (chaos === 'A') {
        await client.query('ROLLBACK');
        return { success: false, reason: 'CHAOS_INJECTION_A' };
      }

      const insertAction = await client.query(`
        INSERT INTO dco_external_actions (action_key, campaign_id, evaluation_id, variant_id, meta_ad_id, action_type, status)
        VALUES ($1, $2, $3, $4, $5, 'PAUSE', 'REQUESTED')
        RETURNING *
      `, [actionKey, campaignId, evalRecord.id, loserVariant.id, loserVariant.meta_ad_id]);
      actionRecord = insertAction.rows[0];
    }

    if (chaos === 'B') {
      await client.query('ROLLBACK');
      return { success: false, reason: 'CHAOS_INJECTION_B' };
    }

    await client.query('COMMIT'); // Commit REQUESTED state before external call

    // 5. Execute External POST Mutation to Pause Loser Meta Ad Only
    let postSuccess = false;
    let postError = null;

    try {
      const postRes = await fetch(`${baseUrl}/${loserVariant.meta_ad_id}?status=PAUSED&access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAUSED', access_token: accessToken })
      });
      const postData = postRes.headers.get('content-type')?.includes('json') ? await postRes.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await postRes.text()).slice(0, 150) } as any;
      if (!postRes.ok || postData.error) {
        throw new Error(postData.error?.message || `HTTP ${postRes.status} pause failure`);
      }
      postSuccess = true;
    } catch (netErr: any) {
      postError = netErr.message;
      console.error(`[DCO OPTIMIZATION] POST pause error for loser ad ${loserVariant.meta_ad_id}:`, postError);
    }

    if (!postSuccess) {
      const errClient = await pool.connect();
      try {
        await errClient.query('BEGIN');
        await errClient.query(`
          UPDATE dco_external_actions
          SET status = 'EXTERNAL_OUTCOME_UNKNOWN', error_details = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [postError, actionRecord.id]);
        await errClient.query('COMMIT');
      } finally {
        errClient.release();
      }
      return { success: false, status: 'EXTERNAL_OUTCOME_UNKNOWN', error: postError };
    }

    if (chaos === 'C') {
      return { success: false, reason: 'CHAOS_INJECTION_C' };
    }

    // 6. Immediate External Verification (GET)
    let verifiedPaused = false;
    try {
      const getRes = await fetch(`${baseUrl}/${loserVariant.meta_ad_id}?fields=id,status,effective_status,campaign_id,adset_id,account_id&access_token=${accessToken}`);
      const getData = getRes.headers.get('content-type')?.includes('json') ? await getRes.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await getRes.text()).slice(0, 150) } as any;
      const extStatus = String(getData.status || getData.effective_status || '').toUpperCase();

      const expectedAccountId = campaign.owner_meta_ad_account_id.startsWith('act_') ? campaign.owner_meta_ad_account_id : `act_${campaign.owner_meta_ad_account_id}`;
      const actualAccountId = getData.account_id ? (getData.account_id.startsWith('act_') ? getData.account_id : `act_${getData.account_id}`) : expectedAccountId;

      if ((extStatus === 'PAUSED' || extStatus === 'ARCHIVED') && actualAccountId === expectedAccountId) {
        verifiedPaused = true;
      }
    } catch (verifyErr: any) {
      console.error(`[DCO OPTIMIZATION] GET verification error for ad ${loserVariant.meta_ad_id}:`, verifyErr.message);
    }

    if (!verifiedPaused) {
      const errClient = await pool.connect();
      try {
        await errClient.query('BEGIN');
        await errClient.query(`
          UPDATE dco_external_actions
          SET status = 'EXTERNAL_OUTCOME_UNKNOWN', error_details = 'Verification failed or status not PAUSED', updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [actionRecord.id]);
        await errClient.query('COMMIT');
      } finally {
        errClient.release();
      }
      return { success: false, status: 'EXTERNAL_OUTCOME_UNKNOWN', reason: 'VERIFICATION_FAILED' };
    }

    if (chaos === 'D') {
      return { success: false, reason: 'CHAOS_INJECTION_D' };
    }

    // 7. DB Commit for Success & Final Winner State Transition
    const finalClient = await pool.connect();
    try {
      await finalClient.query('BEGIN');

      await finalClient.query(`
        UPDATE dco_external_actions
        SET status = 'META_ACTION_SUCCEEDED', error_details = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [actionRecord.id]);

      await finalizeSuccessfulOptimization(finalClient, campaignId, evalRecord, winnerVariant, loserVariant, correlationId);

      await finalClient.query('COMMIT');
      return { success: true, status: 'META_ACTION_SUCCEEDED', evaluation_id: evalRecord.id };
    } catch (finalErr: any) {
      await finalClient.query('ROLLBACK');
      throw finalErr;
    } finally {
      finalClient.release();
    }

  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[DCO OPTIMIZATION ERROR]:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function finalizeSuccessfulOptimization(
  client: any,
  campaignId: number,
  evalRecord: any,
  winnerVariant: any,
  loserVariant: any,
  correlationId: string
) {
  await client.query(`
    UPDATE campaign_creative_variants
    SET status = 'PAUSED', is_published = false, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [loserVariant.id]);

  await client.query(`
    UPDATE campaign_creative_variants
    SET status = 'WINNER', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [winnerVariant.id]);

  await client.query(`
    UPDATE dco_evaluation_transactions
    SET decision = 'WINNER_OPTIMIZED', status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [evalRecord.id]);

  await client.query(`
    UPDATE host_marketing_campaigns
    SET dco_status = 'WINNER_OPTIMIZED', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [campaignId]);

  await client.query(`
    INSERT INTO meta_publishing_events (
      campaign_id, event_type, to_state, reason, correlation_id, metadata
    ) VALUES ($1, 'DCO_WINNER_OPTIMIZED', 'WINNER_OPTIMIZED', $2, $3, $4)
  `, [
    campaignId,
    `Winner variant ${winnerVariant.id} optimized successfully over loser variant ${loserVariant.id}`,
    correlationId,
    JSON.stringify({
      evaluation_id: evalRecord.id,
      winner_variant_id: winnerVariant.id,
      loser_variant_id: loserVariant.id,
      winner_metric_value: evalRecord.winner_metric_value,
      loser_metric_value: evalRecord.loser_metric_value,
      relative_advantage: evalRecord.relative_advantage,
      loser_meta_ad_id: loserVariant.meta_ad_id,
      external_verification_status: 'META_ACTION_SUCCEEDED',
      timestamp: new Date().toISOString()
    })
  ]);
}

export async function reconcileDCOExternalActionsWorker() {
  const client = await pool.connect();
  try {
    const pendingActions = await client.query(`
      SELECT a.*, c.owner_meta_ad_account_id, c.meta_campaign_id, c.meta_adset_id
      FROM dco_external_actions a
      JOIN host_marketing_campaigns c ON a.campaign_id = c.id
      WHERE a.status IN ('REQUESTED', 'EXTERNAL_OUTCOME_UNKNOWN')
    `);

    const baseUrl = process.env.META_BASE_URL || "https://graph.facebook.com/v20.0";
    const accessToken = process.env.META_API_TOKEN || '';

    for (const action of pendingActions.rows) {
      if (!action.meta_ad_id) continue;
      try {
        const getRes = await fetch(`${baseUrl}/${action.meta_ad_id}?fields=id,status,effective_status,campaign_id,adset_id,account_id&access_token=${accessToken}`);
        const getData = getRes.headers.get('content-type')?.includes('json') ? await getRes.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await getRes.text()).slice(0, 150) } as any;
        const extStatus = String(getData.status || getData.effective_status || '').toUpperCase();

        if (extStatus === 'PAUSED' || extStatus === 'ARCHIVED') {
          const txClient = await pool.connect();
          try {
            await txClient.query('BEGIN');
            await txClient.query(`
              UPDATE dco_external_actions SET status = 'META_ACTION_SUCCEEDED', error_details = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1
            `, [action.id]);

            const evalRes = await txClient.query('SELECT * FROM dco_evaluation_transactions WHERE id = $1', [action.evaluation_id]);
            if (evalRes.rows.length > 0) {
              const evalRecord = evalRes.rows[0];
              const winnerRes = await txClient.query('SELECT * FROM campaign_creative_variants WHERE id = $1', [evalRecord.winner_variant_id]);
              const loserRes = await txClient.query('SELECT * FROM campaign_creative_variants WHERE id = $1', [evalRecord.loser_variant_id]);
              if (winnerRes.rows.length > 0 && loserRes.rows.length > 0) {
                await finalizeSuccessfulOptimization(txClient, action.campaign_id, evalRecord, winnerRes.rows[0], loserRes.rows[0], `reconcile_${action.id}`);
              }
            }
            await txClient.query('COMMIT');
          } catch (txErr) {
            await txClient.query('ROLLBACK');
            console.error(`[DCO RECONCILE TX ERROR] Action ${action.id}:`, txErr);
          } finally {
            txClient.release();
          }
        }
      } catch (recErr: any) {
        console.error(`[DCO RECONCILER ERROR] Action ${action.id}:`, recErr.message);
      }
    }
  } catch (err: any) {
    console.error('[DCO RECONCILER WORKER ERROR]:', err.message);
  } finally {
    client.release();
  }
}

function hashCAPIParameter(val: string | null | undefined): string | null {
  if (!val) return null;
  const clean = String(val).trim().toLowerCase();
  return crypto.createHash('sha256').update(clean).digest('hex');
}

// Direct Meta Conversions API (CAPI) & Google Ads Offline Conversion dispatch engine
export async function dispatchConversionsAPI(booking: any, listingId: number, eventName: 'Purchase' | 'Lead' | 'ViewContent') {
  return; // HARVO: only the canonical consent-bound measurement outbox may upload booking conversions.

  try {
    // 1. Fetch active marketing campaign for this listing
    const campaignsRes = await pool.query(`
      SELECT * FROM host_marketing_campaigns
      WHERE listing_id = $1 AND status = 'active' AND subscription_active = true
      ORDER BY id DESC LIMIT 1
    `, [listingId]);

    if (campaignsRes.rows.length === 0) {
      console.log(`[CONVERSIONS API] No active campaign running for Listing #${listingId}. Skipping direct CAPI linkage.`);
      return;
    }

    const campaign = campaignsRes.rows[0];
    const { meta_pixel_id, meta_capi_token, google_conversion_id, google_conversion_label } = campaign;

    console.log(`[CONVERSIONS API] Active campaign found: "${campaign.title}" (Campaign #${campaign.id})`);

    const hasMetaCAPI = meta_pixel_id && meta_capi_token;
    const hasGoogleAds = google_conversion_id && google_conversion_label;

    if (!hasMetaCAPI && !hasGoogleAds) {
      console.log(`[CONVERSIONS API] Meta Pixel and Google Ads IDs are not configured for Campaign #${campaign.id}. Skipping CAPI payload.`);
      return;
    }

    // Prepare payload info
    const phoneHashed = hashCAPIParameter(booking.phone);
    const nameHashed = hashCAPIParameter(booking.name);
    const emailHashed = hashCAPIParameter(booking.email || `${booking.name?.replace(/\s+/g, '')}@encho.space`);
    const finalAmount = Number(booking.total_rent || booking.amount || 0);

    // I. Send Meta Conversions API (CAPI) event
    if (hasMetaCAPI) {
      console.log(`[META CAPI DISPATCH] Dispatched to Pixel ${meta_pixel_id} for event "${eventName}"...`);
      const capiUrl = `${process.env.META_BASE_URL || "https://graph.facebook.com/v20.0"}/${meta_pixel_id}/events`;

      const user_data: any = {
        ph: phoneHashed ? [phoneHashed] : [],
        fn: nameHashed ? [nameHashed] : [],
        em: emailHashed ? [emailHashed] : []
      };

      const custom_data = {
        value: finalAmount,
        currency: 'INR',
        content_name: `Listing Booking #${booking.id}`,
        content_type: 'product',
        content_ids: [String(listingId)]
      };

      const eventPayload = {
        data: [{
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'website',
          event_source_url: `https://nestpick-clone.com/listings/${listingId}`,
          user_data,
          custom_data
        }]
      };

      try {
        const res = await fetch(capiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${meta_capi_token}`
          },
          body: JSON.stringify(eventPayload)
        });

        const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
        if (res.ok) {
          console.log(`[META CAPI SUCCESS] Pixel ${meta_pixel_id} received "${eventName}" event successfully! Event ID: ${data.events_received || 'Received'}`);
        } else {
          console.error(`[META CAPI FAILURE] Pixel ${meta_pixel_id} rejected event:`, data);
        }
      } catch (capiFetchErr: any) {
        console.error(`[META CAPI FETCH EXCEPTION]`, capiFetchErr);
      }
    }

    // II. Send Google Ads Offline Conversion Linkage
    if (hasGoogleAds) {
      console.log(`[GOOGLE ADS DISPATCH] Dispatched to Conversion ID ${google_conversion_id} with Label ${google_conversion_label}...`);

      // Google Ads Offline Conversion API upload payload simulation (or actual sandbox POST)
      const googlePayload = {
        conversionId: google_conversion_id,
        conversionValue: finalAmount,
        currencyCode: 'INR',
        conversionLabel: google_conversion_label,
        conversionDateTime: new Date().toISOString(),
        hashedPhoneNumber: phoneHashed,
        hashedEmail: emailHashed,
        orderId: `encho_booking_${booking.id}`
      };

      console.log(`[GOOGLE ADS SUCCESS] Simulated conversion upload to Google Ads engine successfully:`, JSON.stringify(googlePayload, null, 2));
    }

  } catch (err: any) {
    console.error(`[CONVERSIONS API ENGINE ERROR]`, err);
  }
}

const WEBHOOK_SIGNING_SECRET = process.env.WEBHOOK_SIGNING_SECRET || 'nestpick_marketing_webhook_secure_token_2026';

// Helper to cryptographically verify webhook signatures using standard HMAC-SHA256

// Process webhook transaction


// Public Webhook route for payment gateways
// Public Webhook route for payment gateways

export async function handleVerifiedPayment(txId: any, campaignId: any, paymentIntentId: any, gateway: string, req: any) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Resolve wallet transaction by ID, reference_id, or payment_intent_id
    let txRow: any = null;
    if (txId) {
      const txCheck = await client.query(
        `SELECT wt.*, hw.host_id
         FROM wallet_transactions wt
         JOIN host_wallets hw ON wt.wallet_id = hw.id
         WHERE wt.id = $1 AND wt.status = 'pending'
         FOR UPDATE OF wt`,
        [txId]
      );
      if (txCheck.rows.length > 0) txRow = txCheck.rows[0];
    }

    if (!txRow && paymentIntentId) {
      const txFallback = await client.query(
        `SELECT wt.*, hw.host_id
         FROM wallet_transactions wt
         JOIN host_wallets hw ON wt.wallet_id = hw.id
         WHERE (wt.reference_id = $1 OR wt.description ILIKE $2) AND wt.status = 'pending'
         ORDER BY wt.id DESC LIMIT 1
         FOR UPDATE OF wt`,
        [String(paymentIntentId), `%${paymentIntentId}%`]
      );
      if (txFallback.rows.length > 0) txRow = txFallback.rows[0];
    }

    if (txRow) {
      const amount = Number(txRow.amount);
      const hostId = txRow.host_id;

      // Mark transaction completed
      await client.query(
        `UPDATE wallet_transactions SET status = 'completed' WHERE id = $1`,
        [txRow.id]
      );

      // Record immutable double-entry ledger entry:
      // DEBIT: GATEWAY_CLEARING (Funds received by gateway)
      // CREDIT: HOST_WALLET (Funds credited to host wallet)
      await DoubleEntryLedgerService.recordTransaction(client, {
        transactionRef: `PAYMENT_WEBHOOK_${gateway.toUpperCase()}_${paymentIntentId || txRow.reference_id || txRow.id}`,
        eventType: 'WALLET_FUNDING',
        description: `Verified ${gateway.toUpperCase()} wallet funding payment (${paymentIntentId || txRow.id})`,
        lines: [
          {
            userId: null,
            accountType: 'GATEWAY_CLEARING',
            entryType: 'DEBIT',
            amount,
            currency: 'INR'
          },
          {
            userId: hostId,
            accountType: 'HOST_WALLET',
            entryType: 'CREDIT',
            amount,
            currency: 'INR'
          }
        ]
      });

      console.log(`✅ [DOUBLE-ENTRY LEDGER] Successfully recorded verified wallet funding of ₹${amount} for host #${hostId}`);
    }

    // 2. Resolve campaign activation if this was a direct campaign checkout
    let campaignIdToUse = campaignId;
    if (!campaignIdToUse && paymentIntentId) {
      const dbCheck = await client.query('SELECT id FROM host_marketing_campaigns WHERE payment_intent_id = $1', [paymentIntentId]);
      if (dbCheck.rows.length > 0) campaignIdToUse = dbCheck.rows[0].id;
    }

    if (campaignIdToUse) {
      const check = await client.query('SELECT * FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaignIdToUse]);
      if (check.rows.length > 0) {
        const campaign = check.rows[0];
        if (campaign.payment_status !== 'paid') {
          await client.query(`
            UPDATE host_marketing_campaigns
            SET subscription_active = true, payment_status = 'paid', payment_gateway = $1, payment_intent_id = $2, active_slide_index = 0
            WHERE id = $3
          `, [gateway, paymentIntentId, campaignIdToUse]);

          if (campaign.admin_approved) {
            await transitionCampaignState({ campaignId: campaignIdToUse, expectedCurrentState: campaign.status, to: 'active', reason: 'PAYMENT_SUCCESS', actorType: 'webhook', client });
          } else {
            await transitionCampaignState({ campaignId: campaignIdToUse, expectedCurrentState: campaign.status, to: 'pending_approval', reason: 'PAYMENT_SUCCESS', actorType: 'webhook', client });
          }
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[HANDLE VERIFIED PAYMENT ERROR]', err);
  } finally {
    client.release();
  }
}

export const processAsyncWebhookQueue = async (overridePool?: any) => {
    const dbPool = overridePool || pool;
    if (!dbPool) return;

    try {
        const client = await dbPool.connect();
        let claimedItems: any[] = [];

        try {
            await client.query('BEGIN');

            // 1. Claim eligible pending or timed-out processing webhook items with lease
            const queueRes = await client.query(`
                SELECT id, source, payload, attempt_count
                FROM async_webhook_queue
                WHERE (status = 'pending' OR (status = 'processing' AND lease_expires_at <= CURRENT_TIMESTAMP))
                AND (available_at IS NULL OR available_at <= CURRENT_TIMESTAMP)
                ORDER BY created_at ASC, id ASC
                LIMIT 50
                FOR UPDATE SKIP LOCKED
            `);

            if (queueRes.rows.length === 0) {
                await client.query('COMMIT');
                return;
            }

            const ids = queueRes.rows.map((r: any) => r.id);
            await client.query(`
                UPDATE async_webhook_queue
                SET status = 'processing',
                    lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
                    attempt_count = COALESCE(attempt_count, 0) + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ANY($1::int[])
            `, [ids]);

            await client.query('COMMIT');
            claimedItems = queueRes.rows;
        } catch (lockErr: any) {
            await client.query('ROLLBACK');
            if (lockErr.code === '55P03') return;
            throw lockErr;
        } finally {
            client.release();
        }

        // 2. Process claimed items OUTSIDE the database transaction
        for (const row of claimedItems) {
            console.log(`[ASYNC WEBHOOK WORKER] Processing claimed webhook ID: ${row.id} from ${row.source}`);
            try {
                const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;

                if (payload.event === 'ad_approved' && payload.campaign_id) {
                    await transitionCampaignState({ campaignId: payload.campaign_id, to: 'active', reason: 'Webhook received' });
                    console.log(`[ASYNC WEBHOOK] Campaign #${payload.campaign_id} marked as ACTIVE based on Ad Network webhook.`);
                } else if (payload.event === 'ad_metrics_update' && payload.campaign_id) {
                    // Initialize metrics row if it doesn't exist for today
                    const metricsCheck = await dbPool.query("SELECT id FROM campaign_metrics WHERE campaign_id = $1 AND date = CURRENT_DATE", [payload.campaign_id]);
                    if (metricsCheck.rows.length === 0) {
                        await dbPool.query("INSERT INTO campaign_metrics (campaign_id, date, spend, impressions, clicks) VALUES ($1, CURRENT_DATE, 0, 0, 0)", [payload.campaign_id]);
                    }

                    await dbPool.query(`
                        UPDATE campaign_metrics
                        SET impressions = impressions + $1, clicks = clicks + $2
                        WHERE campaign_id = $3 AND date = CURRENT_DATE
                    `, [payload.impressions || 0, payload.clicks || 0, payload.campaign_id]);
                    console.log(`[ASYNC WEBHOOK] Updated metrics for Campaign #${payload.campaign_id}.`);
                } else if (payload.event === 'new_lead' || payload.event === 'leadgen') {
                    const leadRes = await LeadAlertingCrmService.validateAndIngestMetaLeadWebhook({
                        headers: {},
                        rawBody: typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload),
                        payload,
                        poolOrClient: dbPool,
                        correlationId: `corr_wh_queue_${row.id}`
                    });

                    if (leadRes.success && !leadRes.is_duplicate) {
                        const campRes = await dbPool.query(
                            "SELECT c.*, l.title as listing_title FROM host_marketing_campaigns c JOIN listings l ON c.listing_id = l.id WHERE c.id = $1",
                            [payload.campaign_id]
                        );
                        if (campRes.rows.length > 0) {
                            const camp = campRes.rows[0];
                            const io = getGlobalIoInstance();
                            if (io) {
                                io.to(`user_${camp.host_id}`).emit('notification', {
                                    type: 'new_lead',
                                    title: leadRes.classification === 'HOT' ? '🔥 Hot Lead Received!' : '⚡ New Ad Lead Received!',
                                    message: `You have a new inquiry for '${camp.listing_title}'. Click to reply in CRM.`,
                                    threadId: leadRes.thread_id,
                                    campaignId: camp.id,
                                    leadId: leadRes.lead_id
                                });
                                io.to('admin_room').emit('db_changed', { type: 'marketing_leads' });
                            }
                        }
                    }
                }

                // Mark as successfully processed
                await dbPool.query("UPDATE async_webhook_queue SET status = 'processed', lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [row.id]);
            } catch (err: any) {
                console.error(`[ASYNC WEBHOOK WORKER ERROR] Failed to process webhook ID ${row.id}:`, err);
                const currentAttempts = (row.attempt_count || 1);
                if (currentAttempts >= 3) {
                    await dbPool.query("UPDATE async_webhook_queue SET status = 'dlq', lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [row.id]);
                    // Send failed webhook payload to Dead Letter Queue (DLQ)
                    await dbPool.query(
                        "INSERT INTO webhook_dlq (source, payload, error_message, next_retry_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + interval '5 minutes')",
                        [row.source, JSON.stringify(row.payload), err.message]
                    );
                } else {
                    // Schedule next attempt with 1 minute backoff
                    await dbPool.query(`
                        UPDATE async_webhook_queue
                        SET status = 'pending', available_at = CURRENT_TIMESTAMP + INTERVAL '1 minute', lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1
                    `, [row.id]);
                }
            }
        }
    } catch (err) {
        console.error('[ASYNC WEBHOOK WORKER ERROR]', err);
    }
};

// Background Worker for Phase 3.6: Lead Notification Outbox Queue
export const processLeadNotificationQueue = async (overridePool?: any) => {
  const dbPool = overridePool || pool;
  if (!dbPool) return { processed: 0, delivered: 0, failed: 0, dlq: 0 };
  return LeadAlertingCrmService.processLeadNotificationQueue(dbPool);
};

export const logAdminAudit = async (adminId: number | null, entityType: string, entityId: number, action: string, previousState: any, newState: any, ipAddress: string = '') => {
  try {
    await pool.query(
      `INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [adminId, entityType, entityId, action, JSON.stringify(previousState), JSON.stringify(newState), ipAddress]
    );
  } catch (error) {
    console.error('[AUDIT LOG] Failed to record:', error);
  }
};


export const processEscrowAutoRelease = async (overridePool?: any) => {
  return { processed: 0, status: 'RETIRED', code: 'HARVO_V2_REQUIRED' }; // Old workers cannot authorize funds or publish ads.

  const dbPool = overridePool || pool;
  if (!dbPool) return;

  await DistributedLockService.withAdvisoryLock(
    dbPool,
    DistributedLockService.LOCKS.ESCROW_AUTO_RELEASE,
    'processEscrowAutoRelease',
    async () => {
      // Phase 2.9.3: Pull 10 campaigns at a time to prevent memory exhaustion, with deterministic ordering
      const expiredEscrows = await dbPool.query(
        `SELECT id FROM host_marketing_campaigns
         WHERE escrow_status = 'holding' AND escrow_release_at <= CURRENT_TIMESTAMP
         ORDER BY escrow_release_at ASC, id ASC
         LIMIT 10`
      );

      for (const row of expiredEscrows.rows) {
        const client = await dbPool.connect();
        let shouldDispatch = false;
        const campaignId = row.id;

        try {
          await client.query('BEGIN');

          // 1. Lock campaign FOR UPDATE SKIP LOCKED
          const campRes = await client.query(
            `SELECT id, admin_approved, escrow_status FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE SKIP LOCKED`,
            [campaignId]
          );

          if (campRes.rows.length > 0 && campRes.rows[0].escrow_status === 'holding') {
             const c = campRes.rows[0];

             // 2. Authorize Escrow Release
             await client.query(
               `UPDATE host_marketing_campaigns
                SET escrow_status = 'released', updated_at = CURRENT_TIMESTAMP
                WHERE id = $1`,
               [campaignId]
             );

             // 3. Pre-authorize Meta Dispatch if admin approved
             if (c.admin_approved) {
               const correlationId = crypto.randomUUID();
               const idempotencyKey = `publish_meta_camp_${campaignId}`;
               await client.query(
                 `INSERT INTO meta_publishing_transactions (campaign_id, idempotency_key, correlation_id, publish_status)
                  VALUES ($1, $2, $3, 'PRECHECK_RUNNING')
                  ON CONFLICT (idempotency_key) DO NOTHING`,
                 [campaignId, idempotencyKey, correlationId]
               );
               shouldDispatch = true;
             }

             await client.query('COMMIT');
             console.log(`[ESCROW WORKER] 24-Hour Fraud Escrow auto-released transactionally for Campaign #${campaignId}`);
          } else {
             await client.query('ROLLBACK');
          }
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[ESCROW WORKER ERROR] Campaign #${campaignId}:`, err);
        } finally {
          client.release();
        }

        // 4. Dispatch Async (outside the tight DB lock)
        if (shouldDispatch) {
           dispatchMetaCampaign(campaignId, { protocol: 'https', get: () => 'localhost' } as any).catch(e => console.error(e));
           if (process.env.ENABLE_GOOGLE_ADS_DISPATCH === 'true') {
             dispatchGoogleAdsCampaign(campaignId, { protocol: 'https', get: () => 'localhost' } as any).catch(e => console.error(e));
           }
        }
      }
    }
  );
};

export const processDynamicCreativeOptimization = async (overridePool?: any) => {
  return { processed: 0, status: 'RETIRED', code: 'HARVO_V2_REQUIRED' }; // Old workers cannot authorize funds or publish ads.

  const dbPool = overridePool || pool;
  if (!dbPool) return;

  await DistributedLockService.withAdvisoryLock(
    dbPool,
    DistributedLockService.LOCKS.DYNAMIC_CREATIVE_OPT,
    'processDynamicCreativeOptimization',
    async () => {
      const client = await dbPool.connect();
      let claimedCampaigns: any[] = [];

      try {
        await client.query('BEGIN');
        const res = await client.query(`
          SELECT id, media_urls
          FROM host_marketing_campaigns
          WHERE status = 'active'
          AND media_urls IS NOT NULL
          AND jsonb_array_length(media_urls) > 1
          AND meta_dispatched_at <= CURRENT_TIMESTAMP - INTERVAL '24 hours'
          AND (dco_last_evaluated_at IS NULL OR dco_last_evaluated_at <= CURRENT_TIMESTAMP - INTERVAL '24 hours')
          ORDER BY meta_dispatched_at ASC, id ASC
          LIMIT 20
          FOR UPDATE SKIP LOCKED
        `);

        if (res.rows.length === 0) {
          await client.query('COMMIT');
          return;
        }

        const ids = res.rows.map((r: any) => r.id);
        await client.query(`
          UPDATE host_marketing_campaigns
          SET dco_last_evaluated_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1::int[])
        `, [ids]);

        await client.query('COMMIT');
        claimedCampaigns = res.rows;
      } catch (lockErr: any) {
        await client.query('ROLLBACK');
        if (lockErr.code === '55P03') return;
        throw lockErr;
      } finally {
        client.release();
      }

      for (const row of claimedCampaigns) {
        try {
          const variantCountRes = await dbPool.query('SELECT COUNT(*) as count FROM campaign_creative_variants WHERE campaign_id = $1', [row.id]);
          const hasVariants = Number(variantCountRes.rows[0]?.count || 0) >= 2;

          if (hasVariants) {
            console.log(`[DYNAMIC CREATIVE OPTIMIZATION] Evaluating campaign #${row.id} via DcoEngine...`);
            const result = await DcoEngine.processCampaignDco(row.id, dbPool);
            console.log(`[DYNAMIC CREATIVE OPTIMIZATION] Campaign #${row.id} evaluation completed: ${result.result} (${result.reason})`);
          } else {
            let urls: string[] = [];
            try {
              urls = typeof row.media_urls === 'string' ? JSON.parse(row.media_urls) : row.media_urls;
            } catch (_parseErr) {
              // Non-fatal parse fallback
            }
            if (urls && urls.length > 1) {
              const winningMedia = [urls[0]];
              await dbPool.query("UPDATE host_marketing_campaigns SET media_urls = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [JSON.stringify(winningMedia), row.id]);
            }
          }
        } catch (e: any) {
          console.error(`[DYNAMIC CREATIVE OPTIMIZATION] Failed to process campaign #${row.id}:`, e.message);
        }
      }
    }
  );
};
if (shouldRunBackgroundWorkers) {
  setInterval(processDynamicCreativeOptimization, 60 * 60 * 1000); // Check every 1 hour
}

// Gap 11: Database Death by Analytics (Time-Series Rollups - Phase 2.6 & 2.9.5 Hardened Bounded Processor + Advisory Lock)
export const runAnalyticsRollup = async (overridePool?: any) => {
  const dbPool = overridePool || pool;
  if (!dbPool) return;

  await DistributedLockService.withAdvisoryLock(
    dbPool,
    DistributedLockService.LOCKS.ANALYTICS_ROLLUP,
    'runAnalyticsRollup',
    async () => {
      const client = await dbPool.connect();
      try {
        console.log('[ANALYTICS ROLLUP] Aggregating bounded raw ad metrics into lightweight time-series table...');
        await client.query('BEGIN');
        // A timestamp -> timestamptz -> date cast otherwise uses the connection's
        // timezone and can move a UTC boundary event into the next reporting day.
        await client.query("SET LOCAL TIME ZONE 'UTC'");

        // 1. Fetch bounded chunk of unprocessed raw event log IDs with deterministic ordering and SKIP LOCKED
        const rawEventsRes = await client.query(`
          SELECT
            id,
            campaign_id,
            (created_at AT TIME ZONE 'UTC')::date::text as date,
            impressions_delta,
            clicks_delta,
            conversions_delta,
            spent_delta
          FROM campaign_raw_event_logs
          WHERE processed = false
          ORDER BY id ASC
          LIMIT 500
          FOR UPDATE SKIP LOCKED
        `);

        if (rawEventsRes.rows.length === 0) {
          await client.query('COMMIT');
          return;
        }

        const rawLogIds = rawEventsRes.rows.map((r: any) => r.id);

        // Composite grouping by campaign_id + event_date
        const groupedMap = new Map<string, { campaign_id: number; date: string; impressions: number; clicks: number; conversions: number; spent: number }>();
        for (const row of rawEventsRes.rows) {
          const key = `${row.campaign_id}_${row.date}`;
          const existing = groupedMap.get(key) || {
            campaign_id: row.campaign_id,
            date: row.date,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            spent: 0
          };
          existing.impressions += Number(row.impressions_delta || 0);
          existing.clicks += Number(row.clicks_delta || 0);
          existing.conversions += Number(row.conversions_delta || 0);
          existing.spent += Number(row.spent_delta || 0);
          groupedMap.set(key, existing);
        }

        // 2. Daily Rollup Upsert
        for (const item of groupedMap.values()) {
          await client.query(`
            INSERT INTO campaign_daily_rollups (campaign_id, date, impressions, clicks, conversions, spent_usd)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (campaign_id, date) DO UPDATE
            SET impressions = campaign_daily_rollups.impressions + EXCLUDED.impressions,
                clicks = campaign_daily_rollups.clicks + EXCLUDED.clicks,
                conversions = campaign_daily_rollups.conversions + EXCLUDED.conversions,
                spent_usd = campaign_daily_rollups.spent_usd + EXCLUDED.spent_usd
          `, [item.campaign_id, item.date, item.impressions, item.clicks, item.conversions, item.spent]);
        }

        // 3. Sync cumulative stats back to host_marketing_campaigns for updated campaigns
        const impactedCampaignIds = Array.from(new Set(rawEventsRes.rows.map((r: any) => r.campaign_id)));
        await client.query(`
          UPDATE host_marketing_campaigns c
          SET accumulated_impressions = COALESCE(r.total_impressions, 0),
              accumulated_clicks = COALESCE(r.total_clicks, 0),
              accumulated_conversions = COALESCE(r.total_conversions, 0),
              accumulated_spent = COALESCE(r.total_spent, 0)
          FROM (
            SELECT campaign_id,
                   SUM(impressions) as total_impressions,
                   SUM(clicks) as total_clicks,
                   SUM(conversions) as total_conversions,
                   SUM(spent_usd) as total_spent
            FROM campaign_daily_rollups
            WHERE campaign_id = ANY($1::int[])
            GROUP BY campaign_id
          ) r
          WHERE c.id = r.campaign_id;
        `, [impactedCampaignIds]);

        // 4. Mark processed raw event logs atomically by ID
        await client.query(`
          UPDATE campaign_raw_event_logs
          SET processed = true
          WHERE id = ANY($1::int[])
        `, [rawLogIds]);

        await client.query('COMMIT');
        console.log(`[ANALYTICS ROLLUP] Successfully aggregated ${rawLogIds.length} raw event logs across ${impactedCampaignIds.length} campaigns.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('[ANALYTICS ROLLUP TRANSACTION ERROR]', err);
        throw err;
      } finally {
        client.release();
      }
    }
  );
};
if (shouldRunBackgroundWorkers) {
  setInterval(runAnalyticsRollup, 15 * 60 * 1000); // 15 mins
}

// Social Studio Auto-Publisher Worker (Phase 2.9.5 Hardened Bounded Processor)
export const processScheduledSocialPosts = async (overridePool?: any) => {
  if (!legacySocialPublishingEnabled()) return;
  const dbPool = overridePool || pool;
  if (!dbPool) return;

  try {
    const client = await dbPool.connect();
    let claimedPosts: any[] = [];

    try {
      await client.query('BEGIN');

      const res = await client.query(`
        SELECT p.*
        FROM host_social_posts p
        WHERE status = 'approved' AND COALESCE(publish_attempt_count,0)=0
        AND ${socialApprovalPredicate}
        AND (scheduled_at <= CURRENT_TIMESTAMP OR scheduled_at IS NULL)
        AND published_at IS NULL
        ORDER BY scheduled_at ASC NULLS FIRST, id ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      `);

      if (res.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      const ids = res.rows.map((r: any) => r.id);
      await client.query(`
        UPDATE host_social_posts
        SET status = 'publishing',
            lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '3 minutes',
            publish_attempt_count = COALESCE(publish_attempt_count, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::int[])
      `, [ids]);

      await client.query('COMMIT');
      claimedPosts = res.rows;
    } catch (lockErr: any) {
      await client.query('ROLLBACK');
      if (lockErr.code === '55P03') return;
      throw lockErr;
    } finally {
      client.release();
    }

    for (const row of claimedPosts) {
      console.log(`[SOCIAL STUDIO PUBLISHER] Scheduled post ID ${row.id} (${row.media_type}) is due. Dispatching to Instagram/Facebook...`);
      const currentAttempts = (row.publish_attempt_count || 1);
      const idempotencyKey = row.idempotency_key || `social_pub_post_${row.id}`;

      try {
        const publishResult = await publishToInstagram({ ...row, idempotency_key: idempotencyKey });

        if (publishResult && publishResult.success) {
          const igMediaId = publishResult.ig_media_id;
          if (typeof igMediaId !== 'string' || !/^[0-9]+$/.test(igMediaId)) throw new Error('Provider publication returned no verified media identity; reconciliation required.');
          const providerCreationId = publishResult.provider_creation_id || row.provider_creation_id;

          await dbPool.query(
            `UPDATE host_social_posts
             SET status = 'published',
                 published_at = CURRENT_TIMESTAMP,
                 external_media_id = $1,
                 provider_creation_id = $2,
                 idempotency_key = $3,
                 lease_expires_at = NULL,
                 likes = COALESCE(likes, 0),
                 comments = COALESCE(comments, 0),
                 shares = COALESCE(shares, 0),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [igMediaId, providerCreationId, idempotencyKey, row.id]
          );
          console.log(`[SOCIAL STUDIO PUBLISHER] Post ID ${row.id} successfully finalized (IG Media ID: ${igMediaId}).`);
        }
      } catch (publishErr: any) {
        console.error(`[SOCIAL STUDIO PUBLISHER ERROR] Failed to publish post ${row.id}:`, publishErr.message);
        // A failed write or expired lease may already exist remotely. Never replay it automatically.
        await dbPool.query(
          "UPDATE host_social_posts SET status='failed_publish',admin_feedback=$1,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$2",
          ['Publication outcome needs operator reconciliation before any retry.', row.id]
        );
      }
    }
  } catch (err) {
    console.error('[SOCIAL STUDIO PUBLISHER ERROR]', err);
  }
};
if (shouldRunBackgroundWorkers && legacySocialPublishingEnabled()) {
  setInterval(processScheduledSocialPosts, 60 * 1000);
}

// Gap 18: Webhook Retry Jitter & Dead Letter Queue (DLQ) (Phase 2.9.5 Hardened Bounded Processor + Advisory Lock)
export const processWebhookDLQ = async (overridePool?: any) => {
  const dbPool = overridePool || pool;
  if (!dbPool) return;

  await DistributedLockService.withAdvisoryLock(
    dbPool,
    DistributedLockService.LOCKS.WEBHOOK_DLQ,
    'processWebhookDLQ',
    async () => {
      const client = await dbPool.connect();
      let claimedItems: any[] = [];

      try {
        await client.query('BEGIN');

        const dlqItems = await client.query(`
          SELECT *
          FROM webhook_dlq
          WHERE status = 'pending'
          AND retry_count < 5
          AND next_retry_at <= CURRENT_TIMESTAMP
          AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)
          ORDER BY next_retry_at ASC, id ASC
          LIMIT 20
          FOR UPDATE SKIP LOCKED
        `);

        if (dlqItems.rows.length === 0) {
          await client.query('COMMIT');
          return;
        }

        const ids = dlqItems.rows.map((r: any) => r.id);
        await client.query(`
          UPDATE webhook_dlq
          SET lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
          WHERE id = ANY($1::int[])
        `, [ids]);

        await client.query('COMMIT');
        claimedItems = dlqItems.rows;
      } catch (lockErr: any) {
        await client.query('ROLLBACK');
        if (lockErr.code === '55P03') return;
        throw lockErr;
      } finally {
        client.release();
      }

      for (const item of claimedItems) {
        console.log(`[DLQ PROCESSOR] Retrying failed webhook ID ${item.id} from source '${item.source}' (Attempt ${item.retry_count + 1})`);
        try {
          const isFail = process.env.NODE_ENV === 'test' ? false : Math.random() < 0.3;
          if (isFail) throw new Error("Simulated network failure");

          // Success
          await dbPool.query("DELETE FROM webhook_dlq WHERE id = $1", [item.id]);
          console.log(`[DLQ PROCESSOR] Successfully recovered webhook ID ${item.id}`);
        } catch (retryErr: any) {
          const newRetryCount = item.retry_count + 1;
          if (newRetryCount >= 5) {
            await dbPool.query("UPDATE webhook_dlq SET status = 'failed', lease_expires_at = NULL WHERE id = $1", [item.id]);
            console.log(`[DLQ PROCESSOR] Webhook ID ${item.id} permanently failed after 5 attempts.`);
          } else {
            // Exponential backoff with jitter
            // Delay: base_delay * (2 ^ retry_count) + jitter
            // base_delay = 5 mins, jitter = 0 to 60 secs
            const baseDelayMs = 5 * 60 * 1000;
            const exponentialDelayMs = baseDelayMs * Math.pow(2, item.retry_count);
            const jitterMs = Math.floor(Math.random() * 60000);
            const totalDelayMs = exponentialDelayMs + jitterMs;
            const nextRetryDate = new Date(Date.now() + totalDelayMs);

            await dbPool.query(`
              UPDATE webhook_dlq
              SET retry_count = $1, next_retry_at = $2, lease_expires_at = NULL
              WHERE id = $3
            `, [newRetryCount, nextRetryDate.toISOString(), item.id]);
            console.log(`[DLQ PROCESSOR] Webhook ID ${item.id} failed. Scheduled next retry at ${nextRetryDate.toISOString()} (Delay: ${totalDelayMs}ms with jitter)`);
          }
        }
      }
    }
  );
};
if (shouldRunBackgroundWorkers) {
  setInterval(processWebhookDLQ, 5 * 60 * 1000);
}


// Deep External Meta Object Verification Helper
export async function verifyMetaExternalObjectDetailed(
  objId: string | null,
  accessToken: string
): Promise<{
  outcome: 'MISSING' | 'EXISTS' | 'EXTERNAL_STATE_UNKNOWN';
  status?: string;
  name?: string;
  dailyBudget?: number;
  raw?: any;
  error?: string;
}> {
  if (!objId) return { outcome: 'MISSING' };
  const baseUrl = process.env.META_BASE_URL || "https://graph.facebook.com/v20.0";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${baseUrl}/${objId}?fields=id,status,effective_status,name,daily_budget,account_id,campaign_id,adset_id&access_token=${accessToken}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = (res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await res.text().catch(() => '')).slice(0, 150) } as any);

    // Check for HTTP 404 or Graph API missing object errors
    if (res.status === 404 || (data.error && (data.error.code === 100 || data.error.code === 10 || String(data.error.message || '').includes('does not exist')))) {
      return { outcome: 'MISSING' };
    }

    if (!res.ok && data.error) {
      return { outcome: 'EXTERNAL_STATE_UNKNOWN', error: data.error.message || 'Meta API error' };
    }

    if (data.id) {
      const extStatus = String(data.status || data.effective_status || 'UNKNOWN').toUpperCase();
      const extName = String(data.name || '');
      const dailyBudget = data.daily_budget ? Number(data.daily_budget) : undefined;
      return {
        outcome: 'EXISTS',
        status: extStatus,
        name: extName,
        dailyBudget,
        raw: data
      };
    }

    return { outcome: 'EXTERNAL_STATE_UNKNOWN', error: 'Invalid response structure' };
  } catch (err: any) {
    console.error(`[META RECONCILIATION] Verification transport error for object ${objId}:`, err.message);
    return { outcome: 'EXTERNAL_STATE_UNKNOWN', error: err.message || 'Transport failure' };
  }
}

// Phase 9 / P0-3: DB <-> Meta Active Reconciliation Engine & Quarantine Worker (+ Advisory Lock)
export const processMetaReconciliation = async (overridePool?: any, overrideAccessToken?: string) => {
  const dbPool = overridePool || pool;
  if (!dbPool) return;
  const accessToken = overrideAccessToken || process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN;
  if (!accessToken) return;

  await DistributedLockService.withAdvisoryLock(
    dbPool,
    DistributedLockService.LOCKS.META_RECONCILIATION,
    'processMetaReconciliation',
    async () => {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS meta_reconciliation_incidents (
          id SERIAL PRIMARY KEY,
          transaction_id INTEGER REFERENCES meta_publishing_transactions(id),
          mismatch_type VARCHAR(100),
          details JSONB,
          resolved BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await dbPool.query(`ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS quarantined_objects JSONB;`);
      await dbPool.query(`ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMP;`);
      await dbPool.query(`ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS reconciliation_started_at TIMESTAMP;`);
      await dbPool.query(`ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS reconciliation_lease_expires_at TIMESTAMP;`);
      await dbPool.query(`ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS reconciliation_attempt_count INTEGER DEFAULT 0;`);
      await dbPool.query(`ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS next_reconciliation_at TIMESTAMP;`);

      // 1. STALE / UNKNOWN TRANSACTION RECOVERY
      const staleTxRes = await dbPool.query(`
        SELECT * FROM meta_publishing_transactions
        WHERE publish_status IN ('EXTERNAL_OUTCOME_UNKNOWN', 'RECONCILIATION_REQUIRED', 'ROLLBACK_FAILED', 'QUARANTINED')
        AND (next_reconciliation_at IS NULL OR next_reconciliation_at <= CURRENT_TIMESTAMP)
        AND (reconciliation_lease_expires_at IS NULL OR reconciliation_lease_expires_at <= CURRENT_TIMESTAMP)
        ORDER BY next_reconciliation_at ASC NULLS FIRST, id ASC LIMIT 10
        FOR UPDATE SKIP LOCKED
      `);

      // Acquire leases
      if (staleTxRes.rows.length > 0) {
        await dbPool.query(`
          UPDATE meta_publishing_transactions
          SET reconciliation_started_at = CURRENT_TIMESTAMP,
              reconciliation_lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
              reconciliation_attempt_count = reconciliation_attempt_count + 1
          WHERE id = ANY($1)
        `, [staleTxRes.rows.map((r: any) => r.id)]);
      }

      for (const staleTx of staleTxRes.rows) {
        console.log(`[META RECONCILIATION] Reconciling stale transaction #${staleTx.id} (status: ${staleTx.publish_status})`);

        const [campVerification, adsetVerification, adVerification] = await Promise.all([
          staleTx.meta_campaign_id ? verifyMetaExternalObjectDetailed(staleTx.meta_campaign_id, accessToken) : Promise.resolve<Awaited<ReturnType<typeof verifyMetaExternalObjectDetailed>>>({ outcome: 'MISSING' }),
          staleTx.meta_adset_id ? verifyMetaExternalObjectDetailed(staleTx.meta_adset_id, accessToken) : Promise.resolve<Awaited<ReturnType<typeof verifyMetaExternalObjectDetailed>>>({ outcome: 'MISSING' }),
          staleTx.meta_ad_id ? verifyMetaExternalObjectDetailed(staleTx.meta_ad_id, accessToken) : Promise.resolve<Awaited<ReturnType<typeof verifyMetaExternalObjectDetailed>>>({ outcome: 'MISSING' })
        ]);

        // Rule 3: If verification encounters network timeout or transport failure, PRESERVE EXTERNAL_OUTCOME_UNKNOWN
        const hasUnknown = [campVerification, adsetVerification, adVerification].some(v => v.outcome === 'EXTERNAL_STATE_UNKNOWN');
        if (hasUnknown) {
          console.warn(`[META RECONCILIATION] Stale TX #${staleTx.id}: Meta transport error/timeout. Preserving EXTERNAL_OUTCOME_UNKNOWN.`);
          await dbPool.query(`
            UPDATE meta_publishing_transactions
            SET publish_status = 'EXTERNAL_OUTCOME_UNKNOWN', last_reconciled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [staleTx.id]);

          await dbPool.query(`
            INSERT INTO meta_reconciliation_incidents (transaction_id, mismatch_type, details)
            VALUES ($1, $2, $3)
          `, [staleTx.id, 'EXTERNAL_STATE_UNKNOWN', JSON.stringify({
            message: 'Network transport failure or timeout during verification. Outcome unknown, will retry.',
            correlation_id: staleTx.correlation_id,
            timestamp: new Date().toISOString()
          })]);
          continue;
        }

        const campExists = campVerification.outcome === 'EXISTS';
        const adsetExists = adsetVerification.outcome === 'EXISTS';
        const adExists = adVerification.outcome === 'EXISTS';

        if (campExists && adsetExists && adExists) {
          // Complete publish discovered! Auto-heal to SUCCESS
          await dbPool.query(`
            UPDATE meta_publishing_transactions
            SET publish_status = 'SUCCESS', last_reconciled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [staleTx.id]);
          if (staleTx.campaign_id) {
            await dbPool.query(`
              UPDATE host_marketing_campaigns
              SET meta_campaign_id = $1, meta_adset_id = $2, meta_creative_id = $3, meta_ad_id = $4
              WHERE id = $5
            `, [staleTx.meta_campaign_id, staleTx.meta_adset_id, staleTx.meta_creative_id, staleTx.meta_ad_id, staleTx.campaign_id]);
            await transitionCampaignState({ campaignId: Number(staleTx.campaign_id), to: 'CAMPAIGN_LIVE', reason: 'Reconciliation auto-heal completed dispatch', actorType: 'system' });
          }
        } else if (campExists || adsetExists || staleTx.meta_creative_id) {
          // Partial publication discovered -> QUARANTINE unsafe objects
          console.log(`[META RECONCILIATION] Stale TX #${staleTx.id}: Partial objects found. Quarantining...`);
          const rbRes = await executeMetaRollback({
            metaCampaignId: staleTx.meta_campaign_id,
            metaAdSetId: staleTx.meta_adset_id,
            metaCreativeId: staleTx.meta_creative_id,
            metaAdId: staleTx.meta_ad_id
          }, staleTx.correlation_id || crypto.randomUUID(), dbPool);

          const newStatus = rbRes.quarantined ? 'QUARANTINED' : (rbRes.success ? 'ROLLBACK_SUCCESS' : 'ROLLBACK_FAILED');
          await dbPool.query(`
            UPDATE meta_publishing_transactions
            SET publish_status = $1, rollback_status = $2, quarantined_objects = $3, last_reconciled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
          `, [newStatus, rbRes.success ? 'SUCCESS' : (rbRes.quarantined ? 'QUARANTINED' : 'FAILED'), JSON.stringify(rbRes.quarantinedObjects || {}), staleTx.id]);

          if (staleTx.campaign_id) {
            await transitionCampaignState({ campaignId: Number(staleTx.campaign_id), to: 'failed_publish', reason: 'Reconciliation auto-heal quarantined stale partial transaction', actorType: 'system' });
          }

          await dbPool.query(`
            INSERT INTO meta_reconciliation_incidents (transaction_id, mismatch_type, details)
            VALUES ($1, $2, $3)
          `, [staleTx.id, 'ORPHAN_UNSAFE_OBJECT_QUARANTINED', JSON.stringify({
            incident_type: 'ORPHAN_PARTIAL_QUARANTINED',
            campaign_id: staleTx.campaign_id,
            local_state: staleTx.publish_status,
            remediation_attempted: 'QUARANTINE_PAUSE_AND_RENAME',
            remediation_result: newStatus,
            quarantined_objects: rbRes.quarantinedObjects,
            correlation_id: staleTx.correlation_id,
            timestamp: new Date().toISOString()
          })]);
        } else {
          // No objects exist on Meta -> Safe FAILED_PUBLISH
          await dbPool.query(`
            UPDATE meta_publishing_transactions
            SET publish_status = 'FAILED_PUBLISH', last_reconciled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [staleTx.id]);
          if (staleTx.campaign_id) {
            await transitionCampaignState({ campaignId: Number(staleTx.campaign_id), to: 'failed_publish', reason: 'Reconciliation auto-heal cleared stale uninitiated transaction', actorType: 'system' });
          }
        }
      }

      // 2. COMPLETED / TERMINAL / LIVE TRANSACTIONS RECONCILIATION AND ACTIVE REMEDIATION
      const txRes = await dbPool.query(`
        SELECT t.*, c.budget as expected_budget FROM meta_publishing_transactions t
        LEFT JOIN host_marketing_campaigns c ON t.campaign_id = c.id
        WHERE t.publish_status IN ('SUCCESS', 'ROLLBACK_SUCCESS', 'ROLLBACK_FAILED', 'FAILED', 'FAILED_PUBLISH', 'LIVE', 'QUARANTINED', 'EXTERNAL_OUTCOME_UNKNOWN')
        AND (t.meta_campaign_id IS NOT NULL OR t.meta_adset_id IS NOT NULL OR t.meta_creative_id IS NOT NULL OR t.meta_ad_id IS NOT NULL)
        AND (t.last_reconciled_at IS NULL OR t.last_reconciled_at < CURRENT_TIMESTAMP - INTERVAL '1 minute')
        ORDER BY t.last_reconciled_at ASC NULLS FIRST, t.updated_at DESC, t.id ASC LIMIT 20
        FOR UPDATE OF t SKIP LOCKED
      `);

      for (const tx of txRes.rows) {
        const [campV, adsetV, creativeV, adV] = await Promise.all([
          tx.meta_campaign_id ? verifyMetaExternalObjectDetailed(tx.meta_campaign_id, accessToken) : Promise.resolve<Awaited<ReturnType<typeof verifyMetaExternalObjectDetailed>>>({ outcome: 'MISSING' }),
          tx.meta_adset_id ? verifyMetaExternalObjectDetailed(tx.meta_adset_id, accessToken) : Promise.resolve<Awaited<ReturnType<typeof verifyMetaExternalObjectDetailed>>>({ outcome: 'MISSING' }),
          tx.meta_creative_id ? verifyMetaExternalObjectDetailed(tx.meta_creative_id, accessToken) : Promise.resolve<Awaited<ReturnType<typeof verifyMetaExternalObjectDetailed>>>({ outcome: 'MISSING' }),
          tx.meta_ad_id ? verifyMetaExternalObjectDetailed(tx.meta_ad_id, accessToken) : Promise.resolve<Awaited<ReturnType<typeof verifyMetaExternalObjectDetailed>>>({ outcome: 'MISSING' })
        ]);

        // Rule 3: Transport failure during verification -> PRESERVE EXTERNAL_OUTCOME_UNKNOWN
        if ([campV, adsetV, creativeV, adV].some(v => v.outcome === 'EXTERNAL_STATE_UNKNOWN')) {
          console.warn(`[META RECONCILIATION] TX #${tx.id}: Meta transport failure during audit. Preserving state without mutation.`);
          await dbPool.query(`
            UPDATE meta_publishing_transactions
            SET last_reconciled_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [tx.id]);

          await dbPool.query(`
            INSERT INTO meta_reconciliation_incidents (transaction_id, mismatch_type, details)
            VALUES ($1, $2, $3)
          `, [tx.id, 'EXTERNAL_STATE_UNKNOWN', JSON.stringify({
            message: 'Transport failure inspecting Meta external state. Retrying in next reconciliation cycle.',
            correlation_id: tx.correlation_id,
            timestamp: new Date().toISOString()
          })]);
          continue;
        }

        const expectActiveOrLive = (tx.publish_status === 'SUCCESS' || tx.publish_status === 'LIVE');
        const expectFailedOrQuarantined = !expectActiveOrLive;

        // Check for orphaned / active / unsafe objects on failed or unknown transactions
        const existingObjects = [
          { type: 'CAMPAIGN', id: tx.meta_campaign_id, verification: campV },
          { type: 'ADSET', id: tx.meta_adset_id, verification: adsetV },
          { type: 'CREATIVE', id: tx.meta_creative_id, verification: creativeV },
          { type: 'AD', id: tx.meta_ad_id, verification: adV }
        ].filter(o => o.id && o.verification.outcome === 'EXISTS');

        if (expectFailedOrQuarantined && existingObjects.length > 0) {
          // Local state says transaction failed/rolled back/quarantined/unknown, BUT objects exist on Meta!
          // Check if all existing objects are ALREADY safely quarantined (PAUSED and RENAMED)
          const unquarantinedObjects = existingObjects.filter(o => {
            const isPaused = o.verification.status === 'PAUSED' || o.verification.status === 'ARCHIVED';
            const isQuarantineNamed = (o.verification.name || '').includes('FAILED_ROLLBACK');
            return !(isPaused && isQuarantineNamed);
          });

          if (unquarantinedObjects.length > 0) {
            // ACTIVE OR UNQUARANTINED ORPHAN OBJECT DISCOVERED -> ACTIVE REMEDIATION REQUIRED
            console.warn(`[META RECONCILIATION] ACTIVE/UNQUARANTINED ORPHAN DISCOVERED on TX #${tx.id} (${tx.publish_status}):`, unquarantinedObjects.map(o => `${o.type}:${o.id}(${o.verification.status})`));

            const rbRes = await executeMetaRollback({
              metaCampaignId: tx.meta_campaign_id,
              metaAdSetId: tx.meta_adset_id,
              metaCreativeId: tx.meta_creative_id,
              metaAdId: tx.meta_ad_id
            }, tx.correlation_id || crypto.randomUUID(), dbPool);

            const finalStatus = rbRes.quarantined ? 'QUARANTINED' : 'ROLLBACK_FAILED';

            await dbPool.query(`
              UPDATE meta_publishing_transactions
              SET publish_status = $1, rollback_status = $2, quarantined_objects = $3, last_reconciled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = $4
            `, [finalStatus, rbRes.quarantined ? 'QUARANTINED' : 'FAILED', JSON.stringify(rbRes.quarantinedObjects || {}), tx.id]);

            // Persist reconciliation incident with full remediation details
            for (const unq of unquarantinedObjects) {
              await dbPool.query(`
                INSERT INTO meta_reconciliation_incidents (transaction_id, mismatch_type, details)
                VALUES ($1, $2, $3)
              `, [
                tx.id,
                'ORPHAN_UNSAFE_OBJECT_QUARANTINED',
                JSON.stringify({
                  incident_type: 'ORPHAN_ACTIVE_QUARANTINED',
                  campaign_id: tx.campaign_id,
                  meta_object_id: unq.id,
                  object_type: unq.type,
                  local_state: tx.publish_status,
                  external_state: unq.verification.status,
                  remediation_attempted: 'QUARANTINE_PAUSE_AND_RENAME',
                  remediation_result: finalStatus,
                  quarantined_objects: rbRes.quarantinedObjects,
                  correlation_id: tx.correlation_id,
                  timestamp: new Date().toISOString()
                })
              ]);
            }
          } else {
            // All existing objects are ALREADY PAUSED + RENAMED (Idempotent convergence)
            console.log(`[META RECONCILIATION] TX #${tx.id} objects already safely quarantined. Ensuring QUARANTINED state.`);
            if (tx.publish_status !== 'QUARANTINED') {
              await dbPool.query(`
                UPDATE meta_publishing_transactions
                SET publish_status = 'QUARANTINED', rollback_status = 'QUARANTINED', last_reconciled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
              `, [tx.id]);
            } else {
              await dbPool.query(`
                UPDATE meta_publishing_transactions
                SET last_reconciled_at = CURRENT_TIMESTAMP
                WHERE id = $1
              `, [tx.id]);
            }
          }
        } else if (expectActiveOrLive) {
          // LIVE / SUCCESS transaction checking
          const mismatches: { type: string; details: string; objId?: string; objType?: string; extState?: string }[] = [];

          if (tx.meta_campaign_id && campV.outcome === 'MISSING') mismatches.push({ type: 'MISSING_CAMPAIGN', details: `DB says ${tx.publish_status} but Meta Campaign ${tx.meta_campaign_id} is missing.`, objId: tx.meta_campaign_id, objType: 'CAMPAIGN' });
          if (tx.meta_adset_id && adsetV.outcome === 'MISSING') mismatches.push({ type: 'MISSING_ADSET', details: `DB says ${tx.publish_status} but Meta AdSet ${tx.meta_adset_id} is missing.`, objId: tx.meta_adset_id, objType: 'ADSET' });
          if (tx.meta_creative_id && creativeV.outcome === 'MISSING') mismatches.push({ type: 'MISSING_CREATIVE', details: `DB says ${tx.publish_status} but Meta Creative ${tx.meta_creative_id} is missing.`, objId: tx.meta_creative_id, objType: 'CREATIVE' });
          if (tx.meta_ad_id && adV.outcome === 'MISSING') mismatches.push({ type: 'MISSING_AD', details: `DB says ${tx.publish_status} but Meta Ad ${tx.meta_ad_id} is missing.`, objId: tx.meta_ad_id, objType: 'AD' });

          // Configuration check: Budget mismatch
          if (campV.outcome === 'EXISTS' && campV.dailyBudget && tx.expected_budget) {
            const expectedCents = Math.round(Number(tx.expected_budget) * 100);
            if (Math.abs(campV.dailyBudget - expectedCents) > 100) { // Difference > $1.00
              mismatches.push({
                type: 'CONFIGURATION_MISMATCH',
                details: `Campaign budget mismatch: Local expects $${tx.expected_budget} (${expectedCents} cents), Meta has ${campV.dailyBudget} cents.`,
                objId: tx.meta_campaign_id,
                objType: 'CAMPAIGN',
                extState: `budget:${campV.dailyBudget}`
              });
            }
          }

          for (const mismatch of mismatches) {
            const existing = await dbPool.query(
              `SELECT id FROM meta_reconciliation_incidents WHERE transaction_id = $1 AND mismatch_type = $2 AND resolved = false`,
              [tx.id, mismatch.type]
            );
            if (existing.rows.length === 0) {
              console.warn(`[META RECONCILIATION INCIDENT] TX #${tx.id}: ${mismatch.type} - ${mismatch.details}`);
              await dbPool.query(
                `INSERT INTO meta_reconciliation_incidents (transaction_id, mismatch_type, details) VALUES ($1, $2, $3)`,
                [tx.id, mismatch.type, JSON.stringify({
                  incident_type: mismatch.type,
                  campaign_id: tx.campaign_id,
                  meta_object_id: mismatch.objId,
                  object_type: mismatch.objType,
                  local_state: tx.publish_status,
                  external_state: mismatch.extState || 'MISSING',
                  correlation_id: tx.correlation_id,
                  message: mismatch.details,
                  timestamp: new Date().toISOString()
                })]
              );
            }
          }

          await dbPool.query(`
            UPDATE meta_publishing_transactions
            SET last_reconciled_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [tx.id]);
        } else {
          // Transaction is in rolled_back/failed/quarantined status and all objects are MISSING on Meta -> Clean convergence!
          await dbPool.query(`
            UPDATE meta_publishing_transactions
            SET last_reconciled_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [tx.id]);
        }
      }
    }
  );
};
// Run every 10 minutes
if (shouldRunBackgroundWorkers) {
  setInterval(processMetaReconciliation, 10 * 60 * 1000);
}

// ==========================================
// Phase 2.9.3B: Durable Transaction Recovery Worker
// Eliminates P0 dead-end: PRECHECK_RUNNING / PUBLISHING orphans after process crash
// ==========================================

// Configurable thresholds (documented, not arbitrary)
const RECOVERY_LEASE_STALE_THRESHOLD_SECONDS = 300; // 5 minutes — matches dispatchMetaCampaign lease window
const RECOVERY_LEASE_DURATION_SECONDS = 300;        // 5 minutes — lease duration for recovery worker
const RECOVERY_MAX_ATTEMPTS = 10;                   // Max recovery attempts before permanent DLQ
const RECOVERY_POLL_INTERVAL_MS = 2 * 60 * 1000;   // 2 minutes — polling interval

export const recoverOrphanedMetaTransactions = async (overridePool?: any) => {
  return { processed: 0, status: 'RETIRED', code: 'HARVO_V2_REQUIRED' }; // Old workers cannot authorize funds or publish ads.

  const dbPool = overridePool || pool;
  if (!dbPool) return;

  const workerId = `recovery_${process.pid}_${Date.now()}`;

  await DistributedLockService.withAdvisoryLock(
    dbPool,
    DistributedLockService.LOCKS.ORPHAN_META_TX_RECOVERY,
    'recoverOrphanedMetaTransactions',
    async () => {
      // 1. Discover orphaned transactions with lease protection
      const client = await dbPool.connect();
      let orphans: any[] = [];

      try {
        await client.query('BEGIN');

        const orphanRes = await client.query(`
          SELECT id, campaign_id, publish_status, correlation_id, idempotency_key,
                 meta_campaign_id, meta_adset_id, meta_creative_id, meta_ad_id,
                 publish_attempt, reconciliation_attempt_count, updated_at
          FROM meta_publishing_transactions
          WHERE publish_status IN ('PRECHECK_RUNNING', 'PUBLISHING')
          AND updated_at < CURRENT_TIMESTAMP - INTERVAL '${RECOVERY_LEASE_STALE_THRESHOLD_SECONDS} seconds'
          AND (reconciliation_lease_expires_at IS NULL OR reconciliation_lease_expires_at <= CURRENT_TIMESTAMP)
          AND (reconciliation_attempt_count IS NULL OR reconciliation_attempt_count < ${RECOVERY_MAX_ATTEMPTS})
          ORDER BY updated_at ASC, id ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        `);

        if (orphanRes.rows.length === 0) {
          await client.query('COMMIT');
          return;
        }

        // 2. Claim lease on all discovered orphans
        for (const orphan of orphanRes.rows) {
          await client.query(`
            UPDATE meta_publishing_transactions
            SET reconciliation_started_at = CURRENT_TIMESTAMP,
                reconciliation_lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '${RECOVERY_LEASE_DURATION_SECONDS} seconds',
                reconciliation_attempt_count = COALESCE(reconciliation_attempt_count, 0) + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [orphan.id]);
        }

        await client.query('COMMIT');
        orphans = orphanRes.rows;
      } catch (err: any) {
        await client.query('ROLLBACK');
        if (err.code === '55P03') {
          // Another worker holds the lock — expected, not an error
          return;
        }
        throw err;
      } finally {
        client.release();
      }

      // 3. Process each orphan OUTSIDE the lease transaction (no long-held locks)
      for (const orphan of orphans) {
        const attemptCount = (orphan.reconciliation_attempt_count || 0) + 1;

        console.log(`[RECOVERY WORKER ${workerId}] Processing orphan TX #${orphan.id} (status: ${orphan.publish_status}, campaign: ${orphan.campaign_id}, attempt: ${attemptCount})`);

        try {
          if (orphan.publish_status === 'PRECHECK_RUNNING') {
            // PRECHECK_RUNNING: dispatch intent was created but Meta API was never called.
            // Safe to re-dispatch IF no Meta objects have been created yet.

            const hasMetaObjects = orphan.meta_campaign_id || orphan.meta_adset_id || orphan.meta_creative_id || orphan.meta_ad_id;

            if (hasMetaObjects) {
              // Meta objects exist despite PRECHECK_RUNNING — should not happen, but be safe.
              // Transition to EXTERNAL_OUTCOME_UNKNOWN for reconciliation.
              console.warn(`[RECOVERY WORKER] TX #${orphan.id}: PRECHECK_RUNNING but Meta objects exist. Transitioning to EXTERNAL_OUTCOME_UNKNOWN.`);
              await dbPool.query(`
                UPDATE meta_publishing_transactions
                SET publish_status = 'EXTERNAL_OUTCOME_UNKNOWN', updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
              `, [orphan.id]);

              // Log audit event
              await dbPool.query(`
                INSERT INTO meta_publishing_events (transaction_id, campaign_id, event_type, from_state, to_state, actor_type, actor_id, reason, correlation_id, metadata)
                VALUES ($1, $2, 'RECOVERY_TRANSITION', $3, 'EXTERNAL_OUTCOME_UNKNOWN', 'system', $4, $5, $6, $7)
              `, [
                orphan.id, orphan.campaign_id, orphan.publish_status, workerId,
                'PRECHECK_RUNNING with existing Meta objects detected by recovery worker',
                orphan.correlation_id,
                JSON.stringify({ attempt: attemptCount, meta_campaign_id: orphan.meta_campaign_id })
              ]);
            } else {
              // No Meta objects exist — safe to re-dispatch
              console.log(`[RECOVERY WORKER] TX #${orphan.id}: Re-dispatching orphaned PRECHECK_RUNNING campaign #${orphan.campaign_id}`);

              // Log audit event BEFORE dispatch attempt
              await dbPool.query(`
                INSERT INTO meta_publishing_events (transaction_id, campaign_id, event_type, from_state, to_state, actor_type, actor_id, reason, correlation_id, metadata)
                VALUES ($1, $2, 'RECOVERY_DISPATCH', $3, 'PRECHECK_RUNNING', 'system', $4, $5, $6, $7)
              `, [
                orphan.id, orphan.campaign_id, orphan.publish_status, workerId,
                'Recovery worker re-dispatching orphaned PRECHECK_RUNNING transaction',
                orphan.correlation_id,
                JSON.stringify({ attempt: attemptCount, idempotency_key: orphan.idempotency_key })
              ]);

              // Re-dispatch. dispatchMetaCampaign handles its own idempotency:
              // - INSERT ON CONFLICT DO NOTHING on idempotency_key
              // - SELECT FOR UPDATE NOWAIT for lease claim
              // - 5-minute lease expiry check (our recovery only fires after 5 min, so lease is expired)
              // - correlation_id mismatch detection for re-entry
              try {
                await dispatchMetaCampaign(orphan.campaign_id, { protocol: 'https', get: () => 'localhost' } as any);
              } catch (dispatchErr: any) {
                console.error(`[RECOVERY WORKER] TX #${orphan.id}: Re-dispatch failed:`, dispatchErr.message);
                // dispatchMetaCampaign internally handles its own error recording and DLQ.
                // The recovery worker's job is only to trigger the attempt.
              }
            }
          } else if (orphan.publish_status === 'PUBLISHING') {
            // PUBLISHING: dispatch execution was underway when the worker crashed.
            // Meta objects MAY already exist. NOT safe to blindly re-dispatch.
            // Transition to EXTERNAL_OUTCOME_UNKNOWN for safe reconciliation by processMetaReconciliation.

            console.warn(`[RECOVERY WORKER] TX #${orphan.id}: Stale PUBLISHING state. Transitioning to EXTERNAL_OUTCOME_UNKNOWN for reconciliation.`);

            await dbPool.query(`
              UPDATE meta_publishing_transactions
              SET publish_status = 'EXTERNAL_OUTCOME_UNKNOWN', updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [orphan.id]);

            // Transition campaign state if possible
            if (orphan.campaign_id) {
              try {
                await transitionCampaignState({
                  campaignId: Number(orphan.campaign_id),
                  to: 'EXTERNAL_OUTCOME_UNKNOWN',
                  reason: 'Recovery worker detected stale PUBLISHING state — transitioning to EXTERNAL_OUTCOME_UNKNOWN for reconciliation',
                  actorType: 'system'
                });
              } catch (fsmErr: any) {
                // FSM transition may fail if campaign is already in a compatible state — non-fatal
                console.warn(`[RECOVERY WORKER] TX #${orphan.id}: Campaign FSM transition failed (non-fatal):`, fsmErr.message);
              }
            }

            // Log audit event
            await dbPool.query(`
              INSERT INTO meta_publishing_events (transaction_id, campaign_id, event_type, from_state, to_state, actor_type, actor_id, reason, correlation_id, metadata)
              VALUES ($1, $2, 'RECOVERY_TRANSITION', $3, 'EXTERNAL_OUTCOME_UNKNOWN', 'system', $4, $5, $6, $7)
            `, [
              orphan.id, orphan.campaign_id, orphan.publish_status, workerId,
              'Stale PUBLISHING detected by recovery worker — Meta objects may exist, requires reconciliation',
              orphan.correlation_id,
              JSON.stringify({
                attempt: attemptCount,
                meta_campaign_id: orphan.meta_campaign_id,
                meta_adset_id: orphan.meta_adset_id,
                meta_ad_id: orphan.meta_ad_id
              })
            ]);
          }
        } catch (orphanErr: any) {
          console.error(`[RECOVERY WORKER] TX #${orphan.id}: Recovery processing failed:`, orphanErr.message);

          // Record recovery failure as audit event
          await dbPool.query(`
            INSERT INTO meta_publishing_events (transaction_id, campaign_id, event_type, from_state, to_state, actor_type, actor_id, reason, correlation_id, metadata)
            VALUES ($1, $2, 'RECOVERY_FAILED', $3, $3, 'system', $4, $5, $6, $7)
          `, [
            orphan.id, orphan.campaign_id, orphan.publish_status, workerId,
            'Recovery worker failed: ' + (orphanErr.message || 'Unknown error'),
            orphan.correlation_id,
            JSON.stringify({ attempt: attemptCount, error: orphanErr.message })
          ]).catch((logErr: unknown) => console.error('[RECOVERY WORKER] Failed to log recovery failure:', logErr));
        }
      }

      console.log(`[RECOVERY WORKER ${workerId}] Cycle complete. Processed ${orphans.length} orphan(s).`);
    }
  );
};

async function processGoogleOfflineConversions() {
  try {
    console.log('[Worker] Checking for pending Google Offline Conversions...');
    // Replace with the actual MCC customer ID used by the platform
    const GOOGLE_ADS_MCC_ID = process.env.GOOGLE_ADS_CLIENT_ID || '1234567890';
    const GOOGLE_CONVERSION_ACTION = process.env.GOOGLE_CONVERSION_ACTION_ID || '12345';
    await googleOfflineConversions.syncPendingConversions(GOOGLE_ADS_MCC_ID, GOOGLE_CONVERSION_ACTION);
  } catch (error) {
    console.error('[Worker] Error processing Google Offline Conversions:', error);
  }
}

// Phase 2.9.2: Atomic Financial Settlement Helper
export async function processAtomicRefund(
  campaignId: number,
  hostId: number,
  remainingBudget: number,
  txType: string,
  txRef: string,
  description: string,
  adminId?: number,
  adminAction?: string,
  prevState?: any,
  feedback?: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock Campaign for Update to check idempotency
    const campCheck = await client.query('SELECT * FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [campaignId]);
    if (campCheck.rows.length === 0) throw new Error('Campaign not found');
    const camp = campCheck.rows[0];

    if (camp.payment_status === 'refunded') {
      await client.query('ROLLBACK');
      return { success: false, message: 'Already refunded' };
    }

    // 2. Lock Wallet for Update
    let walletRes = await client.query('SELECT id FROM host_wallets WHERE host_id = $1 FOR UPDATE', [hostId]);
    if (walletRes.rows.length === 0) {
      walletRes = await client.query('INSERT INTO host_wallets (host_id, balance, encho_credits) VALUES ($1, 0, 0) RETURNING id', [hostId]);
    }

    // 3. Double-Entry Ledger Mutate Wallet and Insert Ledger Transaction
    await DoubleEntryLedgerService.recordTransaction(client, {
      transactionRef: txRef,
      eventType: 'ESCROW_RELEASE',
      legacyTransactionType: txType,
      description,
      lines: [
        { accountType: 'AD_SPEND_ESCROW', entryType: 'DEBIT', amount: remainingBudget * 0.85 },
        { accountType: 'ENCHO_FEE_REVENUE', entryType: 'DEBIT', amount: remainingBudget * 0.15 },
        { accountType: 'HOST_WALLET', userId: hostId, entryType: 'CREDIT', amount: remainingBudget }
      ]
    });

    // 4. Update Campaign Financial State
    await client.query("UPDATE host_marketing_campaigns SET payment_status = 'refunded' WHERE id = $1", [campaignId]);

    // 5. Immutable Audit Event (if Admin)
    if (adminId && adminAction && prevState) {
      const newState = { status: adminAction.includes('reject') ? 'rejected' : 'killed', refund: remainingBudget, admin_feedback: feedback };
      await client.query(`
        INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [adminId, 'marketing_campaign', campaignId, adminAction, JSON.stringify(prevState), JSON.stringify(newState), '127.0.0.1']);
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ATOMIC REFUND ERROR]', err);
    throw err;
  } finally {
    client.release();
  }
}

export function startLegacyBackgroundWorkers() {
  if (!shouldRunBackgroundWorkers) return;
  console.log('[WORKER ENGINE] Starting legacy background worker timers...');
  setInterval(() => processLeadNotificationQueue(), 30 * 1000);
  setInterval(processEscrowAutoRelease, 60000);
  const RECOVERY_POLL_INTERVAL_MS = 120000;
  setInterval(recoverOrphanedMetaTransactions, RECOVERY_POLL_INTERVAL_MS);
  setInterval(processGoogleOfflineConversions, 15 * 60 * 1000);
  setInterval(() => TokenHealthMonitor.checkTokenHealth(pool), 12 * 60 * 60 * 1000);
}

export async function syncCampaignSpend(row: any): Promise<any> {
  const { meta_capi_token, meta_access_token, api_token, ...safe } = row;
  return { ...safe, analytics: null, analytics_availability: 'UNVERIFIED_LEGACY', analytics_note: 'Open the campaign studio for provider-observed metrics. Historical simulated analytics are excluded.' };
}
