import { hasAsciiControl } from '../../intentionalText.js';
/** Authenticated Google Ads transport. No implicit simulation or mutation retries. */
import { GoogleAdsError } from './googleErrors.js';

export const GOOGLE_ADS_API_VERSION = 'v25';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_OPERATIONS = 1000;

export interface GoogleAdsCredentials {
  developerToken?: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  mccCustomerId: string;
  customerId?: string;
}

export interface GoogleResourceMutation {
  resourceName: string;
  operation: 'CREATE' | 'UPDATE' | 'REMOVE';
  payload: Record<string, any>;
  updateMask?: string;
}

const RESOURCE_KINDS = {
  campaignBudgetOperation: { collection: 'campaignBudgets', result: 'campaignBudgetResult', composite: false },
  campaignOperation: { collection: 'campaigns', result: 'campaignResult', composite: false },
  campaignCriterionOperation: { collection: 'campaignCriteria', result: 'campaignCriterionResult', composite: true },
  adGroupOperation: { collection: 'adGroups', result: 'adGroupResult', composite: false },
  adGroupCriterionOperation: { collection: 'adGroupCriteria', result: 'adGroupCriterionResult', composite: true },
  adGroupAdOperation: { collection: 'adGroupAds', result: 'adGroupAdResult', composite: true },
  campaignAssetOperation: { collection: 'campaignAssets', result: 'campaignAssetResult', composite: true },
  assetOperation: { collection: 'assets', result: 'assetResult', composite: false }
} as const;
type OperationKind = keyof typeof RESOURCE_KINDS;
type ResourceAction =
  | { create: Record<string, unknown>; update?: never; remove?: never; updateMask?: never }
  | { update: Record<string, unknown>; updateMask: string; create?: never; remove?: never }
  | { remove: string; create?: never; update?: never; updateMask?: never };
export type GoogleMutateOperation = {
  [K in OperationKind]: Record<K, ResourceAction> & Partial<Record<Exclude<OperationKind, K>, never>>
}[OperationKind];
export interface GoogleMutationResult {
  results: Array<{ resourceName: string }>;
  requestId?: string;
}
export interface GoogleGeoTarget {
  resourceName: string;
  name: string;
  canonicalName: string;
  countryCode: string;
  targetType: string;
}
type RequestKind = 'oauth' | 'read' | 'mutation' | 'validation';
const isObject = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = (message: string) => new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', message, {
  statusCode: 400, errorClass: 'VALIDATION'
});

/** Customer IDs are configuration, never inferred from a campaign or an MCC fallback. */
export function normalizeGoogleCustomerId(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:\d{10}|\d{3}-\d{3}-\d{4})$/.test(value.trim())) {
    throw new GoogleAdsError('GOOGLE_MISSING_CUSTOMER', 'A valid ten-digit Google Ads customer ID is required.', {
      statusCode: 400, errorClass: 'VALIDATION'
    });
  }
  return value.trim().replace(/-/g, '');
}

export class GoogleAdsClient {
  private readonly credentials: GoogleAdsCredentials;
  private readonly fetchTransport: typeof fetch;
  private readonly timeoutMs: number;
  private readonly conversionUploadsEnabled: boolean;
  private tokenExpiryTime = 0;
  private cachedAccessToken: string | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(credentials: Partial<GoogleAdsCredentials> = {}, options: { fetch?: typeof fetch; timeoutMs?: number; conversionUploadsEnabled?: boolean } = {}) {
    this.credentials = {
      developerToken: credentials.developerToken ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      clientId: credentials.clientId ?? process.env.GOOGLE_ADS_CLIENT_ID ?? '',
      clientSecret: credentials.clientSecret ?? process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
      refreshToken: credentials.refreshToken ?? process.env.GOOGLE_ADS_REFRESH_TOKEN ?? '',
      mccCustomerId: credentials.mccCustomerId ?? process.env.GOOGLE_ADS_MCC_CUSTOMER_ID ?? '',
      customerId: credentials.customerId ?? process.env.GOOGLE_ADS_CUSTOMER_ID
    };
    this.fetchTransport = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 15000;
    // The legacy scheduler is not a canonical booking-conversion authority. M4 must replace it.
    this.conversionUploadsEnabled = options.conversionUploadsEnabled === true;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60000) {
      throw invalid('Google Ads timeout must be between 1 and 60000 milliseconds.');
    }
  }

  public getCustomerId(): string {
    const customerId = normalizeGoogleCustomerId(this.credentials.customerId);
    if (customerId === normalizeGoogleCustomerId(this.credentials.mccCustomerId)) {
      throw invalid('The configured Google Ads serving account must be distinct from its manager account.');
    }
    return customerId;
  }

  private assertCredentials(): void {
    for (const key of ['clientId', 'clientSecret', 'refreshToken'] as const) {
      const value = this.credentials[key];
      if (typeof value !== 'string' || !value.trim() || value.length > 8192 || /[\r\n]/.test(value)) {
        throw new GoogleAdsError('GOOGLE_CONFIGURATION_REQUIRED', 'Google Ads OAuth credentials are not fully configured.', {
          statusCode: 503, errorClass: 'AUTHENTICATION'
        });
      }
    }
    normalizeGoogleCustomerId(this.credentials.mccCustomerId);
  }

  /** Reading a manager proves this read only; it does not prove campaign-write permission. */
  public async validateMasterCredentials(): Promise<{
    isValid: boolean;
    mccCustomerId: string;
    permissions: string[];
    customer: { resourceName: string; id: string; manager: boolean; currencyCode?: string; descriptiveName?: string };
  }> {
    this.assertCredentials();
    const mccCustomerId = normalizeGoogleCustomerId(this.credentials.mccCustomerId);
    const rows = await this.searchStream(mccCustomerId,
      'SELECT customer.resource_name, customer.id, customer.manager, customer.currency_code, customer.descriptive_name FROM customer LIMIT 1');
    const customer = rows.length === 1 ? rows[0]?.customer : null;
    if (!isObject(customer) || String(customer.id) !== mccCustomerId || customer.manager !== true ||
        customer.resourceName !== `customers/${mccCustomerId}`) {
      throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH', 'Google did not confirm the configured manager account identity.', {
        statusCode: 403, errorClass: 'AUTHENTICATION'
      });
    }
    return { isValid: true, mccCustomerId, permissions: ['REPORTING'], customer: {
      resourceName: customer.resourceName, id: mccCustomerId, manager: true,
      ...(typeof customer.currencyCode === 'string' ? { currencyCode: customer.currencyCode } : {}),
      ...(typeof customer.descriptiveName === 'string' ? { descriptiveName: customer.descriptiveName } : {})
    } };
  }

  public async getFreshAccessToken(): Promise<string> {
    this.assertCredentials();
    if (this.cachedAccessToken && Date.now() < this.tokenExpiryTime - 60000) return this.cachedAccessToken;
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = this.exchangeAccessToken();
    try { return await this.tokenRequest; } finally { this.tokenRequest = null; }
  }

  private async exchangeAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.credentials.clientId, client_secret: this.credentials.clientSecret,
      refresh_token: this.credentials.refreshToken, grant_type: 'refresh_token'
    });
    const { data } = await this.requestJson('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString()
    }, 'oauth');
    if (!isObject(data) || typeof data.access_token !== 'string' || !data.access_token ||
        /[\r\n]/.test(data.access_token) || data.access_token.length > 16384 ||
        typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0 ||
        data.expires_in > 86400) {
      throw new GoogleAdsError('GOOGLE_AUTH_EXPIRED', 'Google OAuth returned an invalid token response.', {
        statusCode: 502, errorClass: 'AUTHENTICATION'
      });
    }
    this.cachedAccessToken = data.access_token;
    this.tokenExpiryTime = Date.now() + data.expires_in * 1000;
    return this.cachedAccessToken;
  }

  public async searchStream(customerId: string, gaqlQuery: string): Promise<any[]> {
    const customer = normalizeGoogleCustomerId(customerId);
    if (typeof gaqlQuery !== 'string' || !gaqlQuery.trim() || gaqlQuery.length > 100000) {
      throw invalid('A bounded Google Ads query is required.');
    }
    const { data, requestId } = await this.adsRequest(customer, 'googleAds:searchStream', { query: gaqlQuery }, 'read');
    if (!Array.isArray(data)) throw this.invalidResponse('read', requestId);
    const results: any[] = [];
    for (const batch of data) {
      if (!isObject(batch) || batch.error || (batch.results !== undefined && !Array.isArray(batch.results))) {
        throw this.invalidResponse('read', requestId);
      }
      for (const row of batch.results ?? []) {
        if (!isObject(row)) throw this.invalidResponse('read', requestId);
        results.push(row);
      }
    }
    return results;
  }

  /** Public targeting metadata only. IDs and labels always originate from Google. */
  public async suggestGeoTargets(input: { names?: string[]; resourceNames?: string[]; countryCode?: string }): Promise<GoogleGeoTarget[]> {
    const names = input.names;
    const resources = input.resourceNames;
    if (!!names === !!resources || names && (!Array.isArray(names) || names.length < 1 || names.length > 25 || names.some(name => typeof name !== 'string' || name.trim().length < 2 || name.length > 100 || hasAsciiControl(name, true))) ||
        resources && (!Array.isArray(resources) || resources.length < 1 || resources.length > 25 || resources.some(name => typeof name !== 'string' || !/^geoTargetConstants\/[1-9]\d{0,19}$/.test(name))) ||
        input.countryCode !== undefined && !/^[A-Z]{2}$/.test(input.countryCode)) throw invalid('Choose a bounded location search or a list of Google location resources.');
    const token = await this.getFreshAccessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'login-customer-id': normalizeGoogleCustomerId(this.credentials.mccCustomerId), 'Content-Type': 'application/json' };
    if (this.credentials.developerToken) headers['developer-token'] = this.credentials.developerToken;
    const { data, requestId } = await this.requestJson(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/geoTargetConstants:suggest`, {
      method: 'POST', headers, body: JSON.stringify({ locale: 'en', ...(input.countryCode ? { countryCode: input.countryCode } : {}),
        ...(names ? { locationNames: { names: names.map(name => name.trim()) } } : { geoTargets: { geoTargetConstants: resources } }) })
    }, 'read');
    if (!isObject(data) || data.error || data.geoTargetConstantSuggestions !== undefined && !Array.isArray(data.geoTargetConstantSuggestions)) throw this.invalidResponse('read', requestId);
    const suggestions = data.geoTargetConstantSuggestions ?? [];
    if (suggestions.length > 1000) throw this.invalidResponse('read', requestId);
    const result = new Map<string, GoogleGeoTarget>();
    for (const item of suggestions) {
      const geo = item?.geoTargetConstant;
      if (!isObject(geo) || typeof geo.resourceName !== 'string' || !/^geoTargetConstants\/[1-9]\d{0,19}$/.test(geo.resourceName)) throw this.invalidResponse('read', requestId);
      if (geo.status !== 'ENABLED') continue;
      if (['name', 'canonicalName', 'targetType'].some(key => typeof geo[key] !== 'string' || !geo[key].trim() || geo[key].length > 500 || hasAsciiControl(geo[key], true)) || typeof geo.countryCode !== 'string' || !/^[A-Z]{2}$/.test(geo.countryCode)) throw this.invalidResponse('read', requestId);
      if (resources && !resources.includes(geo.resourceName) || input.countryCode && input.countryCode !== geo.countryCode) throw this.invalidResponse('read', requestId);
      const value = { resourceName: geo.resourceName, name: geo.name, canonicalName: geo.canonicalName, countryCode: geo.countryCode, targetType: geo.targetType };
      if (result.has(value.resourceName) && JSON.stringify(result.get(value.resourceName)) !== JSON.stringify(value)) throw this.invalidResponse('read', requestId);
      result.set(value.resourceName, value);
    }
    return [...result.values()];
  }

  /** Bounded read-only research, always scoped to the configured serving customer. */
  public async generateKeywordIdeas(input:{canonicalUrl:string;keywords:string[];geoTargetConstants:string[];languageConstant:string}):Promise<unknown> {
    let url:URL;try{url=new URL(input.canonicalUrl);}catch{throw invalid('A canonical property URL is required.');}
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!/^\/stay\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)||
      !Array.isArray(input.keywords)||input.keywords.length>20||input.keywords.some(v=>typeof v!=='string'||v.length<2||v.length>80||hasAsciiControl(v))||
      !Array.isArray(input.geoTargetConstants)||input.geoTargetConstants.length<1||input.geoTargetConstants.length>20||input.geoTargetConstants.some(v=>!/^geoTargetConstants\/[1-9]\d{0,19}$/.test(v))||!/^languageConstants\/[1-9]\d{0,19}$/.test(input.languageConstant))throw invalid('Bounded canonical keyword research parameters are required.');
    const seed=input.keywords.length?{keywordAndUrlSeed:{url:url.href,keywords:input.keywords}}:{urlSeed:{url:url.href}};
    const {data}=await this.adsRequest(this.getCustomerId(),':generateKeywordIdeas',{language:input.languageConstant,geoTargetConstants:input.geoTargetConstants,
      includeAdultKeywords:false,keywordPlanNetwork:'GOOGLE_SEARCH',pageSize:100,...seed},'read');
    return data;
  }

  public async mutateOperations(customerId: string, operations: GoogleMutateOperation[], options: { validateOnly?: boolean } = {}): Promise<GoogleMutationResult> {
    const customer = normalizeGoogleCustomerId(customerId);
    if (customer !== this.getCustomerId()) throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH', 'Google mutations must use the configured serving account.', {
      statusCode: 403, errorClass: 'AUTHENTICATION'
    });
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > MAX_OPERATIONS) {
      throw invalid(`Google Ads mutations require between 1 and ${MAX_OPERATIONS} operations.`);
    }
    const kinds = operations.map(operation => this.validateOperation(customer, operation));
    if (options.validateOnly !== undefined && typeof options.validateOnly !== 'boolean') throw invalid('validateOnly must be a boolean.');
    const requestKind = options.validateOnly ? 'validation' : 'mutation';
    const { data, requestId } = await this.adsRequest(customer, 'googleAds:mutate', {
      mutateOperations: operations, partialFailure: false, validateOnly: options.validateOnly === true,
      responseContentType: 'RESOURCE_NAME_ONLY'
    }, requestKind);
    if (!isObject(data) || data.error || (data.partialFailureError && Object.keys(data.partialFailureError).length > 0)) {
      throw this.invalidResponse(requestKind, requestId);
    }
    if (options.validateOnly) {
      if (data.mutateOperationResponses !== undefined && (!Array.isArray(data.mutateOperationResponses) || data.mutateOperationResponses.length !== 0)) {
        throw this.invalidResponse(requestKind, requestId);
      }
      return { results: [], ...(requestId ? { requestId } : {}) };
    }
    if (!Array.isArray(data.mutateOperationResponses) || data.mutateOperationResponses.length !== kinds.length) {
      throw this.invalidResponse('mutation', requestId);
    }
    const results = data.mutateOperationResponses.map((response: unknown, index: number) => {
      const expected = RESOURCE_KINDS[kinds[index]];
      if (!isObject(response) || Object.keys(response).length !== 1 || !isObject(response[expected.result])) {
        throw this.invalidResponse('mutation', requestId);
      }
      const resourceName = response[expected.result].resourceName;
      if (!this.isResourceName(resourceName, customer, kinds[index], false)) throw this.invalidResponse('mutation', requestId);
      const action = (operations[index] as any)[kinds[index]];
      const existingName = action.update?.resourceName ?? action.remove;
      if (existingName && existingName !== resourceName) throw this.invalidResponse('mutation', requestId);
      return { resourceName };
    });
    return { results, ...(requestId ? { requestId } : {}) };
  }

  /** Compatibility adapter with explicit resource-path mapping; ambiguous shapes fail before HTTP. */
  public async mutate(customerId: string, mutations: GoogleResourceMutation[]): Promise<GoogleMutationResult> {
    const customer = normalizeGoogleCustomerId(customerId);
    if (!Array.isArray(mutations) || !mutations.length) throw invalid('Google Ads mutations are required.');
    const operations = mutations.map((mutation): GoogleMutateOperation => {
      if (!mutation || typeof mutation.resourceName !== 'string' || !isObject(mutation.payload)) throw invalid('Invalid legacy Google mutation.');
      const match = /^customers\/(\d{10})\/([A-Za-z]+)(?:\/(-?\d+(?:~-?\d+)?))?$/.exec(mutation.resourceName);
      const kind = (Object.keys(RESOURCE_KINDS) as OperationKind[]).find(key => RESOURCE_KINDS[key].collection === match?.[2]);
      if (!match || match[1] !== customer || !kind) throw invalid('Unsupported Google resource path.');
      let action: ResourceAction;
      if (mutation.operation === 'CREATE') {
        const payload = { ...mutation.payload };
        if (match[3]) {
          if (payload.resourceName && payload.resourceName !== mutation.resourceName) throw invalid('Conflicting Google resource names.');
          payload.resourceName = mutation.resourceName;
        }
        action = { create: payload };
      } else if (mutation.operation === 'UPDATE') {
        if (mutation.payload.resourceName && mutation.payload.resourceName !== mutation.resourceName) throw invalid('Conflicting Google resource names.');
        action = { update: { ...mutation.payload, resourceName: mutation.resourceName }, updateMask: mutation.updateMask! };
      } else if (mutation.operation === 'REMOVE') {
        if (Object.keys(mutation.payload).length) throw invalid('Google remove operations accept only a resource name.');
        action = { remove: mutation.resourceName };
      } else throw invalid('Unsupported Google mutation action.');
      switch (kind) {
        case 'campaignBudgetOperation': return { campaignBudgetOperation: action };
        case 'campaignOperation': return { campaignOperation: action };
        case 'campaignCriterionOperation': return { campaignCriterionOperation: action };
        case 'adGroupOperation': return { adGroupOperation: action };
        case 'adGroupCriterionOperation': return { adGroupCriterionOperation: action };
        case 'adGroupAdOperation': return { adGroupAdOperation: action };
        case 'assetOperation': return { assetOperation: action };
        case 'campaignAssetOperation': return { campaignAssetOperation: action };
      }
    });
    return this.mutateOperations(customer, operations);
  }

  public async uploadClickConversions(customerId: string, conversions: any[]): Promise<any> {
    if (!this.conversionUploadsEnabled) throw new GoogleAdsError('GOOGLE_MUTATION_FAILED',
      'Conversion uploads are unavailable until the canonical booking conversion integration is enabled.', {
        statusCode: 403, errorClass: 'POLICY', isRetryable: false
      });
    const customer = normalizeGoogleCustomerId(customerId);
    if (customer !== this.getCustomerId()) throw new GoogleAdsError('GOOGLE_OWNERSHIP_MISMATCH', 'Google conversion uploads must use the configured serving account.', {
      statusCode: 403, errorClass: 'AUTHENTICATION'
    });
    if (!Array.isArray(conversions) || conversions.length < 1 || conversions.length > 2000 || conversions.some(c => !isObject(c))) {
      throw invalid('Google conversion uploads require between 1 and 2000 conversion objects.');
    }
    const { data, requestId } = await this.adsRequest(customer, ':uploadClickConversions', { conversions, partialFailure: true }, 'mutation');
    if (!isObject(data) || data.error) throw this.invalidResponse('mutation', requestId);
    // Never let a legacy caller mark the whole batch successful after per-item rejection.
    if (data.partialFailureError && Object.keys(data.partialFailureError).length > 0) {
      throw new GoogleAdsError('GOOGLE_PARTIAL_FAILURE', 'Google rejected one or more conversion uploads; reconcile individual results before retrying.', {
        statusCode: 422, errorClass: 'VALIDATION', isRetryable: false,
        details: { ...(requestId ? { requestId } : {}), submittedCount: conversions.length }
      });
    }
    if (!Array.isArray(data.results) || data.results.length !== conversions.length || data.results.some((row: unknown) =>
      !isObject(row) || typeof row.conversionAction !== 'string' || typeof row.conversionDateTime !== 'string')) {
      throw this.invalidResponse('mutation', requestId);
    }
    return data;
  }

  private validateOperation(customer: string, operation: unknown): OperationKind {
    if (!isObject(operation) || Object.keys(operation).length !== 1) throw invalid('Each Google mutation must specify exactly one supported resource operation.');
    const kind = Object.keys(operation)[0] as OperationKind;
    if (!Object.hasOwn(RESOURCE_KINDS, kind)) throw invalid('Unsupported Google resource operation.');
    const action = operation[kind];
    if (!isObject(action)) throw invalid('Invalid Google mutation action.');
    const verbs = ['create', 'update', 'remove'].filter(verb => Object.hasOwn(action, verb));
    if (verbs.length !== 1 || Object.keys(action).some(key => !['create', 'update', 'remove', 'updateMask'].includes(key))) throw invalid('Invalid Google mutation action.');
    const verb = verbs[0];
    if (verb === 'remove') {
      if (action.updateMask !== undefined || !this.isResourceName(action.remove, customer, kind, false)) throw invalid('Invalid Google removal resource name.');
    } else {
      if (!isObject(action[verb]) || !Object.keys(action[verb]).length) throw invalid('A Google resource payload is required.');
      const name = action[verb].resourceName;
      if ((verb === 'update' || name !== undefined) && !this.isResourceName(name, customer, kind, verb === 'create')) throw invalid('Invalid Google mutation resource name.');
      if (verb === 'update') {
        if (typeof action.updateMask !== 'string' || !/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)*(?:,[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)*)*$/.test(action.updateMask)) {
          throw invalid('Google updates require an explicit field mask.');
        }
      } else if (action.updateMask !== undefined) throw invalid('A create operation cannot contain an update mask.');
    }
    return kind;
  }

  private isResourceName(value: unknown, customer: string, kind: OperationKind, allowTemporary: boolean): value is string {
    const resource = RESOURCE_KINDS[kind];
    const id = allowTemporary ? '-?[1-9]\\d{0,19}' : '[1-9]\\d{0,19}';
    const suffix=kind==='campaignAssetOperation'?`${id}~${id}~(?:SITELINK|AD_IMAGE|13|26)`: `${id}${resource.composite ? `~${id}` : ''}`;
    return typeof value === 'string' && new RegExp(`^customers/${customer}/${resource.collection}/${suffix}$`).test(value);
  }

  private async adsRequest(customer: string, method: string, payload: unknown, kind: RequestKind): Promise<{ data: any; requestId?: string }> {
    let body: string;
    try { body = JSON.stringify(payload); } catch { throw invalid('Google request payload must be JSON serializable.'); }
    if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) throw invalid('Google request exceeds the permitted payload size.');
    const token = await this.getFreshAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`, 'login-customer-id': normalizeGoogleCustomerId(this.credentials.mccCustomerId), 'Content-Type': 'application/json'
    };
    // Optional since the September 2026 Cloud-project access migration. Never a readiness prerequisite.
    if (this.credentials.developerToken) headers['developer-token'] = this.credentials.developerToken;
    const separator = method.startsWith(':') ? '' : '/';
    return this.requestJson(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customer}${separator}${method}`, {
      method: 'POST', headers, body
    }, kind);
  }

  private invalidResponse(kind: RequestKind, requestId?: string): GoogleAdsError {
    return new GoogleAdsError(kind === 'mutation' ? 'GOOGLE_UNKNOWN_OUTCOME' : 'GOOGLE_INVALID_RESPONSE',
      kind === 'mutation' ? 'Google mutation outcome is unverified; reconcile before another submission.' : 'Google returned an invalid response.', {
        statusCode: 502, errorClass: 'UNKNOWN', isRetryable: false, details: { operation: kind, ...(requestId ? { requestId } : {}) }
      });
  }

  private httpError(status: number, kind: RequestKind, requestId?: string): GoogleAdsError {
    const details = { httpStatus: status, operation: kind, ...(requestId ? { requestId } : {}) };
    if (kind === 'mutation' && (status >= 500 || status === 408)) return new GoogleAdsError('GOOGLE_UNKNOWN_OUTCOME',
      'Google mutation outcome is unknown; reconcile before another submission.', { statusCode: status, errorClass: 'UNKNOWN', isRetryable: false, details });
    if (status === 403 && kind !== 'oauth') return new GoogleAdsError('GOOGLE_ACCESS_DENIED',
      'Google rejected account or API access. Check the project access level, account permissions and manager relationship.', { statusCode: status, errorClass: 'AUTHENTICATION', details });
    if (kind === 'oauth' || status === 401) return new GoogleAdsError('GOOGLE_AUTH_REJECTED',
      'Google rejected authentication. The response alone does not establish token expiry.', { statusCode: status, errorClass: 'AUTHENTICATION', details });
    if (status === 429) return new GoogleAdsError('GOOGLE_RATE_LIMIT', 'Google Ads rate limit reached.', {
      statusCode: status, errorClass: 'RATE_LIMIT', isRetryable: kind === 'read' || kind === 'validation', details
    });
    if (status >= 500) return new GoogleAdsError('GOOGLE_HTTP_5XX', 'Google Ads is temporarily unavailable.', {
      statusCode: status, errorClass: 'UNKNOWN', isRetryable: true, details
    });
    return new GoogleAdsError('GOOGLE_INVALID_ARGUMENT', 'Google rejected the request; review its configuration.', {
      statusCode: status, errorClass: 'VALIDATION', details
    });
  }

  private async requestJson(url: string, init: RequestInit, kind: RequestKind): Promise<{ data: any; requestId?: string }> {
    const controller = new AbortController();
    let timedOut = false;
    let requestId: string | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('timeout')); }, this.timeoutMs);
    });
    try {
      return await Promise.race([deadline, (async () => {
        const response = await this.fetchTransport(url, { ...init, redirect: 'error', signal: controller.signal });
        const candidateId = response.headers.get('request-id');
        if (candidateId && /^[A-Za-z0-9_-]{1,128}$/.test(candidateId)) requestId = candidateId;
        if (!response.ok) throw this.httpError(response.status, kind, requestId);
        if (response.status !== 200) throw this.invalidResponse(kind, requestId);
        if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw this.invalidResponse(kind, requestId);
        if (!response.body) throw this.invalidResponse(kind, requestId);
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw this.invalidResponse(kind, requestId); }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
        let data: unknown;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw this.invalidResponse(kind, requestId); }
        return { data, ...(requestId ? { requestId } : {}) };
      })()]);
    } catch (error) {
      if (error instanceof GoogleAdsError) throw error;
      // Do not include transport exception text: it can contain headers, URLs, tokens or provider PII.
      const details = { operation: kind, ...(requestId ? { requestId } : {}) };
      if (kind === 'mutation') throw new GoogleAdsError('GOOGLE_UNKNOWN_OUTCOME', 'Google mutation response was lost; reconcile before another submission.', {
        statusCode: 502, errorClass: 'UNKNOWN', isRetryable: false, details
      });
      throw new GoogleAdsError(timedOut ? 'GOOGLE_TIMEOUT' : 'GOOGLE_HTTP_5XX',
        timedOut ? 'Google request exceeded its deadline.' : 'Google request could not be completed.', {
          statusCode: timedOut ? 504 : 502, errorClass: timedOut ? 'TIMEOUT' : 'UNKNOWN', isRetryable: true, details
        });
    } finally { clearTimeout(timer!); controller.abort(); }
  }
}

export const googleAdsClient = new GoogleAdsClient();
