import { createHmac } from 'node:crypto';
import type { ProviderError } from '../types.js';
export const META_ADS_API_VERSION = 'v26.0';
export interface MetaAdsCredentials {
    accessToken: string;
    appSecret: string;
    accountId: string;
    pageId: string;
    pixelId: string;
    instagramId?: string;
}
export class MetaAdsError extends Error {
    constructor(public readonly code: string, message: string, public readonly unknownOutcome = false, public readonly details: Record<string, unknown> = {}) { super(message); this.name = 'MetaAdsError'; }
    toProviderError(): ProviderError { return { provider: 'META', code: this.code, message: this.message, isRetryable: false, errorClass: this.unknownOutcome ? 'UNKNOWN' : 'VALIDATION', details: this.details }; }
}
export function metaId(value: unknown): string {
    if (typeof value !== 'string' || !/^[1-9]\d{0,29}$/.test(value))
        throw new MetaAdsError('META_INVALID_ID', 'Meta requires a provider-issued numeric identity.');
    return value;
}
export class MetaAdsClient {
    private readonly credentials: MetaAdsCredentials;
    private readonly transport: typeof fetch;
    private readonly timeoutMs: number;
    constructor(credentials: Partial<MetaAdsCredentials> = {}, options: {
        fetch?: typeof fetch;
        timeoutMs?: number;
    } = {}) {
        this.credentials = {
            accessToken: credentials.accessToken ?? process.env.META_ACCESS_TOKEN ?? process.env.META_API_TOKEN ?? '',
            appSecret: credentials.appSecret ?? process.env.META_APP_SECRET ?? '',
            accountId: credentials.accountId ?? process.env.META_AD_ACCOUNT_ID ?? '',
            pageId: credentials.pageId ?? process.env.META_PAGE_ID ?? '', pixelId: credentials.pixelId ?? process.env.META_PIXEL_ID ?? '',
            instagramId: credentials.instagramId ?? process.env.META_INSTAGRAM_ACCOUNT_ID
        };
        this.transport = options.fetch ?? globalThis.fetch.bind(globalThis);
        this.timeoutMs = options.timeoutMs ?? 15000;
        if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60000)
            throw new MetaAdsError('META_INVALID_ARGUMENT', 'Invalid provider deadline.');
    }
    identity() {
        if (!this.credentials.accessToken || !this.credentials.appSecret || /[\r\n]/.test(this.credentials.accessToken))
            throw new MetaAdsError('META_CONFIGURATION_REQUIRED', 'Meta server credentials are not fully configured.');
        return { accountId: `act_${metaId(this.credentials.accountId.replace(/^act_/, ''))}`, pageId: metaId(this.credentials.pageId),
            pixelId: metaId(this.credentials.pixelId), ...(this.credentials.instagramId ? { instagramId: metaId(this.credentials.instagramId) } : {}) };
    }
    async get(path: string, parameters: Record<string, unknown> = {}): Promise<any> { return this.request('GET', path, parameters); }
    async post(path: string, parameters: Record<string, unknown>): Promise<any> { return this.request('POST', path, parameters); }
    private async request(method: 'GET' | 'POST', path: string, parameters: Record<string, unknown>): Promise<any> {
        const identity = this.identity();
        const geoSearch = method === 'GET' && path === 'search' && parameters.type === 'adgeolocation';
        if (!geoSearch && !/^(?:act_)?[1-9]\d{0,29}(?:\/(?:campaigns|adsets|adcreatives|ads|advideos|adspixels|insights|delivery_estimate))?$/.test(path))
            throw new MetaAdsError('META_INVALID_ARGUMENT', 'Unsupported Meta resource path.');
        if (path.endsWith('/delivery_estimate') && method !== 'GET') throw new MetaAdsError('META_INVALID_ARGUMENT', 'Geography validation is read-only.');
        if (path.startsWith('act_') && path.split('/')[0] !== identity.accountId)
            throw new MetaAdsError('META_OWNERSHIP_MISMATCH', 'Meta requests must use the configured ad account.');
        const body = new URLSearchParams();
        for (const [key, value] of Object.entries(parameters)) {
            if (/token|secret|authorization/i.test(key))
                throw new MetaAdsError('META_INVALID_ARGUMENT', 'Credential parameters cannot be supplied by a provider request.');
            body.set(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
        body.set('appsecret_proof', createHmac('sha256', this.credentials.appSecret).update(this.credentials.accessToken).digest('hex'));
        if (Buffer.byteLength(body.toString()) > 2000000)
            throw new MetaAdsError('META_INVALID_ARGUMENT', 'Meta request is too large.');
        const base = `https://graph.facebook.com/${META_ADS_API_VERSION}/${path}`;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        let traceId: string | undefined;
        try {
            return await Promise.race([new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('deadline')); }, this.timeoutMs); }), (async () => {
                    const response = await this.transport(method === 'GET' ? `${base}?${body}` : base, {
                        method, redirect: 'error', signal: controller.signal,
                        headers: { Authorization: `Bearer ${this.credentials.accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                        ...(method === 'POST' ? { body: body.toString() } : {})
                    });
                    const trace = response.headers.get('x-fb-trace-id');
                    if (trace && /^[a-zA-Z0-9_-]{1,128}$/.test(trace))
                        traceId = trace;
                    const unknown = method === 'POST' && (response.status >= 500 || response.status === 408);
                    if (!response.ok)
                        throw new MetaAdsError(unknown ? 'META_UNKNOWN_OUTCOME' : 'META_REQUEST_REJECTED', unknown ? 'Meta write requires reconciliation.' : 'Meta rejected the operation.', unknown, { httpStatus: response.status, ...(traceId ? { traceId } : {}) });
                    if (response.status !== 200 || !response.body || Number(response.headers.get('content-length')) > 8000000)
                        throw new Error('invalid-response');
                    const reader = response.body.getReader();
                    const chunks: Uint8Array[] = [];
                    let bytes = 0;
                    try {
                        while (true) {
                            const part = await reader.read();
                            if (part.done)
                                break;
                            bytes += part.value.byteLength;
                            if (bytes > 8000000) {
                                await reader.cancel();
                                throw new Error('limit');
                            }
                            chunks.push(part.value);
                        }
                    }
                    finally {
                        reader.releaseLock();
                    }
                    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    if (!data || typeof data !== 'object' || Array.isArray(data))
                        throw new Error('invalid-response');
                    if (data.error)
                        throw new MetaAdsError('META_REQUEST_REJECTED', 'Meta rejected the operation.', false, { ...(traceId ? { traceId } : {}) });
                    return data;
                })()]);
        }
        catch (error) {
            if (error instanceof MetaAdsError)
                throw error;
            throw new MetaAdsError(method === 'POST' ? 'META_UNKNOWN_OUTCOME' : 'META_READ_UNAVAILABLE', method === 'POST' ? 'Meta write response is unverified; reconcile before retrying.' : 'Meta read could not be verified.', method === 'POST', { ...(traceId ? { traceId } : {}) });
        }
        finally {
            clearTimeout(timer!);
            controller.abort();
        }
    }
}
export const metaAdsClient = new MetaAdsClient();
