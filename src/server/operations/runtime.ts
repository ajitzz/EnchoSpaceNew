import pg from 'pg';
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
  const raw = env.CR1_WORKFORCE_ORIGIN
    || (env.NODE_ENV !== 'production' && !env.CR1_WORKFORCE_ENVIRONMENT ? (
        env.APP_URL
        || (env.VERCEL_URL ? (env.VERCEL_URL.startsWith('http') ? env.VERCEL_URL : `https://${env.VERCEL_URL}`) : null)
        || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
        || (env.ALLOWED_ORIGINS ?? '').split(',').map(v => v.trim()).find(v => v.startsWith('http'))
        || 'http://localhost:3000'
       ) : (
        env.APP_URL
        || (env.VERCEL_URL ? (env.VERCEL_URL.startsWith('http') ? env.VERCEL_URL : `https://${env.VERCEL_URL}`) : null)
        || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
        || (env.ALLOWED_ORIGINS ?? '').split(',').map(v => v.trim()).find(v => v.startsWith('https://'))
        || (env.NODE_ENV === 'production' ? 'https://encho.co.in' : null)
       ));
  if(!raw)return null;
  try{
    const url=new URL(raw);
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||(local&&workforceEnvironment(env)==='LOCAL'&&url.protocol==='http:')))return null;
    return url.origin;
  }catch{return null;}
}

/** Configured workforce pool with single-pooler cloud fallback support. */
export function workforceConnectionConfig(env: NodeJS.ProcessEnv): pg.PoolConfig | null {
  const configured = env.CR1_WORKFORCE_DATABASE_URL || (env.HARVO_ALLOW_OWNER_ROLE === 'true' ? env.DATABASE_URL : undefined);
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || url.pathname.length < 2 || url.hash) throw new Error();
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!local && !url.password) throw new Error();
    for (const name of url.searchParams.keys()) if (!['sslmode', 'channel_binding'].includes(name)) throw new Error();
    // Prevent URL options replacing strict TLS certificate/hostname validation.
    url.searchParams.delete('sslmode'); url.searchParams.delete('channel_binding');
    const rejectUnauthorized = env.HARVO_ALLOW_OWNER_ROLE !== 'true';
    return {connectionString: url.toString(), ssl: local ? false : {rejectUnauthorized},
      max: 2, connectionTimeoutMillis: 8_000, idleTimeoutMillis: 10_000, statement_timeout: 10_000,
      allowExitOnIdle: true, application_name: 'encho_cr1_workforce'};
  } catch { throw new WorkforceSessionError('WORKFORCE_UNAVAILABLE'); }
}

export function createOperationsRuntime(env: NodeJS.ProcessEnv, reportFault: () => void): OperationsWorkspacePort | null {
  let config: pg.PoolConfig | null,environment:ReturnType<typeof workforceEnvironment>;
  try { config = workforceConnectionConfig(env);environment=workforceEnvironment(env); } catch { reportFault(); return null; }
  if (!config) return null;
  const pool = new pg.Pool(config);
  pool.on('error', reportFault);
  // No browser/request field can downgrade the operating environment.
  const reader = new StaffSessionReader(pool, environment);
  const assignments=new AssignmentService(pool,environment);
  const workforce=new WorkforceReviewReader(pool,environment);
  const commandEnabled=workforceOrigin(env)!==null;
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
      return await reader.read(authorization, (client, principal, expires) => projectOperationsWorkspace(client, principal, expires, environment,commandEnabled));
    } catch (error) {
      if (!(error instanceof WorkforceSessionError && error.code === 'STAFF_SESSION_REQUIRED')) reportFault();
      throw error;
    }
  },async workforce(authorization,input){
    await ready();
    const principal=await reader.read(authorization,async(_client,actor)=>actor);
    return workforce.read(principal,input);
  },...(commandEnabled?{async assignment(authorization:string,input:AssignmentActionRequest){
    await ready();
    const principal=await reader.read(authorization,async(_client,actor)=>actor);
    const command={principal,organizationId:principal.organizationId,assignmentId:input.assignmentId,
      expectedVersion:input.expectedVersion,expectedFence:input.expectedFence,idempotencyKey:input.idempotencyKey,
      reason:input.action==='CLAIM'?'Staff claimed their assigned work from Operations.':'Staff released their own work claim from Operations.'};
    if(input.action==='CLAIM')return assignments.claim(command);
    if(input.action==='RELEASE')return assignments.release(command);
    throw new AssignmentCommandError('INPUT_INVALID');
  }}:{})};
}
