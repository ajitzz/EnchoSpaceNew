import express from 'express';
import request from 'supertest';
import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {createParticipantNotificationRouter} from '../server/conversations/notificationRouter.js';
import {createConversationNotificationRuntime} from '../server/conversations/notificationRuntimeAdapter.js';
import {createHttpExecutionContextMiddleware} from '../server/observability/httpExecutionContext.js';
import {ConversationNotificationError} from '../lib/conversations/notifications.js';
import {publicApiErrorSchema} from '../shared/platform/apiError.js';

const now='2026-09-24T12:00:00.000Z';
const preference={accountId:20,version:'0',inAppAlerts:true,source:'DEFAULT',updatedAt:null,externalChannels:[{channel:'EMAIL',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'},{channel:'PUSH',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'},{channel:'SMS',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'}]};
describe('CR1 participant notification HTTP boundary',()=>{
 function fixture(enabled=true){
  const port={preferences:vi.fn(async()=>preference),setPreference:vi.fn(),evidence:vi.fn(async()=>({accountId:20,items:[],nextBeforeId:null}))};
  let actor:unknown=20,authenticated=true;const limiter=vi.fn((_req,_res,next)=>next()),failure=vi.fn();
  const app=express();app.use(express.json(),createHttpExecutionContextMiddleware());
  app.use('/api/conversations/v1',createParticipantNotificationRouter(enabled?port as unknown as Parameters<typeof createParticipantNotificationRouter>[0]:null,{authenticate:(_req,res,next)=>authenticated?next():void res.status(401).json({error:'Unauthorized'}),mutationLimiter:limiter,accountId:()=>actor,onFailure:failure}));
  return {app,port,limiter,failure,setActor:(value:unknown)=>{actor=value;},signOut:()=>{authenticated=false;}};
 }
 const url='/api/conversations/v1/notifications';
 it('authenticates every route and applies no-store even before authentication succeeds',async()=>{
  const f=fixture();f.signOut();
  for(const method of ['get','put'] as const){const r=await request(f.app)[method](`${url}/preferences`);expect(r.status).toBe(401);expect(r.headers['cache-control']).toBe('no-store');}
  expect((await request(f.app).get(`${url}/evidence`)).status).toBe(401);expect(f.port.preferences).not.toHaveBeenCalled();
 });
 it('requires server identity and explicit feature rollout without falling back to legacy admin',async()=>{
  const f=fixture();f.setActor(undefined);expect((await request(f.app).get(`${url}/preferences`)).status).toBe(401);expect(f.port.preferences).not.toHaveBeenCalled();
  const off=fixture(false);const r=await request(off.app).get(`${url}/preferences`);expect(r.status).toBe(503);expect(r.body.code).toBe('FEATURE_UNAVAILABLE');
 });
 it('validates exact mutation and returns committed version receipt under server actor',async()=>{
  const f=fixture(),body={requestId:randomUUID(),expectedVersion:'0',inAppAlerts:false};
  f.port.setPreference.mockResolvedValue({accountId:20,requestId:body.requestId,previousVersion:'0',version:'1',inAppAlerts:false,recordedAt:now});
  const r=await request(f.app).put(`${url}/preferences`).set('X-Encho-Conversation-Command','1').send(body);expect(r.status).toBe(200);expect(f.port.setPreference).toHaveBeenCalledWith(20,body);expect(f.limiter).toHaveBeenCalled();
  expect((await request(f.app).put(`${url}/preferences`).send(body)).status).toBe(422);
  expect((await request(f.app).put(`${url}/preferences`).set('X-Encho-Conversation-Command','1').send({...body,accountId:90})).status).toBe(422);
  expect((await request(f.app).put(`${url}/preferences`).set('X-Encho-Conversation-Command','1').type('form').send(body)).status).toBe(422);
  expect(f.port.setPreference).toHaveBeenCalledTimes(1);
 });
 it('bounds query inputs and never treats a read as consent or a preference mutation',async()=>{
  const f=fixture();expect((await request(f.app).get(`${url}/preferences`)).body).toEqual(preference);
  const cursor=randomUUID();expect((await request(f.app).get(`${url}/evidence`).query({beforeId:cursor,limit:'10'})).status).toBe(200);expect(f.port.evidence).toHaveBeenCalledWith(20,{beforeId:cursor,limit:10});
  for(const query of [{limit:'51'},{limit:'1.2'},{limit:['1','2']},{accountId:'90'},{beforeId:'malformed'}])expect((await request(f.app).get(`${url}/evidence`).query(query)).status).toBe(422);
  expect(f.port.setPreference).not.toHaveBeenCalled();
 });
 it('rejects cross-actor or structurally unsafe service projections',async()=>{
  const f=fixture();f.port.preferences.mockResolvedValue({...preference,accountId:90});
  expect((await request(f.app).get(`${url}/preferences`)).status).toBe(500);
  f.port.preferences.mockResolvedValue({...preference,privateContact:'guest@example.test'} as typeof preference);
  const r=await request(f.app).get(`${url}/preferences`);expect(r.status).toBe(500);expect(JSON.stringify(r.body)).not.toContain('guest@example');
 });
 it('uses canonical nondisclosing errors and distinguishes unknown commits from safe retries',async()=>{
  const f=fixture();f.port.setPreference.mockRejectedValue(new ConversationNotificationError('OUTCOME_UNKNOWN'));
  const r=await request(f.app).put(`${url}/preferences`).set('X-Encho-Conversation-Command','1').send({requestId:randomUUID(),expectedVersion:'0',inAppAlerts:false});
  expect(r.status).toBe(409);expect(publicApiErrorSchema.parse(r.body)).toMatchObject({code:'OPERATION_OUTCOME_UNKNOWN',retryability:'AFTER_RECONCILIATION'});
  f.port.preferences.mockRejectedValue(new Error('database password private@example.test'));const unknown=await request(f.app).get(`${url}/preferences`);
  expect(unknown.status).toBe(500);expect(JSON.stringify(unknown.body)).not.toMatch(/password|private@example/);expect(f.failure).toHaveBeenCalled();
 });
 it('does not open a connection when rollout is disabled or instantiate a worker',()=>{
  const pool={connect:vi.fn()} as unknown as pg.Pool;
  expect(createConversationNotificationRuntime({},pool)).toBeNull();expect(createConversationNotificationRuntime({CR1_CONVERSATION_NOTIFICATIONS_ENABLED:'false'},pool)).toBeNull();
  expect(createConversationNotificationRuntime({CR1_CONVERSATION_NOTIFICATIONS_ENABLED:'true'},pool)).not.toBeNull();expect(pool.connect).not.toHaveBeenCalled();
 });
});
