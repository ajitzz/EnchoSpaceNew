/**
 * src/server/marketing/databaseSecurityRouter.ts
 *
 * Express Router: Database Security & Row-Level Security (RLS) Operational Endpoints.
 * Fulfills Blueprint Domain 6 (Sprint 5 Specification), Section 9 & 11.
 *
 * Endpoints:
 * - GET  /api/operations/v1/security/rls-health : Returns live catalog RLS posture, table coverage, and role flags.
 * - POST /api/operations/v1/security/verify-isolation : Executes an adversarial cross-tenant query check.
 */

import { Router, type Request, type Response } from 'express';
import type pg from 'pg';
import { DatabaseSecurityService } from '../../services/databaseSecurityService.js';

export function createDatabaseSecurityRouter(pool: pg.Pool): Router {
  const router = Router();
  const service = new DatabaseSecurityService(pool);

  /**
   * GET /rls-health
   * Authoritative catalog check on PostgreSQL Row-Level Security status.
   */
  router.get('/rls-health', async (_req: Request, res: Response) => {
    try {
      const report = await service.auditRlsStatus();
      const httpStatus = report.healthy ? 200 : 503;
      return res.status(httpStatus).json(report);
    } catch (err: any) {
      console.error('[DATABASE_SECURITY_ROUTER] RLS audit error:', err);
      return res.status(500).json({
        error: 'Failed to inspect database security status',
        details: err?.message || String(err)
      });
    }
  });

  /**
   * POST /verify-isolation
   * Runs an adversarial test asserting that tenant A cannot see or update tenant B's records.
   */
  router.post('/verify-isolation', async (req: Request, res: Response) => {
    try {
      const { tenantAId, tenantBId } = req.body;
      if (!tenantAId || !tenantBId) {
        return res.status(400).json({ error: 'tenantAId and tenantBId are required numbers.' });
      }

      const result = await service.verifyCrossTenantIsolation(Number(tenantAId), Number(tenantBId));
      return res.json({
        success: result.isolated,
        ...result
      });
    } catch (err: any) {
      console.error('[DATABASE_SECURITY_ROUTER] Verification error:', err);
      return res.status(500).json({
        error: 'Cross-tenant isolation verification failed',
        details: err?.message || String(err)
      });
    }
  });

  return router;
}
