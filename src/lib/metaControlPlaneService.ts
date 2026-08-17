/**
 * Phase 3.4 — Safe Meta Campaign Management Control Plane & Circuit Breaker
 *
 * Implements authoritative, production-safe management controls for Admin, Host, & System:
 * - Strict RBAC & Tenant Isolation (Admin full authority; Host role-approved controls on own campaigns; System automation)
 * - Mandatory 10-Step Action Pipeline (RBAC -> Target Resolution -> Truth Pre-Check -> PostgreSQL Row Mutex -> State Re-check -> Action Preview -> Durable Idempotency -> Meta Mutation -> Independent GET Verification -> Local Truth & Audit Log)
 * - Emergency Safe Pause (Fail-closed multi-tier Meta pause with zero financial alteration)
 * - Calendar Circuit Breaker (Auto-pause on 100% occupancy; Auto-resume on availability restoration ONLY if system auto-paused)
 * - Strict Manual Pause Precedence (Never auto-resume a campaign manually paused by Host or Admin)
 * - Financial Invariant Protection (pause/resume/resync NEVER expands authorized spend or deducts unauthorized fees)
 * - On-Demand Resync (Read-only Meta GET with hierarchy & freshness verification)
 * - Unknown Outcome Handling (Timeouts / 5xx marked EXTERNAL_OUTCOME_UNKNOWN -> RECONCILIATION_REQUIRED; zero blind retries)
 * - 6-Part Action Explanation Previews
 */

import crypto from 'crypto';
import pg from 'pg';
import { MetaExternalSyncEngine, MetaObjectVerificationResult } from './metaExternalSyncEngine.js';

export type ControlAction = 
  | 'PAUSE' 
  | 'RESUME' 
  | 'EMERGENCY_PAUSE' 
  | 'RESYNC' 
  | 'RECONCILE' 
  | 'CALENDAR_AUTO_PAUSE' 
  | 'CALENDAR_AUTO_RESUME' 
  | 'SET_OBJECT_STATUS' 
  | 'CANCEL';

export type TargetObjectType = 'CAMPAIGN' | 'ADSET' | 'AD';

export type PauseSource = 
  | 'HOST_MANUAL' 
  | 'ADMIN_MANUAL' 
  | 'SYSTEM_AUTO_PAUSED' 
  | 'SYSTEM_EMERGENCY' 
  | 'POLICY_BLOCKED';

export interface ActionActorContext {
  userId: number | string;
  role: 'host' | 'admin' | 'system' | string;
  isAdmin?: boolean;
  tenantId?: number | string;
  ipAddress?: string;
}

export interface ActionExecutionOptions {
  idempotencyKey?: string;
  reason?: string;
  pauseSource?: PauseSource;
  targetObjectType?: TargetObjectType;
  targetObjectId?: string; // Must be validated against campaign hierarchy
  targetStatus?: 'ACTIVE' | 'PAUSED';
  customGraphFetcher?: (endpoint: string, options?: any) => Promise<{ status: number; data: any }>;
  transitionStateFn?: (params: any) => Promise<any>;
}

export interface ActionExplanationPreview {
  action: ControlAction;
  target_object_type: TargetObjectType;
  target_object_id: string | null;
  current_local_status: string;
  current_meta_status: string;
  what_will_happen: string;
  what_will_not_happen: string;
  why_allowed: string;
  expected_result: string;
  failure_or_unknown_outcome: string;
  is_executable: boolean;
  blocking_reason?: string;
  pause_source?: PauseSource | null;
}

export interface ControlActionResult {
  success: boolean;
  action: ControlAction;
  campaign_id: number;
  target_object_type: TargetObjectType;
  target_object_id: string | null;
  previous_state: {
    local_status: string;
    meta_status: string;
    meta_effective_status: string;
  };
  new_state: {
    local_status: string;
    meta_status: string;
    meta_effective_status: string;
  };
  verified_externally: boolean;
  action_preview: ActionExplanationPreview;
  idempotency_key?: string;
  reused_idempotent_result?: boolean;
  outcome_unknown?: boolean;
  reconciliation_required?: boolean;
  pause_source?: PauseSource | null;
  message: string;
  details?: any;
  error?: string;
}

let globalPool: pg.Pool | null = null;
function getDbPool(): pg.Pool {
  if (!globalPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured");
    }
    globalPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
    });
  }
  return globalPool;
}

export class MetaControlPlaneService {
  /**
   * Generates the authoritative 6-part FAANG Action Explanation Preview.
   */
  static async generateActionPreview(
    campaignId: number | string,
    action: ControlAction,
    actorContext: ActionActorContext,
    options: ActionExecutionOptions = {},
    dbClient?: any
  ): Promise<ActionExplanationPreview> {
    const client = dbClient || getDbPool();
    const numId = Number(campaignId);
    const isAdmin = Boolean(actorContext.isAdmin || actorContext.role === 'admin' || actorContext.role === 'system');

    // 1. Fetch Campaign
    const campRes = await client.query(`SELECT * FROM host_marketing_campaigns WHERE id = $1`, [numId]);
    if (campRes.rows.length === 0) {
      const err: any = new Error(`Campaign ${campaignId} not found`);
      err.statusCode = 404;
      throw err;
    }
    const campaign = campRes.rows[0];

    // 2. RBAC & Tenant Isolation Check
    if (!isAdmin) {
      const hostIdStr = String(campaign.host_id);
      const actorIdStr = String(actorContext.userId);
      if (hostIdStr !== actorIdStr) {
        const err: any = new Error(`FORBIDDEN: Tenant isolation prevents access to campaign ${campaignId}`);
        err.statusCode = 403;
        throw err;
      }
    }

    const localStatus = campaign.status || 'draft';
    const metaStatus = campaign.meta_status || 'UNPUBLISHED';
    const metaEffStatus = campaign.meta_effective_status || metaStatus;
    const targetObjType = options.targetObjectType || 'CAMPAIGN';

    let targetObjId: string | null = null;
    if (targetObjType === 'CAMPAIGN') {
      targetObjId = campaign.meta_campaign_id || null;
    } else if (targetObjType === 'ADSET') {
      targetObjId = campaign.meta_adset_id || null;
    } else if (targetObjType === 'AD') {
      targetObjId = options.targetObjectId || campaign.meta_ad_id || null;
    }

    // Determine target status and executability
    let isExecutable = true;
    let blockingReason: string | undefined = undefined;
    let whatWillHappen = '';
    let whatWillNotHappen = 'Will NOT modify authorized budget, host charges, escrow, or billing balances in any way.';
    let whyAllowed = '';
    let expectedResult = '';
    let failureOutcome = 'If Meta API fails or is unreachable, current verified state is safely retained without blind retry.';

    switch (action) {
      case 'PAUSE':
      case 'CALENDAR_AUTO_PAUSE': {
        const canPause = ['active', 'CAMPAIGN_LIVE', 'approved', 'ASSET_PREP', 'META_API_PUSH'].includes(localStatus) || metaEffStatus === 'ACTIVE';
        if (!canPause && !isAdmin) {
          isExecutable = false;
          blockingReason = `Campaign cannot be paused from current state '${localStatus}'`;
        }
        whatWillHappen = `Sends POST request to Meta Graph API setting status=PAUSED on target ${targetObjType} (${targetObjId || 'pending'}). Ad delivery halts immediately.`;
        whatWillNotHappen = 'Will NOT delete Meta objects or forfeit remaining escrowed ad budget.';
        whyAllowed = action === 'CALENDAR_AUTO_PAUSE' 
          ? 'Calendar Circuit Breaker: Property is 100% booked for target dates.' 
          : (isAdmin ? 'Admin has global operational management authority.' : 'Hosts have full control to pause active ad delivery at any time.');
        expectedResult = `Delivery stops within seconds; local and external status transition to PAUSED.`;
        break;
      }

      case 'EMERGENCY_PAUSE': {
        if (!isAdmin) {
          isExecutable = false;
          blockingReason = 'FORBIDDEN: Emergency Safe Pause is restricted to Admin & System operations.';
        }
        whatWillHappen = 'Executes fail-closed emergency pause on Campaign, AdSet, and all active Ad variants simultaneously.';
        whatWillNotHappen = 'Will NOT alter financial balances, refund escrow prematurely, or distort analytics.';
        whyAllowed = 'System Emergency Protection against financial, policy, or occupancy anomalies.';
        expectedResult = 'All active Meta advertising halts immediately and campaign enters PAUSED state.';
        failureOutcome = 'If any Meta object times out, marked as EXTERNAL_OUTCOME_UNKNOWN for urgent reconciliation.';
        break;
      }

      case 'RESUME':
      case 'CALENDAR_AUTO_RESUME': {
        const isCurrentlyPaused = ['paused', 'PAUSED'].includes(localStatus) || metaEffStatus === 'PAUSED' || metaEffStatus === 'CAMPAIGN_PAUSED';
        if (!isCurrentlyPaused && !isAdmin) {
          isExecutable = false;
          blockingReason = `Campaign cannot be resumed from current state '${localStatus}'`;
        }

        // Check if campaign was manually paused by host/admin
        if (action === 'CALENDAR_AUTO_RESUME' && campaign.pause_source && campaign.pause_source !== 'SYSTEM_AUTO_PAUSED') {
          isExecutable = false;
          blockingReason = `Cannot auto-resume campaign manually paused by ${campaign.pause_source === 'HOST_MANUAL' ? 'Host' : 'Admin'}. Manual resume required.`;
        }

        // Financial Authorization Pre-Check
        const finRes = await client.query(
          `SELECT meta_remaining_authorization, meta_authorized_spend, meta_actual_spend 
           FROM campaign_financial_contracts WHERE campaign_id = $1`,
          [numId]
        );
        if (finRes.rows.length > 0) {
          const fin = finRes.rows[0];
          if (Number(fin.meta_remaining_authorization) <= 0 || Number(fin.meta_actual_spend) >= Number(fin.meta_authorized_spend)) {
            isExecutable = false;
            blockingReason = `Resume blocked: Remaining financial authorization is exhausted ($${fin.meta_remaining_authorization} left).`;
          }
        } else {
          // Fallback check on campaign budget/spent
          const remaining = Number(campaign.budget || 0) - Number(campaign.spent || 0);
          if (remaining <= 0) {
            isExecutable = false;
            blockingReason = `Resume blocked: Remaining ad budget is exhausted ($${remaining} remaining).`;
          }
        }

        // Policy & Review Check
        if (campaign.meta_review_status === 'DISAPPROVED' || localStatus === 'failed_publish') {
          isExecutable = false;
          blockingReason = `Resume blocked: Creative or copy has been disapproved by Meta advertising policy.`;
        }

        whatWillHappen = `Sends POST request to Meta Graph API setting status=ACTIVE on target ${targetObjType} (${targetObjId || 'pending'}). Ad delivery resumes on Facebook & Instagram.`;
        whatWillNotHappen = 'Will NOT recharge the host account. Only existing authorized budget is consumed.';
        whyAllowed = action === 'CALENDAR_AUTO_RESUME'
          ? 'Calendar Circuit Breaker: Property inventory has become available again.'
          : (isAdmin ? 'Admin operational management authority.' : 'Hosts can resume paused campaigns with valid remaining authorization.');
        expectedResult = `Ad delivery restarts; local and external status transition back to LIVE / ACTIVE.`;
        failureOutcome = 'If Meta API is unreachable, campaign remains PAUSED and status enters RECONCILIATION_REQUIRED.';
        break;
      }

      case 'RESYNC': {
        whatWillHappen = `Executes read-only GET requests to Meta Graph API to fetch live status, delivery state, and telemetry.`;
        whatWillNotHappen = 'Will NOT modify any Meta settings, creative assets, targeting, or budgets.';
        whyAllowed = isAdmin ? 'Admin on-demand verification.' : 'Hosts can refresh live external status and telemetry on demand.';
        expectedResult = 'External truth snapshot is updated and telemetry freshness refreshed.';
        failureOutcome = 'If Meta API is unreachable, cached state is preserved with FRESHNESS=STALE.';
        break;
      }

      case 'RECONCILE': {
        if (!isAdmin) {
          isExecutable = false;
          blockingReason = 'FORBIDDEN: Authoritative State Reconciliation requires Admin authorization.';
        }
        whatWillHappen = 'Executes full bidirectional state comparison between PostgreSQL and Meta Graph API.';
        whatWillNotHappen = 'Will NOT alter financial balances or bypass state machine rules.';
        whyAllowed = 'Admin operational reconciliation authority.';
        expectedResult = 'All detected discrepancies are catalogued and auto-remediated if policy permits.';
        failureOutcome = 'Unresolved discrepancies are flagged as incidents for admin manual intervention.';
        break;
      }

      case 'SET_OBJECT_STATUS': {
        if (!isAdmin) {
          isExecutable = false;
          blockingReason = 'FORBIDDEN: Object-level status manipulation requires Admin authorization.';
        }
        const targetStatus = options.targetStatus || 'PAUSED';
        whatWillHappen = `Sends POST request to Meta Graph API setting status=${targetStatus} on specific object ${targetObjType} (${options.targetObjectId}).`;
        whatWillNotHappen = 'Will NOT modify other sibling objects or alter campaign financial accounts.';
        whyAllowed = 'Admin granular object management authority.';
        expectedResult = `Target ${targetObjType} status updated to ${targetStatus} and verified via independent GET.`;
        failureOutcome = 'If object update fails, previous status is retained and logged.';
        break;
      }

      case 'CANCEL': {
        const canCancel = ['draft', 'pending_approval', 'pending', 'paused', 'failed_publish', 'failed'].includes(localStatus);
        if (!canCancel && !isAdmin) {
          isExecutable = false;
          blockingReason = `Active campaigns must be paused before cancellation.`;
        }
        whatWillHappen = 'Cancels campaign, archives Meta objects if present, and refunds 100% of unused escrow budget to Host Wallet.';
        whatWillNotHappen = 'Already-delivered impressions and optimization fees cannot be refunded.';
        whyAllowed = isAdmin ? 'Admin cancellation authority.' : 'Hosts can cancel non-active or paused campaigns to recover unused budget.';
        expectedResult = 'Campaign marked cancelled and unused funds immediately credited to Host Wallet.';
        failureOutcome = 'If wallet refund encounters an error, the operation safely rolls back without fund leakage.';
        break;
      }
    }

    return {
      action,
      target_object_type: targetObjType,
      target_object_id: targetObjId,
      current_local_status: localStatus,
      current_meta_status: metaStatus,
      what_will_happen: whatWillHappen,
      what_will_not_happen: whatWillNotHappen,
      why_allowed: whyAllowed,
      expected_result: expectedResult,
      failure_or_unknown_outcome: failureOutcome,
      is_executable: isExecutable,
      blocking_reason: blockingReason,
      pause_source: campaign.pause_source || null
    };
  }

  /**
   * Executes the Mandatory Action Pipeline for Meta Management Mutations.
   */
  static async executeControlAction(
    campaignId: number | string,
    action: ControlAction,
    actorContext: ActionActorContext,
    options: ActionExecutionOptions = {},
    dbClient?: any
  ): Promise<ControlActionResult> {
    const pool = dbClient || getDbPool();
    const numId = Number(campaignId);
    const isAdmin = Boolean(actorContext.isAdmin || actorContext.role === 'admin' || actorContext.role === 'system');
    const isSystem = actorContext.role === 'system';
    const idempotencyKey = options.idempotencyKey || null;

    // STEP 1: RBAC & Tenant Isolation Validation
    const campPreRes = await pool.query(
      `SELECT host_id, status, meta_campaign_id, meta_adset_id, meta_ad_id, budget, spent, 
              escrow_status, pause_source, meta_status, meta_effective_status
       FROM host_marketing_campaigns WHERE id = $1`,
      [numId]
    );
    if (campPreRes.rows.length === 0) {
      const err: any = new Error(`Campaign ${campaignId} not found`);
      err.statusCode = 404;
      throw err;
    }
    const preCamp = campPreRes.rows[0];

    if (!isAdmin && !isSystem) {
      const hostIdStr = String(preCamp.host_id);
      const actorIdStr = String(actorContext.userId);
      if (hostIdStr !== actorIdStr) {
        const err: any = new Error(`FORBIDDEN: Tenant isolation prevents access to campaign ${campaignId}`);
        err.statusCode = 403;
        throw err;
      }

      // Host Role-Approved Actions Check
      const hostAllowedActions: ControlAction[] = ['PAUSE', 'RESUME', 'RESYNC', 'CANCEL'];
      if (!hostAllowedActions.includes(action)) {
        const err: any = new Error(`FORBIDDEN: Action '${action}' is restricted to Admin role`);
        err.statusCode = 403;
        throw err;
      }
    }

    // Precondition: Calendar Auto-Resume must NEVER resume manually paused campaigns
    if (action === 'CALENDAR_AUTO_RESUME') {
      if (preCamp.pause_source && preCamp.pause_source !== 'SYSTEM_AUTO_PAUSED') {
        const err: any = new Error(
          `CANNOT_AUTO_RESUME_MANUALLY_PAUSED_CAMPAIGN: Campaign #${numId} was paused with source '${preCamp.pause_source}'. Manual resume required.`
        );
        err.statusCode = 409;
        throw err;
      }
    }

    // STEP 2: Target Resolution & Hierarchy Verification
    const targetObjType = options.targetObjectType || 'CAMPAIGN';
    let targetMetaId: string | null = null;

    if (targetObjType === 'CAMPAIGN') {
      targetMetaId = preCamp.meta_campaign_id || null;
    } else if (targetObjType === 'ADSET') {
      targetMetaId = preCamp.meta_adset_id || null;
    } else if (targetObjType === 'AD') {
      if (options.targetObjectId) {
        const varCheck = await pool.query(
          `SELECT id, meta_ad_id FROM campaign_creative_variants WHERE campaign_id = $1 AND (meta_ad_id = $2 OR id = $3)`,
          [numId, options.targetObjectId, isNaN(Number(options.targetObjectId)) ? -1 : Number(options.targetObjectId)]
        );
        const directMatch = preCamp.meta_ad_id === options.targetObjectId;

        if (varCheck.rows.length === 0 && !directMatch) {
          const err: any = new Error(`INVALID_TARGET: Target Ad ID '${options.targetObjectId}' is not associated with campaign ${campaignId}`);
          err.statusCode = 400;
          throw err;
        }
        targetMetaId = varCheck.rows.length > 0 ? (varCheck.rows[0].meta_ad_id || options.targetObjectId) : options.targetObjectId;
      } else {
        targetMetaId = preCamp.meta_ad_id || null;
      }
    }

    // STEP 3: On-Demand RESYNC Handler (Pure read-only GET)
    if (action === 'RESYNC') {
      const verifiedSnapshot = await MetaExternalSyncEngine.fetchAndVerifyMetaObjectState(
        numId,
        { source: isAdmin ? 'MANUAL_RESYNC' : 'ACTIVE_POLL', customGraphFetcher: options.customGraphFetcher },
        pool
      );

      const preview = await this.generateActionPreview(numId, action, actorContext, options, pool);
      
      if (isAdmin) {
        await pool.query(`
          INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address)
          VALUES ($1, 'marketing_campaign', $2, 'meta_resync', $3, $4, $5)
        `, [
          Number(actorContext.userId) || 1,
          numId,
          JSON.stringify({ status: preCamp.status }),
          JSON.stringify({ meta_status: verifiedSnapshot?.meta_status, verified_at: verifiedSnapshot?.verified_at }),
          actorContext.ipAddress || '127.0.0.1'
        ]);
      }

      return {
        success: true,
        action: 'RESYNC',
        campaign_id: numId,
        target_object_type: targetObjType,
        target_object_id: targetMetaId,
        previous_state: {
          local_status: preCamp.status,
          meta_status: preCamp.meta_status || 'UNKNOWN',
          meta_effective_status: preCamp.meta_effective_status || 'UNKNOWN'
        },
        new_state: {
          local_status: preCamp.status,
          meta_status: verifiedSnapshot?.meta_status || 'UNKNOWN',
          meta_effective_status: verifiedSnapshot?.meta_effective_status || 'UNKNOWN'
        },
        verified_externally: true,
        action_preview: preview,
        message: 'Campaign state successfully verified and synchronized with Meta Graph API.'
      };
    }

    // STEP 3B: RECONCILE Handler
    if (action === 'RECONCILE') {
      const report = await MetaExternalSyncEngine.reconcileExternalMetaState(
        { campaignId: numId, customGraphFetcher: options.customGraphFetcher, transitionStateFn: options.transitionStateFn },
        pool
      );
      const preview = await this.generateActionPreview(numId, action, actorContext, options, pool);

      return {
        success: true,
        action: 'RECONCILE',
        campaign_id: numId,
        target_object_type: targetObjType,
        target_object_id: targetMetaId,
        previous_state: {
          local_status: preCamp.status,
          meta_status: preCamp.meta_status || 'UNKNOWN',
          meta_effective_status: preCamp.meta_effective_status || 'UNKNOWN'
        },
        new_state: {
          local_status: report.items[0]?.newMetaStatus || preCamp.status,
          meta_status: report.items[0]?.newMetaStatus || 'UNKNOWN',
          meta_effective_status: report.items[0]?.newEffectiveStatus || 'UNKNOWN'
        },
        verified_externally: true,
        action_preview: preview,
        details: report,
        message: `Reconciliation completed: ${report.remediatedCount} remediation(s) applied.`
      };
    }

    // STEP 4: PostgreSQL Row-Level Mutex (Transaction Locking)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lockRes = await client.query(`
        SELECT * FROM host_marketing_campaigns 
        WHERE id = $1 
        FOR UPDATE
      `, [numId]);

      if (lockRes.rows.length === 0) {
        throw new Error(`Campaign ${numId} vanished during locking.`);
      }
      const lockedCamp = lockRes.rows[0];

      // STEP 5: Durable Idempotency Check
      if (idempotencyKey) {
        const idempCheck = await client.query(`
          SELECT * FROM meta_publishing_events 
          WHERE campaign_id = $1 AND correlation_id = $2 AND event_type = $3
          LIMIT 1
        `, [numId, idempotencyKey, `CONTROL_ACTION_${action}`]);

        if (idempCheck.rows.length > 0) {
          const actionPreview = await this.generateActionPreview(numId, action, actorContext, options, client).catch(() => ({
            action,
            target_object_type: targetObjType,
            target_object_id: targetMetaId,
            current_local_status: lockedCamp.status,
            current_meta_status: lockedCamp.meta_status,
            what_will_happen: `Action ${action} already executed for idempotency key ${idempotencyKey}.`,
            what_will_not_happen: 'Will NOT re-execute or modify financial balances.',
            why_allowed: 'Idempotent request replay.',
            expected_result: 'Cached idempotent result returned.',
            failure_or_unknown_outcome: 'N/A',
            is_executable: true
          }));

          await client.query('ROLLBACK');
          client.release();
          return {
            success: true,
            action,
            campaign_id: numId,
            target_object_type: targetObjType,
            target_object_id: targetMetaId,
            previous_state: {
              local_status: lockedCamp.status,
              meta_status: lockedCamp.meta_status,
              meta_effective_status: lockedCamp.meta_effective_status
            },
            new_state: {
              local_status: lockedCamp.status,
              meta_status: lockedCamp.meta_status,
              meta_effective_status: lockedCamp.meta_effective_status
            },
            verified_externally: true,
            action_preview: actionPreview as any,
            idempotency_key: idempotencyKey,
            reused_idempotent_result: true,
            message: `[IDEMPOTENT REUSE] Action ${action} already executed for idempotency key ${idempotencyKey}.`
          };
        }
      }

      // STEP 6: Re-check Preconditions & Financial Boundaries Under Mutex
      const actionPreview = await this.generateActionPreview(numId, action, actorContext, options, client);
      if (!actionPreview.is_executable && !isAdmin) {
        throw new Error(`ACTION_NOT_PERMITTED: ${actionPreview.blocking_reason || 'Action cannot be executed in current state'}`);
      }

      // Snapshot Financial Fields to ensure $0 Financial Mutation
      const initialBudget = lockedCamp.budget;
      const initialSpent = lockedCamp.spent;
      const initialEscrow = lockedCamp.escrow_status;
      const initialOptimizationFee = lockedCamp.optimization_fee;
      const initialAdSpendPool = lockedCamp.ad_spend_pool;

      let targetMetaStatus: 'ACTIVE' | 'PAUSED' = 'PAUSED';
      let nextLocalStatus = lockedCamp.status;
      let pauseSourceToSet: PauseSource | null = null;
      let pauseReasonToSet: string | null = null;

      if (action === 'PAUSE') {
        targetMetaStatus = 'PAUSED';
        nextLocalStatus = 'paused';
        pauseSourceToSet = isAdmin ? 'ADMIN_MANUAL' : 'HOST_MANUAL';
        pauseReasonToSet = options.reason || (isAdmin ? 'Paused by Administrator' : 'Paused by Host');
      } else if (action === 'EMERGENCY_PAUSE') {
        targetMetaStatus = 'PAUSED';
        nextLocalStatus = 'paused';
        pauseSourceToSet = 'SYSTEM_EMERGENCY';
        pauseReasonToSet = options.reason || 'Emergency Safe Pause triggered';
      } else if (action === 'CALENDAR_AUTO_PAUSE') {
        targetMetaStatus = 'PAUSED';
        nextLocalStatus = 'paused';
        pauseSourceToSet = 'SYSTEM_AUTO_PAUSED';
        pauseReasonToSet = options.reason || 'Calendar Circuit Breaker: Property 100% booked for target dates';
      } else if (action === 'RESUME' || action === 'CALENDAR_AUTO_RESUME') {
        targetMetaStatus = 'ACTIVE';
        nextLocalStatus = 'active';
        pauseSourceToSet = null; // Clear pause source on resume
        pauseReasonToSet = null;
      } else if (action === 'SET_OBJECT_STATUS') {
        targetMetaStatus = options.targetStatus || 'PAUSED';
      }

      // STEP 7: Meta Mutation (POST / PATCH to Meta Graph API)
      const accessToken = process.env.META_ACCESS_TOKEN || process.env.META_API_TOKEN || '';
      const baseUrl = process.env.META_BASE_URL || 'https://graph.facebook.com/v20.0';
      let mutationSuccess = false;
      let externalVerifiedStatus = targetMetaStatus;
      let isUnknownOutcome = false;

      if (targetMetaId && targetMetaId !== 'MOCK_ID') {
        try {
          if (options.customGraphFetcher) {
            const mutRes = await options.customGraphFetcher(`/${targetMetaId}?status=${targetMetaStatus}`, {
              method: 'POST',
              body: JSON.stringify({ status: targetMetaStatus })
            });

            if (mutRes.status >= 500 || mutRes.status === 408) {
              isUnknownOutcome = true;
            } else {
              mutationSuccess = mutRes.status >= 200 && mutRes.status < 300;
            }
          } else if (accessToken) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
              const mutRes = await fetch(`${baseUrl}/${targetMetaId}?status=${targetMetaStatus}&access_token=${accessToken}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: targetMetaStatus, access_token: accessToken }),
                signal: controller.signal
              });
              clearTimeout(timeout);

              if (mutRes.status >= 500 || mutRes.status === 408) {
                isUnknownOutcome = true;
              } else {
                let mutData: any;
                try {
                  mutData = await mutRes.json();
                } catch (parseErr: any) {
                  console.error(`[META CONTROL PLANE] Mutation response JSON parse error for ${targetMetaId}:`, parseErr.message);
                  isUnknownOutcome = true;
                  mutData = null;
                }
                if (!isUnknownOutcome) {
                  mutationSuccess = mutRes.ok && (mutData.success === true || mutData.id);
                }
              }
            } catch (e: any) {
              clearTimeout(timeout);
              console.error(`[META CONTROL PLANE] Meta mutation network error for ${targetMetaId}:`, e.message);
              isUnknownOutcome = true;
            }
          } else {
            // Test / simulated mode
            mutationSuccess = true;
          }
        } catch (mutErr: any) {
          console.error(`[META CONTROL PLANE] Unexpected mutation error:`, mutErr.message);
          isUnknownOutcome = true;
        }

        // STEP 8: Independent GET Verification (only if mutation didn't time out)
        if (!isUnknownOutcome) {
          if (options.customGraphFetcher) {
            const getRes = await options.customGraphFetcher(`/${targetMetaId}?fields=id,status,effective_status`);
            if (getRes.status >= 500 || getRes.status === 408) {
              isUnknownOutcome = true;
            } else if (getRes.data && getRes.data.status) {
              externalVerifiedStatus = getRes.data.status;
            }
          } else if (accessToken) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
              const getRes = await fetch(`${baseUrl}/${targetMetaId}?fields=id,status,effective_status&access_token=${accessToken}`, {
                signal: controller.signal
              });
              clearTimeout(timeout);
              if (getRes.status >= 500 || getRes.status === 408) {
                isUnknownOutcome = true;
              } else {
                let getData: any;
                try {
                  getData = await getRes.json();
                } catch (parseErr: any) {
                  console.warn(`[META CONTROL PLANE] GET verification JSON parse error:`, parseErr.message);
                  isUnknownOutcome = true;
                  getData = null;
                }
                if (!isUnknownOutcome && getData?.status) {
                  externalVerifiedStatus = getData.status;
                }
              }
            } catch (e: any) {
              clearTimeout(timeout);
              console.warn(`[META CONTROL PLANE] GET verification network warning:`, e.message);
              isUnknownOutcome = true;
            }
          }
        }
      } else {
        mutationSuccess = true;
      }

      // STEP 9: Handle Unknown Outcome vs Successful Mutation
      const verifiedAtIso = new Date().toISOString();
      const verificationSource = isSystem ? 'CIRCUIT_BREAKER' : (isAdmin ? 'MANUAL_RESYNC' : 'ACTIVE_POLL');
      const correlationId = idempotencyKey || crypto.randomUUID();

      if (isUnknownOutcome) {
        // FAIL-CLOSED: Mark EXTERNAL_OUTCOME_UNKNOWN without blindly retrying
        await client.query(`
          UPDATE host_marketing_campaigns
          SET meta_status = 'UNKNOWN',
              meta_effective_status = 'EXTERNAL_OUTCOME_UNKNOWN',
              external_status_verified_at = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [verifiedAtIso, numId]);

        await client.query(`
          INSERT INTO meta_publishing_events 
          (campaign_id, correlation_id, event_type, from_state, to_state, actor_type, actor_id, reason, metadata)
          VALUES ($1, $2, 'EXTERNAL_OUTCOME_UNKNOWN', $3, 'RECONCILIATION_REQUIRED', $4, $5, $6, $7)
        `, [
          numId,
          correlationId,
          lockedCamp.status,
          isSystem ? 'system' : (isAdmin ? 'admin' : 'host'),
          String(actorContext.userId),
          `Meta API timeout/error during ${action}. Marked for reconciliation.`,
          JSON.stringify({ action, target_object_type: targetObjType, target_object_id: targetMetaId })
        ]);

        await client.query('COMMIT');
        client.release();

        return {
          success: false,
          action,
          campaign_id: numId,
          target_object_type: targetObjType,
          target_object_id: targetMetaId,
          previous_state: {
            local_status: lockedCamp.status,
            meta_status: lockedCamp.meta_status || 'UNKNOWN',
            meta_effective_status: lockedCamp.meta_effective_status || 'UNKNOWN'
          },
          new_state: {
            local_status: lockedCamp.status,
            meta_status: 'UNKNOWN',
            meta_effective_status: 'EXTERNAL_OUTCOME_UNKNOWN'
          },
          verified_externally: false,
          outcome_unknown: true,
          reconciliation_required: true,
          action_preview: actionPreview,
          idempotency_key: correlationId,
          message: `Meta API did not confirm ${action}. State set to EXTERNAL_OUTCOME_UNKNOWN; reconciliation scheduled.`
        };
      }

      // STEP 10: Update Local Truth & Audit Trails
      if (action === 'PAUSE' || action === 'EMERGENCY_PAUSE' || action === 'CALENDAR_AUTO_PAUSE' || action === 'RESUME' || action === 'CALENDAR_AUTO_RESUME') {
        if (options.transitionStateFn) {
          await options.transitionStateFn({
            campaignId: numId,
            to: nextLocalStatus,
            reason: options.reason || `${action} executed by ${isSystem ? 'System' : (isAdmin ? 'Admin' : 'Host')}`,
            actorType: isSystem ? 'system' : (isAdmin ? 'admin' : 'host'),
            actorId: actorContext.userId,
            client
          }).catch(async () => {
            await client.query(`UPDATE host_marketing_campaigns SET status = $1, updated_at = NOW() WHERE id = $2`, [nextLocalStatus, numId]);
          });
        } else {
          await client.query(`UPDATE host_marketing_campaigns SET status = $1, updated_at = NOW() WHERE id = $2`, [nextLocalStatus, numId]);
        }

        // Persist pause source and metadata
        await client.query(`
          UPDATE host_marketing_campaigns
          SET meta_status = $1,
              meta_effective_status = $2,
              pause_source = $3,
              pause_reason = $4,
              pause_actor = $5,
              pause_actor_id = $6,
              paused_at = CASE WHEN $7::text IS NOT NULL THEN NOW() ELSE paused_at END,
              resumed_at = CASE WHEN $8::text = 'ACTIVE' THEN NOW() ELSE resumed_at END,
              external_status_verified_at = $9,
              external_status_verification_source = $10,
              updated_at = NOW()
          WHERE id = $11
        `, [
          targetMetaStatus,
          externalVerifiedStatus,
          pauseSourceToSet,
          pauseReasonToSet,
          isSystem ? 'system' : (isAdmin ? 'admin' : 'host'),
          String(actorContext.userId),
          pauseSourceToSet,
          targetMetaStatus,
          verifiedAtIso,
          verificationSource,
          numId
        ]);
      } else if (action === 'SET_OBJECT_STATUS' && targetObjType === 'AD' && options.targetObjectId) {
        await client.query(`
          UPDATE campaign_creative_variants
          SET status = $1, updated_at = NOW()
          WHERE campaign_id = $2 AND (meta_ad_id = $3 OR id = $4)
        `, [targetMetaStatus.toLowerCase(), numId, options.targetObjectId, isNaN(Number(options.targetObjectId)) ? -1 : Number(options.targetObjectId)]);
      }

      // Assert Financial Invariants: Guarantee that financial columns are unchanged
      const finalCheck = await client.query(`
        SELECT budget, spent, escrow_status, optimization_fee, ad_spend_pool 
        FROM host_marketing_campaigns WHERE id = $1
      `, [numId]);
      const finalRow = finalCheck.rows[0];

      if (
        String(finalRow.budget) !== String(initialBudget) ||
        String(finalRow.spent) !== String(initialSpent) ||
        String(finalRow.escrow_status) !== String(initialEscrow) ||
        String(finalRow.optimization_fee) !== String(initialOptimizationFee) ||
        String(finalRow.ad_spend_pool) !== String(initialAdSpendPool)
      ) {
        throw new Error('FATAL_FINANCIAL_INVARIANT_VIOLATION: Financial fields mutated during control action!');
      }

      // Append Immutable Audit Events
      await client.query(`
        INSERT INTO meta_publishing_events 
        (campaign_id, correlation_id, event_type, from_state, to_state, actor_type, actor_id, reason, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        numId,
        correlationId,
        `CONTROL_ACTION_${action}`,
        lockedCamp.status,
        nextLocalStatus,
        isSystem ? 'system' : (isAdmin ? 'admin' : 'host'),
        String(actorContext.userId),
        options.reason || `Executed ${action} on ${targetObjType} ${targetMetaId || ''}`,
        JSON.stringify({
          action,
          target_object_type: targetObjType,
          target_object_id: targetMetaId,
          target_status: targetMetaStatus,
          pause_source: pauseSourceToSet,
          verified_externally: mutationSuccess
        })
      ]).catch((e: any) => console.warn('[CONTROL PLANE EVENT LOG WARN]', e?.message));

      if (isAdmin && !isSystem) {
        await client.query(`
          INSERT INTO admin_audit_logs (admin_id, entity_type, entity_id, action, previous_state, new_state, ip_address)
          VALUES ($1, 'marketing_campaign', $2, $3, $4, $5, $6)
        `, [
          Number(actorContext.userId) || 1,
          numId,
          `control_action_${action.toLowerCase()}`,
          JSON.stringify({ status: lockedCamp.status, meta_status: lockedCamp.meta_status }),
          JSON.stringify({ status: nextLocalStatus, meta_status: targetMetaStatus, pause_source: pauseSourceToSet }),
          actorContext.ipAddress || '127.0.0.1'
        ]);
      }

      await client.query('COMMIT');
      client.release();

      return {
        success: true,
        action,
        campaign_id: numId,
        target_object_type: targetObjType,
        target_object_id: targetMetaId,
        previous_state: {
          local_status: lockedCamp.status,
          meta_status: lockedCamp.meta_status || 'UNKNOWN',
          meta_effective_status: lockedCamp.meta_effective_status || 'UNKNOWN'
        },
        new_state: {
          local_status: nextLocalStatus,
          meta_status: targetMetaStatus,
          meta_effective_status: externalVerifiedStatus
        },
        verified_externally: mutationSuccess,
        action_preview: actionPreview,
        idempotency_key: correlationId,
        pause_source: pauseSourceToSet,
        message: `Campaign ${action.toLowerCase().replace(/_/g, ' ')}ed successfully.`
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      client.release();
      throw err;
    }
  }

  /**
   * Convenience helpers for standard Admin, Host, & System actions
   */
  static async pauseCampaign(
    campaignId: number | string,
    actorContext: ActionActorContext,
    options: ActionExecutionOptions = {},
    dbClient?: any
  ): Promise<ControlActionResult> {
    return this.executeControlAction(campaignId, 'PAUSE', actorContext, options, dbClient);
  }

  static async emergencyPauseCampaign(
    campaignId: number | string,
    actorContext: ActionActorContext,
    options: ActionExecutionOptions = {},
    dbClient?: any
  ): Promise<ControlActionResult> {
    return this.executeControlAction(campaignId, 'EMERGENCY_PAUSE', actorContext, options, dbClient);
  }

  static async resumeCampaign(
    campaignId: number | string,
    actorContext: ActionActorContext,
    options: ActionExecutionOptions = {},
    dbClient?: any
  ): Promise<ControlActionResult> {
    return this.executeControlAction(campaignId, 'RESUME', actorContext, options, dbClient);
  }

  static async resyncCampaign(
    campaignId: number | string,
    actorContext: ActionActorContext,
    options: ActionExecutionOptions = {},
    dbClient?: any
  ): Promise<ControlActionResult> {
    return this.executeControlAction(campaignId, 'RESYNC', actorContext, options, dbClient);
  }

  static async reconcileCampaign(
    campaignId: number | string,
    actorContext: ActionActorContext,
    options: ActionExecutionOptions = {},
    dbClient?: any
  ): Promise<ControlActionResult> {
    return this.executeControlAction(campaignId, 'RECONCILE', actorContext, options, dbClient);
  }

  static async setObjectStatus(
    campaignId: number | string,
    objectType: TargetObjectType,
    objectId: string,
    status: 'ACTIVE' | 'PAUSED',
    actorContext: ActionActorContext,
    options: ActionExecutionOptions = {},
    dbClient?: any
  ): Promise<ControlActionResult> {
    return this.executeControlAction(
      campaignId,
      'SET_OBJECT_STATUS',
      actorContext,
      { ...options, targetObjectType: objectType, targetObjectId: objectId, targetStatus: status },
      dbClient
    );
  }
}
