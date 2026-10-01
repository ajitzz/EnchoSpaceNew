import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  createNotificationPreferenceLimiter,
  type EvalPort,
} from '../server/conversations/notificationPreferenceLimiter.js';
import { createHttpExecutionContextMiddleware } from '../server/observability/httpExecutionContext.js';
import { publicApiErrorSchema } from '../shared/platform/apiError.js';

describe('R4-01 notification limiter error boundary', () => {
  it('returns authentication failure before attempting an unavailable store for an invalid actor', async () => {
    const app = express();
    const protectedHandler = vi.fn((_req: Request, res: Response) => res.sendStatus(204));
    app.use(createHttpExecutionContextMiddleware());
    app.put('/preferences', createNotificationPreferenceLimiter({
      store: null,
      accountId: () => undefined,
    }), protectedHandler);

    const response = await request(app).put('/preferences');
    expect(response.status).toBe(401);
    expect(publicApiErrorSchema.parse(response.body).code).toBe('AUTHENTICATION_REQUIRED');
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it('does not relabel a downstream synchronous failure as a pre-command Redis outage', async () => {
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
});
