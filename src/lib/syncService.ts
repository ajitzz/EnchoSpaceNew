import { get, set, del, keys } from 'idb-keyval';

/**
 * Local-First Sync Service
 * Abstracts fetching logic to fetch from offline cache first (if offline or slow),
 * then updates with fresh network data. For mutations, queues them when offline.
 */

export async function fetchWithCache<T>(url: string, cacheKey: string, options?: RequestInit): Promise<T | null> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    let cachedData: T | null = null;
    
    try {
        cachedData = (await get(cacheKey)) || null;
    } catch (e) {
        console.warn('IDB get failed', e);
    }

    if (!isOnline && cachedData) {
        return cachedData;
    }

    try {
        const response = await fetch(url, options);
        if (response.ok) {
            const isJson = response.headers.get('content-type')?.includes('json');
            const data = isJson ? await response.json() : null;
            if (data !== null) {
                // Safely save to cache without crashing on quota exceeded
                try {
                    await set(cacheKey, data);
                } catch (quotaErr) {
                    console.warn('[IDB QUOTA] Safe ignore quota error:', quotaErr);
                }
                return data;
            }
            return cachedData;
        } else if (cachedData) {
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

export async function queueMutation(url: string, method: string, body?: any, headers?: Record<string, string>): Promise<boolean> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (isOnline) {
        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (response.ok) {
                return true;
            }
        } catch (e) {
            console.warn(`Direct mutation failed for ${url}, queuing offline`, e);
        }
    }

    try {
        const queue: OfflineQueueItem[] = (await get(SYNC_QUEUE_KEY)) || [];
        const newItem: OfflineQueueItem = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
            url,
            method,
            body,
            headers,
            timestamp: Date.now(),
        };
        queue.push(newItem);
        await set(SYNC_QUEUE_KEY, queue);
        return false;
    } catch (e) {
        console.error('Failed to queue mutation offline', e);
        return false;
    }
}

export async function processOfflineQueue(): Promise<void> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!isOnline) return;

    try {
        const queue: OfflineQueueItem[] = (await get(SYNC_QUEUE_KEY)) || [];
        if (queue.length === 0) return;

        const remainingQueue: OfflineQueueItem[] = [];

        for (const item of queue) {
            try {
                if (item.type === 'CUSTOM_MUTATION' && item.customId && customHandlers[item.customId]) {
                    const success = await customHandlers[item.customId](item);
                    if (!success) remainingQueue.push(item);
                } else {
                    const response = await fetch(item.url, {
                        method: item.method,
                        headers: {
                            'Content-Type': 'application/json',
                            ...item.headers,
                        },
                        body: item.body ? JSON.stringify(item.body) : undefined,
                    });
                    if (!response.ok) {
                        remainingQueue.push(item);
                    }
                }
            } catch (e) {
                console.warn(`Failed to process queued mutation ${item.id}`, e);
                remainingQueue.push(item);
            }
        }

        await set(SYNC_QUEUE_KEY, remainingQueue);
    } catch (e) {
        console.error('Error processing offline queue', e);
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        processOfflineQueue();
    });
}

export async function queueCustomMutation(customId: string, payload: any): Promise<boolean> {
    try {
        const queue: OfflineQueueItem[] = (await get(SYNC_QUEUE_KEY)) || [];
        const newItem: OfflineQueueItem = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
            url: '',
            method: 'CUSTOM',
            body: payload,
            timestamp: Date.now(),
            type: 'CUSTOM_MUTATION',
            customId
        };
        queue.push(newItem);
        await set(SYNC_QUEUE_KEY, queue);
        return false;
    } catch (e) {
        console.error('Failed to queue custom mutation', e);
        return false;
    }
}
