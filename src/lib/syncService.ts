import { get, set } from 'idb-keyval';
import { safeParseResponse } from './apiClient.js';

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
        const parsed = await safeParseResponse<T>(response);
        if (parsed.ok && parsed.data !== null) {
            await set(cacheKey, parsed.data); // store to idle cache
            return parsed.data;
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
    body?: unknown;
    headers?: Record<string, string>;
    timestamp: number;
}

const SYNC_QUEUE_KEY = 'offline_sync_queue';

export async function queueMutation(url: string, method: string, body?: unknown, headers?: Record<string, string>): Promise<boolean> {
    if (navigator.onLine) {
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
        timestamp: Date.now()
    });
    await set(SYNC_QUEUE_KEY, queue);
    
    // Register background sync if supported
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            if ('sync' in registration) {
                await (registration.sync as { register: (tag: string) => Promise<void> }).register('sync-mutations');
            }
        } catch (e) {
            console.warn('Background sync registration failed', e);
        }
    }
    
    return false; // Queued for later
}

export async function processSyncQueue(): Promise<void> {
    if (!navigator.onLine) return;
    
    const queue: OfflineQueueItem[] = await get(SYNC_QUEUE_KEY) || [];
    if (queue.length === 0) return;

    console.log(`Processing ${queue.length} offline mutations`);
    
    const newQueue: OfflineQueueItem[] = [];
    
    for (const item of queue) {
        try {
            const response = await fetch(item.url, {
                method: item.method,
                headers: {
                    'Content-Type': 'application/json',
                    ...item.headers,
                },
                body: item.body ? JSON.stringify(item.body) : undefined,
            });
            
            if (!response.ok) {
                console.error(`Offline sync failed for ${item.url}`, await response.text());
                // Depending on error, could push back to queue. For now, assume retry logic or drop.
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
