import { z } from 'zod';

export const OFFLINE_REPLAY_POLICY_VERSION = 3 as const;
export const retiredQueueName = 'api-syncQueue';
export const offlineWorkerMessageSchema = z.object({
    type: z.enum(['ENCHO_OFFLINE_POLICY', 'ENCHO_PURGE_RETIRED_QUEUE', 'SKIP_WAITING']),
}).strict();

const queueOwnerSchema = z.object({ queueName: z.string() }).passthrough();
const workerReceiptSchema = z.object({
    version: z.literal(OFFLINE_REPLAY_POLICY_VERSION),
    retiredQueuePurged: z.literal(true),
}).strict();

/** Retire credential-bearing legacy requests; they have no provable actor or
 * retry contract. Never instantiate Workbox Queue: its constructor can replay. */
export async function purgeRetiredWorkboxQueue(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<void> {
    // Earlier CacheFirst patterns also admitted private API images. Their
    // contents cannot safely be reclassified as public during an upgrade.
    if (typeof caches !== 'undefined') {
        await Promise.all(['optimized-image-cache', 'image-assets-cache', 'unsplash-images-cache'].map(name => caches.delete(name)));
    }
    if (!factory) return;
    const database = await new Promise<IDBDatabase | null>((resolve, reject) => {
        const request = factory.open('workbox-background-sync');
        let absent = false;
        request.onupgradeneeded = () => {
            // Do not create an empty legacy database merely to discover its absence.
            absent = true;
            request.transaction?.abort();
        };
        request.onerror = () => absent ? resolve(null) : reject(new Error('OFFLINE_QUEUE_RETIREMENT_FAILED'));
        request.onsuccess = () => resolve(request.result);
        request.onblocked = () => reject(new Error('OFFLINE_QUEUE_RETIREMENT_BLOCKED'));
    });
    if (!database) return;
    try {
        if (!database.objectStoreNames.contains('requests')) return;
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction('requests', 'readwrite');
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(new Error('OFFLINE_QUEUE_RETIREMENT_FAILED'));
            transaction.onabort = () => reject(new Error('OFFLINE_QUEUE_RETIREMENT_FAILED'));
            const request = transaction.objectStore('requests').openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                const owner = queueOwnerSchema.safeParse(cursor.value);
                if (owner.success && owner.data.queueName === retiredQueueName) cursor.delete();
                cursor.continue();
            };
        });
    } finally {
        database.close();
    }
}

async function probeWorker(worker: ServiceWorker): Promise<boolean> {
    return new Promise(resolve => {
        const channel = new MessageChannel();
        const finish = (value: boolean) => {
            clearTimeout(timer);
            channel.port1.close();
            channel.port2.close();
            resolve(value);
        };
        const timer = setTimeout(() => finish(false), 600);
        channel.port1.onmessage = event => finish(workerReceiptSchema.safeParse(event.data).success);
        try { worker.postMessage({ type: 'ENCHO_OFFLINE_POLICY' }, [channel.port2]); }
        catch { finish(false); }
    });
}

/** A new client must not run authenticated actions through an old POST-replaying
 * worker. An offline old installation cannot upgrade: keep this client closed. */
export async function ensureSafeOfflineWorker(): Promise<void> {
    await purgeRetiredWorkboxQueue();
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const container = navigator.serviceWorker;
    const registration = await container.getRegistration();
    const existingWorker = container.controller ?? registration?.active;
    if (existingWorker && await probeWorker(existingWorker)) return;
    if (!registration) {
        if (container.controller) throw new Error('OFFLINE_WORKER_UPGRADE_REQUIRED');
        return;
    }
    try {
        await registration.update();
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        // The new worker purges again before claim, closing the old-worker
        // enqueue-after-page-purge race. Polling handles interrupted updates.
        const deadline = Date.now() + 10_000;
        do {
            const controller = container.controller;
            if (controller && await probeWorker(controller)) return;
            await new Promise(resolve => setTimeout(resolve, 100));
        } while (Date.now() < deadline);
    } catch { /* Return a stable non-sensitive error; do not mount the old client. */ }
    throw new Error('OFFLINE_WORKER_UPGRADE_REQUIRED');
}
