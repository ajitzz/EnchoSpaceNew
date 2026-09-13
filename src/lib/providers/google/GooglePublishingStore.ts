import type { ProviderEntity, ProviderPublishRequest, ProviderPublishResult } from '../types.js';
import { GoogleAdsError } from './googleErrors.js';
import { generateListingSlug } from '../../stayProjection.js';
import type { ProviderAuthorizationGuard } from '../ProviderOperationStore.js';

export const GOOGLE_PAUSED_PUBLISH_PROTOCOL = 'HARVO_GOOGLE_V25_PAUSED_V1';

type Claim = { kind: 'CLAIMED'; transactionId: number } | { kind: 'DUPLICATE'; result: ProviderPublishResult };

function invalid(message: string): GoogleAdsError {
  return new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', message, { statusCode: 400, errorClass: 'VALIDATION' });
}

function unresolved(message: string): GoogleAdsError {
  return new GoogleAdsError('GOOGLE_UNKNOWN_OUTCOME', message, { statusCode: 409, errorClass: 'UNKNOWN' });
}

function parseJson(value: any): any {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { throw unresolved('Publishing evidence is malformed; reconciliation is required.'); }
}

// Persist provider evidence, never credentials or authorization headers.
function evidence(value: any): any {
  if (Array.isArray(value)) return value.map(evidence);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/token|secret|password|authorization|api.?key/i.test(key))
      .map(([key, item]) => [key, evidence(item)]));
  }
  return value;
}

function validateResult(result: ProviderPublishResult, campaignId: number, customerId: string): void {
  const hierarchy = result?.hierarchy;
  if (!/^\d{10}$/.test(customerId) || result?.success !== true || result.provider !== 'GOOGLE' || hierarchy?.provider !== 'GOOGLE'
    || hierarchy.campaignId !== campaignId || !Array.isArray(hierarchy.entities)) {
    throw unresolved('A confirmed paused Google hierarchy is required before committing.');
  }
  const patterns: Partial<Record<ProviderEntity['entity_type'], RegExp>> = {
    CAMPAIGN: new RegExp(`^customers/${customerId}/campaigns/[1-9]\\d*$`),
    AD_GROUP: new RegExp(`^customers/${customerId}/adGroups/[1-9]\\d*$`),
    AD: new RegExp(`^customers/${customerId}/adGroupAds/[1-9]\\d*~[1-9]\\d*$`),
    ASSET: new RegExp(`^customers/${customerId}/assets/[1-9]\\d*$`),
    ASSET_SET: new RegExp(`^customers/${customerId}/assetSets/[1-9]\\d*$`),
  };
  const ids = new Set<string>();
  for (const entity of hierarchy.entities) {
    if (entity.provider !== 'GOOGLE' || entity.campaign_id !== campaignId || entity.account_id !== customerId
      || !patterns[entity.entity_type]?.test(entity.external_id) || ids.has(entity.external_id)
      || entity.configured_status !== 'PAUSED' || !['PAUSED', 'UNKNOWN'].includes(entity.effective_status)) {
      throw unresolved('Google hierarchy evidence has an invalid identity or unsafe status.');
    }
    ids.add(entity.external_id);
  }
  const campaign = hierarchy.entities.filter(e => e.entity_type === 'CAMPAIGN');
  const group = hierarchy.entities.filter(e => e.entity_type === 'AD_GROUP');
  const ad = hierarchy.entities.filter(e => e.entity_type === 'AD');
  if (campaign.length !== 1 || group.length !== 1 || ad.length !== 1
    || campaign[0].external_id !== result.externalCampaignId
    || group[0].external_id !== result.externalContainerId || ad[0].external_id !== result.externalAdId
    || hierarchy.externalCampaignId !== result.externalCampaignId
    || hierarchy.externalContainerId !== result.externalContainerId || hierarchy.externalAdId !== result.externalAdId
    || group[0].parent_entity_id !== campaign[0].external_id || ad[0].parent_entity_id !== group[0].external_id
    || campaign[0].parent_entity_id) {
    throw unresolved('Google hierarchy evidence is incomplete or has inconsistent parentage.');
  }
}

/**
 * Durable paused-creation claims. This store verifies ownership and a financial
 * ceiling, not captured funding or permission to activate. No network operation
 * runs inside these short PostgreSQL transactions. Ambiguous claims never expire
 * into an automatic re-create; explicit reconciliation is a later milestone.
 */
export class GooglePublishingStore {
  constructor(private readonly pool: any, private readonly authorize?: ProviderAuthorizationGuard) {
    if (!pool || typeof pool.connect !== 'function') throw invalid('Publishing requires a PostgreSQL connection pool.');
  }

  private async transaction<T>(operation: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) { throw new AggregateError([error, rollbackError], 'Publishing transaction and rollback failed.'); }
      throw error;
    } finally {
      client.release();
    }
  }

  async claim(request: ProviderPublishRequest, customerId: string, fingerprint: string, operationPayload: any): Promise<Claim> {
    if (![request.campaignId, request.hostId, request.listingId].every(n => Number.isSafeInteger(n) && n > 0)
      || !/^\d{10}$/.test(customerId) || !/^[a-f0-9]{64}$/.test(fingerprint)
      || typeof request.idempotencyKey !== 'string' || !request.idempotencyKey.trim() || request.idempotencyKey.length > 255
      || typeof request.correlationId !== 'string' || !request.correlationId.trim() || request.correlationId.length > 255
      || !Number.isSafeInteger(request.budget?.minor_units) || request.budget.minor_units <= 0
      || !/^[A-Z]{3}$/.test(request.budget?.currency || '')) {
      throw invalid('Publishing identity, fingerprint, currency and positive integer budget are required.');
    }
    try {
      return await this.transaction(async client => {
        const campaign = (await client.query(
          'SELECT id, host_id, listing_id FROM host_marketing_campaigns WHERE id = $1 FOR UPDATE', [request.campaignId]
        )).rows[0];
        if (!campaign || Number(campaign.host_id) !== request.hostId || Number(campaign.listing_id) !== request.listingId) {
          throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH', 'Campaign ownership or listing does not match.', { statusCode: 403, errorClass: 'VALIDATION' });
        }
        let authorizationId:string|undefined;
        if (this.authorize) {
          const authorization = await this.authorize({ provider:'GOOGLE', campaignId:request.campaignId, operation:'CREATE_HIERARCHY', fingerprint, idempotencyKey:request.idempotencyKey, correlationId:request.correlationId, budgetMinor:request.budget.minor_units, budgetKind:'LIFETIME', currency:request.budget.currency }, client);
          if (typeof authorization?.authorizationId!=='string'||!authorization.authorizationId.trim()||authorization.authorizationId.length>255) throw new GoogleAdsError('GOOGLE_MUTATION_FAILED', 'Google publishing authorization was not established.', { errorClass:'POLICY' });
          authorizationId=authorization.authorizationId;
        }
        const listing = (await client.query(
          'SELECT id, user_id, title, slug, publication_status FROM listings WHERE id = $1 FOR SHARE', [request.listingId]
        )).rows[0];
        let landing: URL;
        try { landing = new URL(request.creativeAssets?.landingPageUrl); }
        catch { throw invalid('An absolute HTTPS property destination is required.'); }
        if (landing.protocol !== 'https:' || landing.username || landing.password || landing.search || landing.hash) {
          throw invalid('Property destination must use HTTPS without credentials, query parameters or fragments.');
        }
        if (!listing || Number(listing.user_id) !== request.hostId || listing.publication_status !== 'published'
          || landing.pathname !== `/stay/${encodeURIComponent(listing.slug || generateListingSlug(listing.title, listing.id))}`) {
          throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH', 'Campaign destination must match the host’s published canonical property.', { statusCode: 403, errorClass: 'VALIDATION' });
        }
        const existing = (await client.query(
          `SELECT * FROM provider_publishing_transactions
           WHERE (campaign_id = $1 AND provider = 'GOOGLE' AND operation_type = 'CREATE_HIERARCHY')
              OR idempotency_key = $2 ORDER BY id`, [request.campaignId, request.idempotencyKey]
        )).rows;
        if (existing.length) {
          if (existing.length !== 1) throw unresolved('Multiple publishing records require reconciliation before publishing.');
          const prior = existing[0];
          const payload = parseJson(prior.payload);
          if (Number(prior.campaign_id) !== request.campaignId || prior.provider !== 'GOOGLE'
            || prior.operation_type !== 'CREATE_HIERARCHY' || prior.idempotency_key !== request.idempotencyKey
            || payload?.protocol !== GOOGLE_PAUSED_PUBLISH_PROTOCOL || payload.customerId !== customerId
            || payload.fingerprint !== fingerprint) {
            throw unresolved('Publishing identity or request differs from existing evidence; do not create another campaign.');
          }
          if (prior.publish_status !== 'COMMITTED' || prior.is_unknown_outcome !== false) {
            throw unresolved('Previous publishing attempt requires reconciliation; automatic re-creation is blocked.');
          }
          const result = parseJson(prior.response) as ProviderPublishResult;
          validateResult(result, request.campaignId, customerId);
          return { kind: 'DUPLICATE', result: { ...result, isDuplicate: true } };
        }
        const existingEntities = await client.query(
          "SELECT id FROM provider_entities WHERE campaign_id = $1 AND provider = 'GOOGLE' LIMIT 1", [request.campaignId]
        );
        if (existingEntities.rows.length) {
          throw unresolved('Existing Google entity evidence requires reconciliation before another publishing attempt.');
        }
        const contract = (await client.query(
          `SELECT meta_authorized_spend, meta_remaining_authorization, currency
           FROM campaign_financial_contracts WHERE campaign_id = $1 FOR SHARE`, [request.campaignId]
        )).rows[0];
        const integer = (value: any) => /^(0|[1-9]\d*)$/.test(String(value));
        if (!contract || contract.currency !== request.budget.currency
          || !integer(contract.meta_authorized_spend) || !integer(contract.meta_remaining_authorization)
          || BigInt(contract.meta_authorized_spend) < BigInt(request.budget.minor_units)
          || BigInt(contract.meta_remaining_authorization) < BigInt(request.budget.minor_units)) {
          throw new GoogleAdsError('FINANCIAL_BUDGET_EXCEEDS_AUTHORIZATION', 'A matching financial contract with sufficient remaining authorization is required.', { statusCode: 403, errorClass: 'POLICY' });
        }
        const inserted = await client.query(
          `INSERT INTO provider_publishing_transactions
             (campaign_id, provider, operation_type, idempotency_key, correlation_id, publish_status, payload, is_unknown_outcome)
           VALUES ($1, 'GOOGLE', 'CREATE_HIERARCHY', $2, $3, 'REQUESTED', $4, TRUE) RETURNING id`,
          [request.campaignId, request.idempotencyKey, request.correlationId,
            JSON.stringify({ protocol: GOOGLE_PAUSED_PUBLISH_PROTOCOL, customerId, fingerprint, authorizationId, request: evidence(operationPayload) })]
        );
        return { kind: 'CLAIMED', transactionId: Number(inserted.rows[0].id) };
      });
    } catch (error: any) {
      if (error?.code === '23505') throw unresolved('Idempotency key already belongs to another publishing attempt.');
      throw error;
    }
  }

  async complete(transactionId: number, result: ProviderPublishResult): Promise<void> {
    await this.transaction(async client => {
      const tx = (await client.query('SELECT * FROM provider_publishing_transactions WHERE id = $1 FOR UPDATE', [transactionId])).rows[0];
      const payload = parseJson(tx?.payload);
      if (!tx || tx.provider !== 'GOOGLE' || tx.operation_type !== 'CREATE_HIERARCHY'
        || tx.publish_status !== 'REQUESTED' || payload?.protocol !== GOOGLE_PAUSED_PUBLISH_PROTOCOL) {
        throw unresolved('Only the original pending Google request can be committed.');
      }
      validateResult(result, Number(tx.campaign_id), payload.customerId);
      for (const entity of result.hierarchy.entities) {
        await client.query(
          `INSERT INTO provider_entities
             (campaign_id, provider, entity_type, external_id, parent_entity_id, account_id, configured_status, effective_status, metadata)
           VALUES ($1, 'GOOGLE', $2, $3, $4, $5, 'PAUSED', $6, $7)`,
          [entity.campaign_id, entity.entity_type, entity.external_id, entity.parent_entity_id || null,
            entity.account_id, entity.effective_status, JSON.stringify(evidence(entity.metadata || {}))]
        );
      }
      await client.query(
        `UPDATE provider_publishing_transactions SET publish_status = 'COMMITTED', response = $2,
           external_campaign_id = $3, external_container_id = $4, external_ad_id = $5, external_creative_id = $6,
           is_unknown_outcome = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [transactionId, JSON.stringify(evidence(result)), result.externalCampaignId, result.externalContainerId,
          result.externalAdId, result.externalCreativeId || null]
      );
    });
  }

  async quarantine(transactionId: number, error: { code: string; message: string }, response?: any): Promise<void> {
    await this.finishFailure(transactionId, 'RECONCILIATION_REQUIRED', true, error, response);
  }

  async reject(transactionId: number, error: { code: string; message: string }): Promise<void> {
    await this.finishFailure(transactionId, 'FAILED', false, error);
  }

  private async finishFailure(transactionId: number, status: string, unknown: boolean,
    error: { code: string; message: string }, response?: any): Promise<void> {
    await this.transaction(async client => {
      const updated = await client.query(
        `UPDATE provider_publishing_transactions SET publish_status = $2, is_unknown_outcome = $3,
           error_details = $4, response = COALESCE($5::jsonb, response), updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND provider = 'GOOGLE' AND operation_type = 'CREATE_HIERARCHY'
           AND (publish_status = 'REQUESTED' OR ($3 = TRUE AND publish_status = 'RECONCILIATION_REQUIRED'))
           AND payload->>'protocol' = $6 RETURNING id`,
        [transactionId, status, unknown, JSON.stringify({ code: error.code, message: error.message }),
          response === undefined ? null : JSON.stringify(evidence(response)), GOOGLE_PAUSED_PUBLISH_PROTOCOL]
      );
      if (updated.rowCount !== 1) throw unresolved('Publishing evidence changed; failure must be reconciled without overwriting it.');
    });
  }
}
