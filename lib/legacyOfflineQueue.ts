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

type ProbeOutcome = 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNANSWERED';

function probeWorker(worker: ServiceWorker, deadline: number) {
    const channel = new MessageChannel();
    let outcome: ProbeOutcome | null = null;
    let settle!: (value: ProbeOutcome) => void;
    const settled = new Promise<ProbeOutcome>(resolve => { settle = resolve; });
    const finish = (value: ProbeOutcome) => {
        if (outcome !== null) return;
        outcome = value;
        clearTimeout(timer);
        channel.port1.close();
        channel.port2.close();
        settle(value);
    };
    // One probe remains able to accept a late reply until the bounded overall
    // deadline. The 600 ms fast path below is not a version-mismatch verdict.
    const timer = setTimeout(() => finish('UNANSWERED'), Math.max(1, deadline - Date.now()));
    channel.port1.onmessage = event => finish(workerReceiptSchema.safeParse(event.data).success
        ? 'COMPATIBLE' : 'INCOMPATIBLE');
    try { worker.postMessage({ type: 'ENCHO_OFFLINE_POLICY' }, [channel.port2]); }
    catch { finish('UNANSWERED'); }
    return { worker, settled, get outcome() { return outcome; }, cancel: () => finish('UNANSWERED') };
}

/** A new client must not run authenticated actions through an old POST-replaying
 * worker. An offline old installation cannot upgrade: keep this client closed. */
export async function ensureSafeOfflineWorker(): Promise<void> {
    await purgeRetiredWorkboxQueue();
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const container = navigator.serviceWorker;
    const registration = await container.getRegistration();
    const currentWorker = () => container.controller ?? registration?.active ?? null;
    if (!registration && !container.controller) return;
    const deadline = Date.now() + 10_000;
    const probes = new Map<ServiceWorker, ReturnType<typeof probeWorker>>();
    const takeoverRequested = new Set<ServiceWorker>();
    const getProbe = (worker: ServiceWorker) => {
        let probe = probes.get(worker);
        if (!probe) { probe = probeWorker(worker, deadline); probes.set(worker, probe); }
        return probe;
    };
    try {
        const existing = currentWorker();
        if (existing) {
            const probe = getProbe(existing);
            let fastTimer: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([probe.settled, new Promise<void>(resolve => {
                fastTimer = setTimeout(resolve, 600);
            })]);
            if (fastTimer) clearTimeout(fastTimer);
            if (probe.outcome === 'COMPATIBLE' && currentWorker() === existing) return;
        }
        // An unanswered fast probe stays pending while an update is attempted.
        // A waiting worker is asked to take over only after its own policy
        // receipt proves compatibility; registration state alone is not proof.
        if (registration) void registration.update().catch(() => { /* Keep probing the current controller until the deadline. */ });
        while (Date.now() < deadline) {
            const controller = currentWorker();
            if (controller) {
                const probe = getProbe(controller);
                if (probe.outcome === 'COMPATIBLE' && currentWorker() === controller) return;
            }
            const waiting = registration?.waiting;
            if (waiting && waiting !== controller && !takeoverRequested.has(waiting)) {
                const probe = getProbe(waiting);
                if (probe.outcome === 'COMPATIBLE') {
                    takeoverRequested.add(waiting);
                    try { waiting.postMessage({ type: 'SKIP_WAITING' }); }
                    catch { /* No takeover authority follows a failed request. */ }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const finalWorker = currentWorker();
        throw new Error(finalWorker && getProbe(finalWorker).outcome === 'INCOMPATIBLE'
            ? 'OFFLINE_WORKER_UPGRADE_REQUIRED' : 'OFFLINE_WORKER_POLICY_UNVERIFIED');
    } finally {
        for (const probe of probes.values()) probe.cancel();
    }
}
