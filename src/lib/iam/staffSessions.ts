import {createHash} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {parsePrincipalContext, type PrincipalContext} from '../../shared/iam/principalContext.js';
import {workforceAssuranceLevelSchema, workforceEnvironmentSchema} from '../../shared/iam/contracts.js';
import {requireExecutionContext} from '../observability/executionContext.js';
import {isRestrictedWorkforceRuntime} from './runtimeBoundary.js';

// A consumer JWT can never be mistaken for an internal staff credential. The
// isolated identity issuer must generate 32 random bytes, canonical base64url.
const credentialSchema = z.string().regex(/^wfs_[A-Za-z0-9_-]{43}$/).refine(value =>
  Buffer.from(value.slice(4), 'base64url').toString('base64url') === value.slice(4));
const sessionRowSchema = z.object({
  account_id: z.number().int().positive().safe(), organization_id: z.string().uuid(),
  membership_id: z.string().uuid(), session_id: z.string().uuid(),
  assurance_level: workforceAssuranceLevelSchema,
  authenticated_at: z.date(), expires_at: z.date(),
}).strict();

export class WorkforceSessionError extends Error {
  constructor(readonly code: 'STAFF_SESSION_REQUIRED' | 'WORKFORCE_UNAVAILABLE') { super(code); }
}

export function staffSessionCredential(authorization: unknown): string {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');
  }
  const parsed = credentialSchema.safeParse(authorization.slice(7));
  if (!parsed.success) throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');
  return parsed.data;
}

/**
 * Authenticates an opaque token and evaluates read projections under fresh,
 * transaction-fenced RLS context. It neither issues sessions nor renews expiry.
 * Mutations must use runAuthorized with their exact resource/command policy.
 */
export class StaffSessionReader {
  private readonly environment: z.infer<typeof workforceEnvironmentSchema>;
  constructor(private readonly pool: pg.Pool, environment: z.infer<typeof workforceEnvironmentSchema>) {
    this.environment = workforceEnvironmentSchema.parse(environment);
  }

  async read<T>(authorization: unknown, work: (client: pg.PoolClient, principal: PrincipalContext, expiresAt: Date) => Promise<T>): Promise<T> {
    const credential = staffSessionCredential(authorization);
    const digest = createHash('sha256').update(credential).digest('hex');
    const trace = requireExecutionContext();
    const client = await this.pool.connect();
    let discard=false;
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      if (!await isRestrictedWorkforceRuntime(client)) throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE');
      await client.query("SELECT set_config('app.workforce_environment',$1,true)",[this.environment]);
      const result = await client.query('SELECT * FROM internal_iam_authenticate_session($1)', [digest]);
      const parsed = sessionRowSchema.safeParse(result.rows[0]);
      if (result.rowCount !== 1 || !parsed.success) throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');
      const session = parsed.data;
      const principal = parsePrincipalContext({
        accountId: session.account_id, actorKind: 'STAFF', organizationId: session.organization_id,
        membershipId: session.membership_id, sessionId: session.session_id,
        assuranceLevel: session.assurance_level, authenticatedAt: session.authenticated_at.toISOString(),
        correlationId: trace.correlationId, operationId: trace.operationId,
      });
      await client.query(`SELECT set_config('app.current_user_id',$1,true),set_config('app.organization_id',$2,true),
        set_config('app.membership_id',$3,true),set_config('app.staff_session_id',$4,true),
        set_config('app.bypass_rls','false',true),set_config('app.marketing_admin','false',true)`, [
        String(principal.accountId), principal.organizationId, principal.membershipId, principal.sessionId,
      ]);
      const active = (await client.query<{valid: boolean}>('SELECT internal_iam_lock_authority() AS valid')).rows[0];
      if (!active?.valid) throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');
      if (this.environment === 'PRODUCTION') {
        const approved = await client.query(`SELECT 1 FROM internal_iam_current_policy p
          JOIN internal_iam_policy_versions v ON v.id=p.version_id
          WHERE p.singleton AND v.approval_status='APPROVED'`);
        if (approved.rowCount !== 1) throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE');
      }
      const value = await work(client, principal, session.expires_at);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      try{await client.query('ROLLBACK');}catch{discard=true;}
      throw error;
    } finally { client.release(discard); }
  }
}
