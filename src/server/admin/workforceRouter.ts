import { Router, type Request, type Response } from 'express';
import type pg from 'pg';
import {
  WorkforceAdminService,
  validateSodRules,
  DEPARTMENT_ROLE_MAP,
  ROLE_DEPARTMENT_MAP,
} from '../../lib/iam/workforceAdminService.js';

interface AdminAuthRequest extends Request {
  user?: {
    id: number;
    role: string;
    email?: string;
    name?: string;
  };
}

export function createAdminWorkforceRouter(pool: pg.Pool): Router {
  const router = Router();
  const service = new WorkforceAdminService(pool);

  const getAdminUserId = (req: AdminAuthRequest): number => {
    const id = req.user?.id;
    if (!id || typeof id !== 'number') {
      throw new Error('UNAUTHORIZED_ADMIN: Admin identity missing from request context.');
    }
    return id;
  };

  // FAANG L7/L8 Schema Generation Preflight Circuit Breaker
  let isWorkforceSchemaReady = false;
  router.use(async (_req: Request, res: Response, next) => {
    try {
      if (isWorkforceSchemaReady) {
        return next();
      }
      const check = await pool.query(
        "SELECT to_regclass('public.internal_organization_memberships') IS NOT NULL AS ready"
      );
      if (!check.rows[0]?.ready) {
        return res.status(503).json({
          error: 'WORKFORCE_SCHEMA_UNAPPLIED',
          message: 'Workforce IAM schema generation (Migration 036) is not applied on this database instance. Run npm run migrate to synchronize schema.',
        });
      }
      isWorkforceSchemaReady = true;
      return next();
    } catch (err: any) {
      return res.status(503).json({
        error: 'DATABASE_PROBE_FAILED',
        message: err.message || 'Unable to verify workforce database schema readiness.',
      });
    }
  });

  /**
   * GET /api/admin/workforce/overview
   * Telemetry, department headcount, active sessions, and emergency quarantine status.
   */
  router.get('/overview', async (_req: Request, res: Response) => {
    try {
      const overview = await service.getWorkforceOverview();
      return res.json(overview);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to retrieve workforce overview' });
    }
  });

  /**
   * GET /api/admin/workforce/roster
   * Paginated, searchable staff roster.
   */
  router.get('/roster', async (req: Request, res: Response) => {
    try {
      const { department, roleKey, status, search, limit, offset } = req.query;
      const roster = await service.getStaffRoster({
        department: typeof department === 'string' ? department : undefined,
        roleKey: typeof roleKey === 'string' ? roleKey : undefined,
        status: typeof status === 'string' ? status : undefined,
        search: typeof search === 'string' ? search : undefined,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
      });
      return res.json(roster);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to retrieve staff roster' });
    }
  });

  /**
   * POST /api/admin/workforce/hire
   * Atomically provisions a staff account into the IAM registry, checks SoD rules,
   * sets blast radius limits, and generates magic onboarding link.
   */
  router.post('/hire', async (req: AdminAuthRequest, res: Response) => {
    try {
      const adminUserId = getAdminUserId(req);
      const appBaseUrl = `${req.protocol}://${req.get('host')}`;

      const result = await service.hireStaffMember({
        ...req.body,
        adminUserId,
        appBaseUrl,
      });

      return res.status(201).json(result);
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.startsWith('SOD_CONFLICT')) {
        return res.status(422).json({ error: msg, code: 'SOD_CONFLICT' });
      }
      if (
        msg.startsWith('STAFF_HIRE_ADMIN_CONFLICT') ||
        msg.startsWith('STAFF_MEMBER_OFFBOARDED') ||
        msg.startsWith('ROLE_NOT_FOUND')
      ) {
        return res.status(400).json({ error: msg });
      }
      return res.status(500).json({ error: msg || 'Staff hiring transaction failed' });
    }
  });

  /**
   * POST /api/admin/workforce/validate-sod
   * Live pre-flight check for Segregation of Duties conflicts before hiring.
   */
  router.post('/validate-sod', async (req: Request, res: Response) => {
    try {
      const { existingRoles = [], targetRoleKey } = req.body;
      if (!targetRoleKey) {
        return res.status(400).json({ error: 'targetRoleKey is required' });
      }
      const check = validateSodRules(existingRoles, targetRoleKey);
      return res.json(check);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'SoD validation failed' });
    }
  });

  /**
   * POST /api/admin/workforce/members/:id/lifecycle
   * 1-click Emergency Suspend, Force Logout, Resume, or Offboard.
   */
  router.post('/members/:id/lifecycle', async (req: AdminAuthRequest, res: Response) => {
    try {
      const adminUserId = getAdminUserId(req);
      const membershipId = req.params.id;
      const { action, reason } = req.body;

      const result = await service.executeLifecycleAction({
        membershipId,
        action,
        reason,
        adminUserId,
      });

      return res.json(result);
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.startsWith('MEMBERSHIP_NOT_FOUND')) {
        return res.status(404).json({ error: msg });
      }
      if (msg.startsWith('IAM_OFFBOARDING_TERMINAL')) {
        return res.status(409).json({ error: msg });
      }
      return res.status(500).json({ error: msg || 'Lifecycle execution failed' });
    }
  });

  /**
   * PATCH /api/admin/workforce/members/:id/quotas
   * Adjusts daily spend quota / velocity limits.
   */
  router.patch('/members/:id/quotas', async (req: AdminAuthRequest, res: Response) => {
    try {
      const adminUserId = getAdminUserId(req);
      const membershipId = req.params.id;
      const { maxDailySpendPaise, reason } = req.body;

      const result = await service.updateStaffQuotas({
        membershipId,
        maxDailySpendPaise,
        reason,
        adminUserId,
      });

      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to update staff quotas' });
    }
  });

  /**
   * GET /api/admin/workforce/authorizations
   * Lists staged Maker-Checker authorizations requiring Admin ratification.
   */
  router.get('/authorizations', async (_req: Request, res: Response) => {
    try {
      const result = await service.getPendingAuthorizations();
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to retrieve authorizations' });
    }
  });

  /**
   * POST /api/admin/workforce/authorizations/:id/decision
   * Ratifies (Approve/Reject) a staged high-risk Maker action.
   */
  router.post('/authorizations/:id/decision', async (req: AdminAuthRequest, res: Response) => {
    try {
      const adminUserId = getAdminUserId(req);
      const authorizationId = req.params.id;
      const { decision, reason } = req.body;

      const result = await service.ratifyAuthorization({
        authorizationId,
        decision,
        reason,
        adminUserId,
      });

      return res.json(result);
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.startsWith('AUTHORIZATION_NOT_FOUND')) {
        return res.status(404).json({ error: msg });
      }
      if (msg.startsWith('MAKER_CHECKER_SELF_APPROVAL_DENIED')) {
        return res.status(403).json({ error: msg });
      }
      return res.status(500).json({ error: msg || 'Failed to ratify authorization decision' });
    }
  });

  /**
   * GET /api/admin/workforce/audit
   * Paginated stream of workforce IAM audit events.
   */
  router.get('/audit', async (req: Request, res: Response) => {
    try {
      const { limit, offset, eventType } = req.query;
      const result = await service.getAuditEventStream({
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
        eventType: typeof eventType === 'string' ? eventType : undefined,
      });
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to retrieve audit events' });
    }
  });

  /**
   * POST /api/admin/workforce/audit/verify-chain
   * Mathematically recomputes and verifies the cryptographic Merkle hash chain.
   */
  router.post('/audit/verify-chain', async (_req: Request, res: Response) => {
    try {
      const result = await service.verifyMerkleAuditChain();
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Merkle chain verification failed' });
    }
  });

  /**
   * POST /api/admin/workforce/emergency-freeze
   * Nuclear Kill-Switch: Tier 1 (Staff), Tier 2 (Department), Tier 3 (Global Quarantine).
   */
  router.post('/emergency-freeze', async (req: AdminAuthRequest, res: Response) => {
    try {
      const adminUserId = getAdminUserId(req);
      const result = await service.executeEmergencyFreeze({
        ...req.body,
        adminUserId,
      });
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Emergency freeze execution failed' });
    }
  });

  /**
   * GET /api/admin/workforce/catalog
   * Returns departments and role metadata.
   */
  router.get('/catalog', async (_req: Request, res: Response) => {
    return res.json({
      departments: Object.keys(DEPARTMENT_ROLE_MAP),
      departmentRoleMap: DEPARTMENT_ROLE_MAP,
      roleDepartmentMap: ROLE_DEPARTMENT_MAP,
    });
  });

  return router;
}
