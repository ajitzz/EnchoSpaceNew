import { get, del, keys, update } from 'idb-keyval';
import { z } from 'zod';

/**
 * Local-First Sync Service
 * Abstracts fetching logic to fetch from offline cache first (if offline or slow),
 * then updates with fresh network data. For mutations, queues them when offline.
 */

const ACTOR_STORAGE_PREFIX = 'encho:v2:actor:';
const PUBLIC_CACHE_PREFIX = 'encho:v2:public:cache:';
const LEGACY_SYNC_QUEUE_KEY = 'offline_sync_queue';
const QUEUE_VERSION = 2 as const;
export const OFFLINE_MUTATION_COMMITTED_EVENT = 'encho:offline-mutation-committed';
const REPLAY_LEASE_MS = 60_000;
const REPLAY_LEASE_RENEW_MS = 20_000;
const MAX_OFFLINE_QUEUE_ITEMS = 100;
const MAX_OFFLINE_BODY_BYTES = 64 * 1024;

const actorIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9:_-]+$/);
const persistedHeaderSchema = z.record(z.string(), z.string());
const replayLeaseSchema = z.object({
    ownerId: z.string().min(1).max(128),
    expiresAt: z.number().int().nonnegative(),
}).strict();

const SAFE_PERSISTED_HEADERS = new Set([
    'accept',
    'content-type',
    'idempotency-key',
    'x-idempotency-key',
    'x-request-id',
]);

const LEGACY_PRIVATE_CACHE_PREFIXES = [
    'wishlists_',
    'experience_wishlists_',
    'bookings_',
    'experience_bookings_',
    'threads_',
    'messages_',
    'cached_campaigns',
];
const SENSITIVE_PERSISTED_BODY_KEY = /^(?:authorization|cookie|password|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key)$/i;

function containsSensitivePersistedKey(value: unknown, seen = new WeakSet<object>(), depth = 0): boolean {
    if (value === null || typeof value !== 'object') return false;
    if (depth > 20) return true;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some(item => containsSensitivePersistedKey(item, seen, depth + 1));
    return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
        SENSITIVE_PERSISTED_BODY_KEY.test(key) || containsSensitivePersistedKey(child, seen, depth + 1));
}

function readStoredActorId(): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const rawUser = localStorage.getItem('user');
        if (!rawUser) return null;
        const parsed = z.object({ id: z.union([z.string(), z.number()]) }).passthrough().safeParse(JSON.parse(rawUser));
        if (!parsed.success) return null;
        const actorId = String(parsed.data.id);
        const validated = actorIdSchema.safeParse(actorId);
        return validated.success ? validated.data : null;
    } catch {
        return null;
    }
}

function readStoredToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        return localStorage.getItem('token');
    } catch {
        return null;
    }
}

interface ActorSession { actorId: string; token: string }

function readActorSession(): ActorSession | null {
    const actorId = readStoredActorId();
    const token = readStoredToken();
    return actorId && token ? { actorId, token } : null;
}

function isCurrentSession(session: ActorSession | null): boolean {
    return session !== null && readStoredActorId() === session.actorId && readStoredToken() === session.token;
}

/** Only reviewed, idempotent, non-financial domains may use browser retry. */
function isLocalApiPath(url: string): boolean {
    return url.startsWith('/api/') && !url.includes('\\')
        && !Array.from(url).some(character => character.charCodeAt(0) <= 32);
}

function supportsOfflineReplay(url: string, method: string, body?: unknown): boolean {
    if (method === 'POST' && /^\/api\/(?:experience-)?wishlists$/.test(url)) return true;
    if (method === 'DELETE' && /^\/api\/wishlists\/[A-Za-z0-9_-]+(?:\?roomId=[A-Za-z0-9_-]+)?$/.test(url)) return true;
    if (method === 'DELETE' && /^\/api\/experience-wishlists\/[A-Za-z0-9_-]+$/.test(url)) return true;
    return method === 'POST' && /^\/api\/threads\/[1-9][0-9]*\/messages$/.test(url)
        && z.object({ clientEventId: z.string().uuid() }).passthrough().safeParse(body).success;
}

function normalizedActorId(actorId: string | number): string {
    return actorIdSchema.parse(String(actorId));
}

export function actorQueueKey(actorId: string | number): string {
    return `${ACTOR_STORAGE_PREFIX}${normalizedActorId(actorId)}:queue`;
}

function actorCacheKey(actorId: string | number, cacheKey: string): string {
    return `${ACTOR_STORAGE_PREFIX}${normalizedActorId(actorId)}:cache:${cacheKey}`;
}

function actorReplayLeaseKey(actorId: string | number): string {
    return `${ACTOR_STORAGE_PREFIX}${normalizedActorId(actorId)}:replay-lease`;
}

function hasAuthorizationHeader(headers?: HeadersInit): boolean {
    if (!headers) return false;
    const normalized = new Headers(headers);
    return normalized.has('authorization');
}

export function sanitizePersistedHeaders(headers?: HeadersInit): Record<string, string> {
    if (!headers) return {};
    const safe: Record<string, string> = {};
    new Headers(headers).forEach((value, name) => {
        const normalizedName = name.toLowerCase();
        if (SAFE_PERSISTED_HEADERS.has(normalizedName)) safe[normalizedName] = value;
    });
    return persistedHeaderSchema.parse(safe);
}

function isPublicCacheRead(url: string): boolean {
    // Unknown endpoints default to private even if a caller forgets its header.
    return /^\/api\/listings(?:\?|$)/.test(url)
        || /^\/api\/v2\/stays(?:\/[A-Za-z0-9_-]+)?(?:\?|$)/.test(url);
}

export async function fetchWithCache<T>(url: string, cacheKey: string, options?: RequestInit): Promise<T | null> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    let cachedData: T | null = null;
    const privateRequest = !isPublicCacheRead(url) || hasAuthorizationHeader(options?.headers);
    const session = privateRequest ? readActorSession() : null;
    const storageKey = privateRequest
        ? session ? actorCacheKey(session.actorId, cacheKey) : null
        : `${PUBLIC_CACHE_PREFIX}${cacheKey}`;
    const canUseResponse = () => !privateRequest || isCurrentSession(session);
    if (privateRequest && (!session || !isLocalApiPath(url))) return null;
    
    if (storageKey) {
        try {
            cachedData = (await get(storageKey)) || null;
        } catch (e) {
            console.warn('IDB get failed', e);
        }
    }

    if (!canUseResponse()) return null;
    if (!isOnline && cachedData) {
        return cachedData;
    }

    try {
        const requestOptions = privateRequest && session
            ? { ...options, headers: new Headers(options?.headers) }
            : options;
        if (privateRequest && session && requestOptions?.headers instanceof Headers) {
            requestOptions.headers.set('authorization', `Bearer ${session.token}`);
        }
        const response = await fetch(url, requestOptions);
        if (!canUseResponse()) return null;
        if (response.ok) {
            const isJson = response.headers.get('content-type')?.includes('json');
            const data = isJson ? await response.json() : null;
            if (data !== null) {
                if (!canUseResponse()) return null;
                // Safely save to cache without crashing on quota exceeded
                try {
                    if (storageKey) {
                        await update(storageKey, current => canUseResponse() ? data : current);
                    }
                } catch (quotaErr) {
                    console.warn('[IDB QUOTA] Safe ignore quota error:', quotaErr);
                }
                return canUseResponse() ? data : null;
            }
            return canUseResponse() ? cachedData : null;
        } else if ((response.status === 401 || response.status === 403) && storageKey) {
            await del(storageKey).catch(() => undefined);
            return null;
        } else if (cachedData) {
            return cachedData;
        }
        return null;
    } catch (e) {
        console.warn(`Fetch error for ${url}, fallback to cache`, e);
        return canUseResponse() ? cachedData : null;
    }
}

// Basic queue for offline mutations
export interface OfflineQueueItem {
    id: string;
    version: typeof QUEUE_VERSION;
    actorId: string;
    url: string;
    method: string;
    body?: unknown;
    headers?: Record<string, string>;
    requiresAuth: boolean;
    timestamp: number;
    type?: 'FETCH' | 'CUSTOM_MUTATION';
    customId?: string;
}

const offlineQueueItemSchema = z.object({
    id: z.string().min(1).max(128),
    version: z.literal(QUEUE_VERSION),
    actorId: actorIdSchema,
    url: z.string().max(4096),
    method: z.string().min(1).max(16),
    body: z.unknown().optional(),
    headers: persistedHeaderSchema.optional(),
    requiresAuth: z.boolean(),
    timestamp: z.number().int().nonnegative(),
    type: z.enum(['FETCH', 'CUSTOM_MUTATION']).optional(),
    customId: z.string().min(1).max(128).optional(),
}).strict();

function parseActorQueue(value: unknown): OfflineQueueItem[] {
    const parsed = z.array(offlineQueueItemSchema).safeParse(value ?? []);
    if (!parsed.success) {
        console.error('Ignoring malformed actor-scoped offline queue metadata');
        return [];
    }
    return parsed.data;
}

async function readActorQueue(actorId: string): Promise<OfflineQueueItem[]> {
    return parseActorQueue(await get(actorQueueKey(actorId)));
}

async function appendActorCommand(session: ActorSession, item: OfflineQueueItem): Promise<boolean> {
    let appended = false;
    await update(actorQueueKey(session.actorId), current => {
        // The check runs inside the IndexedDB read/write transaction so a delayed
        // network failure cannot resurrect private commands after logout/purge.
        if (!isCurrentSession(session)) return current;
        const queue = parseActorQueue(current);
        if (queue.length >= MAX_OFFLINE_QUEUE_ITEMS) return current;
        appended = true;
        return [...queue, item];
    });
    return appended && isCurrentSession(session);
}

async function acknowledgeActorCommands(actorId: string, completedIds: ReadonlySet<string>): Promise<void> {
    if (completedIds.size === 0) return;
    await update(actorQueueKey(actorId), current => {
        // Never replace the whole snapshot: another tab may have appended a
        // command while this executor awaited the network. A purged key stays empty.
        if (current === undefined) return current;
        return parseActorQueue(current).filter(item => !completedIds.has(item.id));
    });
}

async function removeUnsafeLegacyQueue(): Promise<void> {
    // The legacy queue could contain bearer credentials and had no actor owner.
    // It cannot be safely migrated, so it must be destroyed.
    await del(LEGACY_SYNC_QUEUE_KEY).catch(() => undefined);
}

async function withActorReplayLease(actorId: string, work: (ownsLease: () => Promise<boolean>) => Promise<void>): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks.request(`encho-offline-replay:${actorId}`, { ifAvailable: true }, async lock => {
            if (lock) await work(async () => true);
        });
        return;
    }

    const leaseKey = actorReplayLeaseKey(actorId);
    const leaseOwnerId = createMutationId();
    let acquired = false;
    await update(leaseKey, current => {
        const lease = replayLeaseSchema.safeParse(current);
        if (lease.success && lease.data.expiresAt > Date.now()) {
            return lease.data;
        }
        acquired = true;
        return { ownerId: leaseOwnerId, expiresAt: Date.now() + REPLAY_LEASE_MS };
    });
    if (!acquired) return;

    const renew = setInterval(() => {
        void update(leaseKey, current => {
            const lease = replayLeaseSchema.safeParse(current);
            return lease.success && lease.data.ownerId === leaseOwnerId
                ? { ownerId: leaseOwnerId, expiresAt: Date.now() + REPLAY_LEASE_MS }
                : current;
        }).catch(() => { /* Ownership is rechecked before the next dispatch. */ });
    }, REPLAY_LEASE_RENEW_MS);

    try {
        await work(async () => {
            const lease = replayLeaseSchema.safeParse(await get(leaseKey));
            return lease.success && lease.data.ownerId === leaseOwnerId && lease.data.expiresAt > Date.now();
        });
    } finally {
        clearInterval(renew);
        await update(leaseKey, current => {
            const lease = replayLeaseSchema.safeParse(current);
            return lease.success && lease.data.ownerId === leaseOwnerId
                ? { ownerId: leaseOwnerId, expiresAt: 0 }
                : current;
        });
    }
}

type CustomMutationHandler = (item: OfflineQueueItem) => Promise<boolean>;


function createMutationId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shouldRetryStatus(status: number): boolean {
    return status >= 500 || status === 408 || status === 425 || status === 429;
}

/** Message reconciliation repeats the same canonical event identity. Other
 * unknown outcomes (money/provider writes) never acquire generic retry authority. */
async function isReconcilableMessage(response:Response,url:string,method:string,body:unknown):Promise<boolean>{
    if(response.status!==409||!/^\/api\/threads\/[1-9]\d*\/messages$/.test(url)||method!=='POST'||!supportsOfflineReplay(url,method,body))return false;
    try{return z.object({code:z.literal('OPERATION_OUTCOME_UNKNOWN')}).safeParse(await response.clone().json()).success;}
    catch{return false;}
}

function shouldRetainQueuedStatus(status: number): boolean {
    return shouldRetryStatus(status) || status === 401 || status === 403;
}

function emitOfflineMutationCommitted(item: OfflineQueueItem, data: unknown): void {
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
    window.dispatchEvent(new CustomEvent(OFFLINE_MUTATION_COMMITTED_EVENT, {
        detail: Object.freeze({
            mutationId: item.id,
            actorId: item.actorId,
            url: item.url,
            data,
        }),
    }));
}

export function registerCustomSyncHandler(id: string, handler: CustomMutationHandler) {
    z.string().min(1).max(128).parse(id);
    // Retain the import contract while legacy custom upload replay is retired.
    // A generic callback cannot prove idempotency, actor fencing, or safe finance.
    void handler;
}

export type MutationDispatchResult<T = unknown> =
    | { status: 'COMMITTED'; mutationId: string; data: T | null }
    | { status: 'QUEUED'; mutationId: string }
    | { status: 'REJECTED'; mutationId: string; httpStatus?: number };

export async function queueMutationWithReceipt<T = unknown>(
    url: string,
    method: string,
    body?: unknown,
    headers?: Record<string, string>,
): Promise<MutationDispatchResult<T>> {
    const mutationId = createMutationId();
    const session = readActorSession();
    if (!session) return { status: 'REJECTED', mutationId };
    if (!isLocalApiPath(url)) {
        return { status: 'REJECTED', mutationId };
    }
    const requestHeaders = new Headers(headers);
    requestHeaders.set('Content-Type', 'application/json');
    requestHeaders.set('X-Idempotency-Key', mutationId);
    requestHeaders.set('Authorization', `Bearer ${session.token}`);
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (isOnline) {
        try {
            const response = await fetch(url, {
                method,
                headers: requestHeaders,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal:AbortSignal.timeout(15_000),
            });
            if (!isCurrentSession(session)) return { status: 'REJECTED', mutationId };
            if (response.ok) {
                const isJson = response.headers.get('content-type')?.includes('json');
                const data = isJson ? await response.json() as T : null;
                return isCurrentSession(session)
                    ? { status: 'COMMITTED', mutationId, data }
                    : { status: 'REJECTED', mutationId };
            }
            if (!shouldRetryStatus(response.status) && !await isReconcilableMessage(response,url,method,body)) {
                return { status: 'REJECTED', mutationId, httpStatus: response.status };
            }
        } catch (e) {
            console.warn(`Direct mutation failed for ${url}, queuing offline`, e);
        }
    }

    try {
        if (!isCurrentSession(session) || !supportsOfflineReplay(url, method, body)) {
            console.error('Refusing offline replay without a current session and an approved domain contract');
            return { status: 'REJECTED', mutationId };
        }
        if (containsSensitivePersistedKey(body)) {
            console.error('Refusing to persist an offline mutation containing credential-like fields');
            return { status: 'REJECTED', mutationId };
        }
        const serializedBody = JSON.stringify(body);
        if (serializedBody !== undefined && new TextEncoder().encode(serializedBody).byteLength > MAX_OFFLINE_BODY_BYTES) {
            return { status: 'REJECTED', mutationId };
        }
        await removeUnsafeLegacyQueue();
        const newItem: OfflineQueueItem = {
            id: mutationId,
            version: QUEUE_VERSION,
            actorId: session.actorId,
            url,
            method,
            body,
            headers: sanitizePersistedHeaders(requestHeaders),
            requiresAuth: true,
            timestamp: Date.now(),
        };
        return await appendActorCommand(session, newItem)
            ? { status: 'QUEUED', mutationId }
            : { status: 'REJECTED', mutationId };
    } catch (e) {
        console.error('Failed to queue mutation offline', e);
        return { status: 'REJECTED', mutationId };
    }
}

export async function queueMutation(url: string, method: string, body?: unknown, headers?: Record<string, string>): Promise<boolean> {
    return (await queueMutationWithReceipt(url, method, body, headers)).status === 'COMMITTED';
}

export async function processOfflineQueue(): Promise<void> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!isOnline) return;
    const session = readActorSession();
    if (!session) return;

    try {
        await removeUnsafeLegacyQueue();
        await withActorReplayLease(session.actorId, async ownsLease => {
            const queue = await readActorQueue(session.actorId);
            const completedIds = new Set<string>();
            for (const item of queue) {
                if (!await ownsLease() || !isCurrentSession(session)) break;
                if (item.actorId !== session.actorId) continue;
                // Retire legacy/custom or financial commands instead of running
                // them under a newer browser session without a domain contract.
                if (item.type === 'CUSTOM_MUTATION' || !supportsOfflineReplay(item.url, item.method, item.body)
                    || !item.requiresAuth || containsSensitivePersistedKey(item.body)) {
                    completedIds.add(item.id);
                    continue;
                }
                try {
                    const response = await fetch(item.url, {
                        method: item.method,
                        headers: {
                            'Content-Type': 'application/json',
                            ...sanitizePersistedHeaders(item.headers),
                            Authorization: `Bearer ${session.token}`,
                        },
                        body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
                        signal:AbortSignal.timeout(15_000),
                    });
                    if (!response.ok && (shouldRetainQueuedStatus(response.status)||await isReconcilableMessage(response,item.url,item.method,item.body))) continue;
                    if (response.ok) {
                        const isJson = response.headers.get('content-type')?.includes('json');
                        const data: unknown = isJson ? await response.json() : null;
                        if (isCurrentSession(session)) emitOfflineMutationCommitted(item, data);
                    }
                    completedIds.add(item.id);
                } catch (e) {
                    console.warn(`Failed to process queued mutation ${item.id}`, e);
                }
            }
            await acknowledgeActorCommands(session.actorId, completedIds);
        });
    } catch (e) {
        console.error('Error processing offline queue', e);
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        processOfflineQueue();
    });
}

export async function queueCustomMutation(customId: string, payload: unknown): Promise<boolean> {
    // No current caller has a reviewed custom offline contract. Listing uploads
    // need canonical asset/fact validation and cannot be replayed as arbitrary callbacks.
    void customId;
    void payload;
    return false;
}

/**
 * Clears actor-owned durable browser state during logout/account switching.
 * Public cache entries remain reusable; legacy private entries are removed
 * because they predate actor scoping and cannot be attributed safely.
 */
export async function clearActorScopedOfflineData(actorId?: string | number | null): Promise<void> {
    const validatedActorId = actorId === null || actorId === undefined
        ? readStoredActorId()
        : normalizedActorId(actorId);
    const allKeys = await keys().catch(() => []);
    const actorPrefix = validatedActorId ? `${ACTOR_STORAGE_PREFIX}${validatedActorId}:` : null;

    await Promise.all(allKeys.map(async key => {
        if (typeof key !== 'string') return;
        const belongsToActor = actorPrefix ? key.startsWith(actorPrefix) : key.startsWith(ACTOR_STORAGE_PREFIX);
        const isUnsafeLegacyPrivate = key === LEGACY_SYNC_QUEUE_KEY
            || LEGACY_PRIVATE_CACHE_PREFIXES.some(prefix => key.startsWith(prefix));
        if (belongsToActor || isUnsafeLegacyPrivate) await del(key);
    }));
}
