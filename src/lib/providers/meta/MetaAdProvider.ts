import {publishedStrategyReference,loadPublishedStrategy} from '../../marketing/adtech/publishedStrategy.js';
import {MarketingError} from '../../marketing/domain.js';
import {assertMetaStrategyReadback} from '../../marketing/adtech/compiler.js';
import type {ProviderStoryVerifier} from '../spatialCreative.js';
import {randomUUID} from 'node:crypto';
import { ProviderReportPending } from '../reporting.js';
import {metaHierarchyEvidence} from '../deliveryEvidence.js';
import type { AdProvider } from '../AdProvider.js';
import type { ProviderCapabilitySet, ProviderPublishRequest, ProviderPublishResult, ProviderEntity, ProviderControlRequest, ProviderControlResult, ProviderBudgetUpdateRequest, NormalizedDeliveryTruth, NormalizedTelemetrySnapshot, ProviderReconciliationReport } from '../types.js';
import { providerRegistry } from '../providerRegistry.js';
import { ProviderOperationStore, ProviderOperationError, semanticFingerprint, type ProviderAuthorizationGuard, type ProviderAuthorizationContext,type ProviderMediaVerifier,type ProviderLandingVerifier } from '../ProviderOperationStore.js';
import { MetaAdsClient, metaAdsClient, MetaAdsError, metaId, META_ADS_API_VERSION } from './MetaAdsClient.js';
import { buildMetaCampaignPlan } from './MetaCampaignPlan.js';
import { StructuredLogger } from '../../observability/structuredLogger.js';
function failure(error: unknown): MetaAdsError {
    if(error instanceof MarketingError && /^(STRATEGY_|META_STRATEGY_)/.test(error.code))return new MetaAdsError(error.code,error.message);
    return error instanceof MetaAdsError ? error : error instanceof ProviderOperationError ? new MetaAdsError(error.code, error.message, error.unknownOutcome) : new MetaAdsError('META_INTERNAL_ERROR', 'Meta operation could not be completed.');
}
export class MetaAdProvider implements AdProvider {
    readonly providerId = 'META' as const;
    readonly apiVersion = META_ADS_API_VERSION;
    readonly capabilities: ProviderCapabilitySet = { supportsCreativeMutation: false, supportsVariantPause: false, supportsBudgetMutation: true, supportsHierarchyRollback: false, supportsRealtimeWebhook: false, supportsTelemetryInsights: true, supportsAssetLevelTargeting: false };
    constructor(private readonly client: MetaAdsClient = metaAdsClient, private readonly options: {
        publicOrigin?: string;
        authorize?: ProviderAuthorizationGuard;
        verifyCampaignMedia?:ProviderMediaVerifier;
        verifyLanding?:ProviderLandingVerifier;
        verifySpatialStory?:ProviderStoryVerifier;
    } = {}) { }
    private async account(currency?: string) {
        const identity = this.client.identity();
        const account = await this.client.get(identity.accountId, { fields: 'id,account_id,account_status,currency,timezone_name' });
        if (account.id !== identity.accountId || String(account.account_id) !== identity.accountId.slice(4) || Number(account.account_status) !== 1 || !['INR', 'USD'].includes(account.currency) || (currency && account.currency !== currency))
            throw new MetaAdsError('META_ACCOUNT_UNAVAILABLE', 'Meta account identity, status or campaign currency does not match.');
        return { ...identity, currency: account.currency, timeZone: account.timezone_name };
    }
    async validateCredentials() {
        try {
            const identity = await this.account();
            return { isValid: true, accountId: identity.accountId, permissions: ['OBSERVED_ACCOUNT_READ'], details: { currency: identity.currency, publishingVerified: false } };
        }
        catch (error) {
            return { isValid: false, accountId: '', permissions: [], details: { code: failure(error).code } };
        }
    }
    async checkHealth(): Promise<{
        status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
        latencyMs: number;
        lastCheckedAt: string;
    }> { const start = Date.now(); const valid = await this.validateCredentials(); const latencyMs = Date.now() - start; return { status: !valid.isValid ? 'UNAVAILABLE' : latencyMs < 2000 ? 'HEALTHY' : 'DEGRADED', latencyMs, lastCheckedAt: new Date().toISOString() }; }
    async createCampaignHierarchy(request: ProviderPublishRequest, pool?: any): Promise<ProviderPublishResult> {
        let store: ProviderOperationStore | undefined;
        let transactionId: number | undefined;
        let writeStarted = false;
        const evidence: Record<string, any> = { creationState: 'PAUSED', deliveryConfirmed: false, ids: {} };
        try {
            const strategyReference = publishedStrategyReference(request);
            const identity = this.client.identity();
            const plan = buildMetaCampaignPlan(request, this.options.publicOrigin ?? process.env.META_ADS_LANDING_ORIGIN ?? '', identity);
            store = new ProviderOperationStore(pool);
            const context: ProviderAuthorizationContext = { provider: 'META', campaignId: request.campaignId, operation: 'CREATE_HIERARCHY', fingerprint: plan.fingerprint, idempotencyKey: request.idempotencyKey, correlationId: request.correlationId, budgetMinor: request.budget.minor_units, budgetKind: 'LIFETIME', currency: request.budget.currency };
            if(plan.spatial&&(!this.options.verifySpatialStory||!this.options.authorize))throw new MetaAdsError('META_CREATIVE_AUTHORITY_REQUIRED','Reviewed spatial creative authority is required.');
            const guard: ProviderAuthorizationGuard | undefined = this.options.authorize ? async (ctx, tx) => {
                if (plan.thumbnail && !(await tx.query("SELECT id FROM media_assets WHERE entity_type='listing' AND entity_id=$1 AND url=$2 AND moderation_status='approved' FOR SHARE", [request.listingId, plan.thumbnail])).rows.length)
                    throw new MetaAdsError('META_MEDIA_NOT_APPROVED', 'Video thumbnail must be an approved property image.');
                if(plan.spatial)await this.options.verifySpatialStory!(request,tx);
                return this.options.authorize!(ctx, tx);
            } : undefined;
            const claim = await store.claim(context, { identity, plan: { campaign: plan.campaign, adset: plan.adset, asset: plan.asset, landing: plan.landing } }, guard, { hostId: request.hostId, listingId: request.listingId, landingUrl: plan.landing, mediaUrl: plan.asset },this.options.verifyCampaignMedia,this.options.verifyLanding);
            if (claim.result)
                return { ...claim.result, isDuplicate: true };
            transactionId = claim.id;
            if (claim.resumeEvidence) {
                Object.assign(evidence, claim.resumeEvidence);
                writeStarted = true;
            }
            await this.account(request.budget.currency);
            const page = await this.client.get(identity.pageId, { fields: identity.instagramId ? 'id,instagram_business_account' : 'id' });
            if (page.id !== identity.pageId || (identity.instagramId && page.instagram_business_account?.id !== identity.instagramId))
                throw new MetaAdsError('META_IDENTITY_MISMATCH', 'The configured Page and Instagram identity relationship was not verified.');
            if ((await this.client.get(identity.pixelId, { fields: 'id' })).id !== identity.pixelId)
                throw new MetaAdsError('META_IDENTITY_MISMATCH', 'The configured conversion pixel could not be verified.');
            const create = async (edge: string, payload: Record<string, unknown>, key: string) => {
                evidence.pendingStep = key;
                await store!.step(transactionId!, evidence);
                writeStarted = true;
                const response = await this.client.post(`${identity.accountId}/${edge}`, payload);
                const id = metaId(response.id);
                evidence.ids[key] = id;
                evidence.pendingStep = null;
                await store!.step(transactionId!, evidence);
                return id;
            };
            let videoId: string | undefined;
            if (plan.mediaType === 'VIDEO') {
                videoId = metaId(evidence.ids.video ?? await create('advideos', { file_url: plan.asset, title: plan.headline }, 'video'));
                const video = await this.client.get(videoId, { fields: 'id,status' });
                if (video.id !== videoId || video.status?.video_status !== 'ready')
                    throw new MetaAdsError('META_ASSET_PROCESSING', 'The uploaded video is processing. Retry this same request after processing completes.');
            }
            const campaign = await create('campaigns', plan.campaign, 'campaign');
            const adset = await create('adsets', { ...plan.adset, campaign_id: campaign }, 'adset');
            const creative = await create('adcreatives', plan.creative(videoId), 'creative');
            const ad = await create('ads', { name: `Encho ${request.campaignId} — ${plan.headline}`, adset_id: adset, creative: { creative_id: creative }, status: 'PAUSED' }, 'ad');
            const observed = await this.readHierarchy({ campaign, adset, creative, ad });
            if ([observed.campaign.status, observed.adset.status, observed.ad.status].some(s => s !== 'PAUSED') || String(observed.adset.lifetime_budget) !== String(request.budget.minor_units) || observed.adset.promoted_object?.pixel_id !== identity.pixelId || observed.adset.promoted_object?.custom_event_type !== 'PURCHASE')
                throw new MetaAdsError('META_READBACK_MISMATCH', 'Paused hierarchy, budget or pixel was not verified.', true);
            if(request.metadata?.adtechStrategy)assertMetaStrategyReadback(request.metadata.adtechStrategy,observed.campaign,observed.adset);
            const story = observed.creative.object_story_spec;
            if(plan.spatial){
                const cards=story?.link_data?.child_attachments;
                if(!Array.isArray(cards)||cards.length!==4||cards.some((card:any,index:number)=>card.name!==plan.spatial!.cards[index].title||card.link!==plan.spatial!.cards[index].landingUrl)||story?.link_data?.multi_share_optimized!==false)
                    throw new MetaAdsError('META_PARTIAL_CREATION','Observed carousel order, captions or destinations differ from the reviewed story.');
            }

            if (story?.page_id !== identity.pageId || (identity.instagramId && plan.adset.targeting.publisher_platforms.includes('instagram') && story.instagram_user_id !== identity.instagramId) ||
                (plan.mediaType === 'IMAGE' ? story?.link_data?.link !== plan.landing : story?.video_data?.video_id !== videoId || story?.video_data?.call_to_action?.value?.link !== plan.landing))
                throw new MetaAdsError('META_READBACK_MISMATCH', 'Creative identity or property destination was not verified.', true);
            const entities: ProviderEntity[] = [
                { campaign_id: request.campaignId, provider: 'META', entity_type: 'CAMPAIGN', external_id: campaign, account_id: identity.accountId, configured_status: 'PAUSED', effective_status: 'UNKNOWN', metadata: { fingerprint: plan.fingerprint } },
                { campaign_id: request.campaignId, provider: 'META', entity_type: 'AD_SET', external_id: adset, parent_entity_id: campaign, account_id: identity.accountId, configured_status: 'PAUSED', effective_status: 'UNKNOWN', metadata: { ...strategyReference, budgetMinor: request.budget.minor_units, budgetKind: 'LIFETIME', currency: request.budget.currency } },
                { campaign_id: request.campaignId, provider: 'META', entity_type: 'CREATIVE', external_id: creative, account_id: identity.accountId, configured_status: 'UNKNOWN', effective_status: 'UNKNOWN', metadata: { mediaUrl: plan.asset, videoId } },
                { campaign_id: request.campaignId, provider: 'META', entity_type: 'AD', external_id: ad, parent_entity_id: adset, account_id: identity.accountId, configured_status: 'PAUSED', effective_status: 'UNKNOWN' }
            ];
            const result: ProviderPublishResult = { success: true, provider: 'META', externalCampaignId: campaign, externalContainerId: adset, externalCreativeId: creative, externalAdId: ad, isDuplicate: false,
                hierarchy: { campaignId: request.campaignId, provider: 'META', externalCampaignId: campaign, externalContainerId: adset, externalCreativeId: creative, externalAdId: ad, entities, rawMetadata: evidence }, rawResponse: { creationState: 'PAUSED', deliveryConfirmed: false, verifiedAt: new Date().toISOString() } };
            await store.complete(transactionId, result, entities);
            return result;
        }
        catch (error) {
            let safe = failure(error);
            if (safe.code === 'META_ASSET_PROCESSING' && store && transactionId && evidence.ids.video && !evidence.ids.campaign && evidence.pendingStep === null) {
                try {
                    await store.deferVideo(transactionId, evidence);
                    return { success: false, provider: 'META', hierarchy: { campaignId: request.campaignId, provider: 'META', externalCampaignId: '', entities: [] }, error: safe.toProviderError() };
                }
                catch {
                    safe = new MetaAdsError('META_UNKNOWN_OUTCOME', 'Video continuation evidence requires reconciliation.', true);
                }
            }
            const unknown = writeStarted || safe.unknownOutcome;
            if (unknown)
                safe = new MetaAdsError('META_UNKNOWN_OUTCOME', 'Meta publishing evidence requires reconciliation; no repeat creation or activation is permitted.', true, { causeCode: safe.code, transactionId });
            if (store && transactionId) {
                try {
                    await store.fail(transactionId, unknown, evidence, safe.code);
                }
                catch {
                    safe = new MetaAdsError('META_UNKNOWN_OUTCOME', 'Provider claim must be reconciled before another operation.', true);
                }
            }
            StructuredLogger.warn('Meta paused publishing did not complete', { provider: 'META', campaignId: request?.campaignId, correlationId: request?.correlationId, errorCode: safe.code, outcome: unknown ? 'QUARANTINED' : 'FAILED' });
            return { success: false, provider: 'META', hierarchy: { campaignId: request?.campaignId, provider: 'META', externalCampaignId: '', entities: [] }, error: safe.toProviderError() };
        }
    }
    private async owned(campaignId: number | undefined, externalCampaignId: string, pool: any) {
        metaId(externalCampaignId);
        const identity = this.client.identity();
        if (!pool?.query)
            throw new MetaAdsError('META_OWNERSHIP_MISMATCH', 'Local provider ownership evidence is required.');
        const rows = (await pool.query("SELECT * FROM provider_entities WHERE provider='META' AND account_id=$1 AND campaign_id IN (SELECT campaign_id FROM provider_entities WHERE provider='META' AND external_id=$2 AND entity_type='CAMPAIGN')", [identity.accountId, externalCampaignId])).rows;
        const find = (type: string) => rows.find((r: any) => r.entity_type === type && (campaignId === undefined || Number(r.campaign_id) === campaignId));
        const campaign = find('CAMPAIGN'), adset = find('AD_SET'), creative = find('CREATIVE'), ad = find('AD');
        if (campaign?.external_id !== externalCampaignId || !adset || !creative || !ad || adset.parent_entity_id !== campaign.external_id || ad.parent_entity_id !== adset.external_id)
            throw new MetaAdsError('META_OWNERSHIP_MISMATCH', 'Complete campaign-bound Meta hierarchy evidence is required.');
        return { campaign: metaId(campaign.external_id), adset: metaId(adset.external_id), creative: metaId(creative.external_id), ad: metaId(ad.external_id) };
    }
    private async readHierarchy(ids: {
        campaign: string;
        adset: string;
        creative: string;
        ad: string;
    }) {
        const identity = this.client.identity();
        const [campaign, adset, creative, ad] = await Promise.all([
            this.client.get(ids.campaign, { fields: 'id,account_id,status,effective_status,objective,special_ad_categories' }),
            this.client.get(ids.adset, { fields: 'id,account_id,campaign_id,status,effective_status,lifetime_budget,promoted_object,targeting,optimization_goal,bid_strategy,bid_amount,attribution_spec' }),
            this.client.get(ids.creative, { fields: 'id,account_id,object_story_spec' }),
            this.client.get(ids.ad, { fields: 'id,account_id,campaign_id,adset_id,creative,status,effective_status' })
        ]);
        if ([campaign, adset, creative, ad].some((v, i) => v.id !== [ids.campaign, ids.adset, ids.creative, ids.ad][i] || String(v.account_id) !== identity.accountId.slice(4)) ||
            adset.campaign_id !== ids.campaign || ad.adset_id !== ids.adset || ad.campaign_id !== ids.campaign || ad.creative?.id !== ids.creative)
            throw new MetaAdsError('META_OWNERSHIP_MISMATCH', 'Observed Meta hierarchy identity or parentage does not match.');
        return { campaign, adset, creative, ad };
    }
    async validateHierarchyOwnership(campaignId: number, ids: {
        externalCampaignId?: string;
        externalContainerId?: string;
        externalAdId?: string;
    }, pool?: any): Promise<boolean> {
        try {
            const local = await this.owned(campaignId, ids.externalCampaignId!, pool);
            if (local.adset !== ids.externalContainerId || local.ad !== ids.externalAdId)
                return false;
            await this.readHierarchy(local);
            return true;
        }
        catch {
            return false;
        }
    }
    private async control(request: ProviderControlRequest | ProviderBudgetUpdateRequest, operation: 'PAUSE' | 'RESUME' | 'UPDATE_BUDGET', pool: any): Promise<ProviderControlResult> {
        let store: ProviderOperationStore | undefined;
        let txId: number | undefined;
        let wrote = false;
        let evidence: any = {};
        try {
            const ids = await this.owned(request.campaignId, request.externalCampaignId, pool);
            const budget = operation === 'UPDATE_BUDGET' ? (request as ProviderBudgetUpdateRequest).newBudget : undefined;
            const recorded = operation === 'PAUSE' ? null : (await pool.query("SELECT metadata FROM provider_entities WHERE campaign_id=$1 AND provider='META' AND entity_type='AD_SET' AND external_id=$2", [request.campaignId, ids.adset])).rows[0]?.metadata;
            if (operation !== 'PAUSE' && (!Number.isSafeInteger(recorded?.budgetMinor) || recorded.budgetMinor <= 0 || recorded.budgetKind !== 'LIFETIME' || !['INR', 'USD'].includes(recorded.currency)))
                throw new MetaAdsError('META_INVALID_BUDGET', 'The approved lifetime budget must be recorded before a spending operation.');
            if (budget && (!Number.isSafeInteger(budget.minor_units) || budget.minor_units <= 0 || !['INR', 'USD'].includes(budget.currency)))
                throw new MetaAdsError('META_INVALID_BUDGET', 'A positive supported-currency budget is required.');
            const strategy = operation === 'PAUSE' ? null : await loadPublishedStrategy(pool,request.campaignId,'META',recorded);
            const semantic = { provider: 'META', operation, campaignId: request.campaignId, ids, budget: budget ?? null, ...(strategy?{strategyHash:strategy.snapshotHash}:{}) };
            store = new ProviderOperationStore(pool);
            const claim = await store.claim({ provider: 'META', campaignId: request.campaignId, operation, externalCampaignId: ids.campaign, fingerprint: semanticFingerprint(semantic), idempotencyKey: request.idempotencyKey, correlationId: request.correlationId, ...(operation !== 'PAUSE' ? { budgetMinor: budget?.minor_units ?? recorded.budgetMinor, budgetKind: 'LIFETIME' as const, currency: budget?.currency ?? recorded.currency } : {}) }, semantic, this.options.authorize);
            if (claim.result)
                return claim.result;
            txId = claim.id;
            const before = await this.readHierarchy(ids);
            if(strategy)assertMetaStrategyReadback(strategy,before.campaign,before.adset);
            if (operation !== 'PAUSE' && String(before.adset.lifetime_budget) !== String(recorded.budgetMinor))
                throw new MetaAdsError('META_INVALID_BUDGET', 'Remote lifetime budget differs from approved evidence.');
            if (operation !== 'PAUSE' && (before.adset.promoted_object?.pixel_id !== this.client.identity().pixelId || before.adset.promoted_object?.custom_event_type !== 'PURCHASE'))
                throw new MetaAdsError('META_CONVERSION_DESTINATION_MISMATCH', 'The observed ad set must optimize for Purchase using the configured canonical conversion pixel.');
            const target = operation === 'PAUSE' ? 'PAUSED' : 'ACTIVE';
            if (budget)
                await this.account(budget.currency);
            const writes = budget ? [[ids.adset, { lifetime_budget: budget.minor_units.toString() }]] : operation === 'PAUSE' ? [[ids.campaign, { status: target }], [ids.adset, { status: target }], [ids.ad, { status: target }]] : [[ids.ad, { status: target }], [ids.adset, { status: target }], [ids.campaign, { status: target }]];
            for (const [id, payload] of writes) {
                evidence = { ids, pendingId: id };
                await store.step(txId, evidence);
                wrote = true;
                const response = await this.client.post(id as string, payload as Record<string, unknown>);
                if (response.success !== true)
                    throw new MetaAdsError('META_UNKNOWN_OUTCOME', 'Meta control acknowledgment was not verified.', true);
            }
            const after = await this.readHierarchy(ids);
            if(strategy)assertMetaStrategyReadback(strategy,after.campaign,after.adset);
            if (operation !== 'PAUSE' && (after.adset.promoted_object?.pixel_id !== this.client.identity().pixelId || after.adset.promoted_object?.custom_event_type !== 'PURCHASE'))
                throw new MetaAdsError('META_UNKNOWN_OUTCOME', 'Meta conversion destination changed during control; reconciliation is required.', true);
            if (budget ? String(after.adset.lifetime_budget) !== String(budget.minor_units) : [after.campaign.status, after.adset.status, after.ad.status].some(s => s !== target))
                throw new MetaAdsError('META_UNKNOWN_OUTCOME', 'Meta control readback differs from its authorization.', true);
            const configured = budget ? after.campaign.status : target;
            const result: ProviderControlResult = { success: true, provider: 'META', externalCampaignId: ids.campaign, previousStatus: before.campaign.status, newStatus: configured, normalizedDeliveryState: configured === 'PAUSED' ? 'PAUSED' : 'UNKNOWN', modifiedAt: new Date().toISOString() };
            await store.complete(txId, result, [], budget ? undefined : target, budget ? async (tx) => {
                await tx.query("UPDATE provider_entities SET metadata=jsonb_set(metadata,'{budgetMinor}',$3::jsonb),updated_at=CURRENT_TIMESTAMP WHERE campaign_id=$1 AND provider='META' AND external_id=$2", [request.campaignId, ids.adset, JSON.stringify(budget.minor_units)]);
            } : undefined);
            return result;
        }
        catch (error) {
            let safe = failure(error);
            if (wrote || safe.unknownOutcome)
                safe = new MetaAdsError('META_UNKNOWN_OUTCOME', 'Meta control requires reconciliation before another operation.', true);
            if (store && txId) {
                try {
                    await store.fail(txId, safe.unknownOutcome, evidence, safe.code);
                }
                catch {
                    safe = new MetaAdsError('META_UNKNOWN_OUTCOME', 'Meta control claim needs reconciliation.', true);
                }
            }
            return { success: false, provider: 'META', externalCampaignId: request.externalCampaignId, previousStatus: 'UNKNOWN', newStatus: 'UNKNOWN', normalizedDeliveryState: 'UNKNOWN', modifiedAt: '', error: safe.toProviderError() };
        }
    }
    async pauseCampaign(request: ProviderControlRequest, pool?: any) { return this.control(request, 'PAUSE', pool); }
    async resumeCampaign(request: ProviderControlRequest, pool?: any) { return this.control(request, 'RESUME', pool); }
    async updateBudget(request: ProviderBudgetUpdateRequest, pool?: any) { return this.control(request, 'UPDATE_BUDGET', pool); }
    async fetchAuthoritativeDeliveryTruth(externalCampaignId: string, pool?: any): Promise<NormalizedDeliveryTruth> {
        const correlationId = randomUUID(), started = performance.now();
        try {
            const observed = await this.readHierarchy(await this.owned(undefined, externalCampaignId, pool));
            const result = metaHierarchyEvidence(externalCampaignId, [observed.campaign, observed.adset, observed.ad], this.apiVersion);
            // Account eligibility must also be read before showing a ready hierarchy.
            if (result.readiness === 'ELIGIBLE') await this.account();
            return result;
        }
        catch (error) {
            const diagnostic = failure(error);
            // Never serialize provider messages, bodies, credentials or campaign IDs.
            const errorCode = /^(?:META|PROVIDER)_[A-Z_]{1,64}$/.test(diagnostic.code) ? diagnostic.code : 'META_OBSERVATION_FAILED';
            const trace = diagnostic.details.traceId;
            const providerTraceId = typeof trace === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(trace) ? trace : undefined;
            StructuredLogger.warn('Provider status observation failed', {
                correlationId, provider: 'META', apiVersion: this.apiVersion,
                operation: 'OBSERVE_HIERARCHY', outcome: 'UNKNOWN', errorCode,
                durationMs: Math.max(0, Math.round(performance.now() - started)),
                ...(providerTraceId ? {providerTraceId} : {}),
            });
            return { provider: 'META', externalCampaignId, normalizedState: 'UNKNOWN', rawStatus: 'UNKNOWN', rawEffectiveStatus: 'UNKNOWN', isLive: false, isServingImpressions: false, lastObservedAt: '', reconciliationRequired: true };
        }
    }
    async reconcileHierarchy(campaignId: number, ids: {
        externalCampaignId?: string;
        externalContainerId?: string;
        externalAdId?: string;
    }, pool?: any): Promise<ProviderReconciliationReport> { const valid = await this.validateHierarchyOwnership(campaignId, ids, pool); const truth = valid ? await this.fetchAuthoritativeDeliveryTruth(ids.externalCampaignId!, pool) : null; return { campaignId, provider: 'META', isConsistent: valid && truth?.normalizedState === 'PAUSED', remoteStatus: truth?.rawStatus ?? 'UNKNOWN', localStatus: 'UNKNOWN', normalizedState: truth?.normalizedState ?? 'UNKNOWN', skewDetected: false, autoCorrected: false, auditTimestamp: new Date().toISOString() }; }
    async fetchTelemetrySnapshot(externalCampaignId: string, window: {
        startDate: string;
        endDate: string;
    }, pool?: any): Promise<NormalizedTelemetrySnapshot> {
        await this.owned(undefined, externalCampaignId, pool);
        const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
        if (!validDate(window.startDate) || !validDate(window.endDate) || window.startDate > window.endDate)
            throw new MetaAdsError('META_INVALID_ARGUMENT', 'An ordered date window is required.');
        const account = await this.account();
        const data = await this.client.get(`${externalCampaignId}/insights`, { fields: 'account_currency,impressions,clicks,spend,reach,actions', time_range: { since: window.startDate, until: window.endDate }, level: 'campaign' });
        if (Array.isArray(data.data) && data.data.length === 0) throw new ProviderReportPending('NO_REPORT');
        const row = data.data?.length === 1 ? data.data[0] : null;
        if (!row || row.account_currency !== account.currency || ['impressions', 'clicks'].some(k => !/^(0|[1-9]\d*)$/.test(String(row[k]))) || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(String(row.spend)))
            throw new MetaAdsError('META_TELEMETRY_UNAVAILABLE', 'Meta metrics are missing or invalid.');
        const actionsAvailable = Array.isArray(row.actions);
        if (actionsAvailable && row.actions.some((a: any) => !a || typeof a.action_type !== 'string' || !/^(0|[1-9]\d*)(\.\d+)?$/.test(String(a.value))))
            throw new MetaAdsError('META_TELEMETRY_UNAVAILABLE', 'Meta action counts are invalid.');
        const impressions = Number(row.impressions), clicks = Number(row.clicks), spend = Number(row.spend), conversions = (actionsAvailable ? row.actions : []).filter((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase').reduce((sum: number, a: any) => sum + Number(a.value), 0);
        const [whole, fraction = ''] = String(row.spend).split('.');
        const spendMinor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
        if (!Number.isSafeInteger(impressions) || !Number.isSafeInteger(clicks) || !Number.isFinite(conversions) || conversions < 0 || conversions > Number.MAX_SAFE_INTEGER || spendMinor > BigInt(Number.MAX_SAFE_INTEGER))
            throw new MetaAdsError('META_TELEMETRY_UNAVAILABLE', 'Meta metrics cannot be represented safely.');
        return { provider: 'META', externalCampaignId, dateStart: window.startDate, dateEnd: window.endDate, impressions, clicks, spend: { currency: account.currency, minor_units: Number(spendMinor) }, conversions, ctr: impressions ? clicks / impressions : 0, cpc: clicks ? spend / clicks : 0, cpm: impressions ? spend / impressions * 1000 : 0, observedAt: new Date().toISOString(), dataFreshness: 'DELAYED', providerMetadata: { source: 'META_INSIGHTS', conversionMeaning: 'PROVIDER_ATTRIBUTED_PURCHASES', conversionDataAvailable: actionsAvailable, dataAsOf: null, ratios: { ctr: impressions ? clicks / impressions : null, cpc: clicks ? spend / clicks : null, cpm: impressions ? spend / impressions * 1000 : null }, accountTimeZone: account.timeZone } };
    }
}
export const metaAdProvider = new MetaAdProvider();
providerRegistry.registerProvider(metaAdProvider);
