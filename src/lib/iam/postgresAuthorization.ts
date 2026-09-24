import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {
  PermissionNotGrantedError,
  permissionCheckInputSchema,
  type PermissionCheckInput,
  type PermissionCheckPort,
  type PermissionCheckResult,
  type AuthorizationRequirement,
} from './authorizationPort.js';
import {workforceEnvironmentSchema} from '../../shared/iam/contracts.js';
import {isRestrictedWorkforceRuntime} from './runtimeBoundary.js';

const permissionPolicySchema = z.object({
  resource_type: z.string(),
  step_up_required: z.boolean(),
  checker_policy: z.enum(['NONE', 'DISTINCT_ACTOR']),
  config_hash: z.string().regex(/^[a-f0-9]{64}$/),
  approval_status: z.enum(['PENDING_FOUNDER_OPERATIONAL_APPROVAL', 'APPROVED']),
});
type Allowed = Extract<PermissionCheckResult, {effect: 'ALLOW'}>;

export class WorkforceCommandOutcomeUnknownError extends Error {
  readonly code='OUTCOME_UNKNOWN';
  readonly status=503;
  constructor(cause:unknown){super('The command result must be reconciled before retrying.',{cause});}
}

/**
 * Uses a dedicated restricted pool. Callers resolve resource identity on the
 * server; neither a browser role nor a caller-supplied environment grants access.
 * `check` is a UI/preflight hint. Only `runAuthorized` fences the authority and
 * domain write in one transaction. Its callback must contain database work only:
 * external effects are durable outbox commands, never network calls under locks.
 */
export class PostgresWorkforceAuthorization implements PermissionCheckPort {
  private readonly environment: z.infer<typeof workforceEnvironmentSchema>;

  constructor(private readonly pool: pg.Pool, environment: z.infer<typeof workforceEnvironmentSchema>) {
    this.environment = workforceEnvironmentSchema.parse(environment);
  }

  async check(input: PermissionCheckInput): Promise<PermissionCheckResult> {
    const parsed = permissionCheckInputSchema.parse(input);
    return this.inTransaction(parsed, client => this.evaluate(client, parsed));
  }

  async runAuthorized<T>(rawInput: unknown, write: (client: pg.PoolClient, decision: Allowed) => Promise<T>): Promise<T> {
    const input = permissionCheckInputSchema.parse(rawInput);
    if (!input.conditions.commandHash) throw new PermissionNotGrantedError(this.deny('INVALID_CONTEXT'));
    return this.inTransaction(input, async client => {
      const decision = await this.evaluate(client, input);
      if (decision.effect !== 'ALLOW') throw new PermissionNotGrantedError(decision);
      if (input.evidence.actionAuthorizationId) {
        // The SQL transition rechecks independent approvals, membership, scope,
        // current policy and factor proofs while consuming them exactly once.
        const consumed = await client.query(`UPDATE internal_action_authorizations
          SET status='CONSUMED',consumed_at=clock_timestamp(),version=version+1
          WHERE id=$1 AND status='APPROVED' RETURNING id`, [input.evidence.actionAuthorizationId]);
        if (consumed.rowCount !== 1) throw new PermissionNotGrantedError(this.deny('POLICY_CHANGED'));
      }
      const result = await write(client, decision);
      await client.query(`INSERT INTO internal_iam_events(
        id,organization_id,actor_user_id,actor_membership_id,event_type,entity_type,entity_id,
        new_hash,evidence,correlation_id,causation_id,request_hash,reason
      ) VALUES($1,$2,$3,$4,'AUTHORIZED_COMMAND',$5,$6,$7,$8::jsonb,$9,$10,$11,$12)`, [
        decision.decisionId, input.tenant.organizationId, input.principal.accountId,
        input.principal.membershipId, input.resource.target.type, input.resource.target.id,
        decision.policySnapshotHash,
        JSON.stringify({permission: input.permission, environment: this.environment, operationId: input.principal.operationId}),
        input.principal.correlationId, input.principal.operationId, input.conditions.commandHash,
        'Fresh scoped workforce authorization and domain command committed atomically.',
      ]);
      return result;
    });
  }

  private deny(reason: Extract<PermissionCheckResult, {effect: 'DENY'}>['reason']): PermissionCheckResult & {effect: 'DENY'} {
    return {effect: 'DENY', allowed: false, reason, evaluatedAt: new Date().toISOString()};
  }

  private async inTransaction<T>(input: PermissionCheckInput, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    if (input.principal.actorKind !== 'STAFF' || input.principal.organizationId !== input.tenant.organizationId) {
      throw new PermissionNotGrantedError(this.deny('PRINCIPAL_NOT_ELIGIBLE'));
    }
    if (input.conditions.environment !== this.environment) throw new PermissionNotGrantedError(this.deny('CONDITION_FAILED'));
    const client = await this.pool.connect();
    let committing=false,discard=false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      if (!await isRestrictedWorkforceRuntime(client)) throw new PermissionNotGrantedError(this.deny('IAM_NOT_READY'));
      await client.query(`SELECT set_config('app.current_user_id',$1,true),
        set_config('app.organization_id',$2,true),set_config('app.membership_id',$3,true),
        set_config('app.staff_session_id',$4,true),set_config('app.bypass_rls','false',true),
        set_config('app.marketing_admin','false',true),set_config('app.workforce_environment',$5,true)`, [
        String(input.principal.accountId), input.tenant.organizationId,
        input.principal.membershipId, input.principal.sessionId, this.environment,
      ]);
      const value = await work(client);
      committing=true;
      await client.query('COMMIT');
      return value;
    } catch (error) {
      try{await client.query('ROLLBACK');}catch{discard=true;}
      // A lost COMMIT response cannot prove rollback. Callers must look up their
      // durable command receipt, never issue a fresh financial/provider command.
      if(committing){discard=true;throw new WorkforceCommandOutcomeUnknownError(error);}
      throw error;
    } finally {
      client.release(discard);
    }
  }

  private async evaluate(client: pg.PoolClient, input: PermissionCheckInput): Promise<PermissionCheckResult> {
    const active = (await client.query<{valid: boolean}>('SELECT internal_iam_lock_authority() AS valid')).rows[0];
    if (!active?.valid) return this.deny('SESSION_REVOKED');
    const rawPolicy = (await client.query(`SELECT p.resource_type,p.step_up_required,p.checker_policy,v.config_hash,v.approval_status
      FROM internal_permission_catalog p CROSS JOIN internal_iam_current_policy cp
      JOIN internal_iam_policy_versions v ON v.id=cp.version_id
      WHERE p.permission_code=$1 AND p.active AND cp.singleton`, [input.permission])).rows[0];
    const parsed = permissionPolicySchema.safeParse(rawPolicy);
    if (!parsed.success) return this.deny('IAM_NOT_READY');
    const policy = parsed.data;
    if (this.environment === 'PRODUCTION' && policy.approval_status !== 'APPROVED') return this.deny('IAM_NOT_READY');
    if (policy.resource_type !== input.resource.target.type) return this.deny('RESOURCE_OUT_OF_SCOPE');
    const scoped = (await client.query<{allowed: boolean}>(`SELECT internal_iam_has_permission($1,$2,$3,$4,$5,$6,$7) AS allowed`, [
      input.tenant.organizationId, input.permission, input.resource.target.type, input.resource.target.id,
      input.conditions.provider ?? null, this.environment, input.conditions.amountMinor ?? null,
    ])).rows[0];
    if (!scoped?.allowed) return this.deny('PERMISSION_DENIED');
    if (input.resource.assignmentId) {
      const assignment = await client.query(`SELECT id FROM internal_work_assignments
        WHERE id=$1 AND organization_id=$2 AND assignee_membership_id=$3
          AND resource_type=$4 AND resource_id=$5
          AND state='CLAIMED' AND lease_until>clock_timestamp()
          AND version=$6 AND fence=$7 AND environment=$8 AND required_permission_code=$9
          AND provider IS NOT DISTINCT FROM $10::text`, [
        input.resource.assignmentId, input.tenant.organizationId, input.principal.membershipId,
        input.resource.target.type, input.resource.target.id,
        input.resource.assignmentVersion, input.resource.assignmentFence, this.environment,
        input.permission, input.conditions.provider??null,
      ]);
      if (!assignment.rowCount) return this.deny('RESOURCE_OUT_OF_SCOPE');
    }
    const evaluated = {decisionId: randomUUID(), policySnapshotHash: policy.config_hash, evaluatedAt: new Date().toISOString()};
    if (!policy.step_up_required && policy.checker_policy === 'NONE' && !input.evidence.actionAuthorizationId) {
      return {...evaluated, effect: 'ALLOW', allowed: true};
    }
    const hash = input.conditions.commandHash;
    if (!hash) return this.deny('INVALID_CONTEXT');
    if (input.evidence.actionAuthorizationId) {
      const receipt = await client.query(`SELECT a.id FROM internal_action_authorizations a
        LEFT JOIN internal_step_up_challenges s ON s.id=a.step_up_challenge_id
        WHERE a.id=$1 AND a.organization_id=$2 AND a.maker_membership_id=$3 AND a.permission_code=$4
          AND a.resource_type=$5 AND a.resource_id=$6 AND a.command_hash=$7 AND a.policy_snapshot_hash=$8
          AND a.provider IS NOT DISTINCT FROM $9::text AND a.environment=$10
          AND a.amount_minor IS NOT DISTINCT FROM $11::bigint AND a.status='APPROVED'
          AND a.expires_at>clock_timestamp()
          AND ($12::uuid IS NULL OR a.step_up_challenge_id=$12)
          AND (NOT $13::boolean OR (s.session_id=$14 AND s.status='VERIFIED' AND s.expires_at>clock_timestamp()))`, [
        input.evidence.actionAuthorizationId, input.tenant.organizationId, input.principal.membershipId,
        input.permission, input.resource.target.type, input.resource.target.id, hash, policy.config_hash,
        input.conditions.provider ?? null, this.environment, input.conditions.amountMinor ?? null,
        input.evidence.stepUpReceiptId ?? null,
        policy.step_up_required, input.principal.sessionId,
      ]);
      if (receipt.rowCount === 1) return {...evaluated, effect: 'ALLOW', allowed: true};
      return this.deny('POLICY_CHANGED');
    }
    const requirements: AuthorizationRequirement[] = [];
    if (policy.step_up_required) requirements.push({kind: 'STEP_UP', actionHash: hash, requiredAssuranceLevel: 'AAL2'});
    if (policy.checker_policy === 'DISTINCT_ACTOR') requirements.push({kind: 'CHECKER', actionHash: hash, requiredApprovals: 1, distinctFromMaker: true});
    return {...evaluated, effect: 'REQUIREMENTS', allowed: false, requirements};
  }
}
