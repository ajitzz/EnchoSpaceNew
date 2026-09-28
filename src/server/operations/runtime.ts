import pg from 'pg';
import {z} from 'zod';
import {workforceGoogleClientIdSchema} from '../../lib/iam/googleWorkforceIdentity.js';
import {StaffSessionReader, WorkforceSessionError} from '../../lib/iam/staffSessions.js';
import {projectOperationsWorkspace} from '../../lib/iam/workspaceProjection.js';
import {verifyIamCatalog} from '../deployment/iamReadiness.js';
import type {OperationsWorkspacePort} from './router.js';
import {AssignmentService,AssignmentCommandError} from '../../lib/iam/assignmentService.js';
import type {AssignmentActionRequest} from '../../shared/iam/workspace.js';
import {workforceEnvironmentSchema} from '../../shared/iam/contracts.js';
import {WorkforceReviewReader} from '../../lib/iam/workforceReview.js';

export function workforceEnvironment(env:NodeJS.ProcessEnv){
  const parsed=workforceEnvironmentSchema.safeParse(env.CR1_WORKFORCE_ENVIRONMENT??(env.NODE_ENV==='production'?'PRODUCTION':'LOCAL'));
  if(!parsed.success||(env.NODE_ENV==='production'&&parsed.data==='LOCAL'))throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE');
  return parsed.data;
}

export function workforceOrigin(env:NodeJS.ProcessEnv):string|null{
  const raw = env.CR1_WORKFORCE_ORIGIN;
  if(!raw)return null;
  try{
    const environment=workforceEnvironment(env);
    const url=new URL(raw);
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/'
      ||!(url.protocol==='https:'||(environment==='LOCAL'&&local&&url.protocol==='http:')))return null;
    return url.origin;
  }catch{return null;}
}

/** Construction requires explicit configuration; the helper's conservative
 * production default is retained only for existing environment consumers. */
export function workforceRuntimeSettings(env:NodeJS.ProcessEnv){
  const parsed=z.object({environment:workforceEnvironmentSchema,organizationId:z.uuid(),
    googleClientId:workforceGoogleClientIdSchema}).safeParse({environment:env.CR1_WORKFORCE_ENVIRONMENT,
      organizationId:env.CR1_WORKFORCE_ORGANIZATION_ID,googleClientId:env.CR1_WORKFORCE_GOOGLE_CLIENT_ID});
  const origin=workforceOrigin(env);
  if(!parsed.success||!origin||workforceEnvironment(env)!==parsed.data.environment)throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE');
  return {...parsed.data,origin};
}

/** Dedicated workforce connection; URL options cannot weaken TLS or authority. */
export function workforceConnectionConfig(env: NodeJS.ProcessEnv): pg.PoolConfig | null {
  const configured = env.CR1_WORKFORCE_DATABASE_URL;
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || url.pathname.length < 2 || url.hash) throw new Error();
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!local && !url.password) throw new Error();
    if(local&&env.CR1_WORKFORCE_ENVIRONMENT!=='LOCAL')throw new Error();
    for (const name of Array.from(url.searchParams.keys())) if (!['sslmode', 'channel_binding'].includes(name)) throw new Error();
    // Prevent URL options replacing strict TLS certificate/hostname validation.
    url.searchParams.delete('sslmode'); url.searchParams.delete('channel_binding');
    return {connectionString: url.toString(), ssl: local ? false : {rejectUnauthorized: true},
      max: 2, connectionTimeoutMillis: 8_000, idleTimeoutMillis: 10_000, statement_timeout: 10_000,
      allowExitOnIdle: true, application_name: 'encho_cr1_workforce'};
  } catch { throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE'); }
}

export function createOperationsRuntime(env: NodeJS.ProcessEnv, reportFault: () => void): OperationsWorkspacePort | null {
  let config: pg.PoolConfig | null,settings:ReturnType<typeof workforceRuntimeSettings>;
  try { config = workforceConnectionConfig(env);settings=workforceRuntimeSettings(env); } catch { reportFault(); return null; }
  if (!config) return null;
  const {environment,organizationId}=settings;
  const pool = new pg.Pool(config);
  pool.on('error', reportFault);
  // No browser/request field can downgrade the operating environment.
  const reader = new StaffSessionReader(pool, environment);
  const assignments=new AssignmentService(pool,environment);
  const workforce=new WorkforceReviewReader(pool,environment);
  const commandEnabled=true;
  const requireOrganization=(actual:string|undefined)=>{if(actual!==organizationId)throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');};
  let readyUntil = 0;
  let pending: Promise<void> | null = null;
  async function ready() {
    if (Date.now() < readyUntil) return;
    if (!pending) pending = (async () => {
      const client = await pool.connect();
      try {
        const result = await verifyIamCatalog(client);
        if (!result.ready || (environment === 'PRODUCTION' && !result.operationalPolicyApproved)) throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE');
        readyUntil = Date.now() + 30_000;
      } finally { client.release(); }
    })();
    try { await pending; } finally { pending = null; }
  }
  return {async load(authorization) {
    try {
      await ready();
      return await reader.read(authorization, (client, principal, expires) => {requireOrganization(principal.organizationId);return projectOperationsWorkspace(client, principal, expires, environment,commandEnabled);});
    } catch (error) {
      if (!(error instanceof WorkforceSessionError && error.code === 'STAFF_SESSION_REQUIRED')) reportFault();
      throw error;
    }
  },async workforce(authorization,input){
    await ready();
    const principal=await reader.read(authorization,async(_client,actor)=>{requireOrganization(actor.organizationId);return actor;});
    return workforce.read(principal,input);
  },...(commandEnabled?{async assignment(authorization:string,input:AssignmentActionRequest){
    await ready();
    const principal=await reader.read(authorization,async(_client,actor)=>{requireOrganization(actor.organizationId);return actor;});
    const command={principal,organizationId:principal.organizationId,assignmentId:input.assignmentId,
      expectedVersion:input.expectedVersion,expectedFence:input.expectedFence,idempotencyKey:input.idempotencyKey,
      reason:input.action==='CLAIM'?'Staff claimed their assigned work from Operations.':'Staff released their own work claim from Operations.'};
    if(input.action==='CLAIM')return assignments.claim(command);
    if(input.action==='RELEASE')return assignments.release(command);
    throw new AssignmentCommandError('INPUT_INVALID');
  }}:{})};
}
