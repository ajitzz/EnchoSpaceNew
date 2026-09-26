/**
 * src/server/marketing/circuitBreakerRouter.ts
 *
 * FAANG L7/L8 Express Router for Smart Auto-Pause Circuit Breaker & Worker Daemon (Sprint 3 / Domain 4).
 * Fulfills Blueprint Gap G-03 (Auto-Pause) & Gap G-18 (DLQ & Jitter).
 */

import { Router, Request, Response } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { CircuitBreakerService } from '../../services/circuitBreakerService.js';

export function createCircuitBreakerRouter(pool: pg.Pool): Router {
  const router = Router();
  const service = new CircuitBreakerService(pool);

  // 1. GET /status: Returns active tripped circuit breakers and DLQ counts
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await service.getCircuitBreakerStatus();
      return res.json({
        success: true,
        ...status,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch circuit breaker status' });
    }
  });

  // 2. POST /evaluate: Evaluates occupancy across active campaigns or a specific campaign
  const evaluateSchema = z.object({
    campaignId: z.coerce.number().int().positive().optional(),
  });

  router.post('/evaluate', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const parsed = evaluateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid evaluation payload', details: parsed.error.format() });
      }

      const tripped = await service.evaluateOccupancyCircuitBreaker(parsed.data.campaignId);

      return res.json({
        success: true,
        trippedCount: tripped.length,
        trippedEvents: tripped,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to evaluate circuit breaker' });
    }
  });

  // 3. POST /override/:id: Admin override to resume an auto-paused campaign
  const overrideSchema = z.object({
    reason: z.string().min(10, 'A detailed reason (min 10 characters) is required for admin override'),
  });

  router.post('/override/:id', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin authority required to override a tripped circuit breaker' });
      }

      const parsed = overrideSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid override payload', details: parsed.error.format() });
      }

      const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await service.overrideCircuitBreaker(eventId, Number(user.id), parsed.data.reason);

      return res.json({
        ...result,
      });
    } catch (err: any) {
      const statusCode = err.message?.includes('EVENT_NOT_FOUND') ? 404 : 500;
      return res.status(statusCode).json({ error: err.message || 'Failed to override circuit breaker' });
    }
  });

  // 4. GET /dlq: List dead letter queue records
  router.get('/dlq', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const status = await service.getCircuitBreakerStatus();
      return res.json({
        success: true,
        deadLetters: status.recentDeadLetters,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch dead letter queue' });
    }
  });

  // 5. POST /dlq/:id/resolve: Admin resolve dead letter queue record
  const resolveDlqSchema = z.object({
    notes: z.string().min(3),
  });

  router.post('/dlq/:id/resolve', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin authority required to resolve DLQ items' });
      }

      const parsed = resolveDlqSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid resolution payload', details: parsed.error.format() });
      }

      const dlqId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const resolved = await service.resolveDeadLetter(dlqId, parsed.data.notes);

      if (!resolved) {
        return res.status(404).json({ error: 'Dead letter record not found' });
      }

      return res.json({
        success: true,
        resolved: true,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to resolve DLQ item' });
    }
  });

  return router;
}
