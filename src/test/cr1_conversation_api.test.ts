import express from 'express';
import request from 'supertest';
import {describe,it,expect,vi} from 'vitest';
import {createConversationRouter} from '../server/conversations/router.js';
import {createHttpExecutionContextMiddleware} from '../server/observability/httpExecutionContext.js';
import {MarketingError} from '../lib/marketing/domain.js';
import {PlatformDomainError} from '../shared/platform/apiError.js';

describe('CR1 canonical conversation HTTP boundary',()=>{
 function fixture(){
  const inbox={create:vi.fn(),messages:vi.fn(),send:vi.fn(),acknowledgeRead:vi.fn(),list:vi.fn(),unread:vi.fn(),bookingHistory:vi.fn()};
  const ready=vi.fn(async()=>true),afterCommit=vi.fn(),onFailure=vi.fn();let actor:unknown=10;
  const app=express();app.use(express.json(),createHttpExecutionContextMiddleware());
  app.use('/api',createConversationRouter({inbox,authenticate:(_req,_res,next)=>next(),mutationLimiter:(_req,_res,next)=>next(),accountId:()=>actor,visitor:()=>undefined,ready,afterCommit,onFailure}));
  return {app,inbox,ready,afterCommit,onFailure,setActor:(value:unknown)=>{actor=value;}};
 }
 it('rejects missing authority and unavailable migration evidence before calling any domain service',async()=>{
  const f=fixture();f.setActor(undefined);
  expect((await request(f.app).get('/api/threads')).status).toBe(401);expect(f.ready).not.toHaveBeenCalled();
  f.setActor(10);f.ready.mockResolvedValue(false);
  const r=await request(f.app).post('/api/threads/1/messages').send({content:'private'});
  expect(r.status).toBe(503);expect(r.headers['cache-control']).toBe('no-store');expect(f.inbox.send).not.toHaveBeenCalled();
 });
 it('preserves authentication identity independently of client fields and returns one canonical receipt',async()=>{
  const f=fixture(),message={id:7,thread_id:1};f.inbox.send.mockResolvedValue({message,thread:{id:1},duplicate:false});
  const body={content:'hello',userId:90};const r=await request(f.app).post('/api/threads/1/messages').send(body);
  expect(r.status).toBe(200);expect(r.body).toEqual(message);
  expect(f.inbox.send).toHaveBeenCalledWith({id:10,role:'host'},1,body,undefined);expect(f.afterCommit).toHaveBeenCalledTimes(1);
  f.inbox.send.mockResolvedValue({message,thread:{id:1},duplicate:true});
  expect((await request(f.app).post('/api/threads/1/messages').send(body)).status).toBe(200);expect(f.afterCommit).toHaveBeenCalledTimes(1);
 });
 it('does not report a committed message as failed when the optional socket hint is unavailable',async()=>{
  const f=fixture();f.inbox.send.mockResolvedValue({message:{id:7},thread:{id:1},duplicate:false});f.afterCommit.mockImplementation(()=>{throw new Error('socket unavailable');});
  expect((await request(f.app).post('/api/threads/1/messages').send({})).status).toBe(200);
  expect(f.onFailure).toHaveBeenCalledWith(expect.objectContaining({code:'CONVERSATION_SOCKET_HINT_FAILED'}));
 });
 it('keeps reads and explicit acknowledgements separate and supports legacy history without a write',async()=>{
  const f=fixture();f.inbox.messages.mockResolvedValue([]);f.inbox.bookingHistory.mockResolvedValue([]);f.inbox.acknowledgeRead.mockResolvedValue({threadId:1,throughMessageId:7,unread:0,lastReadSequence:'3'});
  expect((await request(f.app).get('/api/threads/1/messages?before=8')).status).toBe(200);
  expect(f.inbox.acknowledgeRead).not.toHaveBeenCalled();expect(f.inbox.messages).toHaveBeenCalledWith({id:10,role:'host'},1,'8');
  expect((await request(f.app).get('/api/messages/77')).status).toBe(200);
  expect((await request(f.app).post('/api/threads/1/read').send({throughMessageId:7})).body.lastReadSequence).toBe('3');
 });
 it('preserves unknown outcomes and sanitizes database failures without false zero counts',async()=>{
  const f=fixture();f.inbox.send.mockRejectedValue(new PlatformDomainError('OPERATION_OUTCOME_UNKNOWN'));
  expect((await request(f.app).post('/api/threads/1/messages').send({})).body.code).toBe('OPERATION_OUTCOME_UNKNOWN');
  f.inbox.unread.mockRejectedValue(new Error('database password and guest text'));
  const r=await request(f.app).get('/api/unread-counts');expect(r.status).toBe(500);
  expect(r.body).not.toHaveProperty('unread');expect(JSON.stringify(r.body)).not.toMatch(/password|guest text/);
 });
 it('returns nondisclosing not-found and idempotency conflicts without internal details',async()=>{
  const f=fixture();f.inbox.messages.mockRejectedValue(new MarketingError('THREAD_NOT_FOUND','private details',404));
  const r=await request(f.app).get('/api/threads/90/messages');expect(r.status).toBe(404);expect(r.body.code).toBe('RESOURCE_NOT_FOUND');
  f.inbox.send.mockRejectedValue(new MarketingError('IDEMPOTENCY_CONFLICT','private body'));
  expect((await request(f.app).post('/api/threads/1/messages').send({})).status).toBe(409);
 });
});
