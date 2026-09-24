import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type pg from 'pg';
import {createConversationFixture} from './helpers/conversationFixture.js';
import {ConversationNotificationWorker,type ConversationHintDispatchPort} from '../../server/conversation/notificationWorker.js';

describe('CR1 queue-only conversation hint worker',()=>{
 let f:Awaited<ReturnType<typeof createConversationFixture>>;
 beforeEach(async()=>{
  f=await createConversationFixture();
  await f.asActor(10,c=>c.query("INSERT INTO messages(thread_id,sender_id,receiver_id,content) VALUES(1,10,20,'Private message text +919999999999')"));
 },30_000);
 afterEach(async()=>{await f?.close();});
 const accepted=()=>({outcome:'SOCKET_HINT_DISPATCHED' as const});
 const worker=(port:ConversationHintDispatchPort,workerId='notification.test',dispatchTimeoutMs=1000,pool=f.worker)=>new ConversationNotificationWorker(pool,port,{workerId,dispatchTimeoutMs});
 const intent=async()=>(await f.pool.query('SELECT * FROM notification_intents ORDER BY created_at DESC LIMIT 1')).rows[0];

 it('emits only validated routing identity and records hint dispatch without recipient delivery claims',async()=>{
  const dispatch=vi.fn<ConversationHintDispatchPort['dispatch']>(async()=>accepted());
  const result=await worker({dispatch}).runOnce();
  const row=await intent();
  expect(result).toEqual({claimed:1,completed:1,retried:0,dead:0,claimLost:0});
  expect(dispatch.mock.calls[0]?.[0]).toEqual({recipientId:20,payload:{type:'new_message',threadId:1,messageId:row.message_id,notificationId:row.id}});
  expect(JSON.stringify(dispatch.mock.calls)).not.toContain('919999999999');
  const evidence=(await f.pool.query("SELECT evidence FROM notification_intent_events WHERE event_type='SUCCEEDED'")).rows[0].evidence;
  expect(evidence).toEqual({outcome:'SOCKET_HINT_DISPATCHED'});
  expect(await worker({dispatch}).runOnce()).toMatchObject({claimed:0,completed:0});
  expect(dispatch).toHaveBeenCalledTimes(1);
 });
 it('refuses runtime, owner and widened-policy pools before dispatch',async()=>{
  const dispatch=vi.fn(async()=>accepted());
  for(const pool of [f.runtime,f.pool])await expect(worker({dispatch},'notification.test',1000,pool).runOnce()).rejects.toMatchObject({code:'NOTIFICATION_WORKER_NOT_READY'});
  await f.pool.query('ALTER POLICY notification_worker_read ON notification_intents TO PUBLIC');
  await expect(worker({dispatch}).runOnce()).rejects.toMatchObject({code:'NOTIFICATION_WORKER_NOT_READY'});
  expect(dispatch).not.toHaveBeenCalled();expect((await intent()).state).toBe('PENDING');
 });
 it('sanitizes dispatch errors and durably retries with backoff',async()=>{
  const dispatch=vi.fn(async()=>{throw new Error('private token and contact must not leak');});
  expect(await worker({dispatch}).runOnce()).toMatchObject({completed:0,retried:1});
  const row=await intent();expect(row.state).toBe('RETRY');expect(row.last_error_code).toBe('NOTIFICATION_HINT_TEMPORARILY_UNAVAILABLE');
  expect(new Date(row.available_at).getTime()).toBeGreaterThan(Date.now());
  expect(JSON.stringify((await f.pool.query('SELECT * FROM notification_intent_events')).rows)).not.toContain('private token');
 });
 it('bounds a hanging adapter, aborts it and never finalizes its late response',async()=>{
  let observedSignal:AbortSignal|undefined;let finish:((value:ReturnType<typeof accepted>)=>void)|undefined;
  const dispatch=vi.fn((_input:Parameters<ConversationHintDispatchPort['dispatch']>[0],signal:AbortSignal)=>{observedSignal=signal;return new Promise<ReturnType<typeof accepted>>(resolve=>{finish=resolve;});});
  const run=await worker({dispatch},'notification.timeout',10).runOnce();
  expect(run).toMatchObject({completed:0,retried:1});expect(observedSignal?.aborted).toBe(true);
  finish?.(accepted());await Promise.resolve();
  expect((await intent()).state).toBe('RETRY');expect((await intent()).completed_at).toBeNull();
 });
 it('rejects invalid adapter acknowledgements permanently without claiming delivery',async()=>{
  const port={dispatch:async()=>({outcome:'DELIVERED_TO_HOST'})} as unknown as ConversationHintDispatchPort;
  expect(await worker(port).runOnce()).toMatchObject({completed:0,dead:1});
  expect((await intent()).last_error_code).toBe('NOTIFICATION_DISPATCH_PROTOCOL_INVALID');
 });
 it('fences a lease lost after dispatch and replays the same notification identity',async()=>{
  const observed:string[]=[];
  const first:ConversationHintDispatchPort={dispatch:async input=>{observed.push(input.payload.notificationId);await f.pool.query("UPDATE notification_intents SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[input.payload.notificationId]);return accepted();}};
  expect(await worker(first,'notification.old').runOnce()).toMatchObject({completed:0,claimLost:1});
  const second:ConversationHintDispatchPort={dispatch:async input=>{observed.push(input.payload.notificationId);return accepted();}};
  expect(await worker(second,'notification.new').runOnce()).toMatchObject({completed:1,claimLost:0});
  expect(observed).toHaveLength(2);expect(observed[0]).toBe(observed[1]);
 });
 it('does not duplicate claims across concurrent workers',async()=>{
  const dispatch=vi.fn(async()=>accepted());
  const result=await Promise.all([worker({dispatch},'notification.one').runOnce(),worker({dispatch},'notification.two').runOnce()]);
  expect(result.reduce((sum,row)=>sum+row.completed,0)).toBe(1);expect(dispatch).toHaveBeenCalledTimes(1);
 });
 it('rejects overlapping runs on the same worker instance',async()=>{
  let finish:((value:ReturnType<typeof accepted>)=>void)|undefined;
  const dispatch=vi.fn(()=>new Promise<ReturnType<typeof accepted>>(resolve=>{finish=resolve;}));
  const instance=worker({dispatch});const first=instance.runOnce();
  await vi.waitFor(()=>expect(dispatch).toHaveBeenCalledTimes(1));
  await expect(instance.runOnce()).rejects.toMatchObject({code:'NOTIFICATION_WORKER_BUSY'});
  finish?.(accepted());expect(await first).toMatchObject({completed:1});
 });
 it('surfaces a lost finalization acknowledgement without falsely reporting completion or redispatching committed success',async()=>{
  let loseReply=false;
  const pool=new Proxy(f.worker,{get(target,key){
   if(key==='connect')return async()=>{const c=await target.connect();return new Proxy(c,{get(client,field){
    if(field==='query')return async(sql:string,values?:unknown[])=>{const result=await client.query(sql,values);if(sql==='COMMIT'&&loseReply){loseReply=false;throw new Error('Lost acknowledgement');}return result;};
    const value=Reflect.get(client,field,client);return typeof value==='function'?value.bind(client):value;
   }});};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }}) as pg.Pool;
  const dispatch=vi.fn(async()=>{loseReply=true;return accepted();});
  await expect(worker({dispatch},'notification.uncertain',1000,pool).runOnce()).rejects.toMatchObject({code:'NOTIFICATION_FINALIZATION_UNAVAILABLE'});
  expect((await intent()).state).toBe('SUCCEEDED');
  expect(await worker({dispatch},'notification.recheck').runOnce()).toMatchObject({claimed:0});expect(dispatch).toHaveBeenCalledTimes(1);
 });
 it('dead-letters exhausted transient failures rather than retrying forever',async()=>{
  await f.pool.query('UPDATE notification_intents SET attempts=7');
  const dispatch=vi.fn(async()=>{throw new Error('Unavailable');});
  expect(await worker({dispatch}).runOnce()).toMatchObject({completed:0,dead:1});
  expect((await intent()).attempts).toBe(8);expect((await intent()).state).toBe('DEAD');
 });
});
