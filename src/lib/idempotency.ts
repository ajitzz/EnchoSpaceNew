import { Request, Response, NextFunction } from 'express';
import { Redis } from '@upstash/redis';

// Determine if Redis is configured
const isRedisConfigured = process.env.UPSTASH_REDIS_REST_URL && !process.env.UPSTASH_REDIS_REST_URL.includes('dummy');
const redis = isRedisConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// In-memory fallback if Redis is not available
const memoryStore = new Map<string, { status: number; body: any }>();

export const idempotencyMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Only apply to state-mutating requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = req.headers['x-idempotency-key'] as string;
  if (!idempotencyKey) {
    // If we strictly enforce it, we'd fail here. But let's just bypass if not provided to avoid breaking existing clients.
    return next();
  }

  // Namespace the key based on user if authenticated, else IP to prevent collisions across users
  const userId = (req as any).user?.id || req.ip;
  const scopedKey = `idempotency:${userId}:${idempotencyKey}`;

  try {
    if (redis) {
      const cachedResponse = await redis.get(scopedKey);
      if (cachedResponse) {
        const parsed = typeof cachedResponse === 'string' ? JSON.parse(cachedResponse) : cachedResponse;
        console.log(`[IDEMPOTENCY CACHE HIT] Reusing response for key ${scopedKey}`);
        return res.status(parsed.status).json(parsed.body);
      }
    } else {
      if (memoryStore.has(scopedKey)) {
        console.log(`[IDEMPOTENCY CACHE HIT] Reusing memory response for key ${scopedKey}`);
        const cached = memoryStore.get(scopedKey)!;
        return res.status(cached.status).json(cached.body);
      }
    }
  } catch (err) {
    console.warn(`[IDEMPOTENCY WARNING] Failed to read from cache:`, err);
    // Continue if cache fails
  }

  // Intercept response
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    // Cache the response if it's successful (2xx) or a client error (4xx) we want to cache.
    // E.g., we probably want to cache it regardless to prevent retries.
    const responseToCache = { status: res.statusCode, body };
    
    // Fire and forget cache save (24 hour expiry)
    if (redis) {
      redis.set(scopedKey, JSON.stringify(responseToCache), { ex: 86400 }).catch(e => console.warn('Redis set error', e));
    } else {
      memoryStore.set(scopedKey, responseToCache);
      // Clean up memory store after 24 hours (simplified)
      setTimeout(() => memoryStore.delete(scopedKey), 86400 * 1000);
    }
    
    return originalJson(body);
  };

  next();
};
