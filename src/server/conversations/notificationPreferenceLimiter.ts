import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { requireExecutionContext } from '../../lib/observability/executionContext.js';
import { PlatformDomainError, toPublicApiError } from '../../shared/platform/apiError.js';

/**
 * Atomic Redis Lua counter for authenticated participant preference mutations.
 * Evaluates an atomic increment within a fixed window, applying a TTL expiration from the initial hit.
 *
 * KEYS[1]: Account rate-limit key (e.g. encho:conv:notif_pref_limit:v1:<accountId>)
 * ARGV[1]: Window length in seconds (default: 900, 15 minutes)
 * ARGV[2]: Maximum allowed mutations within the window (default: 20)
 *
 * Returns: { allowed (1 or 0), remainingTtlSeconds, currentCount }
 */
export const NOTIFICATION_PREFERENCE_LIMITER_SCRIPT = `-- encho-notification-preference-limiter-v1
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  ttl = tonumber(ARGV[1])
end
if current > tonumber(ARGV[2]) then
  return {0, ttl, current}
end
return {1, ttl, current}
`;

/**
 * Strict tuple schema validating exact Lua return types without loose coercion:
 * - allowed: strictly literal 0 (blocked) or 1 (permitted)
 * - remainingTtl: strict non-negative safe integer
 * - current: strict positive safe integer
 */
const evalTupleSchema = z.tuple([
  z.union([z.literal(0), z.literal(1)]),
  z.number().int().nonnegative().safe(),
  z.number().int().positive().safe(),
]);

const safePositiveIntSchema = z.number().int().positive().safe();
const positiveActorSchema = z.number().int().positive().safe();

export interface EvalPort {
  eval<T = unknown>(script: string, keys: string[], args: (string | number)[]): Promise<T>;
}

export type StoreResolver = EvalPort | null | (() => EvalPort | null);

export interface NotificationPreferenceLimiterOptions {
  store: StoreResolver;
  accountId: (req: Request) => unknown;
  windowSeconds?: number; // default: 900 (15 minutes)
  max?: number; // default: 20
  namespace?: string; // default: 'encho:conv:notif_pref_limit:v1'
  onFailure?: (event: { code: string; correlationId: string; operationId: string }) => void;
}

export class RedisNotificationPreferenceCounter {
  readonly windowSeconds: number;
  readonly max: number;
  readonly namespace: string;

  constructor(
    private readonly store: EvalPort,
    windowSeconds: number = 900,
    max: number = 20,
    namespace: string = 'encho:conv:notif_pref_limit:v1',
  ) {
    const validWindow = safePositiveIntSchema.safeParse(windowSeconds);
    const validMax = safePositiveIntSchema.safeParse(max);
    if (!validWindow.success || !validMax.success) {
      throw new Error('LIMITER_CONFIG_INVALID');
    }
    if (!/^[a-z0-9:_-]+$/i.test(namespace)) {
      throw new Error('LIMITER_NAMESPACE_INVALID');
    }

    this.windowSeconds = validWindow.data;
    this.max = validMax.data;
    this.namespace = namespace;
  }

  key(accountId: number): string {
    return `${this.namespace}:${accountId}`;
  }

  async checkAndIncrement(accountId: number): Promise<{
    allowed: boolean;
    remainingTtl: number;
    count: number;
  }> {
    const key = this.key(accountId);
    const raw = await this.store.eval(
      NOTIFICATION_PREFERENCE_LIMITER_SCRIPT,
      [key],
      [this.windowSeconds, this.max],
    );
    const [allowedNum, ttl, count] = evalTupleSchema.parse(raw);
    return {
      allowed: allowedNum === 1,
      remainingTtl: ttl,
      count,
    };
  }
}

function resolveTrace(): { correlationId: string; operationId: string } {
  try {
    const ctx = requireExecutionContext();
    return { correlationId: ctx.correlationId, operationId: ctx.operationId };
  } catch {
    return { correlationId: randomUUID(), operationId: randomUUID() };
  }
}

/**
 * Creates an Express RequestHandler middleware for limiting participant preference mutations.
 *
 * Rules:
 * - Scoped strictly to positive authenticated account IDs.
 * - No IP fallback: unauthenticated or invalid account IDs receive 401 AUTHENTICATION_REQUIRED before any store access.
 * - Missing store, thrown resolver errors, or Redis evaluation failures fail closed with 503 DEPENDENCY_UNAVAILABLE
 *   before any downstream mutation can run.
 * - Calls next() strictly after the Redis try/catch block so downstream exceptions are never masked as 503.
 * - Over-limit requests receive 429 RATE_LIMITED with Retry-After header and canonical publicApiErrorSchema body.
 */
export function createNotificationPreferenceLimiter(
  options: NotificationPreferenceLimiterOptions,
): RequestHandler {
  const windowResult = safePositiveIntSchema.safeParse(options.windowSeconds ?? 900);
  const maxResult = safePositiveIntSchema.safeParse(options.max ?? 20);
  if (!windowResult.success || !maxResult.success) {
    throw new Error('LIMITER_CONFIG_INVALID');
  }

  const windowSeconds = windowResult.data;
  const max = maxResult.data;
  const namespace = options.namespace ?? 'encho:conv:notif_pref_limit:v1';

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const trace = resolveTrace();

    // 1. Validate actor before resolving store; no IP fallback
    const actorResult = positiveActorSchema.safeParse(options.accountId(req));
    if (!actorResult.success) {
      const domainError = new PlatformDomainError('AUTHENTICATION_REQUIRED');
      const safe = toPublicApiError(domainError, trace);
      res.status(safe.status).json(safe.body);
      return;
    }
    const actor = actorResult.data;

    // 2. Resolve store; fail closed with 503 if absent or if the resolver throws
    let store: EvalPort | null = null;
    try {
      store = typeof options.store === 'function' ? options.store() : options.store;
    } catch {
      options.onFailure?.({ code: 'DEPENDENCY_UNAVAILABLE', ...trace });
      const domainError = new PlatformDomainError('DEPENDENCY_UNAVAILABLE');
      const safe = toPublicApiError(domainError, trace);
      res.status(safe.status).json(safe.body);
      return;
    }

    if (!store) {
      options.onFailure?.({ code: 'DEPENDENCY_UNAVAILABLE', ...trace });
      const domainError = new PlatformDomainError('DEPENDENCY_UNAVAILABLE');
      const safe = toPublicApiError(domainError, trace);
      res.status(safe.status).json(safe.body);
      return;
    }

    const counter = new RedisNotificationPreferenceCounter(store, windowSeconds, max, namespace);

    // 3. Increment and evaluate counter atomically in Redis (only wrap store calls in try/catch)
    let result: { allowed: boolean; remainingTtl: number; count: number };
    try {
      result = await counter.checkAndIncrement(actor);
    } catch {
      // Fail closed on store/evaluation errors: do NOT proceed with protected mutation
      options.onFailure?.({ code: 'DEPENDENCY_UNAVAILABLE', ...trace });
      const domainError = new PlatformDomainError('DEPENDENCY_UNAVAILABLE');
      const safe = toPublicApiError(domainError, trace);
      res.status(safe.status).json(safe.body);
      return;
    }

    // 4. Over limit check
    if (!result.allowed) {
      const retryAfterSeconds = Math.max(1, Math.min(result.remainingTtl, 86400));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', '0');
      res.setHeader('RateLimit-Reset', String(retryAfterSeconds));

      const domainError = new PlatformDomainError('RATE_LIMITED', {
        retryAfterSeconds,
      });
      const safe = toPublicApiError(domainError, trace);
      res.status(safe.status).json(safe.body);
      return;
    }

    // 5. Allowed within quota: invoke next() strictly AFTER Redis try/catch so downstream exceptions are not relabeled as 503
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - result.count)));
    res.setHeader('RateLimit-Reset', String(Math.max(1, result.remainingTtl)));
    return next();
  };
}

/**
 * Factory constructing the notification preference limiter from environment variables.
 * Requires HTTPS-only endpoints for the Redis REST identity.
 *
 * Note: Dedicated credentials (CONVERSATION_NOTIFICATION_REDIS_REST_URL and
 * CONVERSATION_NOTIFICATION_REDIS_REST_TOKEN) represent our reviewed architectural design choice
 * for domain isolation and blast radius containment (preventing noisy-neighbor or credential
 * exposure across unrelated subsystems).
 */
export function createNotificationPreferenceLimiterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    accountId: (req: Request) => unknown;
    windowSeconds?: number;
    max?: number;
    namespace?: string;
    onFailure?: (event: { code: string; correlationId: string; operationId: string }) => void;
  },
): RequestHandler {
  const url = env.CONVERSATION_NOTIFICATION_REDIS_REST_URL;
  const token = env.CONVERSATION_NOTIFICATION_REDIS_REST_TOKEN;
  let store: EvalPort | null = null;

  // Strict HTTPS-only protocol enforcement
  if (url && token && /^https:\/\//.test(url)) {
    try {
      store = new Redis({ url, token });
    } catch {
      store = null;
    }
  }

  return createNotificationPreferenceLimiter({
    ...options,
    store,
  });
}
