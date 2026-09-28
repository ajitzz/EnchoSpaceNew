/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { OFFLINE_REPLAY_POLICY_VERSION, offlineWorkerMessageSchema, purgeRetiredWorkboxQueue } from '../lib/legacyOfflineQueue';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { allowlist: [/^\/$/] }));

const imageCache = (cacheName: string, maxEntries: number) => new CacheFirst({
    cacheName,
    plugins: [new ExpirationPlugin({ maxEntries, maxAgeSeconds: 7 * 24 * 60 * 60, purgeOnQuotaError: true }),
        new CacheableResponsePlugin({ statuses: [200] })],
});
registerRoute(({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/api/'), new NetworkOnly(), 'GET');
registerRoute(({ url, request }) => !request.headers.has('authorization') && url.origin === 'https://images.unsplash.com', imageCache('encho-v3-public-unsplash', 40), 'GET');
registerRoute(({ url, request }) => !request.headers.has('authorization') && url.origin === self.location.origin
    && url.pathname.startsWith('/assets/') && /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/i.test(url.pathname), imageCache('encho-v3-public-assets', 50), 'GET');

// No mutation route and no background-sync Queue. The foreground domain queue
// alone owns reviewed, credential-free inquiry/wishlist retry contracts.
self.addEventListener('install', event => {
    event.waitUntil(purgeRetiredWorkboxQueue().then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil(purgeRetiredWorkboxQueue().then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
    const command = offlineWorkerMessageSchema.safeParse(event.data);
    if (!command.success) return;
    event.waitUntil((async () => {
        await purgeRetiredWorkboxQueue();
        if (command.data.type === 'SKIP_WAITING') await self.skipWaiting();
        event.ports[0]?.postMessage({ version: OFFLINE_REPLAY_POLICY_VERSION, retiredQueuePurged: true });
    })());
});
