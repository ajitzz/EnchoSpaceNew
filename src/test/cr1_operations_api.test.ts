import express from 'express';
import request from 'supertest';
import {randomBytes} from 'node:crypto';
import {describe, expect, it, vi} from 'vitest';
import {createOperationsRouter} from '../server/operations/router.js';
import {createHttpExecutionContextMiddleware} from '../server/observability/httpExecutionContext.js';
import {workforceConnectionConfig,workforceEnvironment,workforceOrigin} from '../server/operations/runtime.js';
import {WorkforceSessionError, staffSessionCredential} from '../lib/iam/staffSessions.js';
import {AssignmentCommandError} from '../lib/iam/assignmentService.js';
import {WorkforceReviewError} from '../lib/iam/workforceReview.js';

describe('CR1 independent workforce HTTP boundary', () => {
  const credential = `wfs_${randomBytes(32).toString('base64url')}`;
  it('rejects query-supplied workforce authority and scopes pagination to the authenticated session',async()=>{
    const workforce=vi.fn(async()=>{throw new WorkforceReviewError('PERMISSION_DENIED');});
    const server=express();server.use(createHttpExecutionContextMiddleware());
    server.use('/api/operations/v1',createOperationsRouter({load:vi.fn(),workforce}));
    const get=(query:string)=>request(server).get(`/api/operations/v1/workforce${query}`).set('Cookie',`__Host-encho_workforce=${credential}`);
    for(const query of ['?organizationId=attacker','?environment=LOCAL','?limit=0','?limit=51','?memberAfter=not-an-id','?limit[]=2'])expect((await get(query)).status).toBe(422);
    expect(workforce).not.toHaveBeenCalled();
    const response=await get('?limit=10&memberAfter=11111111-1111-4111-8111-111111111111');
    expect(response.status).toBe(403);expect(response.headers['cache-control']).toBe('no-store');
    expect(workforce).toHaveBeenCalledWith(`Bearer ${credential}`,{limit:10,memberAfter:'11111111-1111-4111-8111-111111111111'});
    expect((await request(server).get('/api/operations/v1/workforce').set('Authorization','Bearer consumer-jwt')).status).toBe(401);
  });
  it('does not expose workforce database diagnostics on a failed read',async()=>{
    const server=express();server.use(createHttpExecutionContextMiddleware());
    server.use('/api/operations/v1',createOperationsRouter({load:vi.fn(),workforce:vi.fn(async()=>{throw new Error('secret-token db@private.test');})}));
    const response=await request(server).get('/api/operations/v1/workforce').set('Authorization',`Bearer ${credential}`);
    expect(response.status).toBe(503);expect(JSON.stringify(response.body)).not.toMatch(/secret-token|private.test/);
    expect(response.body.correlationId).toBeTruthy();
  });
  function app(load?: (authorization: string) => Promise<never>) {
    const server = express();
    server.use(createHttpExecutionContextMiddleware());
    server.use('/api/operations/v1',createOperationsRouter(load ? {load} : null));
    return server;
  }
  it('rejects consumer JWTs, missing credentials, aliases and malformed staff bytes', async () => {
    const load = vi.fn();
    const server = app(load);
    for (const token of ['', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4ifQ.signature', `bearer ${credential}`, 'Bearer wfs_!' ]) {
      expect((await request(server).get('/api/operations/v1/workspace').set('Authorization',token)).status).toBe(401);
    }
    expect(load).not.toHaveBeenCalled();
    expect(() => staffSessionCredential(`Bearer wfs_${'A'.repeat(42)}B`)).toThrow('STAFF_SESSION_REQUIRED');
  });
  it('requires one exact HttpOnly cookie identity and returns sanitized unavailable diagnostics', async () => {
    const load = vi.fn(async () => {throw new Error('postgres://secret:password@example.test/user@email.com');});
    const response = await request(app(load)).get('/api/operations/v1/workspace')
      .set('Cookie',`consumer_token=admin; __Host-encho_workforce=${credential}`).set('x-correlation-id','ops.boundary.test');
    expect(response.status).toBe(503);
    expect(load).toHaveBeenCalledWith(`Bearer ${credential}`);
    expect(response.body).toMatchObject({code:'WORKFORCE_UNAVAILABLE',correlationId:'ops.boundary.test'});
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toMatch(/password|user@email|postgres:/);
    const duplicate = await request(app(load)).get('/api/operations/v1/workspace')
      .set('Cookie',`__Host-encho_workforce=${credential}; __Host-encho_workforce=${credential}`);
    expect(duplicate.status).toBe(401);
  });
  it('reports absent runtime and expired session truthfully without consumer fallback', async () => {
    expect((await request(app()).get('/api/operations/v1/workspace').set('Authorization',`Bearer ${credential}`)).status).toBe(503);
    const load = vi.fn(async () => {throw new WorkforceSessionError('STAFF_SESSION_REQUIRED');});
    expect((await request(app(load)).get('/api/operations/v1/workspace').set('Authorization',`Bearer ${credential}`)).status).toBe(401);
  });
  it('uses only explicit workforce configuration with strict remote TLS', () => {
    expect(workforceConnectionConfig({DATABASE_URL:'postgres://owner:secret@live.test/encho'})).toBeNull();
    const parsed = workforceConnectionConfig({CR1_WORKFORCE_DATABASE_URL:'postgres://runtime:secret@branch.neon.tech/encho?sslmode=require'});
    expect(parsed?.ssl).toEqual({rejectUnauthorized:true});
    expect(parsed?.connectionString).not.toContain('sslmode');
    expect(() => workforceConnectionConfig({CR1_WORKFORCE_DATABASE_URL:'postgres://runtime:secret@host/db?options=bad'})).toThrow('WORKFORCE_UNAVAILABLE');
    expect(() => workforceConnectionConfig({CR1_WORKFORCE_DATABASE_URL:'dummy'})).toThrow('WORKFORCE_UNAVAILABLE');
  });
  it('uses trusted environment configuration and refuses production downgrades or insecure staging origins',()=>{
    expect(workforceEnvironment({NODE_ENV:'production'})).toBe('PRODUCTION');
    expect(workforceEnvironment({NODE_ENV:'production',CR1_WORKFORCE_ENVIRONMENT:'STAGING'})).toBe('STAGING');
    expect(()=>workforceEnvironment({NODE_ENV:'production',CR1_WORKFORCE_ENVIRONMENT:'LOCAL'})).toThrow('WORKFORCE_UNAVAILABLE');
    expect(workforceOrigin({CR1_WORKFORCE_ENVIRONMENT:'STAGING',CR1_WORKFORCE_ORIGIN:'http://localhost:3000'})).toBeNull();
  });
  it('requires a fixed trusted origin and exact command input before executing cookie-authenticated work',async()=>{
    const assignment=vi.fn(async()=>{throw new AssignmentCommandError('CAS_CONFLICT');});
    const server=express();server.use(express.json(),createHttpExecutionContextMiddleware());
    server.use('/api/operations/v1',createOperationsRouter({load:vi.fn(),assignment},{origin:'https://ops.encho.test'}));
    const command={assignmentId:'11111111-1111-4111-8111-111111111111',action:'CLAIM',expectedVersion:1,expectedFence:'0',idempotencyKey:'22222222-2222-4222-8222-222222222222'};
    const send=(origin:string,body:unknown=command)=>request(server).post(`/api/operations/v1/assignments/${command.assignmentId}/actions`)
      .set('Cookie',`__Host-encho_workforce=${credential}`).set('Origin',origin).set('X-Encho-Workforce-Command','1').send(body);
    expect((await send('https://attacker.test')).status).toBe(403);
    expect((await send('https://ops.encho.test',{...command,principal:{role:'admin'}})).status).toBe(422);
    expect((await send('https://ops.encho.test',{...command,action:'HANDOFF'})).status).toBe(422);
    expect(assignment).not.toHaveBeenCalled();
    const conflict=await send('https://ops.encho.test');
    expect(conflict.status).toBe(409);expect(conflict.body.code).toBe('CAS_CONFLICT');
    expect(assignment).toHaveBeenCalledExactlyOnceWith(`Bearer ${credential}`,command);
  });
  it('never reports an ambiguous assignment mutation as accepted',async()=>{
    const server=express();server.use(express.json(),createHttpExecutionContextMiddleware());
    server.use('/api/operations/v1',createOperationsRouter({load:vi.fn(),assignment:async()=>{throw new AssignmentCommandError('OUTCOME_UNKNOWN',new Error('postgres secret'));}},{origin:'https://ops.encho.test'}));
    const assignmentId='11111111-1111-4111-8111-111111111111';
    const response=await request(server).post(`/api/operations/v1/assignments/${assignmentId}/actions`).set('Authorization',`Bearer ${credential}`)
      .set('Origin','https://ops.encho.test').set('X-Encho-Workforce-Command','1')
      .send({assignmentId,action:'RELEASE',expectedVersion:2,expectedFence:'1',idempotencyKey:'22222222-2222-4222-8222-222222222222'});
    expect(response.status).toBe(503);expect(response.body.code).toBe('OUTCOME_UNKNOWN');
    expect(JSON.stringify(response.body)).not.toMatch(/postgres|secret|ACCEPTED/);
  });
});
