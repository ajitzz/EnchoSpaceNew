import { describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import {
  createNotificationPreferenceLimiter,
  createNotificationPreferenceLimiterFromEnv,
  RedisNotificationPreferenceCounter,
  type EvalPort,
} from '../../server/conversations/notificationPreferenceLimiter.js';
import { createHttpExecutionContextMiddleware } from '../../server/observability/httpExecutionContext.js';
import { publicApiErrorSchema } from '../../shared/platform/apiError.js';

interface CounterRecord {
  value: number;
  expiresAt: number;
}

/**
 * In-memory EvalPort fixture modeling atomic fixed-window Redis semantics for multiple application instances.
 * Enables deterministic clock advancement and multi-client concurrency without external network dependencies.
 */
class SharedEvalFixture implements EvalPort {
  readonly counters = new Map<string, CounterRecord>();
  currentTimeMs = 1_000_000_000;

  private increment(key: string, windowSeconds: number): { count: number; ttl: number } {
    const existing = this.counters.get(key);
    let record: CounterRecord;

    if (!existing || existing.expiresAt <= this.currentTimeMs) {
      record = { value: 1, expiresAt: this.currentTimeMs + windowSeconds * 1000 };
      this.counters.set(key, record);
    } else {
      existing.value += 1;
      record = existing;
    }

    const remainingTtl = Math.max(1, Math.ceil((record.expiresAt - this.currentTimeMs) / 1000));
    return { count: record.value, ttl: remainingTtl };
  }

  async eval<T>(_script: string, keys: string[], args: (string | number)[]): Promise<T> {
    const key = keys[0];
    const windowSeconds = Number(args[0]);
    const max = Number(args[1]);

    const { count, ttl } = this.increment(key, windowSeconds);
    const allowed = count <= max ? 1 : 0;
    return [allowed, ttl, count] as T;
  }
}

describe('CR1 notification preference rate limiter (R4-01)', () => {
  function createTestApp(options: {
    store: EvalPort | null | (() => EvalPort | null);
    getActor: (req: Request) => unknown;
    max?: number;
    windowSeconds?: number;
    onFailure?: (event: { code: string; correlationId: string; operationId: string }) => void;
  }) {
    const app = express();
    app.use(express.json());
    app.use(createHttpExecutionContextMiddleware());

    const protectedHandler = vi.fn((_req: Request, res: Response) => {
      res.status(200).json({ success: true });
    });

    const limiter = createNotificationPreferenceLimiter({
      store: options.store,
      accountId: options.getActor,
      max: options.max ?? 20,
      windowSeconds: options.windowSeconds ?? 900,
      onFailure: options.onFailure,
    });

    app.put('/api/conversations/v1/notifications/preferences', limiter, protectedHandler);

    return { app, protectedHandler };
  }

  it('enforces actor isolation under a shared client IP in an atomic fixed window', async () => {
    const fixture = new SharedEvalFixture();
    let currentActor: unknown = 20;

    const { app, protectedHandler } = createTestApp({
      store: fixture,
      getActor: () => currentActor,
      max: 20,
      windowSeconds: 900,
    });

    const sharedIp = '203.0.113.195';

    // Account 20 executes 20 rapid mutations from the shared IP
    for (let i = 1; i <= 20; i += 1) {
      const res = await request(app)
        .put('/api/conversations/v1/notifications/preferences')
        .set('X-Forwarded-For', sharedIp)
        .send({ inAppAlerts: true });
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-remaining']).toBe(String(20 - i));
    }
    expect(protectedHandler).toHaveBeenCalledTimes(20);

    // Account 20 attempts 21st mutation -> strictly rate limited (429)
    const blockedRes = await request(app)
      .put('/api/conversations/v1/notifications/preferences')
      .set('X-Forwarded-For', sharedIp)
      .send({ inAppAlerts: true });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers['retry-after']).toBeDefined();
    expect(blockedRes.headers['ratelimit-remaining']).toBe('0');
    expect(protectedHandler).toHaveBeenCalledTimes(20); // Downstream handler not invoked

    // Validate canonical public error schema on 429
    const parsedError = publicApiErrorSchema.parse(blockedRes.body);
    expect(parsedError).toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Too many requests. Wait before trying again.',
      retryability: 'AFTER_DELAY',
    });
    expect(parsedError.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(parsedError.correlationId).toBeDefined();
    expect(parsedError.operationId).toBeDefined();

    // Account 30 connects from the EXACT SAME shared IP
    currentActor = 30;
    const actor30Res = await request(app)
      .put('/api/conversations/v1/notifications/preferences')
      .set('X-Forwarded-For', sharedIp)
      .send({ inAppAlerts: true });

    // Account 30 succeeds with their own fresh quota
    expect(actor30Res.status).toBe(200);
    expect(actor30Res.headers['ratelimit-remaining']).toBe('19');
    expect(protectedHandler).toHaveBeenCalledTimes(21);
  });

  it('fails closed with canonical 503 DEPENDENCY_UNAVAILABLE when store is missing for valid actor', async () => {
    const onFailure = vi.fn();
    const { app, protectedHandler } = createTestApp({
      store: null,
      getActor: () => 20,
      onFailure,
    });

    const res = await request(app)
      .put('/api/conversations/v1/notifications/preferences')
      .send({ inAppAlerts: true });

    expect(res.status).toBe(503);
    expect(protectedHandler).not.toHaveBeenCalled();

    const parsed = publicApiErrorSchema.parse(res.body);
    expect(parsed).toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'A required service is temporarily unavailable.',
      retryability: 'AFTER_DELAY',
    });
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DEPENDENCY_UNAVAILABLE' }),
    );
  });

  it('returns 401 AUTHENTICATION_REQUIRED for invalid actor before attempting store resolution', async () => {
    const app = express();
    app.use(createHttpExecutionContextMiddleware());
    const protectedHandler = vi.fn();
    const throwingStore = vi.fn(() => { throw new Error('Store should not be evaluated'); });

    app.put('/preferences-absent', createNotificationPreferenceLimiter({
      store: null,
      accountId: () => undefined,
    }), protectedHandler);

    app.put('/preferences-throwing', createNotificationPreferenceLimiter({
      store: throwingStore,
      accountId: () => 0,
    }), protectedHandler);

    const resAbsent = await request(app).put('/preferences-absent');
    expect(resAbsent.status).toBe(401);
    expect(publicApiErrorSchema.parse(resAbsent.body).code).toBe('AUTHENTICATION_REQUIRED');

    const resThrowing = await request(app).put('/preferences-throwing');
    expect(resThrowing.status).toBe(401);
    expect(publicApiErrorSchema.parse(resThrowing.body).code).toBe('AUTHENTICATION_REQUIRED');

    expect(throwingStore).not.toHaveBeenCalled();
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it('fails closed with canonical 503 when store resolver throws synchronously or asynchronously', async () => {
    const onFailure = vi.fn();
    const throwingResolver = () => {
      throw new Error('Credential provider timeout or KMS failure');
    };

    const { app, protectedHandler } = createTestApp({
      store: throwingResolver,
      getActor: () => 20,
      onFailure,
    });

    const res = await request(app)
      .put('/api/conversations/v1/notifications/preferences')
      .send({ inAppAlerts: true });

    expect(res.status).toBe(503);
    expect(protectedHandler).not.toHaveBeenCalled();

    const parsed = publicApiErrorSchema.parse(res.body);
    expect(parsed.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DEPENDENCY_UNAVAILABLE' }),
    );
  });

  it('fails closed with canonical 503 when store evaluation throws an error', async () => {
    const onFailure = vi.fn();
    const faultyStore: EvalPort = {
      async eval() {
        throw new Error('Connection reset by peer');
      },
    };

    const { app, protectedHandler } = createTestApp({
      store: faultyStore,
      getActor: () => 20,
      onFailure,
    });

    const res = await request(app)
      .put('/api/conversations/v1/notifications/preferences')
      .send({ inAppAlerts: true });

    expect(res.status).toBe(503);
    expect(protectedHandler).not.toHaveBeenCalled();

    const parsed = publicApiErrorSchema.parse(res.body);
    expect(parsed.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DEPENDENCY_UNAVAILABLE' }),
    );
  });

  it('fails closed with canonical 503 when Redis returns a malformed tuple (strict tuple schema)', async () => {
    const onFailure = vi.fn();
    let malformedResponse: unknown = [2, 900, 1]; // invalid allowed flag (not 0 or 1)

    const malformedStore: EvalPort = {
      async eval<T>() {
        return malformedResponse as T;
      },
    };

    const { app, protectedHandler } = createTestApp({
      store: malformedStore,
      getActor: () => 20,
      onFailure,
    });

    // Test invalid allowed number (2)
    const res1 = await request(app).put('/api/conversations/v1/notifications/preferences').send();
    expect(res1.status).toBe(503);
    expect(protectedHandler).not.toHaveBeenCalled();

    // Test string type instead of strict number
    malformedResponse = ['1', 900, 1];
    const res2 = await request(app).put('/api/conversations/v1/notifications/preferences').send();
    expect(res2.status).toBe(503);
    expect(protectedHandler).not.toHaveBeenCalled();

    // Test negative remaining TTL
    malformedResponse = [1, -5, 1];
    const res3 = await request(app).put('/api/conversations/v1/notifications/preferences').send();
    expect(res3.status).toBe(503);
    expect(protectedHandler).not.toHaveBeenCalled();

    // Test non-positive counter
    malformedResponse = [1, 900, 0];
    const res4 = await request(app).put('/api/conversations/v1/notifications/preferences').send();
    expect(res4.status).toBe(503);
    expect(protectedHandler).not.toHaveBeenCalled();

    // Test incomplete array
    malformedResponse = [1, 900];
    const res5 = await request(app).put('/api/conversations/v1/notifications/preferences').send();
    expect(res5.status).toBe(503);
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it('propagates downstream handler exceptions without relabeling them as 503 pre-command outages', async () => {
    const store: EvalPort = { eval: async <T>() => [1, 900, 1] as T };
    const onFailure = vi.fn();
    const limiter = createNotificationPreferenceLimiter({
      store,
      accountId: () => 41,
      onFailure,
    });
    const req = {} as Request;
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn(() => { throw new Error('downstream protected effect failed'); }) as NextFunction;

    await expect(limiter(req, res, next)).rejects.toThrow('downstream protected effect failed');
    expect(onFailure).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(503);
  });

  it('requires authenticated positive account ID and does not fall back to client IP', async () => {
    const fixture = new SharedEvalFixture();
    let currentActor: unknown = undefined;

    const { app, protectedHandler } = createTestApp({
      store: fixture,
      getActor: () => currentActor,
    });

    for (const invalidActor of [undefined, null, 0, -1, '20', NaN, {}, []]) {
      currentActor = invalidActor;
      const res = await request(app)
        .put('/api/conversations/v1/notifications/preferences')
        .set('X-Forwarded-For', '198.51.100.22')
        .send({ inAppAlerts: true });

      expect(res.status).toBe(401);
      expect(protectedHandler).not.toHaveBeenCalled();
      const parsed = publicApiErrorSchema.parse(res.body);
      expect(parsed.code).toBe('AUTHENTICATION_REQUIRED');
    }

    // No keys created in the store for unauthenticated calls
    expect(fixture.counters.size).toBe(0);
  });

  it('enforces shared fixed-window quota across multiple concurrent application instances', async () => {
    const sharedStore = new SharedEvalFixture();

    // Instance 1
    const { app: app1 } = createTestApp({
      store: sharedStore,
      getActor: () => 42,
      max: 20,
    });

    // Instance 2 (different process/pod sharing the same Redis counter store)
    const { app: app2 } = createTestApp({
      store: sharedStore,
      getActor: () => 42,
      max: 20,
    });

    // Interleave 20 requests across both instances
    for (let i = 0; i < 10; i += 1) {
      const res1 = await request(app1).put('/api/conversations/v1/notifications/preferences').send();
      expect(res1.status).toBe(200);

      const res2 = await request(app2).put('/api/conversations/v1/notifications/preferences').send();
      expect(res2.status).toBe(200);
    }

    // Combined limit (20) reached: next request on Instance 1 is rejected
    const blocked1 = await request(app1).put('/api/conversations/v1/notifications/preferences').send();
    expect(blocked1.status).toBe(429);

    // Next request on Instance 2 is also rejected
    const blocked2 = await request(app2).put('/api/conversations/v1/notifications/preferences').send();
    expect(blocked2.status).toBe(429);
  });

  it('resets quota when the fixed window expires', async () => {
    const fixture = new SharedEvalFixture();
    const { app } = createTestApp({
      store: fixture,
      getActor: () => 55,
      max: 2,
      windowSeconds: 60,
    });

    // Request 1 and 2 succeed
    expect((await request(app).put('/api/conversations/v1/notifications/preferences').send()).status).toBe(200);
    expect((await request(app).put('/api/conversations/v1/notifications/preferences').send()).status).toBe(200);

    // Request 3 is blocked
    expect((await request(app).put('/api/conversations/v1/notifications/preferences').send()).status).toBe(429);

    // Advance clock past the 60-second window
    fixture.currentTimeMs += 61_000;

    // Request 4 succeeds again with refreshed quota
    const refreshed = await request(app).put('/api/conversations/v1/notifications/preferences').send();
    expect(refreshed.status).toBe(200);
    expect(refreshed.headers['ratelimit-remaining']).toBe('1');
  });

  it('enforces HTTPS-only Redis REST URL in createNotificationPreferenceLimiterFromEnv', async () => {
    // 1. Insecure http:// URL: rejected, fails closed with 503
    const limiterInsecure = createNotificationPreferenceLimiterFromEnv({
      CONVERSATION_NOTIFICATION_REDIS_REST_URL: 'http://insecure-redis.internal',
      CONVERSATION_NOTIFICATION_REDIS_REST_TOKEN: 'mock-token',
    }, {
      accountId: () => 20,
    });

    const appInsecure = express();
    appInsecure.use(createHttpExecutionContextMiddleware());
    appInsecure.put('/test', limiterInsecure, (_req, res) => { res.json({ ok: true }); });

    const resInsecure = await request(appInsecure).put('/test');
    expect(resInsecure.status).toBe(503);
    expect(publicApiErrorSchema.parse(resInsecure.body).code).toBe('DEPENDENCY_UNAVAILABLE');

    // 2. Missing env: fails closed with 503
    const limiterMissing = createNotificationPreferenceLimiterFromEnv({}, {
      accountId: () => 20,
    });

    const appMissing = express();
    appMissing.use(createHttpExecutionContextMiddleware());
    appMissing.put('/test', limiterMissing, (_req, res) => { res.json({ ok: true }); });

    const resMissing = await request(appMissing).put('/test');
    expect(resMissing.status).toBe(503);
    expect(publicApiErrorSchema.parse(resMissing.body).code).toBe('DEPENDENCY_UNAVAILABLE');

    // 3. Valid https:// URL: configured without reading .env directly
    const limiterSecure = createNotificationPreferenceLimiterFromEnv({
      CONVERSATION_NOTIFICATION_REDIS_REST_URL: 'https://secure-redis.internal',
      CONVERSATION_NOTIFICATION_REDIS_REST_TOKEN: 'mock-token',
    }, {
      accountId: () => 20,
    });
    expect(typeof limiterSecure).toBe('function');
  });

  it('strictly validates safe positive integers for configuration parameters', () => {
    const fixture = new SharedEvalFixture();

    // Floating-point, negative, zero, NaN, or unsafe integers must throw LIMITER_CONFIG_INVALID
    for (const invalidWindow of [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '900' as unknown as number]) {
      expect(() => new RedisNotificationPreferenceCounter(fixture, invalidWindow, 20)).toThrow('LIMITER_CONFIG_INVALID');
      expect(() => createNotificationPreferenceLimiter({ store: fixture, accountId: () => 1, windowSeconds: invalidWindow })).toThrow('LIMITER_CONFIG_INVALID');
    }

    for (const invalidMax of [0, -1, 2.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '20' as unknown as number]) {
      expect(() => new RedisNotificationPreferenceCounter(fixture, 900, invalidMax)).toThrow('LIMITER_CONFIG_INVALID');
      expect(() => createNotificationPreferenceLimiter({ store: fixture, accountId: () => 1, max: invalidMax })).toThrow('LIMITER_CONFIG_INVALID');
    }

    // Invalid namespace
    expect(() => new RedisNotificationPreferenceCounter(fixture, 900, 20, 'bad namespace!')).toThrow('LIMITER_NAMESPACE_INVALID');

    // Valid configuration succeeds
    const counter = new RedisNotificationPreferenceCounter(fixture, 900, 20, 'encho:notif:test');
    expect(counter.key(99)).toBe('encho:notif:test:99');
  });
});
