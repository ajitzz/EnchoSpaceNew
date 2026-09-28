import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keys } from 'idb-keyval';

const idb = vi.hoisted(() => ({ store: new Map<IDBValidKey, unknown>() }));

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: IDBValidKey) => idb.store.get(key)),
  set: vi.fn(async (key: IDBValidKey, value: unknown) => { idb.store.set(key, value); }),
  del: vi.fn(async (key: IDBValidKey) => { idb.store.delete(key); }),
  keys: vi.fn(async () => [...idb.store.keys()]),
  update: vi.fn(async (key: IDBValidKey, updater: (current: unknown) => unknown) => {
    const next = updater(idb.store.get(key));
    if (next === undefined) idb.store.delete(key);
    else idb.store.set(key, next);
  }),
}));

import {
  actorQueueKey,
  clearActorScopedOfflineData,
  fetchWithCache,
  processOfflineQueue,
  queueMutation,
  queueMutationWithReceipt,
  queueCustomMutation,
} from '../../lib/syncService.js';

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

function setOnline(value: boolean): void {
  vi.stubGlobal('navigator', { onLine: value });
}

function setActor(id: number, token = `token-${id}`): void {
  localStorage.setItem('user', JSON.stringify({ id, name: `Actor ${id}` }));
  localStorage.setItem('token', token);
}

describe('CR1 actor-scoped browser persistence', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    idb.store.clear();
    vi.stubGlobal('localStorage', new MemoryStorage());
    setOnline(false);
  });

  it('retains ambiguous inquiry commits for reconciliation using the same message event',async()=>{
    setActor(17);setOnline(true);
    const body={content:'A question',clientEventId:'11111111-1111-4111-8111-111111111111'};
    const unknown=()=>new Response(JSON.stringify({code:'OPERATION_OUTCOME_UNKNOWN'}),{status:409,headers:{'Content-Type':'application/json'}});
    const fetcher=vi.fn().mockImplementation(async()=>unknown());vi.stubGlobal('fetch',fetcher);
    expect((await queueMutationWithReceipt('/api/threads/3/messages','POST',body)).status).toBe('QUEUED');
    await processOfflineQueue();
    const pending=idb.store.get(actorQueueKey(17)) as Array<{body:unknown}>;
    expect(pending).toHaveLength(1);expect(pending[0].body).toEqual(body);
    fetcher.mockImplementation(async()=>new Response(JSON.stringify({id:7,client_event_id:body.clientEventId}),{status:200,headers:{'Content-Type':'application/json'}}));
    await processOfflineQueue();expect(idb.store.get(actorQueueKey(17))).toEqual([]);
    expect(fetcher.mock.calls.every((call)=>JSON.parse(call[1].body).clientEventId===body.clientEventId)).toBe(true);
  });
  it('does not grant unknown financial operations the inquiry reconciliation exception',async()=>{
    setActor(17);setOnline(true);
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({code:'OPERATION_OUTCOME_UNKNOWN'}),{status:409,headers:{'Content-Type':'application/json'}})));
    expect((await queueMutationWithReceipt('/api/payments','POST',{clientEventId:'11111111-1111-4111-8111-111111111111'})).status).toBe('REJECTED');
    expect(idb.store.get(actorQueueKey(17))).toBeUndefined();
  });

  it('persists offline mutations under the actor namespace without bearer credentials', async () => {
    setActor(17, 'sensitive-bearer');

    await expect(queueMutation('/api/wishlists', 'POST', { listingId: 9 }, {
      Authorization: 'Bearer sensitive-bearer',
      'X-Request-Id': 'request-17',
    })).resolves.toBe(false);

    const queue = idb.store.get(actorQueueKey(17)) as Array<Record<string, unknown>>;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ actorId: '17', requiresAuth: true, version: 2 });
    expect(queue[0].headers).toMatchObject({
      'content-type': 'application/json',
      'x-request-id': 'request-17',
    });
    expect(queue[0].headers).toHaveProperty('x-idempotency-key', queue[0].id);
    expect(JSON.stringify(queue[0])).not.toContain('sensitive-bearer');
  });

  it('never replays one actor queue after the browser switches accounts', async () => {
    setActor(17);
    await queueMutation('/api/wishlists', 'POST', { value: 1 }, {
      Authorization: 'Bearer token-17',
    });

    setActor(22);
    setOnline(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await processOfflineQueue();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(idb.store.get(actorQueueKey(17))).toHaveLength(1);
  });

  it('fences the prior session even if logout IndexedDB cleanup fails and the same actor signs back in', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    setActor(17);
    await clearActorScopedOfflineData(17);
    await queueMutation('/api/threads/3/messages', 'POST', { content: 'Unsent prior intent', clientEventId: '11111111-1111-4111-8111-111111111111' });
    vi.mocked(keys).mockRejectedValueOnce(new Error('fixture storage unavailable'));
    await expect(clearActorScopedOfflineData(17)).rejects.toThrow('fixture storage unavailable');
    localStorage.removeItem('token');
    setActor(17, 'new-session-token');
    setOnline(true);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await processOfflineQueue();
    expect(fetcher).not.toHaveBeenCalled();
    expect(idb.store.get(actorQueueKey(17))).toEqual([]);
  });

  it('does not lift an in-flight pre-logout mutation above the new fence on same-token re-login', async () => {
    setActor(17, 'same-token'); setOnline(true);
    vi.stubGlobal('fetch', vi.fn(async () => {
      await clearActorScopedOfflineData(17);
      localStorage.removeItem('token');
      setActor(17, 'same-token');
      throw new Error('fixture lost response after logout');
    }));
    expect((await queueMutationWithReceipt('/api/threads/3/messages', 'POST', { content: 'Old intent', clientEventId: '11111111-1111-4111-8111-111111111111' })).status).toBe('REJECTED');
    expect(idb.store.get(actorQueueKey(17))).toBeUndefined();
  });

  it('retires persisted commands after logout despite a backward clock and failed IndexedDB cleanup', async () => {
    const clock=vi.spyOn(Date,'now').mockReturnValue(1_800_000_000_000);
    setActor(17);
    await queueMutation('/api/threads/3/messages','POST',{content:'Intent from prior session',clientEventId:'11111111-1111-4111-8111-111111111111'});
    clock.mockReturnValue(1_799_999_000_000);
    vi.mocked(keys).mockRejectedValueOnce(new Error('fixture blocked cleanup'));
    await expect(clearActorScopedOfflineData(17)).rejects.toThrow('fixture blocked cleanup');
    setActor(17,'new-session-token');setOnline(true);
    const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',fetcher);
    await processOfflineQueue();
    expect(fetcher).not.toHaveBeenCalled();expect(idb.store.get(actorQueueKey(17))).toEqual([]);
  });

  it('allows legacy records only before the first revocation generation', async () => {
    setActor(17);
    await queueMutation('/api/threads/3/messages','POST',{content:'Legacy reviewed inquiry',clientEventId:'11111111-1111-4111-8111-111111111111'});
    const legacy={...(idb.store.get(actorQueueKey(17)) as Array<Record<string,unknown>>)[0]};
    delete legacy.replayFence;idb.store.set(actorQueueKey(17),[legacy]);
    const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',fetcher);setOnline(true);
    await processOfflineQueue();expect(fetcher).toHaveBeenCalledTimes(1);
    await clearActorScopedOfflineData(17);
    idb.store.set(actorQueueKey(17),[{...legacy,timestamp:Number.MAX_SAFE_INTEGER}]);
    setActor(17,'new-session-token');fetcher.mockClear();
    await processOfflineQueue();expect(fetcher).not.toHaveBeenCalled();expect(idb.store.get(actorQueueKey(17))).toEqual([]);
  });

  it('does not hide an unknown-owner global logout behind a newer actor generation', async () => {
    const clock=vi.spyOn(Date,'now').mockReturnValue(1_800_000_000_000);
    setActor(17);await clearActorScopedOfflineData(17);
    await queueMutation('/api/threads/3/messages','POST',{content:'Prior intent',clientEventId:'11111111-1111-4111-8111-111111111111'});
    clock.mockReturnValue(1_799_999_000_000);localStorage.removeItem('user');
    vi.mocked(keys).mockRejectedValueOnce(new Error('fixture blocked cleanup'));
    await expect(clearActorScopedOfflineData(null)).rejects.toThrow('fixture blocked cleanup');
    setActor(17,'new-session-token');setOnline(true);
    const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',fetcher);
    await processOfflineQueue();expect(fetcher).not.toHaveBeenCalled();expect(idb.store.get(actorQueueKey(17))).toEqual([]);
  });

  it('uses distinct generations when concurrent tabs observe the same stale prior generation', async () => {
    vi.spyOn(Date,'now').mockReturnValue(1_800_000_000_000);setActor(17);
    const fenceKey='encho:v3:offline-revoked-before:17';
    const actualGet=localStorage.getItem.bind(localStorage);let staleSnapshot=true;
    vi.spyOn(localStorage,'getItem').mockImplementation(key=>key===fenceKey&&staleSnapshot?'0':actualGet(key));
    await clearActorScopedOfflineData(17);staleSnapshot=false;
    const first=localStorage.getItem(fenceKey);
    await queueMutation('/api/threads/3/messages','POST',{content:'Between two revocations',clientEventId:'11111111-1111-4111-8111-111111111111'});
    staleSnapshot=true;vi.mocked(keys).mockRejectedValueOnce(new Error('fixture failed second-tab cleanup'));
    await expect(clearActorScopedOfflineData(17)).rejects.toThrow('fixture failed second-tab cleanup');staleSnapshot=false;
    expect(localStorage.getItem(fenceKey)).not.toBe(first);
    setActor(17,'new-session-token');setOnline(true);
    const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',fetcher);
    await processOfflineQueue();expect(fetcher).not.toHaveBeenCalled();expect(idb.store.get(actorQueueKey(17))).toEqual([]);
  });

  it('globally fences unknown ownership when IndexedDB cleanup fails', async () => {
    setActor(17);
    await queueMutation('/api/threads/3/messages', 'POST', { content: 'Old intent', clientEventId: '11111111-1111-4111-8111-111111111111' });
    localStorage.removeItem('user');
    vi.mocked(keys).mockRejectedValueOnce(new Error('fixture blocked storage'));
    await expect(clearActorScopedOfflineData(null)).rejects.toThrow();
    setActor(17); setOnline(true);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await processOfflineQueue();
    expect(fetcher).not.toHaveBeenCalled();
    expect(idb.store.get(actorQueueKey(17))).toEqual([]);
  });

  it('rehydrates the current token and preserves the original idempotency key on replay', async () => {
    setActor(17, 'expired-token');
    await queueMutation('/api/wishlists', 'POST', { value: 1 }, {
      Authorization: 'Bearer expired-token',
    });
    const queued = (idb.store.get(actorQueueKey(17)) as Array<Record<string, unknown>>)[0];

    localStorage.setItem('token', 'fresh-token');
    setOnline(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await processOfflineQueue();

    expect(fetchSpy).toHaveBeenCalledWith('/api/wishlists', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer fresh-token',
        'x-idempotency-key': queued.id,
      }),
    }));
    expect(idb.store.get(actorQueueKey(17))).toEqual([]);
  });

  it('returns the canonical server representation for an immediately committed mutation', async () => {
    setActor(17);
    setOnline(true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 44,
      client_event_id: '11111111-1111-4111-8111-111111111111',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(queueMutationWithReceipt<{ id: number; client_event_id: string }>(
      '/api/threads/3/messages',
      'POST',
      { content: 'Hello' },
      { Authorization: 'Bearer token-17' },
    )).resolves.toMatchObject({
      status: 'COMMITTED',
      data: { id: 44, client_event_id: '11111111-1111-4111-8111-111111111111' },
    });
  });

  it('emits the canonical representation when an offline command later commits', async () => {
    setActor(17);
    await queueMutation('/api/threads/3/messages', 'POST', {
      content: 'Hello',
      clientEventId: '11111111-1111-4111-8111-111111111111',
    }, { Authorization: 'Bearer token-17' });
    const eventTarget = new EventTarget();
    vi.stubGlobal('window', eventTarget);
    setOnline(true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 44,
      thread_id: 3,
      sender_id: 17,
      receiver_id: 22,
      content: 'Hello',
      is_read: false,
      created_at: '2026-09-23T10:00:00.000Z',
      client_event_id: '11111111-1111-4111-8111-111111111111',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const committed = new Promise<CustomEvent>(resolve => {
      eventTarget.addEventListener('encho:offline-mutation-committed', event => resolve(event as CustomEvent), { once: true });
    });

    await processOfflineQueue();

    await expect(committed).resolves.toMatchObject({
      detail: {
        actorId: '17',
        url: '/api/threads/3/messages',
        data: { id: 44, client_event_id: '11111111-1111-4111-8111-111111111111' },
      },
    });
  });

  it('leases replay so concurrent browser executors cannot submit the same command twice', async () => {
    setActor(17);
    await queueMutation('/api/wishlists', 'POST', { value: 1 }, {
      Authorization: 'Bearer token-17',
    });
    setOnline(true);
    let finishRequest: (() => void) | undefined;
    const responseGate = new Promise<void>(resolve => { finishRequest = resolve; });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await responseGate;
      return new Response(null, { status: 204 });
    });

    const first = processOfflineQueue();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const second = processOfflineQueue();
    await second;
    finishRequest?.();
    await first;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(idb.store.get(actorQueueKey(17))).toEqual([]);
  });

  it('purges actor and unsafe legacy private state while retaining public cache entries', async () => {
    idb.store.set(actorQueueKey(17), []);
    idb.store.set('encho:v2:actor:17:cache:bookings_17', { private: true });
    idb.store.set('encho:v2:actor:22:cache:bookings_22', { otherActor: true });
    idb.store.set('offline_sync_queue', [{ headers: { Authorization: 'Bearer leaked' } }]);
    idb.store.set('wishlists_17', [{ listingId: 1 }]);
    idb.store.set('encho:v2:public:cache:listings', [{ id: 1 }]);

    await clearActorScopedOfflineData(17);

    expect(idb.store.has(actorQueueKey(17))).toBe(false);
    expect(idb.store.has('encho:v2:actor:17:cache:bookings_17')).toBe(false);
    expect(idb.store.has('offline_sync_queue')).toBe(false);
    expect(idb.store.has('wishlists_17')).toBe(false);
    expect(idb.store.has('encho:v2:actor:22:cache:bookings_22')).toBe(true);
    expect(idb.store.has('encho:v2:public:cache:listings')).toBe(true);
  });

  it('does not serve stale private cache content after an authorization failure', async () => {
    setActor(17);
    idb.store.set('encho:v2:actor:17:cache:bookings_17', [{ id: 'private-booking' }]);
    setOnline(true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(fetchWithCache('/api/bookings', 'bookings_17', {
      headers: { Authorization: 'Bearer token-17' },
    })).resolves.toBeNull();
    expect(idb.store.has('encho:v2:actor:17:cache:bookings_17')).toBe(false);
  });

  it('fails closed instead of creating an ownerless offline mutation', async () => {
    await expect(queueMutation('/api/wishlists', 'POST', { value: 1 }, {
      Authorization: 'Bearer orphaned-token',
    })).resolves.toBe(false);
    expect([...idb.store.keys()]).toEqual([]);
  });

  it('refuses to durably persist credential-like fields hidden in a mutation body', async () => {
    setActor(17);
    await expect(queueMutationWithReceipt('/api/wishlists', 'POST', {
      value: 1,
      nested: { refreshToken: 'must-never-reach-indexeddb' },
    }, { Authorization: 'Bearer token-17' })).resolves.toMatchObject({ status: 'REJECTED' });
    expect(JSON.stringify([...idb.store.values()])).not.toContain('must-never-reach-indexeddb');
  });
  it('atomically retains every command when multiple tabs enqueue concurrently', async () => {
    setActor(17);
    const results = await Promise.all(Array.from({ length: 20 }, (_, listingId) =>
      queueMutationWithReceipt('/api/wishlists', 'POST', { listingId })));
    expect(results.every(result => result.status === 'QUEUED')).toBe(true);
    const queue = idb.store.get(actorQueueKey(17)) as Array<{ body: { listingId: number } }>;
    expect(queue).toHaveLength(20);
    expect(new Set(queue.map(item => item.body.listingId)).size).toBe(20);
  });

  it('acknowledges only replayed IDs without erasing a command enqueued during the request', async () => {
    setActor(17);
    await queueMutationWithReceipt('/api/wishlists', 'POST', { listingId: 1 });
    setOnline(true);
    let finish: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await gate;
      return new Response(null, { status: 204 });
    });
    const processing = processOfflineQueue();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    setOnline(false);
    const newResult = await queueMutationWithReceipt('/api/wishlists', 'POST', { listingId: 2 });
    finish?.();
    await processing;
    expect(newResult.status).toBe('QUEUED');
    expect(idb.store.get(actorQueueKey(17))).toMatchObject([{ body: { listingId: 2 } }]);
  });

  it('stops replay after an account switch and suppresses the prior account response event', async () => {
    setActor(17);
    await queueMutationWithReceipt('/api/wishlists', 'POST', { listingId: 1 });
    await queueMutationWithReceipt('/api/wishlists', 'POST', { listingId: 2 });
    const eventTarget = new EventTarget();
    const committed = vi.fn();
    eventTarget.addEventListener('encho:offline-mutation-committed', committed);
    vi.stubGlobal('window', eventTarget);
    setOnline(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      setActor(22);
      return new Response(null, { status: 204 });
    });
    await processOfflineQueue();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(committed).not.toHaveBeenCalled();
    expect(idb.store.get(actorQueueKey(17))).toMatchObject([{ body: { listingId: 2 } }]);
    expect(idb.store.has(actorQueueKey(22))).toBe(false);
  });

  it('cannot enqueue a failed direct request under the account switched in during its network wait', async () => {
    setActor(17);
    setOnline(true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      setActor(22);
      throw new Error('Lost response');
    });
    await expect(queueMutationWithReceipt('/api/wishlists', 'POST', { listingId: 1 }))
      .resolves.toMatchObject({ status: 'REJECTED' });
    expect(idb.store.has(actorQueueKey(17))).toBe(false);
    expect(idb.store.has(actorQueueKey(22))).toBe(false);
  });

  it('does not return a committed private representation into a replacement account session', async () => {
    setActor(17);
    setOnline(true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      setActor(22);
      return new Response(JSON.stringify({ private: 'actor-17' }), {
        headers: { 'content-type': 'application/json' },
      });
    });
    await expect(queueMutationWithReceipt('/api/wishlists', 'POST', { listingId: 1 }))
      .resolves.toMatchObject({ status: 'REJECTED' });
  });

  it('does not resurrect private cache after logout while its response is in flight', async () => {
    setActor(17);
    setOnline(true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await clearActorScopedOfflineData(17);
      localStorage.clear();
      return new Response(JSON.stringify({ private: 'actor-17' }), {
        headers: { 'content-type': 'application/json' },
      });
    });
    await expect(fetchWithCache('/api/threads', 'threads_17', {
      headers: { Authorization: 'Bearer token-17' },
    })).resolves.toBeNull();
    expect(idb.store.has('encho:v2:actor:17:cache:threads_17')).toBe(false);
  });

  it('never durably queues financial, booking, campaign, or arbitrary external requests', async () => {
    setActor(17);
    for (const url of ['/api/bookings', '/api/user/bookings/7/cancel', '/api/payments/create',
      '/api/marketing/v2/campaigns/1/activate', 'https://external.invalid/api/wishlists']) {
      await expect(queueMutationWithReceipt(url, 'POST', { amount: 50000 }))
        .resolves.toMatchObject({ status: 'REJECTED' });
    }
    await expect(queueCustomMutation('upload_listing', { listingId: 1 })).resolves.toBe(false);
    expect(idb.store.has(actorQueueKey(17))).toBe(false);
  });

  it('does not leak a current bearer token to an absolute URL even when online', async () => {
    setActor(17);
    setOnline(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(queueMutationWithReceipt('https://external.invalid/api/wishlists', 'POST', {}))
      .resolves.toMatchObject({ status: 'REJECTED' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retires previously persisted unsafe commands without performing their network operation', async () => {
    setActor(17);
    await queueMutationWithReceipt('/api/wishlists', 'POST', { listingId: 1 });
    const queue = idb.store.get(actorQueueKey(17)) as Array<{ url: string }>;
    queue[0].url = '/api/bookings';
    setOnline(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await processOfflineQueue();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(idb.store.get(actorQueueKey(17))).toEqual([]);
  });

  it('uses current credentials on the first attempt even if the caller captured a stale header', async () => {
    setActor(17, 'current-token');
    setOnline(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await queueMutationWithReceipt('/api/wishlists', 'POST', { listingId: 1 }, { authorization: 'Bearer stale-token' });
    const init = fetchSpy.mock.calls[0][1];
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer current-token');
  });

  it('bounds persistent command size and queue length rather than retaining unlimited private data', async () => {
    setActor(17);
    await expect(queueMutationWithReceipt('/api/wishlists', 'POST', { content: 'x'.repeat(65536) }))
      .resolves.toMatchObject({ status: 'REJECTED' });
    const results = await Promise.all(Array.from({ length: 101 }, (_, listingId) =>
      queueMutationWithReceipt('/api/wishlists', 'POST', { listingId })));
    expect(results.filter(result => result.status === 'QUEUED')).toHaveLength(100);
    expect(results.filter(result => result.status === 'REJECTED')).toHaveLength(1);
  });

  it('defaults unknown reads to actor-private even when the caller omits authorization', async () => {
    setActor(17);
    setOnline(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ id: 4 }]), {
      headers: { 'content-type': 'application/json' },
    }));
    await expect(fetchWithCache('/api/threads', 'threads')).resolves.toEqual([{ id: 4 }]);
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer token-17');
    expect(idb.store.get('encho:v2:actor:17:cache:threads')).toEqual([{ id: 4 }]);
    expect(idb.store.has('encho:v2:public:cache:threads')).toBe(false);
  });

  it('keeps only explicitly public listing reads available without a browser actor', async () => {
    setOnline(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ id: 4 }]), {
      headers: { 'content-type': 'application/json' },
    }));
    await expect(fetchWithCache('/api/listings?city=Goa', 'listings')).resolves.toEqual([{ id: 4 }]);
    expect(idb.store.get('encho:v2:public:cache:listings')).toEqual([{ id: 4 }]);
    await expect(fetchWithCache('/api/threads', 'threads')).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retains room-specific wishlist deletion intent within the reviewed offline contract', async () => {
    setActor(17);
    await expect(queueMutationWithReceipt('/api/wishlists/4?roomId=7', 'DELETE'))
      .resolves.toMatchObject({ status: 'QUEUED' });
    expect(idb.store.get(actorQueueKey(17))).toMatchObject([{ url: '/api/wishlists/4?roomId=7' }]);
  });

  it('requires the message domain deduplication UUID before persisting inquiry retries', async () => {
    setActor(17);
    await expect(queueMutationWithReceipt('/api/threads/3/messages', 'POST', { content: 'Hello' }))
      .resolves.toMatchObject({ status: 'REJECTED' });
    expect(idb.store.has(actorQueueKey(17))).toBe(false);
  });

});
