/**
 * src/server/marketing/creativePackageRouter.ts
 *
 * FAANG L7/L8 Enterprise Creative Package Express Router (Sprint 2 / Domain 2).
 * Fulfills Decision 037-G & Blueprint Gap G-07.
 */

import { Router, Request, Response } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import {
  CreativePackageService,
  createCreativePackageSchema,
  type ModerationStatus
} from '../../services/creativePackageService.js';

export function createCreativePackageRouter(pool: pg.Pool): Router {
  const router = Router();
  const service = new CreativePackageService(pool);

  // 1. POST /: Create a new standalone creative package (e.g. 9:16 Reel)
  router.post('/', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const isAdmin = user.role === 'admin';
      const createdPackage = await service.createPackage(Number(user.id), req.body, isAdmin);

      return res.status(201).json({
        success: true,
        package: createdPackage,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: err.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
        });
      }
      const message = err.message || 'Failed to create creative package';
      const statusCode = message.includes('PERMISSION_DENIED') ? 403
        : message.includes('RIGHTS_ATTESTATION_REQUIRED') || message.includes('INVALID_ASPECT_RATIO') || message.includes('DURATION_EXCEEDED') || message.includes('INVALID_MEDIA_TYPE') ? 400
        : message.includes('NOT_FOUND') ? 404
        : 500;

      return res.status(statusCode).json({ error: message });
    }
  });

  // 2. GET /: List creative packages
  router.get('/', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const isAdmin = user.role === 'admin';
      const listingId = req.query.listingId ? Number(req.query.listingId) : undefined;
      const status = req.query.status as ModerationStatus | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;

      const packages = await service.listPackages({
        userId: Number(user.id),
        listingId,
        status,
        isAdmin,
        limit,
      });

      return res.json({
        success: true,
        packages,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to list creative packages' });
    }
  });

  // 3. GET /:id: Get package by ID
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const isAdmin = user.role === 'admin';
      const packageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const pkg = await service.getPackage(packageId, Number(user.id), isAdmin);

      if (!pkg) {
        return res.status(404).json({ error: 'Creative package not found' });
      }

      return res.json({
        success: true,
        package: pkg,
      });
    } catch (err: any) {
      const statusCode = err.message?.includes('PERMISSION_DENIED') ? 403 : 500;
      return res.status(statusCode).json({ error: err.message });
    }
  });

  // 4. POST /:id/moderate: Admin approve/reject
  const moderationSchema = z.object({
    decision: z.enum(['APPROVE', 'REJECT']),
    rejectionReasons: z.array(z.string()).optional().default([]),
  });

  router.post('/:id/moderate', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin authority required for creative moderation' });
      }

      const parsed = moderationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid moderation payload', details: parsed.error.format() });
      }

      const packageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const updated = await service.moderatePackage(
        packageId,
        Number(user.id),
        parsed.data.decision,
        parsed.data.rejectionReasons
      );

      return res.json({
        success: true,
        package: updated,
      });
    } catch (err: any) {
      const statusCode = err.message?.includes('NOT_FOUND') ? 404 : 500;
      return res.status(statusCode).json({ error: err.message });
    }
  });

  return router;
}
