import { MarketingError } from '../../marketing/domain.js';
import { ProviderReportPending } from '../reporting.js';
/**
 * Google v25 adapter. Creation is a paused Search preparation operation only.
 * Server live dispatch remains contained until funding/activation acceptance.
 * No provider state, resource identifier or performance metric is simulated.
 */
import type { AdProvider } from '../AdProvider.js';
import type {
  ProviderId, ProviderCapabilitySet, ProviderPublishRequest, ProviderPublishResult,
  ProviderControlRequest, ProviderControlResult, ProviderBudgetUpdateRequest,
  NormalizedDeliveryTruth, NormalizedTelemetrySnapshot, ProviderReconciliationReport,
  ProviderEntity,
} from '../types.js';
import { providerRegistry } from '../providerRegistry.js';
import { googleAdsClient, GoogleAdsClient, GOOGLE_ADS_API_VERSION } from './GoogleAdsClient.js';
import { buildGoogleSearchPlan } from './GoogleSearchPlan.js';
import { GooglePublishingStore } from './GooglePublishingStore.js';
import { GoogleDeliveryReducer } from './googleDeliveryReducer.js';
import { GoogleTelemetryMapper } from './googleTelemetryMapper.js';
import { googleDcoStrategy } from './googleDcoStrategy.js';
import { GoogleAdsError } from './googleErrors.js';
import type { DcoEvaluationOutput } from '../../dcoEngine.js';
import { StructuredLogger } from '../../observability/structuredLogger.js';
import { ProviderOperationStore, ProviderOperationError, semanticFingerprint, type ProviderAuthorizationGuard } from '../ProviderOperationStore.js';
import type { GoogleMutateOperation } from './GoogleAdsClient.js';

function providerError(error: unknown): GoogleAdsError {
  if (error instanceof GoogleAdsError) return error;
  if (error instanceof MarketingError) {
    return new GoogleAdsError(error.code === 'INVENTORY_UNAVAILABLE' ? 'INVENTORY_UNAVAILABLE' : 'GOOGLE_WORKFLOW_REJECTED',
      error.code === 'INVENTORY_UNAVAILABLE' ? 'No room type has verified availability for the advertised stay dates.' : 'The campaign workflow blocked this provider operation.',
      { statusCode: error.status, errorClass: 'VALIDATION', details: { workflowCode: /^[A-Z_0-9]{1,100}$/.test(error.code) ? error.code : 'STATE_CONFLICT' } });
  }
  return new GoogleAdsError(
    'GOOGLE_INTERNAL_ERROR', 'Google operation could not be completed; inspect its correlation record.',
    { errorClass: 'INTERNAL' },
  );
}

function resourceId(resource: string, customerId: string, collection: string): string {
  const suffix = collection === 'adGroupAds' || collection.endsWith('Criteria')
    ? '[1-9][0-9]*~[1-9][0-9]*' : '[1-9][0-9]*';
  const match = new RegExp(`^customers/${customerId}/${collection}/(${suffix})$`).exec(resource);
  if (!match) throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH', 'Google resource does not belong to the configured serving customer or expected resource type.', { statusCode: 409, errorClass: 'VALIDATION' });
  return match[1];
}

function oneRow(rows: any[], key: string): any {
  if (rows.length !== 1 || !rows[0]?.[key]) {
    throw new GoogleAdsError('GOOGLE_MISSING_CAMPAIGN', 'Expected Google resource could not be verified.', { statusCode: 409, errorClass: 'VALIDATION' });
  }
  return rows[0];
}

function budgetMatches(observed:any, mode:'DAILY'|'CAMPAIGN_TOTAL', minor:unknown):boolean {
  if(typeof minor!=='number'||!Number.isSafeInteger(minor)||minor<=0||observed?.explicitlyShared!==false)return false;
  const total=mode==='CAMPAIGN_TOTAL';
  // M1 legacy daily reads did not request period. An explicit conflicting
  // period is never accepted, and total budgets always require CUSTOM_PERIOD.
  if(total?observed.period!=='CUSTOM_PERIOD':observed.period!==undefined&&observed.period!=='DAILY')return false;
  const amount=total?observed.totalAmountMicros:observed.amountMicros;
  const other=total?observed.amountMicros:observed.totalAmountMicros;
  return /^\d+$/.test(String(amount))&&(other===undefined||String(other)==='0')&&BigInt(amount)===BigInt(minor)*10000n;
}

export class GoogleAdsProvider implements AdProvider {
  readonly providerId: ProviderId = 'GOOGLE';
  readonly apiVersion = GOOGLE_ADS_API_VERSION;
  readonly capabilities: ProviderCapabilitySet = {
    supportsCreativeMutation: false,
    supportsVariantPause: false,
    supportsBudgetMutation: true,
    supportsHierarchyRollback: false,
    supportsRealtimeWebhook: false,
    supportsTelemetryInsights: true,
    supportsAssetLevelTargeting: false,
  };

  constructor(
    private readonly client: GoogleAdsClient = googleAdsClient,
    private readonly options: { publicOrigin?: string; authorize?: ProviderAuthorizationGuard } = {},
  ) {}

  private async servingCustomer(currency?: string): Promise<any> {
    const customerId = this.client.getCustomerId();
    const row = oneRow(await this.client.searchStream(customerId,
      'SELECT customer.id, customer.resource_name, customer.manager, customer.currency_code, customer.time_zone FROM customer LIMIT 1'), 'customer');
    const customer = row.customer;
    if (String(customer.id) !== customerId || customer.resourceName !== `customers/${customerId}` || customer.manager !== false) {
      throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH', 'Configured Google customer must be the observed non-manager serving account.', { statusCode: 403, errorClass: 'AUTHENTICATION' });
    }
    if (!['INR', 'USD'].includes(customer.currencyCode) || (currency && customer.currencyCode !== currency)) {
      throw new GoogleAdsError('GOOGLE_BUDGET_MISMATCH', 'Campaign currency must match the supported Google serving-account currency; implicit FX is prohibited.', { statusCode: 409, errorClass: 'VALIDATION' });
    }
    try { if (typeof customer.timeZone !== 'string' || !customer.timeZone) throw new Error(); new Intl.DateTimeFormat('en', { timeZone: customer.timeZone }).format(); }
    catch { throw new GoogleAdsError('GOOGLE_INVALID_RESPONSE', 'Google serving-account timezone was not verified.'); }
    return customer;
  }

  async validateCredentials() {
    try {
      await this.client.validateMasterCredentials();
      const customer = await this.servingCustomer();
      return { isValid: true, accountId: String(customer.id), permissions: ['REPORTING'], details: { manager: false, currency: customer.currencyCode, timeZone: customer.timeZone, publishingVerified: false } };
    } catch (error) {
      return { isValid: false, accountId: '', permissions: [], details: { error: providerError(error).message, code: providerError(error).code } };
    }
  }

  async checkHealth(): Promise<{ status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'; latencyMs: number; lastCheckedAt: string }> {
    const start = Date.now();
    const validation = await this.validateCredentials();
    const latencyMs = Date.now() - start;
    return { status: !validation.isValid ? 'UNAVAILABLE' : latencyMs < 2000 ? 'HEALTHY' : 'DEGRADED', latencyMs, lastCheckedAt: new Date().toISOString() };
  }

  async createCampaignHierarchy(request: ProviderPublishRequest, poolOrClient?: any): Promise<ProviderPublishResult> {
    let store: GooglePublishingStore | undefined;
    let transactionId: number | undefined;
    let mutationStarted = false;
    let providerAccepted = false;
    let remoteEvidence: Record<string, unknown> | undefined;
    try {
      const customerId = this.client.getCustomerId();
      const plan = buildGoogleSearchPlan(request, customerId, this.options.publicOrigin ?? process.env.GOOGLE_ADS_LANDING_ORIGIN ?? '');
      if (request.metadata?.providerProtocol === 'HARVO_V2' && !this.options.authorize) throw new GoogleAdsError('GOOGLE_MUTATION_FAILED', 'Trusted V2 publishing authorization is required.', { errorClass: 'POLICY' });
      store = new GooglePublishingStore(poolOrClient, this.options.authorize);
      const claim = await store.claim(request, customerId, plan.fingerprint, { operations: plan.operations, listingId: request.listingId });
      if (claim.kind === 'DUPLICATE') return { ...claim.result, isDuplicate: true };
      transactionId = claim.transactionId;
      StructuredLogger.info('Google paused publishing request claimed', { provider: 'GOOGLE', operation: 'CREATE_PAUSED_SEARCH', campaignId: request.campaignId, correlationId: request.correlationId, transactionId });
      const customer = await this.servingCustomer(request.budget.currency);
      mutationStarted = true;
      const response = await this.client.mutateOperations(customerId, plan.operations);
      providerAccepted = true;
      remoteEvidence = { resourceNames: response.results.map(r => r.resourceName), requestId: response.requestId };
      if (response.results.length !== plan.expectedResourceTypes.length) {
        throw new GoogleAdsError('GOOGLE_PARTIAL_CREATION', 'Google creation response did not contain the complete requested hierarchy.', { errorClass: 'VALIDATION' });
      }
      response.results.forEach((result, index) => resourceId(result.resourceName, customerId, plan.expectedResourceTypes[index]));
      const names = response.results.map(r => r.resourceName);
      if (new Set(names).size !== names.length) throw new GoogleAdsError('GOOGLE_PARTIAL_CREATION', 'Google returned duplicate resource identities.', { errorClass: 'VALIDATION' });
      const [externalBudgetId, externalCampaignId, externalContainerId, externalAdId] = names;
      const campaignNumericId = resourceId(externalCampaignId, customerId, 'campaigns');
      const observed = oneRow(await this.client.searchStream(customerId,
        `SELECT campaign.resource_name, campaign.status, campaign.campaign_budget, campaign.start_date_time, campaign.end_date_time, ad_group.resource_name, ad_group.campaign, ad_group.status, ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE campaign.id = ${campaignNumericId}`), 'adGroupAd');
      if (observed.campaign?.resourceName !== externalCampaignId || observed.campaign?.campaignBudget !== externalBudgetId ||
          observed.adGroup?.resourceName !== externalContainerId || observed.adGroup?.campaign !== externalCampaignId ||
          observed.adGroupAd.resourceName !== externalAdId ||
          [observed.campaign?.status, observed.adGroup?.status, observed.adGroupAd.status].some(s => s !== 'PAUSED') ||
          JSON.stringify(observed.adGroupAd.ad?.finalUrls) !== JSON.stringify([request.creativeAssets.landingPageUrl])) {
        throw new GoogleAdsError('GOOGLE_PARTIAL_CREATION', 'Returned Google hierarchy, destination or paused state could not be verified.', { errorClass: 'VALIDATION' });
      }
      if (plan.budgetMode === 'CAMPAIGN_TOTAL' && (observed.campaign.startDateTime !== `${request.startTime} 00:00:00` || observed.campaign.endDateTime !== `${request.endTime} 23:59:59`)) {
        throw new GoogleAdsError('GOOGLE_BUDGET_MISMATCH', 'Google campaign total budget dates were not verified in the serving-account timezone.');
      }
      const budgetId = resourceId(externalBudgetId, customerId, 'campaignBudgets');
      const budget = oneRow(await this.client.searchStream(customerId,
        `SELECT campaign_budget.resource_name, campaign_budget.period, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.explicitly_shared FROM campaign_budget WHERE campaign_budget.id = ${budgetId}`), 'campaignBudget').campaignBudget;
      if (budget.resourceName !== externalBudgetId || !budgetMatches(budget, plan.budgetMode, plan.budgetMinor)) {
        throw new GoogleAdsError('GOOGLE_BUDGET_MISMATCH', 'Google budget type and amount do not match the explicit unshared campaign plan.', { errorClass: 'VALIDATION' });
      }
      const entities: ProviderEntity[] = [
        { campaign_id: request.campaignId, provider: 'GOOGLE', entity_type: 'CAMPAIGN', external_id: externalCampaignId, account_id: customerId, configured_status: 'PAUSED', effective_status: 'UNKNOWN', metadata: { budgetResourceName: externalBudgetId, budgetMode:plan.budgetMode, ...(plan.budgetMode==='CAMPAIGN_TOTAL'?{totalBudgetMinor:plan.budgetMinor,startTime:request.startTime,endTime:request.endTime}:{dailyBudgetMinor:plan.dailyBudgetMinor}), currency: customer.currencyCode, timeZone: customer.timeZone, fingerprint: plan.fingerprint } },
        { campaign_id: request.campaignId, provider: 'GOOGLE', entity_type: 'AD_GROUP', external_id: externalContainerId, parent_entity_id: externalCampaignId, account_id: customerId, configured_status: 'PAUSED', effective_status: 'UNKNOWN' },
        { campaign_id: request.campaignId, provider: 'GOOGLE', entity_type: 'AD', external_id: externalAdId, parent_entity_id: externalContainerId, account_id: customerId, configured_status: 'PAUSED', effective_status: 'UNKNOWN' },
      ];
      const result: ProviderPublishResult = {
        success: true, provider: 'GOOGLE', externalCampaignId, externalContainerId, externalAdId, isDuplicate: false,
        hierarchy: { campaignId: request.campaignId, provider: 'GOOGLE', externalCampaignId, externalContainerId, externalAdId, entities, rawMetadata: { creationState: 'PAUSED', deliveryConfirmed: false, budgetResourceName: externalBudgetId, resourceNames: names, fingerprint: plan.fingerprint } },
        rawResponse: { requestId: response.requestId, creationState: 'PAUSED', verifiedAt: new Date().toISOString(), deliveryConfirmed: false },
      };
      await store.complete(transactionId, result);
      StructuredLogger.info('Google paused hierarchy verified and persisted', { provider: 'GOOGLE', operation: 'CREATE_PAUSED_SEARCH', campaignId: request.campaignId, correlationId: request.correlationId, transactionId, requestId: response.requestId, outcome: 'SUCCESS' });
      return result;
    } catch (error) {
      let safeError = providerError(error);
      if (!remoteEvidence && typeof safeError.details?.requestId === 'string') {
        remoteEvidence = { requestId: safeError.details.requestId };
      }
      const unknown = mutationStarted && (providerAccepted || !(error instanceof GoogleAdsError) || safeError.code === 'GOOGLE_UNKNOWN_OUTCOME');
      if (unknown) safeError = new GoogleAdsError('GOOGLE_UNKNOWN_OUTCOME', 'Google creation requires reconciliation. Do not create another campaign or activate it.', { statusCode: 409, errorClass: 'UNKNOWN', details: { causeCode: safeError.code, transactionId } });
      if (store && transactionId !== undefined) {
        try {
          if (unknown) await store.quarantine(transactionId, { code: safeError.code, message: safeError.message }, remoteEvidence);
          else await store.reject(transactionId, { code: safeError.code, message: safeError.message });
        } catch {
          // The committed REQUESTED claim remains a durable non-retryable guard.
          StructuredLogger.error('Could not persist Google failure outcome; original claim must be reconciled', { provider: 'GOOGLE', campaignId: request.campaignId, correlationId: request.correlationId, transactionId, outcome: 'UNKNOWN', errorCode: safeError.code });
          safeError = new GoogleAdsError('GOOGLE_UNKNOWN_OUTCOME', 'Publishing record requires reconciliation; no automatic retry is permitted.', { statusCode: 409, errorClass: 'UNKNOWN' });
        }
      }
      StructuredLogger.warn('Google paused publishing did not complete', { provider: 'GOOGLE', campaignId: request?.campaignId, correlationId: request?.correlationId, transactionId, outcome: unknown ? 'QUARANTINED' : 'FAILED', errorCode: safeError.code });
      return { success: false, provider: 'GOOGLE', hierarchy: { campaignId: request?.campaignId, provider: 'GOOGLE', externalCampaignId: '', entities: [] }, error: safeError.toProviderError() };
    }
  }

  private async ownedEntities(externalCampaignId: string, poolOrClient: any, campaignId?: number): Promise<any[]> {
    const customerId = this.client.getCustomerId();
    resourceId(externalCampaignId, customerId, 'campaigns');
    if (!poolOrClient?.query) throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH', 'A local campaign ownership record is required.', { statusCode: 403, errorClass: 'AUTHENTICATION' });
    const rows = (await poolOrClient.query(`SELECT * FROM provider_entities WHERE provider = 'GOOGLE' AND account_id = $1 AND campaign_id IN (SELECT campaign_id FROM provider_entities WHERE provider = 'GOOGLE' AND external_id = $2 AND entity_type = 'CAMPAIGN')`, [customerId, externalCampaignId])).rows;
    if (!rows.some((r: any) => r.external_id === externalCampaignId && r.entity_type === 'CAMPAIGN' && (campaignId === undefined || Number(r.campaign_id) === campaignId))) {
      throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH', 'Google campaign is not bound to this local campaign and configured serving account.', { statusCode: 403, errorClass: 'AUTHENTICATION' });
    }
    return rows;
  }

  async validateHierarchyOwnership(campaignId: number, externalIds: { externalCampaignId?: string; externalContainerId?: string; externalAdId?: string }, poolOrClient?: any): Promise<boolean> {
    try {
      if (!externalIds.externalCampaignId || !externalIds.externalContainerId || !externalIds.externalAdId) return false;
      const customerId = this.client.getCustomerId();
      const local = await this.ownedEntities(externalIds.externalCampaignId, poolOrClient, campaignId);
      const groupId = resourceId(externalIds.externalContainerId, customerId, 'adGroups');
      if (resourceId(externalIds.externalAdId, customerId, 'adGroupAds').split('~')[0] !== groupId) return false;
      for (const [id, type, collection] of [[externalIds.externalContainerId, 'AD_GROUP', 'adGroups'], [externalIds.externalAdId, 'AD', 'adGroupAds']]) {
        resourceId(id, customerId, collection);
        const expectedParent = type === 'AD_GROUP' ? externalIds.externalCampaignId : externalIds.externalContainerId;
        if (!local.some((e: any) => e.external_id === id && e.entity_type === type && Number(e.campaign_id) === campaignId && e.parent_entity_id === expectedParent)) return false;
      }
      const numericId = resourceId(externalIds.externalCampaignId, customerId, 'campaigns');
      const rows = await this.client.searchStream(customerId, `SELECT campaign.resource_name, ad_group.resource_name, ad_group.campaign, ad_group_ad.resource_name FROM ad_group_ad WHERE campaign.id = ${numericId}`);
      return rows.some(row => row.campaign?.resourceName === externalIds.externalCampaignId && row.adGroup?.campaign === externalIds.externalCampaignId && row.adGroup?.resourceName === externalIds.externalContainerId && row.adGroupAd?.resourceName === externalIds.externalAdId);
    } catch (error) {
      StructuredLogger.warn('Google hierarchy ownership not verified', { provider: 'GOOGLE', campaignId, errorCode: providerError(error).code });
      return false;
    }
  }

  private unavailableControl(externalCampaignId: string, operation: string): ProviderControlResult {
    const error = new GoogleAdsError('GOOGLE_MUTATION_FAILED', `${operation} is unavailable until Google control-plane authorization and reconciliation are implemented.`, { statusCode: 409, errorClass: 'POLICY' });
    return { success: false, provider: 'GOOGLE', externalCampaignId, previousStatus: 'UNKNOWN', newStatus: 'UNKNOWN', normalizedDeliveryState: 'UNKNOWN', modifiedAt: new Date().toISOString(), error: error.toProviderError() };
  }

  private async control(request: ProviderControlRequest | ProviderBudgetUpdateRequest, operation: 'PAUSE' | 'RESUME' | 'UPDATE_BUDGET', pool: any): Promise<ProviderControlResult> {
    let store: ProviderOperationStore | undefined; let transactionId: number | undefined; let mutationStarted = false; let accepted = false;
    let evidence: Record<string, unknown> = {};
    try {
      if (!this.options.authorize) return this.unavailableControl(request.externalCampaignId, operation);
      const customerId = this.client.getCustomerId();
      const entities = await this.ownedEntities(request.externalCampaignId, pool, request.campaignId);
      const campaign = entities.find(e => e.entity_type === 'CAMPAIGN' && Number(e.campaign_id) === request.campaignId);
      const group = entities.find(e => e.entity_type === 'AD_GROUP' && Number(e.campaign_id) === request.campaignId);
      const ad = entities.find(e => e.entity_type === 'AD' && Number(e.campaign_id) === request.campaignId);
      if (!campaign || !group || !ad || group.parent_entity_id !== campaign.external_id || ad.parent_entity_id !== group.external_id) throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH', 'Google controls require complete campaign-bound hierarchy evidence.');
      const groupId = resourceId(group.external_id, customerId, 'adGroups');
      resourceId(ad.external_id, customerId, 'adGroupAds');
      const budget = operation === 'UPDATE_BUDGET' ? (request as ProviderBudgetUpdateRequest).newBudget : undefined;
      const budgetMode=campaign.metadata?.budgetMode??'DAILY';
      if (!['DAILY','CAMPAIGN_TOTAL'].includes(budgetMode)) throw new GoogleAdsError('GOOGLE_BUDGET_MISMATCH','Stored Google budget type is unavailable.');
      const recordedBudgetMinor=budgetMode==='CAMPAIGN_TOTAL'?campaign.metadata?.totalBudgetMinor:campaign.metadata?.dailyBudgetMinor;
      if(operation==='RESUME'&&(!Number.isSafeInteger(recordedBudgetMinor)||recordedBudgetMinor<=0))throw new GoogleAdsError('GOOGLE_BUDGET_MISMATCH','Activation requires recorded budget evidence.');
      if (budget && (Object.keys(budget).some(key=>!['currency','minor_units'].includes(key)) || !Number.isSafeInteger(budget.minor_units) || budget.minor_units <= 0 || !['INR','USD'].includes(budget.currency) || BigInt(budget.minor_units) * 10000n > 9223372036854775807n)) throw new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', 'Google budget must be positive supported-currency minor units; budget type cannot change.');
      const semantic = { provider:'GOOGLE', operation, campaignId:request.campaignId, campaign:campaign.external_id, group:group.external_id, ad:ad.external_id, budgetMode,budget:budget ?? null };
      store = new ProviderOperationStore(pool);
      const claim = await store.claim({ provider:'GOOGLE', campaignId:request.campaignId, operation, externalCampaignId:request.externalCampaignId,
        fingerprint:semanticFingerprint(semantic), idempotencyKey:request.idempotencyKey, correlationId:request.correlationId,
        ...(budget||operation==='RESUME' ? { budgetMinor:budget?.minor_units??recordedBudgetMinor, budgetKind:budgetMode==='CAMPAIGN_TOTAL'?'LIFETIME' as const:'DAILY' as const, currency:budget?.currency??campaign.metadata?.currency } : {}) }, semantic, this.options.authorize);
      if (claim.result) return claim.result; transactionId = claim.id;
      const campaignId = resourceId(campaign.external_id, customerId, 'campaigns');
      const read = async () => oneRow(await this.client.searchStream(customerId,
        `SELECT campaign.resource_name,campaign.status,campaign.campaign_budget,campaign.start_date_time,campaign.end_date_time,ad_group.resource_name,ad_group.campaign,ad_group.status,ad_group_ad.resource_name,ad_group_ad.status FROM ad_group_ad WHERE campaign.id = ${campaignId}`), 'adGroupAd');
      const verifyIdentity = (row: any) => {
        if (row.campaign?.resourceName !== campaign.external_id || row.adGroup?.resourceName !== group.external_id || row.adGroup.campaign !== campaign.external_id || row.adGroupAd?.resourceName !== ad.external_id) throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH','Observed Google hierarchy changed.');
      };
      const before = await read(); verifyIdentity(before);
      if (![before.campaign.status,before.adGroup.status,before.adGroupAd.status].every(status=>['PAUSED','ENABLED'].includes(status))) throw new GoogleAdsError('GOOGLE_INVALID_RESPONSE','Google hierarchy configuration could not be read before control.');
      if(operation==='RESUME'){
        const budgetId=resourceId(before.campaign.campaignBudget,customerId,'campaignBudgets');
        const observedBudget=oneRow(await this.client.searchStream(customerId,`SELECT campaign_budget.resource_name,campaign_budget.period,campaign_budget.amount_micros,campaign_budget.total_amount_micros,campaign_budget.explicitly_shared FROM campaign_budget WHERE campaign_budget.id = ${budgetId}`),'campaignBudget').campaignBudget;
        if(before.campaign.campaignBudget!==campaign.metadata?.budgetResourceName||observedBudget.resourceName!==before.campaign.campaignBudget||!budgetMatches(observedBudget,budgetMode,recordedBudgetMinor))throw new GoogleAdsError('GOOGLE_BUDGET_MISMATCH','Remote budget changed after approval; activation is blocked.');
        if(budgetMode==='CAMPAIGN_TOTAL'&&(before.campaign.startDateTime!==`${campaign.metadata.startTime} 00:00:00`||before.campaign.endDateTime!==`${campaign.metadata.endTime} 23:59:59`))throw new GoogleAdsError('GOOGLE_BUDGET_MISMATCH','Campaign total budget dates changed after approval.');
      }
      const target = operation === 'PAUSE' ? 'PAUSED' : 'ENABLED';
      let operations: GoogleMutateOperation[]; let keywordNames: string[] = [];
      if (budget) {
        await this.servingCustomer(budget.currency);
        const budgetName = before.campaign.campaignBudget;
        const budgetId = resourceId(budgetName, customerId, 'campaignBudgets');
        const observedBudget = oneRow(await this.client.searchStream(customerId, `SELECT campaign_budget.resource_name,campaign_budget.period,campaign_budget.amount_micros,campaign_budget.total_amount_micros,campaign_budget.explicitly_shared FROM campaign_budget WHERE campaign_budget.id = ${budgetId}`), 'campaignBudget').campaignBudget;
        const priorMinor=budgetMode==='CAMPAIGN_TOTAL'?campaign.metadata?.totalBudgetMinor:campaign.metadata?.dailyBudgetMinor;
        if (observedBudget.resourceName !== budgetName || !budgetMatches(observedBudget,budgetMode,priorMinor) || campaign.metadata?.budgetResourceName !== budgetName) throw new GoogleAdsError('GOOGLE_BUDGET_MISMATCH','Google budget must retain its verified unshared type and prior amount.');
        const field=budgetMode==='CAMPAIGN_TOTAL'?'totalAmountMicros':'amountMicros';
        operations = [{ campaignBudgetOperation:{ update:{ resourceName:budgetName, [field]:(BigInt(budget.minor_units)*10000n).toString() },updateMask:field } }];
      } else {
        const keywords = await this.client.searchStream(customerId, `SELECT ad_group_criterion.resource_name,ad_group_criterion.status,ad_group_criterion.type,ad_group_criterion.negative FROM ad_group_criterion WHERE ad_group.id = ${groupId} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED'`);
        keywordNames = keywords.map(row => {
          const criterion = row.adGroupCriterion;
          if (!criterion || criterion.type !== 'KEYWORD' || criterion.negative !== false || !['PAUSED','ENABLED'].includes(criterion.status) || !String(criterion.resourceName).startsWith(`customers/${customerId}/adGroupCriteria/${groupId}~`)) throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH','Google keyword scope was not verified.');
          resourceId(criterion.resourceName, customerId, 'adGroupCriteria'); return criterion.resourceName;
        });
        if (operation === 'RESUME') {
          const publication = (await pool.query("SELECT response FROM provider_publishing_transactions WHERE campaign_id=$1 AND provider='GOOGLE' AND operation_type='CREATE_HIERARCHY' AND publish_status='COMMITTED' AND is_unknown_outcome=FALSE",[request.campaignId])).rows;
          const hierarchy = publication.length===1 ? publication[0].response?.hierarchy : null;
          const originalNames = hierarchy?.rawMetadata?.resourceNames;
          const approvedKeywords = Array.isArray(originalNames) ? originalNames.filter((name:unknown)=>typeof name==='string' && name.startsWith(`customers/${customerId}/adGroupCriteria/${groupId}~`)) : [];
          if (hierarchy?.externalCampaignId!==campaign.external_id || !approvedKeywords.length || approvedKeywords.length!==keywordNames.length || !approvedKeywords.every((name:string)=>keywordNames.includes(name))) throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH','Google keyword set changed from the published campaign revision; review is required.');
        }
        if (operation === 'RESUME' && !keywordNames.length) throw new GoogleAdsError('GOOGLE_MUTATION_FAILED','Google activation requires verified keyword criteria.');
        operations = [{campaignOperation:{update:{resourceName:campaign.external_id,status:target},updateMask:'status'}},
          {adGroupOperation:{update:{resourceName:group.external_id,status:target},updateMask:'status'}},
          {adGroupAdOperation:{update:{resourceName:ad.external_id,status:target},updateMask:'status'}},
          ...keywordNames.map(resourceName => ({adGroupCriterionOperation:{update:{resourceName,status:target},updateMask:'status'}}))];
      }
      evidence = { operations, pending:true }; await store.step(transactionId,evidence);
      mutationStarted = true; const response = await this.client.mutateOperations(customerId,operations); accepted = true;
      evidence = { resourceNames:response.results.map(r=>r.resourceName),requestId:response.requestId }; await store.step(transactionId,evidence);
      const after = await read(); verifyIdentity(after);
      if (budget) {
        const budgetId = resourceId(after.campaign.campaignBudget,customerId,'campaignBudgets');
        const observed = oneRow(await this.client.searchStream(customerId, `SELECT campaign_budget.resource_name,campaign_budget.period,campaign_budget.amount_micros,campaign_budget.total_amount_micros,campaign_budget.explicitly_shared FROM campaign_budget WHERE campaign_budget.id = ${budgetId}`),'campaignBudget').campaignBudget;
        if (observed.resourceName !== before.campaign.campaignBudget || !budgetMatches(observed,budgetMode,budget.minor_units)) throw new GoogleAdsError('GOOGLE_UNKNOWN_OUTCOME','Google budget change could not be verified.');
      } else {
        if ([after.campaign.status,after.adGroup.status,after.adGroupAd.status].some(status=>status!==target)) throw new GoogleAdsError('GOOGLE_UNKNOWN_OUTCOME','Google status change could not be verified.');
        const verified = await this.client.searchStream(customerId, `SELECT ad_group_criterion.resource_name,ad_group_criterion.status FROM ad_group_criterion WHERE ad_group.id = ${groupId} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED'`);
        if (verified.length !== keywordNames.length || !keywordNames.every(name=>verified.some(row=>row.adGroupCriterion?.resourceName===name&&row.adGroupCriterion.status===target))) throw new GoogleAdsError('GOOGLE_UNKNOWN_OUTCOME','Google keyword status changes were not verified.');
      }
      const configured = budget ? after.campaign.status : target;
      const result: ProviderControlResult = { success:true, provider:'GOOGLE', externalCampaignId:campaign.external_id,previousStatus:before.campaign.status,newStatus:configured,normalizedDeliveryState:configured==='PAUSED'?'PAUSED':'UNKNOWN',modifiedAt:new Date().toISOString() };
      await store.complete(transactionId,result,[],budget?undefined:target,budget?async tx=>{
        await tx.query("UPDATE provider_entities SET metadata=jsonb_set(metadata,$4::text[],$3::jsonb),updated_at=CURRENT_TIMESTAMP WHERE campaign_id=$1 AND provider='GOOGLE' AND external_id=$2",[request.campaignId,campaign.external_id,JSON.stringify(budget.minor_units),[budgetMode==='CAMPAIGN_TOTAL'?'totalBudgetMinor':'dailyBudgetMinor']]);
      }:undefined);
      return result;
    } catch(error) {
      const safe = providerError(error);
      const unknown = (error instanceof ProviderOperationError && error.unknownOutcome) || (mutationStarted && (accepted || safe.code==='GOOGLE_UNKNOWN_OUTCOME' || !(error instanceof GoogleAdsError)));
      let final = unknown ? new GoogleAdsError('GOOGLE_UNKNOWN_OUTCOME','Google control requires reconciliation before another operation.',{errorClass:'UNKNOWN'}) : safe;
      if (store && transactionId) { try { await store.fail(transactionId,unknown,evidence,final.code); } catch { final=new GoogleAdsError('GOOGLE_UNKNOWN_OUTCOME','Google control claim requires reconciliation.',{errorClass:'UNKNOWN'}); } }
      return { success:false,provider:'GOOGLE',externalCampaignId:request.externalCampaignId,previousStatus:'UNKNOWN',newStatus:'UNKNOWN',normalizedDeliveryState:'UNKNOWN',modifiedAt:'',error:final.toProviderError() };
    }
  }
  async pauseCampaign(request: ProviderControlRequest, pool?: any) { return this.control(request,'PAUSE',pool); }
  async resumeCampaign(request: ProviderControlRequest, pool?: any) { return this.control(request,'RESUME',pool); }
  async updateBudget(request: ProviderBudgetUpdateRequest, pool?: any) { return this.control(request,'UPDATE_BUDGET',pool); }

  async fetchAuthoritativeDeliveryTruth(externalCampaignId: string, poolOrClient?: any): Promise<NormalizedDeliveryTruth> {
    try {
      await this.ownedEntities(externalCampaignId, poolOrClient);
      const customerId = this.client.getCustomerId();
      const id = resourceId(externalCampaignId, customerId, 'campaigns');
      const row = oneRow(await this.client.searchStream(customerId, `SELECT campaign.resource_name, campaign.status, campaign.primary_status, campaign.primary_status_reasons FROM campaign WHERE campaign.id = ${id}`), 'campaign').campaign;
      if (row.resourceName !== externalCampaignId) throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH', 'Google returned a different campaign.');
      const truth = GoogleDeliveryReducer.toNormalizedDeliveryTruth(externalCampaignId, { status: row.status, primary_status: row.primaryStatus, primary_status_reasons: row.primaryStatusReasons });
      // M1 certifies paused preparation only. Parent eligibility cannot prove
      // that its descendants are enabled or that the hierarchy is delivering.
      if (row.status === 'PAUSED') return { ...truth, isServingImpressions: false };
      if (row.status === 'REMOVED') return { ...truth, normalizedState: 'NOT_DELIVERING', isLive: false, isServingImpressions: false, reconciliationRequired: false };
      return { ...truth, normalizedState: 'UNKNOWN', isLive: false, isServingImpressions: false, reconciliationRequired: true };
    } catch (error) {
      StructuredLogger.warn('Google delivery observation unavailable', { provider: 'GOOGLE', errorCode: providerError(error).code });
      return { provider: 'GOOGLE', externalCampaignId, normalizedState: 'UNKNOWN', rawStatus: 'UNKNOWN', rawEffectiveStatus: 'UNKNOWN', isLive: false, isServingImpressions: false, lastObservedAt: '', reconciliationRequired: true };
    }
  }

  async reconcileHierarchy(campaignId: number, externalIds: { externalCampaignId?: string; externalContainerId?: string; externalAdId?: string }, poolOrClient?: any): Promise<ProviderReconciliationReport> {
    const unavailable: ProviderReconciliationReport = { campaignId, provider: 'GOOGLE', isConsistent: false, remoteStatus: 'UNKNOWN', localStatus: 'UNKNOWN', normalizedState: 'UNKNOWN', skewDetected: false, autoCorrected: false, auditTimestamp: new Date().toISOString() };
    if (!externalIds.externalCampaignId || !await this.validateHierarchyOwnership(campaignId, externalIds, poolOrClient)) return unavailable;
    try {
      const local = await this.ownedEntities(externalIds.externalCampaignId, poolOrClient, campaignId);
      const campaign = local.find((e: any) => e.entity_type === 'CAMPAIGN' && e.external_id === externalIds.externalCampaignId);
      const group = local.find((e: any) => e.external_id === externalIds.externalContainerId);
      const ad = local.find((e: any) => e.external_id === externalIds.externalAdId);
      const customerId = this.client.getCustomerId();
      const numericId = resourceId(externalIds.externalCampaignId, customerId, 'campaigns');
      const remote = oneRow(await this.client.searchStream(customerId,
        `SELECT campaign.resource_name, campaign.status, campaign.campaign_budget, ad_group.resource_name, ad_group.campaign, ad_group.status, ad_group_ad.resource_name, ad_group_ad.status FROM ad_group_ad WHERE campaign.id = ${numericId}`), 'adGroupAd');
      if (remote.campaign?.resourceName !== externalIds.externalCampaignId || remote.adGroup?.resourceName !== externalIds.externalContainerId || remote.adGroup?.campaign !== externalIds.externalCampaignId || remote.adGroupAd.resourceName !== externalIds.externalAdId ||
          ![remote.campaign?.status, remote.adGroup?.status, remote.adGroupAd.status].every(status => ['PAUSED', 'ENABLED', 'REMOVED'].includes(status))) return unavailable;
      const expectedBudget = campaign.metadata?.budgetResourceName;
      const budgetMode=campaign.metadata?.budgetMode??'DAILY';
      const budgetMinor=budgetMode==='CAMPAIGN_TOTAL'?campaign.metadata?.totalBudgetMinor:campaign.metadata?.dailyBudgetMinor;
      if (!['DAILY','CAMPAIGN_TOTAL'].includes(budgetMode)||!Number.isSafeInteger(budgetMinor) || budgetMinor <= 0) return unavailable;
      const budgetId = resourceId(expectedBudget, customerId, 'campaignBudgets');
      const budget = oneRow(await this.client.searchStream(customerId,
        `SELECT campaign_budget.resource_name, campaign_budget.period, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.explicitly_shared FROM campaign_budget WHERE campaign_budget.id = ${budgetId}`), 'campaignBudget').campaignBudget;
      if (budget.resourceName !== expectedBudget || typeof budget.explicitlyShared !== 'boolean') return unavailable;
      const differences = [
        campaign.configured_status === remote.campaign.status ? null : 'campaign status',
        group.configured_status === remote.adGroup.status ? null : 'ad group status',
        ad.configured_status === remote.adGroupAd.status ? null : 'ad status',
        remote.campaign.campaignBudget === expectedBudget ? null : 'budget association',
        budgetMatches(budget,budgetMode,budgetMinor) ? null : 'budget type or amount',
      ].filter(Boolean);
      const paused = remote.campaign.status === 'PAUSED';
      return { ...unavailable, isConsistent: differences.length === 0, remoteStatus: remote.campaign.status, localStatus: campaign.configured_status, normalizedState: paused ? 'PAUSED' : 'UNKNOWN', skewDetected: differences.length > 0, skewDetails: differences.length ? `Google structural hierarchy drift: ${differences.join(', ')}.` : undefined };
    } catch (error) {
      StructuredLogger.warn('Google reconciliation unavailable', { provider: 'GOOGLE', campaignId, errorCode: providerError(error).code });
      return unavailable;
    }
  }

  async fetchTelemetrySnapshot(externalCampaignId: string, dateWindow: { startDate: string; endDate: string }, poolOrClient?: any): Promise<NormalizedTelemetrySnapshot> {
    const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    if (!validDate(dateWindow.startDate) || !validDate(dateWindow.endDate) || dateWindow.startDate > dateWindow.endDate) throw new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', 'Telemetry requires an ordered calendar date window.', { statusCode: 400, errorClass: 'VALIDATION' });
    
    await this.ownedEntities(externalCampaignId, poolOrClient);
    const customerId = this.client.getCustomerId();
    const id = resourceId(externalCampaignId, customerId, 'campaigns');
    const customer = await this.servingCustomer();
    const rows = await this.client.searchStream(customerId, `SELECT campaign.resource_name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id = ${id} AND segments.date BETWEEN '${dateWindow.startDate}' AND '${dateWindow.endDate}'`);
    if (rows.length === 0) throw new ProviderReportPending('NO_REPORT');
    if (rows.length !== 1 || rows[0]?.campaign?.resourceName !== externalCampaignId) throw new GoogleAdsError('GOOGLE_TELEMETRY_UNAVAILABLE', 'Google did not return an authoritative campaign metrics row.', { statusCode: 503, errorClass: 'UNKNOWN' });
    const metrics = rows[0].metrics;
    for (const key of ['impressions', 'clicks', 'costMicros', 'conversions']) {
      const value = metrics?.[key];
      if ((typeof value !== 'string' && typeof value !== 'number') || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > Number.MAX_SAFE_INTEGER || (key !== 'conversions' && !Number.isSafeInteger(Number(value)))) {
        throw new GoogleAdsError('GOOGLE_TELEMETRY_UNAVAILABLE', 'Google returned missing or invalid metrics; existing observations must be preserved.', { statusCode: 503, errorClass: 'VALIDATION' });
      }
    }
    const snapshot = GoogleTelemetryMapper.normalizeSnapshot(externalCampaignId, { impressions: metrics.impressions, clicks: metrics.clicks, cost_micros: metrics.costMicros, conversions: metrics.conversions }, dateWindow, customer.currencyCode);
    return { ...snapshot, dataFreshness: 'DELAYED', providerMetadata: { raw_cost_micros: metrics.costMicros, source: 'GOOGLE_ADS_API', accountTimeZone: customer.timeZone, dataAsOf:null, conversionDataAvailable:true, ctrUnit: 'RATIO', deliveryIsRealtime: false } };
  }

  async applyDcoDecision(campaignId: number, decision: DcoEvaluationOutput, poolOrClient?: any) {
    return googleDcoStrategy.applyWinnerDecision(campaignId, decision, poolOrClient);
  }
}

export const googleAdsProvider = new GoogleAdsProvider();
providerRegistry.registerProvider(googleAdsProvider);
