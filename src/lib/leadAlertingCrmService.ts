import * as crypto from 'crypto';
import { maskContactInfo } from './maskUtils.js';
import { encryptPII, decryptPII } from './cryptoUtils.js';

export type LeadState = 
  | 'NEW'
  | 'DELIVERED'
  | 'VIEWED'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'CONVERTED'
  | 'LOST'
  | 'INVALID';

export type LeadPriority = 'HOT' | 'WARM' | 'NORMAL';
export type LeadIntentBadge = 'HOT_LEAD' | 'WARM_INQUIRY' | 'NORMAL_INQUIRY';

export interface LeadScoringInputs {
  submission_recency_minutes?: number;
  has_phone_number?: boolean;
  has_email?: boolean;
  booking_proximity_intent?: boolean;
  repeat_inquiry_on_listing?: boolean;
  message_text?: string;
  form_fields_count?: number;
}

export interface LeadScoreResult {
  score: number; // 0 - 100
  classification: LeadPriority;
  ai_intent_badge: LeadIntentBadge;
  display_label: string;
  badge_emoji: string;
  scoring_inputs: LeadScoringInputs;
  scored_at: string;
}

export interface LeadRecord {
  id: number;
  campaign_id: number;
  host_id: number;
  listing_id: number | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  message_history: any[];
  intent_score: number;
  ai_intent_badge: LeadIntentBadge;
  status: LeadState;
  source: string;
  platform: string;
  external_lead_id: string | null;
  form_id: string | null;
  ad_id: string | null;
  scoring_inputs: LeadScoringInputs | null;
  scored_at: string | null;
  first_viewed_at: string | null;
  first_contacted_at: string | null;
  qualified_at: string | null;
  converted_at: string | null;
  lost_at: string | null;
  thread_id: number | null;
  dedup_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadIngestionResult {
  success: boolean;
  is_duplicate: boolean;
  lead_id?: number;
  status?: LeadState;
  classification?: LeadPriority;
  thread_id?: number;
  notification_intents_created?: number;
  error_code?: string;
  error_message?: string;
  audit_logged?: boolean;
}

export class LeadAlertingCrmService {
  /**
   * Valid State Transitions for Lead FSM
   */
  private static readonly ALLOWED_TRANSITIONS: Record<LeadState, LeadState[]> = {
    NEW: ['DELIVERED', 'INVALID', 'VIEWED', 'CONTACTED'],
    DELIVERED: ['VIEWED', 'CONTACTED', 'LOST', 'INVALID'],
    VIEWED: ['CONTACTED', 'QUALIFIED', 'LOST', 'INVALID'],
    CONTACTED: ['QUALIFIED', 'CONVERTED', 'LOST'],
    QUALIFIED: ['CONVERTED', 'LOST', 'CONTACTED'],
    CONVERTED: [], // Terminal conversion state
    LOST: ['CONTACTED', 'QUALIFIED'], // Re-engagement path
    INVALID: [] // Terminal rejected state
  };

  /**
   * Verify HMAC-SHA256 signature against META_APP_SECRET
   */
  public static verifyWebhookSignature(
    signatureHeader: string | undefined,
    rawBody: string | Buffer
  ): boolean {
    const appSecret = process.env.META_APP_SECRET || 'encho_meta_secret_live_test_2026';
    
    // In local test environments with intentionally omitted signature
    if (process.env.NODE_ENV === 'test' && !signatureHeader) {
      return true;
    }

    if (!signatureHeader) {
      return false;
    }

    const cleanSig = signatureHeader.replace('sha256=', '').trim();
    if (!cleanSig) return false;

    try {
      const hmac = crypto.createHmac('sha256', appSecret);
      const calculatedDigest = hmac.update(rawBody).digest('hex');

      const expectedBuffer = Buffer.from(calculatedDigest, 'hex');
      const receivedBuffer = Buffer.from(cleanSig, 'hex');

      if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch (err) {
      return false;
    }
  }

  /**
   * Deterministic Hot Lead Scoring Engine
   * Calculates intent score (0-100) and assigns canonical classification & badge.
   */
  public static calculateHotLeadScore(inputs: LeadScoringInputs): LeadScoreResult {
    let score = 30; // Base baseline score

    const recencyMin = inputs.submission_recency_minutes ?? 0;
    if (recencyMin <= 60) {
      score += 20; // Fresh within 1 hour
    } else if (recencyMin <= 1440) {
      score += 10; // Within 24 hours
    }

    if (inputs.has_phone_number) {
      score += 10;
    }

    if (inputs.has_email) {
      score += 5;
    }

    if (inputs.booking_proximity_intent) {
      score += 15; // Mentioned specific dates, guest count or immediate travel
    }

    if (inputs.repeat_inquiry_on_listing) {
      score += 10;
    }

    const msg = (inputs.message_text || '').toLowerCase();
    const highIntentKeywords = ['available', 'booking', 'dates', 'price', 'reserve', 'next weekend', 'checkout', 'stay', 'nightly', 'cost', 'discount', 'vacation'];
    const matchedKeywords = highIntentKeywords.filter(kw => msg.includes(kw));
    if (matchedKeywords.length >= 2) {
      score += 15;
    } else if (matchedKeywords.length === 1) {
      score += 8;
    }

    // Clamp score between 0 and 100
    score = Math.min(100, Math.max(0, score));

    let classification: LeadPriority = 'NORMAL';
    let ai_intent_badge: LeadIntentBadge = 'NORMAL_INQUIRY';
    let display_label = 'Standard Inquiry';
    let badge_emoji = '📩';

    if (score >= 75) {
      classification = 'HOT';
      ai_intent_badge = 'HOT_LEAD';
      display_label = 'Hot Lead (High Intent)';
      badge_emoji = '🔥';
    } else if (score >= 50) {
      classification = 'WARM';
      ai_intent_badge = 'WARM_INQUIRY';
      display_label = 'Warm Inquiry';
      badge_emoji = '⚡';
    }

    return {
      score,
      classification,
      ai_intent_badge,
      display_label,
      badge_emoji,
      scoring_inputs: inputs,
      scored_at: new Date().toISOString()
    };
  }

  /**
   * Validates and Ingests Meta Webhook Leads atomically into ENCHO Walled Garden CRM
   */
  public static async validateAndIngestMetaLeadWebhook(params: {
    headers: Record<string, any>;
    rawBody: string | Buffer;
    payload: any;
    poolOrClient: any;
    correlationId?: string;
    reqIp?: string;
    userAgent?: string;
  }): Promise<LeadIngestionResult> {
    const { headers, rawBody, payload, poolOrClient, correlationId, reqIp, userAgent } = params;

    // 1. Signature Verification
    const sigHeader = headers['x-hub-signature-256'] || headers['x-hub-signature'];
    const isSigValid = this.verifyWebhookSignature(sigHeader, rawBody);
    if (!isSigValid) {
      await this.recordSecurityEvent({
        action: 'WEBHOOK_SIGNATURE_REJECTED',
        severity: 'CRITICAL',
        reason: 'HMAC-SHA256 signature mismatch on leadgen webhook payload',
        clientIp: reqIp,
        userAgent,
        poolOrClient
      });
      return {
        success: false,
        is_duplicate: false,
        error_code: 'INVALID_SIGNATURE',
        error_message: 'Cryptographic signature verification failed.'
      };
    }

    // 2. Schema and Event Type Validation
    if (!payload || typeof payload !== 'object') {
      return {
        success: false,
        is_duplicate: false,
        error_code: 'MALFORMED_PAYLOAD',
        error_message: 'Payload is empty or non-object.'
      };
    }

    // Extract leadgen items from payload structure
    let externalLeadId: string | null = null;
    let formId: string | null = null;
    let adId: string | null = null;
    let campaignIdentifier: any = null;
    let guestName = 'Meta Guest';
    let guestEmail = '';
    let guestPhone = '';
    let messageText = 'Inquired via Meta Instagram/Facebook Ad';

    if (payload.entry && Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            if (change.field === 'leadgen' && change.value) {
              externalLeadId = String(change.value.leadgen_id || change.value.lead_id || '');
              formId = change.value.form_id ? String(change.value.form_id) : null;
              adId = change.value.ad_id ? String(change.value.ad_id) : null;
              campaignIdentifier = change.value.campaign_id || null;
              if (change.value.name) guestName = change.value.name;
              if (change.value.email) guestEmail = change.value.email;
              if (change.value.phone) guestPhone = change.value.phone;
              if (change.value.message) messageText = change.value.message;
            }
          }
        }
      }
    } else if (payload.event === 'new_lead' || payload.leadgen_id) {
      externalLeadId = String(payload.leadgen_id || payload.external_lead_id || payload.lead_id || `sim_${Date.now()}`);
      formId = payload.form_id ? String(payload.form_id) : null;
      adId = payload.ad_id ? String(payload.ad_id) : null;
      campaignIdentifier = payload.campaign_id || null;
      if (payload.guest_name || payload.name) guestName = payload.guest_name || payload.name;
      if (payload.guest_email || payload.email) guestEmail = payload.guest_email || payload.email;
      if (payload.guest_phone || payload.phone) guestPhone = payload.guest_phone || payload.phone;
      if (payload.message) messageText = payload.message;
    }

    if (!externalLeadId) {
      return {
        success: false,
        is_duplicate: false,
        error_code: 'MISSING_LEAD_IDENTIFIER',
        error_message: 'Payload did not contain a recognizable leadgen_id.'
      };
    }

    // 3. Resolve Authoritative Campaign and Host from Database
    let matchedCampaign: any = null;
    if (campaignIdentifier) {
      const campRes = await poolOrClient.query(`
        SELECT id, host_id, listing_id, title
        FROM host_marketing_campaigns
        WHERE id = $1 OR meta_campaign_id = $2
        LIMIT 1
      `, [isNaN(Number(campaignIdentifier)) ? -1 : Number(campaignIdentifier), String(campaignIdentifier)]);
      if (campRes.rows.length > 0) {
        matchedCampaign = campRes.rows[0];
      }
    }

    if (!matchedCampaign && adId) {
      const adRes = await poolOrClient.query(`
        SELECT id, host_id, listing_id, title
        FROM host_marketing_campaigns
        WHERE meta_ad_id = $1
        LIMIT 1
      `, [String(adId)]);
      if (adRes.rows.length > 0) {
        matchedCampaign = adRes.rows[0];
      }
    }

    if (!matchedCampaign) {
      // If foreign/unknown campaign: reject safely
      await this.recordSecurityEvent({
        action: 'UNKNOWN_CAMPAIGN_LEAD_REJECTED',
        severity: 'WARNING',
        reason: `Lead ${externalLeadId} arrived for unlinked campaign identifier (${campaignIdentifier || adId})`,
        clientIp: reqIp,
        userAgent,
        poolOrClient
      });
      return {
        success: false,
        is_duplicate: false,
        error_code: 'UNKNOWN_CAMPAIGN_LINKAGE',
        error_message: 'Campaign linkage could not be authoritatively resolved.'
      };
    }

    // 4. Mandatory Tenant Invariant: Always resolve host_id from canonical campaign record
    const canonicalHostId = matchedCampaign.host_id;
    const canonicalCampaignId = matchedCampaign.id;
    const canonicalListingId = matchedCampaign.listing_id;

    // Cross-tenant injection check if payload attempted to pass a forged host_id
    if (payload.host_id && Number(payload.host_id) !== Number(canonicalHostId)) {
      await this.recordSecurityEvent({
        campaignId: canonicalCampaignId,
        attemptedHostId: Number(payload.host_id),
        actualHostId: canonicalHostId,
        action: 'CROSS_TENANT_LEAD_FORGERY_BLOCKED',
        severity: 'CRITICAL',
        reason: `Webhook attempted to assign lead to host ${payload.host_id}, but campaign belongs to ${canonicalHostId}`,
        clientIp: reqIp,
        userAgent,
        poolOrClient
      });
      return {
        success: false,
        is_duplicate: false,
        error_code: 'CROSS_TENANT_VIOLATION',
        error_message: 'Tenant authorization mismatch detected and blocked.'
      };
    }

    // 5. Deterministic Lead Idempotency Check
    const platform = 'META';
    const dedupKey = `${platform}:${externalLeadId}:${canonicalCampaignId}`;

    const existingLeadRes = await poolOrClient.query(`
      SELECT id, status, ai_intent_badge, thread_id
      FROM host_outreach_leads
      WHERE dedup_key = $1 OR (platform = $2 AND external_lead_id = $3 AND campaign_id = $4)
      LIMIT 1
    `, [dedupKey, platform, externalLeadId, canonicalCampaignId]);

    if (existingLeadRes.rows.length > 0) {
      const existing = existingLeadRes.rows[0];
      return {
        success: true,
        is_duplicate: true,
        lead_id: existing.id,
        status: existing.status,
        classification: existing.ai_intent_badge === 'HOT_LEAD' ? 'HOT' : (existing.ai_intent_badge === 'WARM_INQUIRY' ? 'WARM' : 'NORMAL'),
        thread_id: existing.thread_id
      };
    }

    // 6. Deterministic Hot Lead Scoring
    const scoringInputs: LeadScoringInputs = {
      submission_recency_minutes: 0,
      has_phone_number: Boolean(guestPhone && guestPhone.length > 6),
      has_email: Boolean(guestEmail && guestEmail.includes('@')),
      booking_proximity_intent: messageText.toLowerCase().includes('weekend') || messageText.toLowerCase().includes('next') || messageText.toLowerCase().includes('available'),
      repeat_inquiry_on_listing: false,
      message_text: messageText
    };

    // Check repeat engagement on listing
    try {
      const repeatRes = await poolOrClient.query(`
        SELECT COUNT(*) as count FROM host_outreach_leads
        WHERE listing_id = $1 AND (guest_name = $2 OR guest_email = $3)
      `, [canonicalListingId, guestName, guestEmail]);
      if (parseInt(repeatRes.rows[0]?.count || '0') > 0) {
        scoringInputs.repeat_inquiry_on_listing = true;
      }
    } catch (e) {}

    const scoreResult = this.calculateHotLeadScore(scoringInputs);

    // 7. PII Sanitization for Walled Garden CRM
    const { sanitized: maskedMessage, wasSanitized } = maskContactInfo(messageText);
    const initialMessageHistory = [
      {
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sender: 'Guest',
        text: maskedMessage,
        data_masked: wasSanitized
      }
    ];

    // Encrypt raw PII at rest
    const encryptedEmail = encryptPII(guestEmail) || '[REDACTED]';
    const encryptedPhone = encryptPII(guestPhone) || '[REDACTED]';

    // 8. Atomic Lead Insertion
    let newLead: any;
    try {
      const insertLeadRes = await poolOrClient.query(`
        INSERT INTO host_outreach_leads (
          campaign_id, host_id, listing_id, guest_name, guest_email, guest_phone,
          message_history, intent_score, ai_intent_badge, status, source,
          platform, external_lead_id, form_id, ad_id, scoring_inputs,
          scored_at, dedup_key, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, 'NEW', 'Meta Advertising Webhook',
          $10, $11, $12, $13, $14,
          $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `, [
        canonicalCampaignId,
        canonicalHostId,
        canonicalListingId,
        guestName,
        encryptedEmail,
        encryptedPhone,
        JSON.stringify(initialMessageHistory),
        scoreResult.score,
        scoreResult.ai_intent_badge,
        platform,
        externalLeadId,
        formId,
        adId,
        JSON.stringify(scoreResult.scoring_inputs),
        scoreResult.scored_at,
        dedupKey
      ]);

      newLead = insertLeadRes.rows[0];
    } catch (insertErr: any) {
      if (insertErr.code === '23505') { // Unique constraint violation (concurrent race)
        const recheck = await poolOrClient.query(
          `SELECT id, status, ai_intent_badge, thread_id FROM host_outreach_leads WHERE dedup_key = $1`,
          [dedupKey]
        );
        if (recheck.rows.length > 0) {
          const ex = recheck.rows[0];
          return {
            success: true,
            is_duplicate: true,
            lead_id: ex.id,
            status: ex.status,
            classification: ex.ai_intent_badge === 'HOT_LEAD' ? 'HOT' : 'WARM',
            thread_id: ex.thread_id
          };
        }
      }
      throw insertErr;
    }

    // 9. Lead Lifecycle Event Audit Log
    await poolOrClient.query(`
      INSERT INTO lead_lifecycle_events (
        lead_id, campaign_id, host_id, event_type, from_state, to_state,
        actor_type, actor_id, details, created_at
      ) VALUES (
        $1, $2, $3, 'LEAD_INGESTED', NULL, 'NEW',
        'SYSTEM', 'META_WEBHOOK_HANDLER', $4, CURRENT_TIMESTAMP
      )
    `, [
      newLead.id,
      canonicalCampaignId,
      canonicalHostId,
      JSON.stringify({
        score: scoreResult.score,
        classification: scoreResult.classification,
        dedup_key: dedupKey,
        correlation_id: correlationId || null
      })
    ]);

    // 10. Deterministic CRM Thread Creation
    let threadId: number | undefined;
    try {
      const threadResult = await this.ensureLeadConversationThread({
        leadId: newLead.id,
        hostId: canonicalHostId,
        listingId: canonicalListingId || 0,
        guestName,
        initialMessage: maskedMessage,
        poolOrClient
      });
      threadId = threadResult.threadId;

      await poolOrClient.query(`
        UPDATE host_outreach_leads SET thread_id = $1 WHERE id = $2
      `, [threadId, newLead.id]);
    } catch (threadErr) {
      console.warn(`[LEAD SERVICE] CRM Thread creation deferred:`, threadErr);
    }

    // 11. Create PostgreSQL-Backed Notification Intents (Outbox Pattern)
    let notifCount = 0;
    try {
      const intentIds = await this.createNotificationIntents(newLead, matchedCampaign, poolOrClient);
      notifCount = intentIds.length;
    } catch (notifErr) {
      console.error(`[LEAD SERVICE] Failed to record notification intent:`, notifErr);
      // NOTE: Failure to create notification intent does NOT rollback lead persistence!
    }

    // Transition state from NEW -> DELIVERED
    try {
      await this.transitionLeadState({
        leadId: newLead.id,
        toState: 'DELIVERED',
        actorType: 'system',
        actorId: 'LEAD_DISPATCH_ENGINE',
        reason: 'Lead successfully persisted and queued for notification',
        poolOrClient
      });
    } catch (transErr) {}

    return {
      success: true,
      is_duplicate: false,
      lead_id: newLead.id,
      status: 'DELIVERED',
      classification: scoreResult.classification,
      thread_id: threadId,
      notification_intents_created: notifCount
    };
  }

  /**
   * Deterministic Lead Conversation Thread Creation
   * Avoids duplicate thread creation for the same lead inquiry
   */
  public static async ensureLeadConversationThread(params: {
    leadId: number;
    hostId: number;
    listingId: number;
    guestName?: string;
    initialMessage: string;
    poolOrClient: any;
  }): Promise<{ threadId: number; messageId: number; isExisting: boolean }> {
    const { leadId, hostId, listingId, initialMessage, poolOrClient } = params;

    // Check if guest user exists or use system guest ID
    let guestId: number = hostId;
    try {
      const gRes = await poolOrClient.query(`SELECT id FROM users WHERE role = 'guest' ORDER BY id ASC LIMIT 1`);
      if (gRes.rows.length > 0) {
        guestId = gRes.rows[0].id;
      } else {
        const anyUser = await poolOrClient.query(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
        if (anyUser.rows.length > 0) guestId = anyUser.rows[0].id;
      }
    } catch (e) {}

    // Check for existing thread for this host/listing/guest combination
    const threadCheck = await poolOrClient.query(`
      SELECT id FROM threads
      WHERE host_id = $1 AND listing_id = $2 AND guest_id = $3
      LIMIT 1
    `, [hostId, listingId, guestId]);

    let threadId: number;
    let isExisting = false;

    if (threadCheck.rows.length > 0) {
      threadId = threadCheck.rows[0].id;
      isExisting = true;
      await poolOrClient.query(`
        UPDATE threads 
        SET last_message = $1, lead_intent_score = '🔥 HOT LEAD', updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [initialMessage, threadId]);
    } else {
      const newThreadRes = await poolOrClient.query(`
        INSERT INTO threads (guest_id, host_id, listing_id, last_message, lead_intent_score)
        VALUES ($1, $2, $3, $4, '🔥 HOT LEAD')
        RETURNING id
      `, [guestId, hostId, listingId, initialMessage]);
      threadId = newThreadRes.rows[0].id;
    }

    const msgRes = await poolOrClient.query(`
      INSERT INTO messages (thread_id, sender_id, receiver_id, content, is_sanitized)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id
    `, [threadId, guestId, hostId, initialMessage]);

    return {
      threadId,
      messageId: msgRes.rows[0].id,
      isExisting
    };
  }

  /**
   * Creates PostgreSQL-Backed Notification Intents (Outbox Pattern)
   */
  public static async createNotificationIntents(
    lead: any,
    campaign: any,
    poolOrClient: any
  ): Promise<number[]> {
    const intentIds: number[] = [];
    const hostId = lead.host_id;
    const campaignTitle = campaign?.title || 'Your Listing Ad';
    const isHot = lead.ai_intent_badge === 'HOT_LEAD' || lead.intent_score >= 75;
    const alertPrefix = isHot ? '🔥 Hot Lead Alert' : '⚡ New Lead Received';

    // 1. In-App Notification Intent
    const inAppTitle = `${alertPrefix}: ${campaignTitle}`;
    const inAppBody = `A high-intent guest inquiry arrived for '${campaignTitle}'. Open CRM to reply.`;
    const inAppRes = await poolOrClient.query(`
      INSERT INTO lead_notification_intents (
        lead_id, campaign_id, host_id, channel, recipient, title, body, metadata, status
      ) VALUES (
        $1, $2, $3, 'in_app', $4, $5, $6, $7, 'PENDING'
      ) RETURNING id
    `, [
      lead.id,
      lead.campaign_id,
      hostId,
      `user_${hostId}`,
      inAppTitle,
      inAppBody,
      JSON.stringify({ lead_id: lead.id, thread_id: lead.thread_id, is_hot: isHot })
    ]);
    intentIds.push(inAppRes.rows[0].id);

    // 2. Email Notification Intent
    const emailTitle = `${alertPrefix}: Hot Lead for ${campaignTitle}`;
    const emailBody = `Hello Host,\n\nYou have a new inquiry from a verified advertising lead on Encho.\n\nProperty: ${campaignTitle}\nIntent Level: ${isHot ? 'High Priority' : 'Standard'}\n\nLog in to your Encho Host CRM to reply instantly without leaking contact information.`;
    const emailRes = await poolOrClient.query(`
      INSERT INTO lead_notification_intents (
        lead_id, campaign_id, host_id, channel, recipient, title, body, metadata, status
      ) VALUES (
        $1, $2, $3, 'email', $4, $5, $6, $7, 'PENDING'
      ) RETURNING id
    `, [
      lead.id,
      lead.campaign_id,
      hostId,
      `host_${hostId}@encho.internal`,
      emailTitle,
      emailBody,
      JSON.stringify({ lead_id: lead.id, is_hot: isHot })
    ]);
    intentIds.push(emailRes.rows[0].id);

    // 3. Optional SMS/WhatsApp Notification Intent for Hot Leads
    if (isHot) {
      const smsBody = `[ENCHO] Hot Lead Alert for ${campaignTitle}! Click here to reply in Host CRM: https://encho.com/host/inbox`;
      const smsRes = await poolOrClient.query(`
        INSERT INTO lead_notification_intents (
          lead_id, campaign_id, host_id, channel, recipient, title, body, metadata, status
        ) VALUES (
          $1, $2, $3, 'sms', $4, $5, $6, $7, 'PENDING'
        ) RETURNING id
      `, [
        lead.id,
        lead.campaign_id,
        hostId,
        `+1555000${hostId.toString().padStart(4, '0')}`,
        'Hot Lead SMS Alert',
        smsBody,
        JSON.stringify({ lead_id: lead.id })
      ]);
      intentIds.push(smsRes.rows[0].id);
    }

    return intentIds;
  }

  /**
   * Background Worker for Durable Notification Outbox Queue
   * Delivers intents, manages bounded retries, and routes exhausted attempts to DLQ
   */
  public static async processLeadNotificationQueue(
    poolOrClient: any,
    options?: { maxBatch?: number; mockDispatcher?: (intent: any) => Promise<boolean> }
  ): Promise<{ processed: number; delivered: number; failed: number; dlq: number }> {
    const maxBatch = options?.maxBatch || 50;
    let processed = 0;
    let delivered = 0;
    let failed = 0;
    let dlq = 0;

    // 1. Claim eligible pending notification intents
    const claimRes = await poolOrClient.query(`
      SELECT id, lead_id, campaign_id, host_id, channel, recipient, title, body, metadata, attempt_count, max_attempts
      FROM lead_notification_intents
      WHERE (status = 'PENDING' OR (status = 'PROCESSING' AND lease_expires_at <= CURRENT_TIMESTAMP))
        AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
      ORDER BY id ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `, [maxBatch]);

    if (claimRes.rows.length === 0) {
      return { processed: 0, delivered: 0, failed: 0, dlq: 0 };
    }

    const claimedIds = claimRes.rows.map((r: any) => r.id);
    await poolOrClient.query(`
      UPDATE lead_notification_intents
      SET status = 'PROCESSING',
          lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '1 minute',
          attempt_count = attempt_count + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1::int[])
    `, [claimedIds]);

    for (const intent of claimRes.rows) {
      processed++;
      try {
        let isDelivered = true;
        if (options?.mockDispatcher) {
          isDelivered = await options.mockDispatcher(intent);
        } else {
          // Default delivery dispatcher
          console.log(`[LEAD NOTIFICATION] Dispatched ${intent.channel} to ${intent.recipient}: "${intent.title}"`);
        }

        if (isDelivered) {
          await poolOrClient.query(`
            UPDATE lead_notification_intents
            SET status = 'DELIVERED',
                delivered_at = CURRENT_TIMESTAMP,
                lease_expires_at = NULL,
                error_message = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [intent.id]);
          delivered++;
        } else {
          throw new Error(`Channel adapter for ${intent.channel} returned delivery failure.`);
        }
      } catch (dispErr: any) {
        failed++;
        const currentAttempt = (intent.attempt_count || 0) + 1;
        const maxAttempts = intent.max_attempts || 3;

        if (currentAttempt >= maxAttempts) {
          dlq++;
          await poolOrClient.query(`
            UPDATE lead_notification_intents
            SET status = 'DLQ',
                lease_expires_at = NULL,
                error_message = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [dispErr.message || 'Exceeded max retry attempts', intent.id]);
        } else {
          const backoffSec = Math.pow(2, currentAttempt) * 15; // 30s, 60s
          await poolOrClient.query(`
            UPDATE lead_notification_intents
            SET status = 'PENDING',
                lease_expires_at = NULL,
                next_retry_at = CURRENT_TIMESTAMP + ($1 || ' seconds')::interval,
                error_message = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `, [backoffSec.toString(), dispErr.message || 'Transient failure', intent.id]);
        }
      }
    }

    return { processed, delivered, failed, dlq };
  }

  /**
   * Lead FSM State Transition Engine with Deterministic Row Locking & Auditing
   */
  public static async transitionLeadState(params: {
    leadId: number;
    toState: LeadState;
    actorType: 'host' | 'admin' | 'system';
    actorId?: string | number;
    reason?: string;
    hostId?: number;
    poolOrClient: any;
  }): Promise<LeadRecord> {
    const { leadId, toState, actorType, actorId, reason, hostId, poolOrClient } = params;

    // Row Lock on Lead
    const lockRes = await poolOrClient.query(`
      SELECT * FROM host_outreach_leads
      WHERE id = $1
      FOR UPDATE
    `, [leadId]);

    if (lockRes.rows.length === 0) {
      throw new Error(`Lead #${leadId} does not exist.`);
    }

    const currentLead = lockRes.rows[0];

    // Host Tenant Isolation Check
    if (actorType === 'host' && hostId && Number(currentLead.host_id) !== Number(hostId)) {
      await this.recordSecurityEvent({
        leadId,
        campaignId: currentLead.campaign_id,
        attemptedHostId: Number(hostId),
        actualHostId: currentLead.host_id,
        action: 'CROSS_TENANT_STATE_MUTATION_BLOCKED',
        severity: 'CRITICAL',
        reason: `Host #${hostId} attempted to mutate state of lead #${leadId} belonging to host #${currentLead.host_id}`,
        poolOrClient
      });
      throw new Error(`Forbidden: You do not own lead #${leadId}.`);
    }

    const currentState = (currentLead.status || 'NEW') as LeadState;
    if (currentState === toState) {
      return currentLead; // No-op idempotent transition
    }

    const allowed = this.ALLOWED_TRANSITIONS[currentState] || [];
    if (!allowed.includes(toState)) {
      throw new Error(`Invalid lead state transition from '${currentState}' to '${toState}'. Allowed: [${allowed.join(', ')}]`);
    }

    // Update timestamps according to target state
    const timestampUpdates: string[] = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const queryParams: any[] = [toState, leadId];

    if (toState === 'VIEWED' && !currentLead.first_viewed_at) {
      timestampUpdates.push('first_viewed_at = CURRENT_TIMESTAMP');
    } else if (toState === 'CONTACTED' && !currentLead.first_contacted_at) {
      timestampUpdates.push('first_contacted_at = CURRENT_TIMESTAMP');
    } else if (toState === 'QUALIFIED' && !currentLead.qualified_at) {
      timestampUpdates.push('qualified_at = CURRENT_TIMESTAMP');
    } else if (toState === 'CONVERTED' && !currentLead.converted_at) {
      timestampUpdates.push('converted_at = CURRENT_TIMESTAMP');
    } else if (toState === 'LOST' && !currentLead.lost_at) {
      timestampUpdates.push('lost_at = CURRENT_TIMESTAMP');
    }

    const updateRes = await poolOrClient.query(`
      UPDATE host_outreach_leads
      SET ${timestampUpdates.join(', ')}
      WHERE id = $2
      RETURNING *
    `, queryParams);

    const updatedLead = updateRes.rows[0];

    // Audit State Transition Event
    await poolOrClient.query(`
      INSERT INTO lead_lifecycle_events (
        lead_id, campaign_id, host_id, event_type, from_state, to_state,
        actor_type, actor_id, details, created_at
      ) VALUES (
        $1, $2, $3, 'STATE_TRANSITION', $4, $5,
        $6, $7, $8, CURRENT_TIMESTAMP
      )
    `, [
      leadId,
      updatedLead.campaign_id,
      updatedLead.host_id,
      currentState,
      toState,
      actorType.toUpperCase(),
      actorId ? String(actorId) : 'SYSTEM',
      JSON.stringify({ reason: reason || null, timestamp: new Date().toISOString() })
    ]);

    return updatedLead;
  }

  /**
   * Fetches Host Leads with Strict Tenant Authorization & Masked Projections
   */
  public static async getHostLeads(
    hostId: number,
    options: { campaignId?: number; status?: string; limit?: number; offset?: number },
    poolOrClient: any
  ): Promise<{ leads: any[]; total: number }> {
    const { campaignId, status, limit = 50, offset = 0 } = options;
    const filterClauses = ['host_id = $1'];
    const queryParams: any[] = [hostId];

    if (campaignId) {
      queryParams.push(campaignId);
      filterClauses.push(`campaign_id = $${queryParams.length}`);
    }

    if (status) {
      queryParams.push(status);
      filterClauses.push(`status = $${queryParams.length}`);
    }

    const whereClause = filterClauses.join(' AND ');

    const countRes = await poolOrClient.query(
      `SELECT COUNT(*) FROM host_outreach_leads WHERE ${whereClause}`,
      queryParams
    );
    const total = parseInt(countRes.rows[0]?.count || '0');

    queryParams.push(limit);
    queryParams.push(offset);
    const leadsRes = await poolOrClient.query(`
      SELECT l.*, c.title as campaign_title, lst.title as listing_title
      FROM host_outreach_leads l
      LEFT JOIN host_marketing_campaigns c ON l.campaign_id = c.id
      LEFT JOIN listings lst ON l.listing_id = lst.id
      WHERE ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
    `, queryParams);

    const projectedLeads = leadsRes.rows.map((row: any) => {
      let msgHist: any[] = [];
      try {
        msgHist = typeof row.message_history === 'string' ? JSON.parse(row.message_history) : (row.message_history || []);
      } catch (e) { msgHist = []; }

      return {
        id: row.id,
        campaign_id: row.campaign_id,
        campaign_title: row.campaign_title || 'Encho Marketing Campaign',
        listing_title: row.listing_title || 'Encho Property',
        guest_name: row.guest_name || 'Guest Lead',
        guest_email: '[EMAIL REDACTED]', // Masked for Host CRM Walled Garden
        guest_phone: '[PHONE REDACTED]', // Masked for Host CRM Walled Garden
        intent_score: row.intent_score || 50,
        ai_intent_badge: row.ai_intent_badge || 'WARM_INQUIRY',
        status: row.status || 'NEW',
        message_history: msgHist,
        thread_id: row.thread_id,
        first_viewed_at: row.first_viewed_at,
        first_contacted_at: row.first_contacted_at,
        qualified_at: row.qualified_at,
        converted_at: row.converted_at,
        created_at: row.created_at,
        next_recommended_action: row.status === 'NEW' || row.status === 'DELIVERED'
          ? 'Reply within 15 minutes to maximize booking probability.'
          : (row.status === 'CONTACTED' ? 'Send direct booking invitation.' : 'Manage lead in CRM.')
      };
    });

    return { leads: projectedLeads, total };
  }

  /**
   * Fetches Single Lead Details with Role-Based Redaction and Access Audit
   */
  public static async getLeadDetails(
    leadId: number,
    viewerContext: { userId?: number; role?: string; isAdmin?: boolean },
    poolOrClient: any
  ): Promise<any> {
    const leadRes = await poolOrClient.query(`
      SELECT l.*, c.title as campaign_title, lst.title as listing_title
      FROM host_outreach_leads l
      LEFT JOIN host_marketing_campaigns c ON l.campaign_id = c.id
      LEFT JOIN listings lst ON l.listing_id = lst.id
      WHERE l.id = $1
    `, [leadId]);

    if (leadRes.rows.length === 0) {
      throw new Error(`Lead #${leadId} not found.`);
    }

    const lead = leadRes.rows[0];
    const isAdmin = Boolean(viewerContext.isAdmin || viewerContext.role === 'admin');
    const isHostOwner = Boolean(viewerContext.userId && Number(viewerContext.userId) === Number(lead.host_id));

    if (!isAdmin && !isHostOwner) {
      await this.recordSecurityEvent({
        leadId,
        campaignId: lead.campaign_id,
        attemptedHostId: viewerContext.userId,
        actualHostId: lead.host_id,
        action: 'UNAUTHORIZED_LEAD_ACCESS_BLOCKED',
        severity: 'CRITICAL',
        reason: `User #${viewerContext.userId} attempted to access lead #${leadId} without authorization`,
        poolOrClient
      });
      throw new Error(`Forbidden: Access denied to lead #${leadId}.`);
    }

    // Auto-transition to VIEWED if currently DELIVERED
    if (isHostOwner && (lead.status === 'DELIVERED' || lead.status === 'NEW')) {
      try {
        await this.transitionLeadState({
          leadId,
          toState: 'VIEWED',
          actorType: 'host',
          actorId: viewerContext.userId,
          reason: 'Host opened lead details view in CRM',
          hostId: viewerContext.userId,
          poolOrClient
        });
        lead.status = 'VIEWED';
      } catch (e) {}
    }

    // Fetch Lifecycle Timeline
    const timelineRes = await poolOrClient.query(`
      SELECT * FROM lead_lifecycle_events
      WHERE lead_id = $1
      ORDER BY created_at ASC
    `, [leadId]);

    let msgHist: any[] = [];
    try {
      msgHist = typeof lead.message_history === 'string' ? JSON.parse(lead.message_history) : (lead.message_history || []);
    } catch (e) { msgHist = []; }

    return {
      id: lead.id,
      campaign_id: lead.campaign_id,
      campaign_title: lead.campaign_title,
      listing_id: lead.listing_id,
      listing_title: lead.listing_title,
      host_id: lead.host_id,
      guest_name: lead.guest_name,
      guest_email: isAdmin ? (decryptPII(lead.guest_email) || lead.guest_email) : '[EMAIL REDACTED]',
      guest_phone: isAdmin ? (decryptPII(lead.guest_phone) || lead.guest_phone) : '[PHONE REDACTED]',
      intent_score: lead.intent_score,
      ai_intent_badge: lead.ai_intent_badge,
      status: lead.status,
      source: lead.source,
      thread_id: lead.thread_id,
      message_history: msgHist,
      timeline: timelineRes.rows,
      created_at: lead.created_at,
      updated_at: lead.updated_at
    };
  }

  /**
   * Admin Monitoring & System Health Metrics
   */
  public static async getLeadSystemHealth(poolOrClient: any): Promise<any> {
    const queueDepthRes = await poolOrClient.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending_notifs,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing_notifs,
        COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered_notifs,
        COUNT(*) FILTER (WHERE status = 'DLQ') as dlq_notifs
      FROM lead_notification_intents
    `);

    const leadCountsRes = await poolOrClient.query(`
      SELECT 
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE ai_intent_badge = 'HOT_LEAD' OR intent_score >= 75) as hot_leads,
        COUNT(*) FILTER (WHERE status = 'QUALIFIED') as qualified_leads,
        COUNT(*) FILTER (WHERE status = 'CONVERTED') as converted_leads,
        COUNT(*) FILTER (WHERE status = 'LOST') as lost_leads,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') as leads_24h
      FROM host_outreach_leads
    `);

    const secAuditRes = await poolOrClient.query(`
      SELECT COUNT(*) as security_violations
      FROM lead_security_audit_logs
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `);

    const notifStats = queueDepthRes.rows[0];
    const leadStats = leadCountsRes.rows[0];
    const totalNotifs = parseInt(notifStats.delivered_notifs || '0') + parseInt(notifStats.dlq_notifs || '0');
    const deliverySuccessRate = totalNotifs > 0 
      ? Number(((parseInt(notifStats.delivered_notifs || '0') / totalNotifs) * 100).toFixed(2)) 
      : 100.0;

    return {
      status: parseInt(notifStats.dlq_notifs || '0') > 0 ? 'DEGRADED' : 'HEALTHY',
      queue_depths: {
        pending_notifications: parseInt(notifStats.pending_notifs || '0'),
        processing_notifications: parseInt(notifStats.processing_notifs || '0'),
        dlq_notifications: parseInt(notifStats.dlq_notifs || '0')
      },
      lead_metrics: {
        total_leads: parseInt(leadStats.total_leads || '0'),
        leads_last_24h: parseInt(leadStats.leads_24h || '0'),
        hot_leads_count: parseInt(leadStats.hot_leads || '0'),
        qualified_leads_count: parseInt(leadStats.qualified_leads || '0'),
        converted_leads_count: parseInt(leadStats.converted_leads || '0'),
        lost_leads_count: parseInt(leadStats.lost_leads || '0')
      },
      notification_engine: {
        delivery_success_rate_percent: deliverySuccessRate,
        total_delivered: parseInt(notifStats.delivered_notifs || '0'),
        total_in_dlq: parseInt(notifStats.dlq_notifs || '0')
      },
      security: {
        violations_last_24h: parseInt(secAuditRes.rows[0]?.security_violations || '0')
      },
      checked_at: new Date().toISOString()
    };
  }

  /**
   * Records Security Violation / Cross-Tenant Audit Log
   */
  public static async recordSecurityEvent(params: {
    leadId?: number;
    campaignId?: number;
    attemptedHostId?: number;
    actualHostId?: number;
    action: string;
    severity?: string;
    reason: string;
    clientIp?: string;
    userAgent?: string;
    poolOrClient: any;
  }): Promise<void> {
    const {
      leadId,
      campaignId,
      attemptedHostId,
      actualHostId,
      action,
      severity = 'WARNING',
      reason,
      clientIp,
      userAgent,
      poolOrClient
    } = params;

    try {
      await poolOrClient.query(`
        INSERT INTO lead_security_audit_logs (
          lead_id, campaign_id, attempted_host_id, actual_host_id, action,
          severity, reason, client_ip, user_agent, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, CURRENT_TIMESTAMP
        )
      `, [
        leadId || null,
        campaignId || null,
        attemptedHostId || null,
        actualHostId || null,
        action,
        severity,
        reason,
        clientIp || null,
        userAgent || null
      ]);
    } catch (e) {
      console.error('[LEAD SECURITY AUDIT ERROR] Failed to record security event:', e);
    }
  }
}
