import express from 'express';
import request from 'supertest';
import {randomBytes,randomUUID} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {z} from 'zod';
import {createWorkforceSessionRouter,type WorkforceLoginPort} from '../server/operations/sessionRouter.js';
import {StaffSessionIssuerError} from '../lib/iam/staffSessionIssuer.js';
import {createHttpExecutionContextMiddleware} from '../server/observability/httpExecutionContext.js';
import {createWorkforceSessionRuntime} from '../server/operations/sessionRuntime.js';

describe('CR1 workforce identity HTTP transport',()=>{
 const origin='https://ops.encho.test',challengeId=randomUUID(),browserVerifier=randomBytes(32).toString('base64url'),credential=`wfs_${randomBytes(32).toString('base64url')}`;
 const nonce=randomBytes(32).toString('base64url'),clientId='workforce-fixture.apps.googleusercontent.com';
 function setup(){
  const port:WorkforceLoginPort={begin:vi.fn(async()=>({public:{challengeId,nonce,clientId,expiresAt:new Date(Date.now()+300000).toISOString()},private:{browserVerifier}})),
   complete:vi.fn(async()=>({public:{sessionId:randomUUID(),organizationId:randomUUID(),membershipId:randomUUID(),accountId:1,assuranceLevel:'AAL1' as const,authenticatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()},private:{credential}})),
   logout:vi.fn(async()=>({outcome:'LOGGED_OUT' as const}))};
  const app=express();app.use(createHttpExecutionContextMiddleware());app.use('/session',createWorkforceSessionRouter(port,origin));return{app,port};
 }
 const post=(app:express.Express,action:string,body:object={})=>request(app).post(`/session/${action}`).set('Origin',origin).set('X-Encho-Workforce-Command','1').send(body);
 it('binds a public challenge to a distinct Secure HttpOnly strict cookie without leaking credentials',async()=>{
  const {app}=setup();const response=await post(app,'begin');expect(response.status).toBe(200);
  expect(response.body).toMatchObject({challengeId,nonce,clientId});expect(JSON.stringify(response.body)).not.toContain(browserVerifier);
  expect(response.headers['set-cookie'][0]).toContain(`__Host-encho_workforce_login=${challengeId}.${browserVerifier}`);
  expect(response.headers['set-cookie'][0]).toMatch(/Path=\/;.*HttpOnly; Secure; SameSite=Strict/);expect(response.headers['set-cookie'][0]).not.toMatch(/Domain=/);
  expect(response.headers['cache-control']).toBe('no-store');
 });
 it('denies foreign origin, ordinary forms, unexpected claims and oversized JSON before issuer use',async()=>{
  const {app,port}=setup();
  expect((await request(app).post('/session/begin').set('Origin','https://evil.encho.test').set('X-Encho-Workforce-Command','1').send({})).status).toBe(403);
  expect((await request(app).post('/session/begin').set('Origin',origin).send({})).status).toBe(403);
  expect((await post(app,'begin',{role:'admin'})).status).toBe(422);
  expect((await post(app,'complete',{credential:'x'.repeat(19000),challengeId})).status).toBe(400);
  expect(port.begin).not.toHaveBeenCalled();expect(port.complete).not.toHaveBeenCalled();
 });
 it('rejects absent, duplicate or foreign browser binding and never accepts consumer tokens',async()=>{
  const {app,port}=setup();const body={challengeId,credential:'x'.repeat(120)};
  expect((await post(app,'complete',body)).status).toBe(401);
  const binding=`__Host-encho_workforce_login=${challengeId}.${browserVerifier}`;
  expect((await post(app,'complete',body).set('Cookie',`${binding}; ${binding}`)).status).toBe(401);
  expect((await post(app,'complete',{...body,challengeId:randomUUID()}).set('Cookie',binding)).status).toBe(401);
  expect(port.complete).not.toHaveBeenCalled();
 });
 it('returns minimal session confirmation and keeps the opaque token out of JSON',async()=>{
  const {app,port}=setup();const google='signed-google-token'.repeat(10);
  const response=await post(app,'complete',{challengeId,credential:google}).set('Cookie',`__Host-encho_workforce_login=${challengeId}.${browserVerifier}`);
  expect(response.status).toBe(200);expect(Object.keys(response.body).sort()).toEqual(['expiresAt','status']);expect(response.body.status).toBe('AUTHENTICATED');
  expect(JSON.stringify(response.body)).not.toContain(credential);expect(JSON.stringify(response.body)).not.toContain(google);
  expect(port.complete).toHaveBeenCalledWith({challengeId,credential:google,browserVerifier,correlationId:expect.any(String)});
  expect(z.array(z.string()).parse(response.headers['set-cookie']).some((cookie:string)=>cookie.startsWith(`__Host-encho_workforce=${credential};`))).toBe(true);
 });
 it('does not confirm unknown commits, expose SQL failures or fabricate logout',async()=>{
  const {app,port}=setup();vi.mocked(port.complete).mockRejectedValueOnce(new StaffSessionIssuerError('OUTCOME_UNKNOWN'));
  const response=await post(app,'complete',{challengeId,credential:'x'.repeat(120)}).set('Cookie',`__Host-encho_workforce_login=${challengeId}.${browserVerifier}`);
  expect(response.status).toBe(503);expect(response.body.code).toBe('OUTCOME_UNKNOWN');expect(z.array(z.string()).parse(response.headers['set-cookie']).join()).not.toContain(credential);
  vi.mocked(port.logout).mockRejectedValueOnce(new Error('postgres password private guest'));
  const logout=await post(app,'logout').set('Cookie',`__Host-encho_workforce=${credential}`);
  expect(logout.status).toBe(503);expect(logout.headers['set-cookie']).toBeUndefined();expect(JSON.stringify(logout.body)).not.toMatch(/postgres|password|private guest|LOGGED_OUT/);
 });
 it('revokes only the current staff cookie and leaves consumer identity alone',async()=>{
  const {app,port}=setup();const response=await post(app,'logout').set('Cookie',`token=consumer; __Host-encho_workforce=${credential}`);
  expect(response.status).toBe(200);expect(response.body.status).toBe('LOGGED_OUT');expect(port.logout).toHaveBeenCalledWith({credential,correlationId:expect.any(String)});
  expect(z.array(z.string()).parse(response.headers['set-cookie']).join()).not.toMatch(/(?:^|;)token=/);
 });
 it('has no consumer or migration-owner database/client fallback',()=>{
  const report=vi.fn();expect(createWorkforceSessionRuntime({DATABASE_URL:'postgres://owner:private@live.test/encho',GOOGLE_CLIENT_ID:clientId},report)).toBeNull();expect(report).not.toHaveBeenCalled();
 });
});
