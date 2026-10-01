import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, loadConfigFromFile, mergeConfig, type Plugin } from 'vite';
import { generateSW } from 'workbox-build';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

interface AuditFixture {
    state: string;
    login(id: number, token: string): void;
    attemptInvalidLogin(): string;
    logout(): void;
    actorQueueKey(id: number): string;
    get(key: string): Promise<unknown>;
    keys(): Promise<string[]>;
    processOfflineQueue(): Promise<void>;
    purgeRetiredWorkboxQueue(): Promise<void>;
    queueMutationWithReceipt(url: string, method: string, body: unknown): Promise<{ status: string }>;
}
declare global { interface Window { offlineAudit: AuditFixture } }

type RecordedRequest = { url: string; authorization: string | undefined; body: string };
let browser: Browser;
let server: Server;
let directory: string;
let origin: string;
let serveLegacy = false;
let serveWaiting = false;
let uncertainMessages = false;
let denyExpiredMessages = false;
let denyExpiredAuth = false;
let malformedAuthCheck = false;
let heldAuthCheck: Promise<void> | null = null;
let authCheckStarted = false;
const requests: RecordedRequest[] = [];

async function legacyEntries(page: Page): Promise<Array<{ queueName: string; requestData: { headers: Record<string, string> } }>> {
    return page.evaluate(async () => new Promise((resolveEntries, reject) => {
        const request = indexedDB.open('workbox-background-sync');
        request.onupgradeneeded = () => { request.transaction?.abort(); };
        request.onerror = () => resolveEntries([]);
        request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('requests')) { db.close(); resolveEntries([]); return; }
            const transaction = db.transaction('requests', 'readonly');
            const all = transaction.objectStore('requests').getAll();
            all.onsuccess = () => resolveEntries(all.result);
            all.onerror = () => reject(new Error('fixture queue read failed'));
            transaction.oncomplete = () => db.close();
        };
    }));
}

async function contextFixture(): Promise<BrowserContext> {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    // Browser network is restricted independently of Vitest's Node socket guard.
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    // Prevent the deliberately unsafe legacy fixture from spending a queued
    // command before the replacement arrives. Replay is tested only after upgrade.
    await session.send('Browser.setPermission', { permission: { name: 'background-sync' }, setting: 'denied', origin });
    await page.goto(origin + '/seed');
    await page.evaluate(async () => {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise<void>(resolveController => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolveController(), { once: true });
        });
    });
    return context;
}

async function openApplication(page: Page): Promise<void> {
    await page.goto(origin + '/index.html');
    await page.waitForFunction(() => window.offlineAudit?.state === 'READY');
    await page.getByTestId('actor').waitFor();
}

beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'encho-offline-worker-'));
    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve('vite.config.ts'));
    if (!loaded) throw new Error('Production Vite config unavailable');
    const fixtureIndex: Plugin = {
        name: 'local-audit-index', enforce: 'post',
        generateBundle(_options, bundle) {
            const key = Object.keys(bundle).find(name => name.endsWith('cr1-offline-browser/index.html'));
            if (key) { const asset = bundle[key]; delete bundle[key]; asset.fileName = 'index.html'; bundle['index.html'] = asset; }
        },
    };
    // Real production PWA pipeline/source; only the UI entrypoint is a local
    // fixture exposing canonical auth/sync functions. No .env or application server.
    await build(mergeConfig(loaded.config, {
        configFile: false, envDir: false, logLevel: 'silent', publicDir: false,
        plugins: [fixtureIndex],
        build: { outDir: join(directory, 'client'), emptyOutDir: true,
            rollupOptions: { input: resolve('scripts/testing/cr1-offline-browser/index.html') } },
    }));
    await generateSW({ swDest: join(directory, 'legacy', 'sw.js'), globDirectory: join(directory, 'client'), globPatterns: [],
        skipWaiting: true, clientsClaim: true,
        runtimeCaching: [{ urlPattern: /\/api\/.*/, method: 'POST', handler: 'NetworkOnly', options: {
            backgroundSync: { name: 'api-syncQueue', options: { maxRetentionTime: 1440 } },
        } }],
    });
    await generateSW({ swDest: join(directory, 'legacy-waiting', 'sw.js'), globDirectory: join(directory, 'client'), globPatterns: [],
        skipWaiting: false, clientsClaim: true,
        runtimeCaching: [{ urlPattern: /\/api\/.*/, method: 'GET', handler: 'NetworkOnly' }],
    });
    server = createServer((request, response) => {
        void (async () => {
            const url = request.url?.split('?')[0] ?? '/';
            if (url.startsWith('/api/')) {
                let body = ''; for await (const chunk of request) body += String(chunk);
                if (request.method !== 'GET') requests.push({ url, body, authorization: request.headers.authorization });
                response.setHeader('Content-Type', 'application/json');
                if (url === '/api/auth/me') {
                    authCheckStarted = true;
                    if (heldAuthCheck) await heldAuthCheck;
                    if (malformedAuthCheck) {
                        response.end(JSON.stringify({ user: { id: 'wrong-type', role: 'admin' } }));
                        return;
                    }
                    if (denyExpiredAuth && request.headers.authorization?.endsWith('-expired')) {
                        response.statusCode = 401; response.end(JSON.stringify({ code: 'AUTH_EXPIRED' }));
                        return;
                    }
                    const actor = Number(request.headers.authorization?.match(/fixture-(\d+)/)?.[1]);
                    response.end(JSON.stringify({ user: { id: actor, name: 'Local fixture', email: 'local@example.invalid', role: 'host' } }));
                } else if (url.startsWith('/api/private/')) {
                    response.end(JSON.stringify({ privateActor: request.headers.authorization }));
                } else if (url.includes('/messages') && denyExpiredMessages && request.headers.authorization?.endsWith('-expired')) {
                    response.statusCode = 401; response.end(JSON.stringify({ code: 'AUTH_EXPIRED' }));
                } else if (url.includes('/messages') && uncertainMessages) {
                    response.statusCode = 409; response.end(JSON.stringify({ code: 'OPERATION_OUTCOME_UNKNOWN' }));
                } else response.end(JSON.stringify({ id: 1, state: 'LOCAL_FIXTURE' }));
                return;
            }
            if (url === '/seed') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Local seed</title>'); return; }
            const path = url === '/sw.js' ? join(directory, serveLegacy ? serveWaiting ? 'legacy-waiting' : 'legacy' : 'client', 'sw.js')
                : url.startsWith('/workbox-') ? join(directory, 'legacy', url.slice(1)) : join(directory, 'client', url.slice(1));
            response.setHeader('Cache-Control', 'no-store');
            response.setHeader('Content-Type', path.endsWith('.html') ? 'text/html' : 'text/javascript');
            const content = await readFile(path).catch(error => {
                if (!url.startsWith('/workbox-')) throw error;
                return readFile(join(directory, 'legacy-waiting', url.slice(1)));
            });
            response.end(content);
        })().catch(() => { response.statusCode = 404; response.end(); });
    });
    await new Promise<void>(resolveListening => server.listen(0, '127.0.0.1', resolveListening));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Local fixture did not bind');
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
}, 120_000);

afterAll(async () => {
    await browser?.close();
    if (server) await new Promise<void>(resolveClosed => server.close(() => resolveClosed()));
    if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(() => { serveLegacy = false; serveWaiting = false; uncertainMessages = false; denyExpiredMessages = false; denyExpiredAuth = false; malformedAuthCheck = false; heldAuthCheck = null; authCheckStarted = false; requests.length = 0; });

describe('R1-03 production-built service worker with actual browser persistence', () => {
    it('upgrades the real legacy Workbox queue, purges credentials and claims both tabs', async () => {
        serveLegacy = true;
        const context = await contextFixture();
        try {
            const page = context.pages()[0];
            const second = await context.newPage(); await second.goto(origin + '/seed');
            await context.setOffline(true);
            await page.evaluate(() => fetch('/api/admin/workforce/change', { method: 'POST', headers: { Authorization: 'Bearer retired-fixture-credential' }, body: '{}' }).catch(() => null));
            await expect.poll(async () => (await legacyEntries(page)).length).toBe(1);
            expect(JSON.stringify(await legacyEntries(page))).toContain('retired-fixture-credential');
            serveLegacy = false;
            await context.setOffline(false);
            await openApplication(page);
            await expect.poll(() => legacyEntries(page)).toEqual([]);
            // Actual old tab is claimed by the replacement without reloading.
            const policy = await second.evaluate(async () => new Promise(resolvePolicy => {
                const channel = new MessageChannel(); channel.port1.onmessage = event => resolvePolicy(event.data);
                navigator.serviceWorker.controller!.postMessage({ type: 'ENCHO_OFFLINE_POLICY' }, [channel.port2]);
            }));
            expect(policy).toEqual({ version: 3, retiredQueuePurged: true });
            const protocol = await context.newCDPSession(page);
            const registration = new Promise<string>(resolveRegistration => {
                protocol.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
                    const current = registrations.find(row => row.scopeURL === origin + '/' && !row.isDeleted);
                    if (current) resolveRegistration(current.registrationId);
                });
            });
            await protocol.send('ServiceWorker.enable');
            await protocol.send('ServiceWorker.dispatchSyncEvent', { origin, registrationId: await registration, tag: 'workbox-background-sync:api-syncQueue', lastChance: true });
            expect(requests).toEqual([]);
        } finally { await context.close(); }
    });

    it('does not persist privileged, payment, booking or activation POSTs while offline', async () => {
        const context = await contextFixture();
        try {
            const page = context.pages()[0]; await openApplication(page); await context.setOffline(true);
            for (const url of ['/api/admin/workforce/change', '/api/operations/v1/session/logout', '/api/payments', '/api/bookings', '/api/marketing/v2/campaigns/1/activate']) {
                await page.evaluate(url => fetch(url, { method: 'POST', headers: { Authorization: 'Bearer current-fixture' }, body: '{}' }).catch(() => null), url);
            }
            expect(await legacyEntries(page)).toEqual([]);
            await context.setOffline(false); await page.reload(); await page.waitForFunction(() => window.offlineAudit?.state === 'READY');
            expect(requests).toEqual([]);
        } finally { await context.close(); }
    });

    it('replaces a waiting interrupted update before mounting the authenticated client', async () => {
        serveLegacy = true;
        const context = await contextFixture();
        try {
            const page = context.pages()[0];
            serveWaiting = true;
            await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
            await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
            serveLegacy = false;
            await openApplication(page);
            expect(await page.evaluate(() => window.offlineAudit.state)).toBe('READY');
            expect(await legacyEntries(page)).toEqual([]);
            expect(requests).toEqual([]);
        } finally { await context.close(); }
    });

    it('cleans actor intents on logout across tabs without persisting bearer tokens', async () => {
        const context = await contextFixture();
        try {
            const page = context.pages()[0]; await openApplication(page);
            await page.evaluate(() => window.offlineAudit.login(17, 'fixture-17'));
            await page.getByTestId('actor').filter({ hasText: '17' }).waitFor();
            const second = await context.newPage(); await openApplication(second);
            await context.setOffline(true);
            expect(await page.evaluate(() => window.offlineAudit.queueMutationWithReceipt('/api/threads/3/messages', 'POST', { content: 'Local question', clientEventId: '11111111-1111-4111-8111-111111111111' }))).toMatchObject({ status: 'QUEUED' });
            const queue = await page.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)));
            expect(JSON.stringify(queue)).not.toContain('fixture-17');
            await second.evaluate(() => window.offlineAudit.logout());
            await expect.poll(() => page.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toBeUndefined();
            await expect.poll(() => page.getByTestId('actor').textContent()).toBe('signed-out');
            await context.setOffline(false); await page.evaluate(() => window.offlineAudit.processOfflineQueue());
            expect(requests).toEqual([]);
        } finally { await context.close(); }
    });

    it('does not cache private API images and retires the earlier shared image caches', async () => {
        const context = await contextFixture();
        try {
            const page = context.pages()[0]; await openApplication(page);
            expect(await page.evaluate(async () => (await fetch('/api/private/guest.jpg', { headers: { Authorization: 'Bearer fixture-17' } })).json())).toEqual({ privateActor: 'Bearer fixture-17' });
            expect(await page.evaluate(async () => Boolean(await caches.match('/api/private/guest.jpg')))).toBe(false);
            await page.evaluate(async () => {
                const cache = await caches.open('image-assets-cache');
                await cache.put('/api/private/stale.jpg', new Response('private fixture bytes'));
            });
            await page.evaluate(() => window.offlineAudit.logout());
            await expect.poll(() => page.evaluate(async () => Boolean(await caches.match('/api/private/stale.jpg')))).toBe(false);
            await context.setOffline(true);
            expect(await page.evaluate(() => fetch('/api/private/guest.jpg', { headers: { Authorization: 'Bearer fixture-22' } }).then(() => 'CACHED', () => 'UNAVAILABLE'))).toBe('UNAVAILABLE');
        } finally { await context.close(); }
    });

    it('preserves unresolved inquiry identity when another tab refreshes the same actor profile', async () => {
        const context = await contextFixture();
        try {
            const page = context.pages()[0]; await openApplication(page);
            await page.evaluate(() => window.offlineAudit.login(17, 'fixture-17'));
            const second = await context.newPage(); await openApplication(second);
            await context.setOffline(true);
            await page.evaluate(() => window.offlineAudit.queueMutationWithReceipt('/api/threads/3/messages', 'POST', { content: 'Local question', clientEventId: '11111111-1111-4111-8111-111111111111' }));
            await second.evaluate(() => {
                const user = JSON.parse(localStorage.getItem('user')!);
                localStorage.setItem('user', JSON.stringify({ ...user, name: 'Profile refresh' }));
            });
            await expect.poll(() => page.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toHaveLength(1);
            await context.setOffline(false);
            await page.evaluate(() => window.offlineAudit.processOfflineQueue());
            await expect.poll(() => page.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toEqual([]);
            expect(requests).toHaveLength(1);
        } finally { await context.close(); }
    });

    it('switches actors while two tabs hold pending inquiry intent and never replays as the new actor', async () => {
        const context = await contextFixture();
        try {
            const page = context.pages()[0]; await openApplication(page);
            await page.evaluate(() => window.offlineAudit.login(17, 'fixture-17'));
            const second = await context.newPage(); await openApplication(second);
            await context.setOffline(true);
            await page.evaluate(() => window.offlineAudit.queueMutationWithReceipt('/api/threads/3/messages', 'POST', { content: 'Local question', clientEventId: '11111111-1111-4111-8111-111111111111' }));
            await second.evaluate(() => window.offlineAudit.login(22, 'fixture-22'));
            await expect.poll(() => page.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toBeUndefined();
            await context.setOffline(false); await page.evaluate(() => window.offlineAudit.processOfflineQueue());
            expect(requests).toEqual([]);
        } finally { await context.close(); }
    });

    it('retains unknown canonical message outcome and reconciles the same event with fresh current credentials', async () => {
        const context = await contextFixture();
        try {
            const page = context.pages()[0]; await openApplication(page);
            await page.evaluate(() => window.offlineAudit.login(17, 'fixture-17-expired'));
            uncertainMessages = true;
            expect(await page.evaluate(() => window.offlineAudit.queueMutationWithReceipt('/api/threads/3/messages', 'POST', { content: 'Local question', clientEventId: '11111111-1111-4111-8111-111111111111' }))).toMatchObject({ status: 'QUEUED' });
            denyExpiredAuth = true;
            await page.reload(); await page.getByTestId('actor').filter({ hasText: 'signed-out' }).waitFor();
            uncertainMessages = false;
            await page.evaluate(() => window.offlineAudit.login(17, 'fixture-17-fresh'));
            await expect.poll(() => page.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toEqual([]);
            const messages = requests.filter(request => request.url.includes('/messages'));
            expect(messages).toHaveLength(2);
            expect(messages.map(request => JSON.parse(request.body).clientEventId)).toEqual(Array(2).fill('11111111-1111-4111-8111-111111111111'));
            expect(messages[1].authorization).toBe('Bearer fixture-17-fresh');
        } finally { await context.close(); }
    });

    it('retains an explicitly unauthorized inquiry until its actor obtains fresh authentication', async () => {
        const context = await contextFixture();
        try {
            const page = context.pages()[0]; await openApplication(page);
            await page.evaluate(() => window.offlineAudit.login(17, 'fixture-17-expired'));
            await context.setOffline(true);
            await page.evaluate(() => window.offlineAudit.queueMutationWithReceipt('/api/threads/3/messages', 'POST', { content: 'Local question', clientEventId: '11111111-1111-4111-8111-111111111111' }));
            denyExpiredMessages = true;
            await context.setOffline(false);
            await page.evaluate(() => window.offlineAudit.processOfflineQueue());
            expect(await page.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toHaveLength(1);
            await page.evaluate(() => window.offlineAudit.login(17, 'fixture-17-fresh'));
            await page.evaluate(() => window.offlineAudit.processOfflineQueue());
            await expect.poll(() => page.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toEqual([]);
            expect(requests.at(-1)?.authorization).toBe('Bearer fixture-17-fresh');
        } finally { await context.close(); }
    });

    it('keeps an unresolved inquiry identity after /auth/me expires until the same actor reauthenticates', async () => {
        const context = await contextFixture();
        try {
            const page = context.pages()[0]; await openApplication(page);
            await page.evaluate(() => window.offlineAudit.login(17, 'fixture-17-expired'));
            await page.getByTestId('actor').filter({ hasText: '17' }).waitFor();
            await context.setOffline(true);
            const queued = await page.evaluate(() => window.offlineAudit.queueMutationWithReceipt('/api/threads/3/messages', 'POST', {
                content: 'Pending question', clientEventId: '11111111-1111-4111-8111-111111111111',
            }));
            expect(queued.status).toBe('QUEUED');
            denyExpiredAuth = true;
            denyExpiredMessages = true;
            await context.setOffline(false);
            await page.reload();
            await page.getByTestId('actor').filter({ hasText: 'signed-out' }).waitFor();
            expect(await page.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toHaveLength(1);
            expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
            denyExpiredMessages = false;
            await page.evaluate(() => window.offlineAudit.login(17, 'fixture-17-fresh'));
            // Login itself resumes reviewed replay; no connectivity toggle or
            // manual queue-processing command should be needed by the host.
            await expect.poll(() => page.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toEqual([]);
            const messages = requests.filter(request => request.url.includes('/messages'));
            expect(messages.filter(request => request.authorization === 'Bearer fixture-17-fresh')).toHaveLength(1);
            expect(messages.every(request => JSON.parse(request.body).clientEventId === '11111111-1111-4111-8111-111111111111')).toBe(true);
        } finally { await context.close(); }
    });

    it('does not expose a saved identity before the server verifies it after reload', async () => {
        const context = await contextFixture();
        let releaseCheck: () => void = () => {};
        try {
            const page = context.pages()[0]; await openApplication(page);
            await Promise.all([
                page.waitForResponse(response => response.url().endsWith('/api/auth/me')),
                page.evaluate(() => window.offlineAudit.login(17, 'fixture-17')),
            ]);
            heldAuthCheck = new Promise<void>(resolveCheck => { releaseCheck = resolveCheck; });
            authCheckStarted = false;
            await page.reload();
            await expect.poll(() => authCheckStarted).toBe(true);
            try {
                await expect.poll(() => page.getByTestId('actor').textContent(), { timeout: 1500 }).toBe('signed-out');
            } finally {
                releaseCheck(); heldAuthCheck = null;
            }
            await page.getByTestId('actor').filter({ hasText: '17' }).waitFor();
        } finally { releaseCheck(); heldAuthCheck = null; await context.close(); }
    });

    it('does not replay a saved inquiry before restored-session verification finishes', async () => {
        const context = await contextFixture();
        let releaseCheck: () => void = () => {};
        try {
            const page = context.pages()[0]; await openApplication(page);
            await Promise.all([
                page.waitForResponse(response => response.url().endsWith('/api/auth/me')),
                page.evaluate(() => window.offlineAudit.login(17, 'fixture-17')),
            ]);
            uncertainMessages = true;
            expect((await page.evaluate(() => window.offlineAudit.queueMutationWithReceipt('/api/threads/3/messages', 'POST', {
                content: 'Revalidate before retry', clientEventId: '33333333-3333-4333-8333-333333333333',
            }))).status).toBe('QUEUED');
            uncertainMessages = false;
            const initialAttempts = requests.filter(request => request.url.includes('/messages')).length;
            heldAuthCheck = new Promise<void>(resolveCheck => { releaseCheck = resolveCheck; });
            authCheckStarted = false;
            await page.reload();
            await expect.poll(() => authCheckStarted).toBe(true);
            await page.evaluate(() => window.offlineAudit.processOfflineQueue());
            expect(requests.filter(request => request.url.includes('/messages'))).toHaveLength(initialAttempts);
            releaseCheck(); heldAuthCheck = null;
            await expect.poll(() => requests.filter(request => request.url.includes('/messages')).length).toBe(initialAttempts + 1);
            await expect.poll(() => page.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toEqual([]);
        } finally { releaseCheck(); heldAuthCheck = null; await context.close(); }
    });

    it('rejects a malformed successful identity response and strips legacy private cached fields', async () => {
        const context = await contextFixture();
        try {
            const page = context.pages()[0]; await openApplication(page);
            await page.evaluate(() => {
                localStorage.setItem('token', 'fixture-17');
                localStorage.setItem('user', JSON.stringify({
                    id: 17, email: 'local@example.invalid', name: 'Fixture', role: 'host',
                    password_hash: 'must-not-remain-in-browser', wallet_balance: 7123,
                }));
            });
            malformedAuthCheck = true;
            authCheckStarted = false;
            await page.reload();
            await expect.poll(() => authCheckStarted).toBe(true);
            await expect.poll(() => page.getByTestId('actor').textContent()).toBe('signed-out');
            const cached = await page.evaluate(() => localStorage.getItem('user'));
            expect(cached).not.toContain('password_hash');
            expect(cached).not.toContain('wallet_balance');
            expect(requests.filter(request => request.url.includes('/messages'))).toEqual([]);
        } finally { await context.close(); }
    });

    it('does not install a malformed sign-in response as a browser session', async () => {
        const context = await contextFixture();
        try {
            const page = context.pages()[0]; await openApplication(page);
            expect(await page.evaluate(() => window.offlineAudit.attemptInvalidLogin()))
                .toBe('Authentication response was invalid. Please try again.');
            expect(await page.getByTestId('actor').textContent()).toBe('signed-out');
            expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
            expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
        } finally { await context.close(); }
    });

    it('hides expired identity in both tabs and purges its inquiry before a different actor signs in', async () => {
        const context = await contextFixture();
        try {
            const first = context.pages()[0]; await openApplication(first);
            await first.evaluate(() => window.offlineAudit.login(17, 'fixture-17-expired'));
            const second = await context.newPage(); await openApplication(second);
            await context.setOffline(true);
            expect((await first.evaluate(() => window.offlineAudit.queueMutationWithReceipt('/api/threads/3/messages', 'POST', {
                content: 'Old actor question', clientEventId: '22222222-2222-4222-8222-222222222222',
            }))).status).toBe('QUEUED');
            denyExpiredAuth = true;
            denyExpiredMessages = true;
            await context.setOffline(false);
            await second.reload();
            await second.getByTestId('actor').filter({ hasText: 'signed-out' }).waitFor();
            await first.getByTestId('actor').filter({ hasText: 'signed-out' }).waitFor();
            expect(await first.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toHaveLength(1);
            const requestCountBeforeSwitch = requests.filter(request => request.url.includes('/messages')).length;
            await second.evaluate(() => window.offlineAudit.login(22, 'fixture-22'));
            await expect.poll(() => first.evaluate(() => window.offlineAudit.get(window.offlineAudit.actorQueueKey(17)))).toBeUndefined();
            await second.evaluate(() => window.offlineAudit.processOfflineQueue());
            const messages = requests.filter(request => request.url.includes('/messages'));
            expect(messages).toHaveLength(requestCountBeforeSwitch);
            expect(messages.every(request => request.authorization !== 'Bearer fixture-22')).toBe(true);
        } finally { await context.close(); }
    });

    it('blocks a new client when an old worker cannot be upgraded', async () => {
        serveLegacy = true;
        const context = await contextFixture();
        try {
            const page = context.pages()[0]; await page.goto(origin + '/index.html');
            await page.waitForFunction(() => window.offlineAudit?.state === 'UPGRADE_REQUIRED', undefined, { timeout: 20_000 });
            expect(await page.getByTestId('actor').count()).toBe(0);
            expect(requests).toEqual([]);
        } finally { await context.close(); }
    }, 30_000);
});
