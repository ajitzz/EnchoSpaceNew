import { createHash } from 'node:crypto';
import type { ProviderEntity } from './types.js';
import { generateListingSlug } from '../stayProjection.js';
export interface ProviderAuthorizationContext {
    provider: 'META' | 'GOOGLE';
    campaignId: number;
    operation: 'CREATE_HIERARCHY' | 'PAUSE' | 'RESUME' | 'UPDATE_BUDGET';
    fingerprint: string;
    idempotencyKey: string;
    correlationId: string;
    externalCampaignId?: string;
    budgetMinor?: number;
    budgetKind?: 'DAILY' | 'LIFETIME';
    currency?: string;
}
/** Supplied only by trusted server composition. A request-body boolean is never authorization. */
export type ProviderAuthorizationGuard = (context: ProviderAuthorizationContext, transactionClient: any) => Promise<{
    authorizationId: string;
}>;
export class ProviderOperationError extends Error {
    constructor(public readonly code: string, message: string, public readonly unknownOutcome = false) { super(message); this.name = 'ProviderOperationError'; }
}
export function semanticFingerprint(value: unknown): string {
    const seen = new Set<object>();
    const encode = (v: any, depth = 0): string => {
        if (depth > 32)
            throw new ProviderOperationError('INVALID_ARGUMENT', 'Provider input nesting is too deep.');
        if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)))
            return JSON.stringify(v);
        if (!v || typeof v !== 'object' || seen.has(v))
            throw new ProviderOperationError('INVALID_ARGUMENT', 'Provider input must be finite acyclic JSON.');
        seen.add(v);
        const result = Array.isArray(v) ? `[${v.map(x => encode(x, depth + 1)).join(',')}]` : `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${encode(v[k], depth + 1)}`).join(',')}}`;
        seen.delete(v);
        return result;
    };
    const encoded = encode(value);
    if (Buffer.byteLength(encoded) > 1000000)
        throw new ProviderOperationError('INVALID_ARGUMENT', 'Provider input is too large.');
    return createHash('sha256').update(encoded).digest('hex');
}
const protocol = 'HARVO_PROVIDER_OPERATION_V2';
type Identity = {
    hostId: number;
    listingId: number;
    landingUrl: string;
    mediaUrl?: string;
};
/** Trusted server composition only; no request-body media approval flag is accepted. */
export type ProviderMediaVerifier = (context:ProviderAuthorizationContext,identity:Identity,transactionClient:any)=>Promise<{mediaUrl:string}>;
/** Row-locked durable operation claims; no expiry or automatic replay of uncertain external writes. */
export class ProviderOperationStore {
    constructor(private readonly pool: any) {
        if (!pool || typeof pool.connect !== 'function')
            throw new ProviderOperationError('DATABASE_REQUIRED', 'A PostgreSQL pool is required.');
    }
    private async transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            try {
                await client.query('ROLLBACK');
            }
            catch {
                throw new ProviderOperationError('UNKNOWN_OUTCOME', 'Provider operation transaction requires reconciliation.', true);
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async claim(context: ProviderAuthorizationContext, payload: unknown, authorize?: ProviderAuthorizationGuard, identity?: Identity,verifyMedia?:ProviderMediaVerifier): Promise<{
        id: number;
        result?: any;
        resumeEvidence?: any;
    }> {
        if (!authorize)
            throw new ProviderOperationError('AUTHORIZATION_REQUIRED', 'Trusted provider operation authorization is required.');
        if (!Number.isSafeInteger(context.campaignId) || context.campaignId <= 0 || !/^[a-f0-9]{64}$/.test(context.fingerprint) ||
            !context.idempotencyKey || context.idempotencyKey.length > 255 || !context.correlationId || context.correlationId.length > 255) {
            throw new ProviderOperationError('INVALID_ARGUMENT', 'Valid campaign identity, fingerprint and request identifiers are required.');
        }
        return this.transaction(async (client) => {
            const campaign = (await client.query('SELECT id,host_id,listing_id FROM host_marketing_campaigns WHERE id=$1 FOR UPDATE', [context.campaignId])).rows[0];
            if (!campaign)
                throw new ProviderOperationError('OWNERSHIP_MISMATCH', 'Campaign does not exist.');
            if (identity) {
                const listing = (await client.query('SELECT id,user_id,title,slug,publication_status FROM listings WHERE id=$1 FOR SHARE', [identity.listingId])).rows[0];
                const landing = new URL(identity.landingUrl);
                if (Number(campaign.host_id) !== identity.hostId || Number(campaign.listing_id) !== identity.listingId ||
                    Number(listing?.user_id) !== identity.hostId || listing?.publication_status !== 'published' ||
                    landing.pathname !== `/stay/${encodeURIComponent(listing.slug || generateListingSlug(listing.title, listing.id))}`) {
                    throw new ProviderOperationError('OWNERSHIP_MISMATCH', 'Campaign must advertise its host’s published property.');
                }
                if (identity.mediaUrl) {
                    const media = await client.query("SELECT id FROM media_assets WHERE entity_type='listing' AND entity_id=$1 AND url=$2 AND moderation_status='approved' FOR SHARE", [identity.listingId, identity.mediaUrl]);
                    if (!media.rows.length) {
                        const verified=verifyMedia?await verifyMedia(context,identity,client):undefined;
                        if(!verified||verified.mediaUrl!==identity.mediaUrl)throw new ProviderOperationError('MEDIA_NOT_APPROVED', 'Campaign media must be an approved asset or an exactly verified campaign derivative of this property.');
                    }
                }
            }
            const authorization = await authorize(context, client);
            if (!authorization || typeof authorization.authorizationId !== 'string' || !authorization.authorizationId.trim() || authorization.authorizationId.length > 255) {
                throw new ProviderOperationError('AUTHORIZATION_REQUIRED', 'Provider operation authorization was not established.');
            }
            const rows = (await client.query(`SELECT * FROM provider_publishing_transactions WHERE idempotency_key=$1 OR
        (campaign_id=$2 AND provider=$3 AND (publish_status IN ('REQUESTED','RECONCILIATION_REQUIRED') OR (operation_type='CREATE_HIERARCHY' AND $4='CREATE_HIERARCHY'))) ORDER BY id`, [context.idempotencyKey, context.campaignId, context.provider, context.operation])).rows;
            if (rows.length) {
                const prior = rows.length === 1 ? rows[0] : null;
                // A confirmed video upload that is still processing is a known pending
                // state. Reclaim only this exact request; never resume an unknown write.
                if (prior && context.provider === 'META' && context.operation === 'CREATE_HIERARCHY' &&
                    prior.idempotency_key === context.idempotencyKey && Number(prior.campaign_id) === context.campaignId &&
                    prior.provider === 'META' && prior.operation_type === 'CREATE_HIERARCHY' && prior.payload?.protocol === protocol &&
                    prior.payload?.fingerprint === context.fingerprint && prior.publish_status === 'ASSET_PREPARING' &&
                    prior.is_unknown_outcome === false && /^[1-9]\d{0,29}$/.test(prior.response?.ids?.video ?? '') &&
                    !prior.response?.ids?.campaign && prior.response?.pendingStep === null) {
                    await client.query("UPDATE provider_publishing_transactions SET publish_status='REQUESTED',is_unknown_outcome=TRUE,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [prior.id]);
                    return { id: Number(prior.id), resumeEvidence: prior.response };
                }
                if (!prior || prior.idempotency_key !== context.idempotencyKey || Number(prior.campaign_id) !== context.campaignId || prior.provider !== context.provider ||
                    prior.operation_type !== context.operation || prior.payload?.protocol !== protocol || prior.payload?.fingerprint !== context.fingerprint ||
                    prior.publish_status !== 'COMMITTED' || prior.is_unknown_outcome !== false || prior.response?.success !== true ||
                    prior.response.provider !== context.provider || !prior.external_campaign_id || prior.response.externalCampaignId !== prior.external_campaign_id ||
                    (context.externalCampaignId !== undefined && prior.external_campaign_id !== context.externalCampaignId)) {
                    throw new ProviderOperationError('UNKNOWN_OUTCOME', 'Existing provider evidence requires reconciliation; automatic re-creation is blocked.', true);
                }
                return { id: Number(prior.id), result: prior.response };
            }
            if (context.operation === 'CREATE_HIERARCHY') {
                if ((await client.query('SELECT id FROM provider_entities WHERE campaign_id=$1 AND provider=$2 LIMIT 1', [context.campaignId, context.provider])).rows.length) {
                    throw new ProviderOperationError('UNKNOWN_OUTCOME', 'Existing provider resources require reconciliation before creation.', true);
                }
            }
            const inserted = await client.query(`INSERT INTO provider_publishing_transactions
        (campaign_id,provider,operation_type,idempotency_key,correlation_id,publish_status,is_unknown_outcome,payload)
        VALUES ($1,$2,$3,$4,$5,'REQUESTED',TRUE,$6) RETURNING id`, [context.campaignId, context.provider, context.operation, context.idempotencyKey, context.correlationId,
                JSON.stringify({ protocol, fingerprint: context.fingerprint, authorizationId: authorization.authorizationId, request: payload })]);
            return { id: Number(inserted.rows[0].id) };
        });
    }
    async step(id: number, evidence: unknown): Promise<void> {
        const result = await this.pool.query("UPDATE provider_publishing_transactions SET response=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND publish_status='REQUESTED' AND payload->>'protocol'=$3 RETURNING id", [id, JSON.stringify(evidence), protocol]);
        if (result.rowCount !== 1)
            throw new ProviderOperationError('UNKNOWN_OUTCOME', 'Provider operation claim changed; reconcile its outcome.', true);
    }
    async complete(id: number, result: any, entities: ProviderEntity[] = [], configuredStatus?: string, updateEvidence?: (client: any, transaction: any) => Promise<void>): Promise<void> {
        await this.transaction(async (client) => {
            const tx = (await client.query('SELECT * FROM provider_publishing_transactions WHERE id=$1 FOR UPDATE', [id])).rows[0];
            if (!tx || tx.publish_status !== 'REQUESTED' || tx.payload?.protocol !== protocol)
                throw new ProviderOperationError('UNKNOWN_OUTCOME', 'Provider claim is not pending.', true);
            if(result?.success!==true||result.provider!==tx.provider||typeof result.externalCampaignId!=='string'||!result.externalCampaignId||new Set(entities.map(e=>e.external_id)).size!==entities.length)
                throw new ProviderOperationError('UNKNOWN_OUTCOME','Successful, distinct provider identities are required before completion.',true);
            for (const entity of entities) {
                if (entity.campaign_id !== Number(tx.campaign_id) || entity.provider !== tx.provider)
                    throw new ProviderOperationError('OWNERSHIP_MISMATCH', 'Provider entity does not match its claim.');
                await client.query(`INSERT INTO provider_entities (campaign_id,provider,entity_type,external_id,parent_entity_id,account_id,configured_status,effective_status,metadata)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [entity.campaign_id, entity.provider, entity.entity_type, entity.external_id, entity.parent_entity_id ?? null, entity.account_id, entity.configured_status, entity.effective_status, JSON.stringify(entity.metadata ?? {})]);
            }
            if (configuredStatus)
                await client.query("UPDATE provider_entities SET configured_status=$3,effective_status='UNKNOWN',updated_at=CURRENT_TIMESTAMP WHERE campaign_id=$1 AND provider=$2 AND entity_type IN ('CAMPAIGN','AD_SET','AD_GROUP','AD')", [tx.campaign_id, tx.provider, configuredStatus]);
            if (updateEvidence)
                await updateEvidence(client, tx);
            await client.query(`UPDATE provider_publishing_transactions SET publish_status='COMMITTED',is_unknown_outcome=FALSE,response=$2,
        external_campaign_id=$3,external_container_id=$4,external_ad_id=$5,external_creative_id=$6,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [id, JSON.stringify(result), result.externalCampaignId ?? null, result.externalContainerId ?? null, result.externalAdId ?? null, result.externalCreativeId ?? null]);
        });
    }
    async fail(id: number, unknown: boolean, evidence: unknown, code: string): Promise<void> {
        const result = await this.pool.query(`UPDATE provider_publishing_transactions SET publish_status=$2,is_unknown_outcome=$3,response=$4,error_details=$5,updated_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND publish_status='REQUESTED' AND payload->>'protocol'=$6 RETURNING id`, [id, unknown ? 'RECONCILIATION_REQUIRED' : 'FAILED', unknown, JSON.stringify(evidence), JSON.stringify({ code }), protocol]);
        if (result.rowCount !== 1)
            throw new ProviderOperationError('UNKNOWN_OUTCOME', 'Provider failure evidence could not be committed.', true);
    }
    async deferVideo(id: number, evidence: any): Promise<void> {
        if (!/^[1-9]\d{0,29}$/.test(evidence?.ids?.video ?? '') || evidence?.ids?.campaign || evidence?.pendingStep !== null)
            throw new ProviderOperationError('UNKNOWN_OUTCOME', 'Video continuation evidence is incomplete.', true);
        const result = await this.pool.query("UPDATE provider_publishing_transactions SET publish_status='ASSET_PREPARING',is_unknown_outcome=FALSE,response=$2,error_details=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND provider='META' AND operation_type='CREATE_HIERARCHY' AND publish_status='REQUESTED' AND payload->>'protocol'=$4 RETURNING id",
            [id, JSON.stringify(evidence), JSON.stringify({ code: 'META_ASSET_PROCESSING' }), protocol]);
        if (result.rowCount !== 1) throw new ProviderOperationError('UNKNOWN_OUTCOME', 'Video continuation could not be recorded.', true);
    }
}
