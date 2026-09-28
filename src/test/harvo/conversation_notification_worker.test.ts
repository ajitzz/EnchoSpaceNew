import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type pg from 'pg';
import {spawn,type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {createConversationFixture} from './helpers/conversationFixture.js';
import {ConversationNotificationWorker,ConversationNotificationWorkerError,type ConversationHintDispatchPort} from '../../server/conversation/notificationWorker.js';
import {notificationRuntimeFailure} from '../../server/conversation/notificationRuntime.js';
import {verifyConversationCatalog} from '../../server/deployment/conversationReadiness.js';

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
 const children:ChildProcess[]=[];
 afterEach(()=>{for(const child of children.splice(0))if(child.exitCode===null)child.kill('SIGKILL');});
 async function childWorker(name:string,mode:'RUN'|'EXIT_AFTER_HINT'='RUN'){
  const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('../../../scripts/testing/cr1-notification-worker.ts',import.meta.url)),JSON.stringify({host:f.worker.options.host,port:f.worker.options.port,workerId:`notification.child.${name}`,mode})],{
   env:{PATH:process.env.PATH??'',NODE_ENV:'test',ENCHO_TEST_SANDBOX:'1',TZ:'UTC'},stdio:['ignore','ignore','pipe','ipc'],
  });
  children.push(child);let stderr='';child.stderr?.on('data',chunk=>{stderr+=String(chunk);});
  const hints:string[]=[];
  const results:{claimed:number;completed:number}[]=[];
  const completion=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{if(code===0||code===23)resolve(code);else reject(new Error(`Child worker failed (${code}): ${stderr}`));});});
  const ready=new Promise<void>((resolve,reject)=>{
   child.once('error',reject);child.once('exit',code=>reject(new Error(`Child exited before readiness: ${code}`)));
   child.on('message',message=>{
    const parsed=z.discriminatedUnion('type',[
     z.object({type:z.literal('ready')}),z.object({type:z.literal('hint'),notificationId:z.string().uuid()}),
     z.object({type:z.literal('result'),result:z.object({claimed:z.number().int(),completed:z.number().int()})}),
     z.object({type:z.literal('error'),code:z.literal('LOCAL_WORKER_FIXTURE_FAILED')}),
    ]).parse(message);
    if(parsed.type==='ready')resolve();else if(parsed.type==='hint')hints.push(parsed.notificationId);else if(parsed.type==='result')results.push(parsed.result);
   });
  });
  // Attach a failure handler immediately; the test still awaits the same promise.
  void completion.catch(()=>{});await ready;
  return {run:()=>{child.send({type:'run'});return completion;},hints,results};
 }

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
 it('projects unknown outcomes through the actual runtime reporter without private error material',()=>{
  expect(notificationRuntimeFailure(new ConversationNotificationWorkerError('NOTIFICATION_QUEUE_OUTCOME_UNKNOWN'))).toEqual({code:'NOTIFICATION_HINT_OUTCOME_UNKNOWN',stage:'CLAIM_OR_HEARTBEAT'});
  expect(notificationRuntimeFailure(new ConversationNotificationWorkerError('NOTIFICATION_FINALIZATION_OUTCOME_UNKNOWN'))).toEqual({code:'NOTIFICATION_HINT_OUTCOME_UNKNOWN',stage:'FINALIZATION'});
  for(const error of [new Error('private token and content'),new ConversationNotificationWorkerError('NOTIFICATION_WORKER_NOT_READY'),{code:'NOTIFICATION_QUEUE_OUTCOME_UNKNOWN',secret:'private token'}])
   expect(notificationRuntimeFailure(error)).toEqual({code:'NOTIFICATION_HINT_RUNTIME_UNAVAILABLE'});
 });
 it('refuses runtime, owner and widened-policy pools before dispatch',async()=>{
  const dispatch=vi.fn(async()=>accepted());
  for(const pool of [f.runtime,f.pool])await expect(worker({dispatch},'notification.test',1000,pool).runOnce()).rejects.toMatchObject({code:'NOTIFICATION_WORKER_NOT_READY'});
  await f.pool.query('ALTER POLICY notification_worker_read ON notification_intents TO PUBLIC');
  await expect(worker({dispatch}).runOnce()).rejects.toMatchObject({code:'NOTIFICATION_WORKER_NOT_READY'});
  expect(dispatch).not.toHaveBeenCalled();expect((await intent()).state).toBe('PENDING');
 });
 it('certifies only separate restricted LOGIN roles, rejecting owner SET ROLE and NOINHERIT privilege reachability',async()=>{
  for(const [pool,mode] of [[f.runtime,'runtime'],[f.worker,'worker']] as const){
   const client=await pool.connect();try{expect(await verifyConversationCatalog(client,mode)).toMatchObject({ready:true,roleSafe:true});}finally{client.release();}
  }
  const owner=await f.pool.connect();
  try{
   for(const mode of ['runtime','worker'] as const)expect(await verifyConversationCatalog(owner,mode)).toMatchObject({ready:false,roleSafe:false});
   await owner.query('SET ROLE cr1_notification_worker');
   expect(await verifyConversationCatalog(owner,'worker')).toMatchObject({ready:false,roleSafe:false});
  }finally{await owner.query('RESET ROLE');owner.release();}
  await f.pool.query('CREATE ROLE reachable_unsafe NOLOGIN BYPASSRLS; ALTER ROLE cr1_notification_worker NOINHERIT; GRANT reachable_unsafe TO cr1_notification_worker');
  const dispatch=vi.fn(async()=>accepted());
  await expect(worker({dispatch}).runOnce()).rejects.toMatchObject({code:'NOTIFICATION_WORKER_NOT_READY'});
  expect(dispatch).not.toHaveBeenCalled();expect((await intent()).state).toBe('PENDING');
 });
 it.each([
  ['GRANT SELECT(content) ON messages TO reachable_data','grantsValid'],
  ['GRANT INSERT ON notification_intents TO reachable_data','grantsValid'],
  ['GRANT UPDATE(recipient_id) ON notification_intents TO reachable_data','grantsValid'],
  ['GRANT REFERENCES(content) ON messages TO reachable_data','grantsValid'],
  ['GRANT EXECUTE ON FUNCTION conversation_acknowledge_read(integer,integer) TO reachable_data','executeValid'],
  ['GRANT USAGE ON SEQUENCE messages_id_seq TO reachable_data','sequenceValid'],
  ['GRANT UPDATE ON SEQUENCE notification_intent_events_id_seq TO reachable_data','sequenceValid'],
 ] as const)('rejects a reachable NOINHERIT forbidden queue capability: %s',async(sql,field)=>{
  await f.pool.query('CREATE ROLE reachable_data NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION; ALTER ROLE cr1_notification_worker NOINHERIT; GRANT reachable_data TO cr1_notification_worker');
  await f.pool.query(sql);
  const client=await f.worker.connect();
  try{expect(await verifyConversationCatalog(client,'worker')).toMatchObject({ready:false,roleSafe:true,[field]:false});}finally{client.release();}
  const dispatch=vi.fn(async()=>accepted());await expect(worker({dispatch}).runOnce()).rejects.toMatchObject({code:'NOTIFICATION_WORKER_NOT_READY'});
  expect(dispatch).not.toHaveBeenCalled();expect((await intent()).state).toBe('PENDING');
 });
 it('rejects a reachable NOINHERIT edit capability on consumer message content',async()=>{
  await f.pool.query('CREATE ROLE reachable_consumer_data NOLOGIN; ALTER ROLE cr1_conversation_runtime NOINHERIT; GRANT reachable_consumer_data TO cr1_conversation_runtime; GRANT UPDATE(content) ON messages TO reachable_consumer_data');
  const client=await f.runtime.connect();
  try{expect(await verifyConversationCatalog(client,'runtime')).toMatchObject({ready:false,roleSafe:true,grantsValid:false});}finally{client.release();}
 });
 it('reauthorizes worker authority after a committed claim and before a socket effect',async()=>{
  let revoked=false;
  const pool=new Proxy(f.worker,{get(target,key){
   if(key==='connect')return async()=>{const c=await target.connect();return new Proxy(c,{get(client,field){
    if(field==='query')return async(sql:string,values?:unknown[])=>{
     const result=await client.query(sql,values);
     if(sql==='COMMIT'&&!revoked){revoked=true;await f.pool.query('REVOKE SELECT ON notification_intent_events FROM cr1_notification_worker');}
     return result;
    };
    const value=Reflect.get(client,field,client);return typeof value==='function'?value.bind(client):value;
   }});};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }}) as pg.Pool;
  const dispatch=vi.fn(async()=>accepted());
  await expect(worker({dispatch},'notification.revoked',1000,pool).runOnce()).rejects.toMatchObject({code:'NOTIFICATION_WORKER_NOT_READY'});
  expect(revoked).toBe(true);expect(dispatch).not.toHaveBeenCalled();
  const row=await intent();expect(row.state).toBe('RUNNING');expect(row.attempts).toBe(1);
  expect((await f.pool.query("SELECT count(*) FROM notification_intent_events WHERE event_type IN ('SUCCEEDED','FAILED')")).rows[0].count).toBe('0');
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
 it('rejects a stale claim before its protected hint and permits only the newer attempt',async()=>{
  let commits=0;
  const pool=new Proxy(f.worker,{get(target,key){
   if(key==='connect')return async()=>{const c=await target.connect();return new Proxy(c,{get(client,field){
    if(field==='query')return async(sql:string,values?:unknown[])=>{
     const result=await client.query(sql,values);
     if(sql==='COMMIT'&&++commits===2)await f.pool.query("UPDATE notification_intents SET lease_until=clock_timestamp()-interval '1 second'");
     return result;
    };
    const value=Reflect.get(client,field,client);return typeof value==='function'?value.bind(client):value;
   }});};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }}) as pg.Pool;
  const dispatch=vi.fn<ConversationHintDispatchPort['dispatch']>(async()=>accepted());
  expect(await worker({dispatch},'notification.stale',1000,pool).runOnce()).toMatchObject({completed:0,claimLost:1});
  expect(dispatch).not.toHaveBeenCalled();const stale=await intent();
  expect(await worker({dispatch},'notification.fresh').runOnce()).toMatchObject({completed:1});
  expect(dispatch).toHaveBeenCalledTimes(1);expect(BigInt((await intent()).fence)).toBeGreaterThan(BigInt(stale.fence));
 });
 it('does not duplicate claims across concurrent workers',async()=>{
  const dispatch=vi.fn(async()=>accepted());
  const result=await Promise.all([worker({dispatch},'notification.one').runOnce(),worker({dispatch},'notification.two').runOnce()]);
  expect(result.reduce((sum,row)=>sum+row.completed,0)).toBe(1);expect(dispatch).toHaveBeenCalledTimes(1);
 });
 it('keeps a single durable claim across distinct Node processes',async()=>{
  const [one,two]=await Promise.all([childWorker('one'),childWorker('two')]);
  expect(await Promise.all([one.run(),two.run()])).toEqual([0,0]);
  expect([...one.hints,...two.hints]).toHaveLength(1);
  expect([...one.results,...two.results].reduce((sum,r)=>sum+r.completed,0)).toBe(1);
  expect((await intent()).state).toBe('SUCCEEDED');
 },20_000);
 it('recovers a process exit after a hint without inventing a new notification identity',async()=>{
  const first=await childWorker('crash','EXIT_AFTER_HINT');expect(await first.run()).toBe(23);
  const prior=await intent();expect(prior.state).toBe('RUNNING');expect(first.hints).toEqual([prior.id]);
  await f.pool.query("UPDATE notification_intents SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[prior.id]);
  const restarted=await childWorker('restart');expect(await restarted.run()).toBe(0);expect(restarted.hints).toEqual([prior.id]);
  const final=await intent();expect(final.state).toBe('SUCCEEDED');expect(BigInt(final.fence)).toBeGreaterThan(BigInt(prior.fence));
  const third=await childWorker('verified');expect(await third.run()).toBe(0);expect(third.hints).toEqual([]);expect(third.results[0]).toMatchObject({claimed:0,completed:0});
 },20_000);
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
  await expect(worker({dispatch},'notification.uncertain',1000,pool).runOnce()).rejects.toMatchObject({code:'NOTIFICATION_FINALIZATION_OUTCOME_UNKNOWN'});
  expect((await intent()).state).toBe('SUCCEEDED');
  expect(await worker({dispatch},'notification.recheck').runOnce()).toMatchObject({claimed:0});expect(dispatch).toHaveBeenCalledTimes(1);
 });
 it.each([false,true])('does not dispatch after an unknown claim commit (committed=%s)',async committed=>{
  let fail=true;
  const pool=new Proxy(f.worker,{get(target,key){
   if(key==='connect')return async()=>{const c=await target.connect();return new Proxy(c,{get(client,field){
    if(field==='query')return async(sql:string,values?:unknown[])=>{
     if(sql==='COMMIT'&&fail){fail=false;if(committed)await client.query(sql,values);throw new Error('Claim acknowledgement lost');}
     return client.query(sql,values);
    };
    const value=Reflect.get(client,field,client);return typeof value==='function'?value.bind(client):value;
   }});};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }}) as pg.Pool;
  const dispatch=vi.fn<ConversationHintDispatchPort['dispatch']>(async()=>accepted());const prior=await intent();
  await expect(worker({dispatch},'notification.unknownclaim',1000,pool).runOnce()).rejects.toMatchObject({code:'NOTIFICATION_QUEUE_OUTCOME_UNKNOWN'});
  expect(dispatch).not.toHaveBeenCalled();expect((await intent()).state).toBe(committed?'RUNNING':'PENDING');
  if(committed){
   expect(await worker({dispatch},'notification.beforeexpiry').runOnce()).toMatchObject({claimed:0});
   await f.pool.query("UPDATE notification_intents SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[prior.id]);
  }
  expect(await worker({dispatch},'notification.recoveredclaim').runOnce()).toMatchObject({completed:1});
  expect(dispatch).toHaveBeenCalledTimes(1);expect(dispatch.mock.calls[0]?.[0].payload.notificationId).toBe(prior.id);
 });
 it('keeps an uncommitted finalization unknown until lease recovery and reuses the hint identity',async()=>{
  let fail=false;
  const pool=new Proxy(f.worker,{get(target,key){
   if(key==='connect')return async()=>{const c=await target.connect();return new Proxy(c,{get(client,field){
    if(field==='query')return async(sql:string,values?:unknown[])=>{if(sql==='COMMIT'&&fail){fail=false;throw new Error('Connection lost before COMMIT');}return client.query(sql,values);};
    const value=Reflect.get(client,field,client);return typeof value==='function'?value.bind(client):value;
   }});};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }}) as pg.Pool;
  const hints:string[]=[];const prior=await intent();
  await expect(worker({dispatch:async input=>{hints.push(input.payload.notificationId);fail=true;return accepted();}},'notification.uncommitted',1000,pool).runOnce()).rejects.toMatchObject({code:'NOTIFICATION_FINALIZATION_OUTCOME_UNKNOWN'});
  expect((await intent()).state).toBe('RUNNING');
  const dispatch=vi.fn(async(input:Parameters<ConversationHintDispatchPort['dispatch']>[0])=>{hints.push(input.payload.notificationId);return accepted();});
  expect(await worker({dispatch},'notification.waitlease').runOnce()).toMatchObject({claimed:0});expect(dispatch).not.toHaveBeenCalled();
  await f.pool.query("UPDATE notification_intents SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[prior.id]);
  expect(await worker({dispatch},'notification.recoveredhint').runOnce()).toMatchObject({completed:1});
  expect(hints).toEqual([prior.id,prior.id]);
 });
 it('dead-letters exhausted transient failures rather than retrying forever',async()=>{
  await f.pool.query('UPDATE notification_intents SET attempts=7');
  const dispatch=vi.fn(async()=>{throw new Error('Unavailable');});
  expect(await worker({dispatch}).runOnce()).toMatchObject({completed:0,dead:1});
  expect((await intent()).attempts).toBe(8);expect((await intent()).state).toBe('DEAD');
 });
});
