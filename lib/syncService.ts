import { get, set, del, keys } from 'idb-keyval';

/**
 * Local-First Sync Service
 * Abstracts fetching logic to fetch from offline cache first (if offline or slow),
 * then updates with fresh network data. For mutations, queues them when offline.
 */

export async function fetchWithCache<T>(url: string, cacheKey: string, options?: RequestInit): Promise<T | null> {
    const isOnline = navigator.onLine;
    let cachedData: T | null = null;
    
    try {
        cachedData = await get(cacheKey);
    } catch (e) {
        console.warn('IDB get failed', e);
    }

    if (!isOnline && cachedData) {
        console.log(`[Offline] Using cached data for ${cacheKey}`);
        return cachedData;
    }

    try {
        const response = await fetch(url, options);
        if (response.ok) {
            const data = await response.json();
            await set(cacheKey, data); // store to idle cache
            return data;
        } else if (cachedData) {
            console.log(`[Fetch Failed] Using cached data for ${cacheKey}`);
            return cachedData;
        }
        return null;
    } catch (e) {
        console.warn(`Fetch error for ${url}, fallback to cache`, e);
        return cachedData;
    }
}

// Basic queue for offline mutations
export interface OfflineQueueItem {
    id: string;
    url: string;
    method: string;
    body?: any;
    headers?: Record<string, string>;
    timestamp: number;
    type?: 'FETCH' | 'CUSTOM_MUTATION';
    customId?: string;
}

const SYNC_QUEUE_KEY = 'offline_sync_queue';

type CustomMutationHandler = (item: OfflineQueueItem) => Promise<boolean>;
const customHandlers: Record<string, CustomMutationHandler> = {};

export function registerCustomSyncHandler(id: string, handler: CustomMutationHandler) {
    customHandlers[id] = handler;
}

export async function queueMutation(url: string, method: string, body?: any, headers?: Record<string, string>, isRaw?: boolean): Promise<boolean> {
    if (navigator.onLine && !isRaw) {
        try {
            const fetchOptions: RequestInit = { method };
            if (!isRaw) {
                fetchOptions.headers = { 'Content-Type': 'application/json', ...headers };
                fetchOptions.body = body ? JSON.stringify(body) : undefined;
            } else {
                fetchOptions.headers = headers;
                fetchOptions.body = body;
            }
            const response = await fetch(url, fetchOptions);
            if (response.ok) {
                return true; // Successfully synced immediately
            }
        } catch (e) {
            console.warn(`Direct fetch failed for ${url}, queueing for offline sync`, e);
        }
    }

    const queue: OfflineQueueItem[] = await get(SYNC_QUEUE_KEY) || [];
    queue.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
        url,
        method,
        body,
        headers,
        timestamp: Date.now(),
        type: 'FETCH'
    });
    await set(SYNC_QUEUE_KEY, queue);
    
    // Register background sync if supported
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await (registration as any).sync.register('sync-mutations');
        } catch (e) {
            console.warn('Background sync registration failed', e);
        }
    }
    
    return false; // Queued for later
}

export async function queueCustomMutation(customId: string, body: any): Promise<boolean> {
    if (navigator.onLine) {
        const handler = customHandlers[customId];
        if (handler) {
            try {
                // Fake a queue item for the handler
                const success = await handler({
                    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
                    url: '', method: '', timestamp: Date.now(),
                    type: 'CUSTOM_MUTATION', customId, body
                });
                if (success) return true;
            } catch (e) {
                console.warn(`Direct custom mutation failed for ${customId}, queueing for offline sync`, e);
            }
        }
    }

    const queue: OfflineQueueItem[] = await get(SYNC_QUEUE_KEY) || [];
    queue.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
        url: '', // Handled by custom handler
        method: '',
        body,
        timestamp: Date.now(),
        type: 'CUSTOM_MUTATION',
        customId
    });
    await set(SYNC_QUEUE_KEY, queue);
    
    // Register background sync if supported
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await (registration as any).sync.register('sync-mutations');
        } catch (e) {
            console.warn('Background sync registration failed', e);
        }
    }
    
    return false; 
}

export async function processSyncQueue(): Promise<void> {
    if (!navigator.onLine) return;
    
    const queue: OfflineQueueItem[] = await get(SYNC_QUEUE_KEY) || [];
    if (queue.length === 0) return;

    console.log(`Processing ${queue.length} offline mutations`);
    
    const newQueue: OfflineQueueItem[] = [];
    
    for (const item of queue) {
        try {
            if (item.type === 'CUSTOM_MUTATION' && item.customId) {
                const handler = customHandlers[item.customId];
                if (handler) {
                    const success = await handler(item);
                    if (!success) newQueue.push(item);
                } else {
                    console.warn(`No handler found for custom mutation ${item.customId}`);
                    newQueue.push(item); // Keep in queue 
                }
            } else {
                const fetchOptions: RequestInit = {
                    method: item.method,
                    headers: item.headers
                };
                if (item.headers?.['Content-Type'] !== 'multipart/form-data') {
                    fetchOptions.headers = { 'Content-Type': 'application/json', ...item.headers };
                    fetchOptions.body = item.body ? JSON.stringify(item.body) : undefined;
                } else {
                    // Raw body handling if needed, though FormData can't be easily stored in IDB.
                    fetchOptions.body = item.body;
                    // Delete Content-Type so browser sets boundary correctly
                    if (fetchOptions.headers) {
                        const newHeaders = { ...fetchOptions.headers } as Record<string, string>;
                        delete newHeaders['Content-Type'];
                        fetchOptions.headers = newHeaders;
                    }
                }
                
                const response = await fetch(item.url, fetchOptions);
                
                if (!response.ok) {
                    console.error(`Offline sync failed for ${item.url}`, await response.text());
                }
            }
        } catch (e) {
            console.warn('Sync failed, keeping in queue', e);
            newQueue.push(item);
        }
    }
    
    await set(SYNC_QUEUE_KEY, newQueue);
}

// Event listener to process queue when back online
if (typeof window !== 'undefined') {
    window.addEventListener('online', processSyncQueue);
}
