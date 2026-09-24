import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {createNotificationPreferencesFixture} from './helpers/notificationPreferencesFixture.js';
import {ConversationNotifications} from '../../lib/conversations/notifications.js';
import {verifyNotificationPreferenceCatalog,notificationPreferenceRuntimeGrants} from '../../server/deployment/notificationPreferencesReadiness.js';
import {ConversationNotificationWorker} from '../../server/conversation/notificationWorker.js';
import {DurableOutbox} from '../../lib/platform/durableOutbox.js';
import {conversationNotificationPayloadSchema,conversationNotificationTables} from '../../shared/conversation/delivery.js';
import type {PrincipalContext} from '../../shared/iam/principalContext.js';

const principal=(accountId=20):PrincipalContext=>({accountId,actorKind:'ACCOUNT',assuranceLevel:'AAL1',authenticatedAt:new Date().toISOString(),correlationId:'notification.test',operationId:randomUUID()});
describe('CR1 participant notification preferences and honest recipient evidence',()=>{
 let f:Awaited<ReturnType<typeof createNotificationPreferencesFixture>>,service:ConversationNotifications;
 beforeEach(async()=>{f=await createNotificationPreferencesFixture();service=new ConversationNotifications(f.runtime);},30_000);
 afterEach(async()=>{await f?.close();});
 const change=(expectedVersion='0',inAppAlerts=false,requestId=randomUUID())=>({requestId,expectedVersion,inAppAlerts});
 const send=(thread=1,sender=10,recipient=20)=>f.asActor(sender,async c=>(await c.query('INSERT INTO messages(thread_id,sender_id,receiver_id,content,client_event_id) VALUES($1,$2,$3,$4,$5) RETURNING id,notification_intent_id',[thread,sender,recipient,'Private contact guest@example.test',randomUUID()])).rows[0]);
 const worker=()=>new ConversationNotificationWorker(f.worker,{dispatch:async()=>({outcome:'SOCKET_HINT_DISPATCHED'})},{workerId:'test-worker'});
 const catalog=async()=>{const c=await f.runtime.connect();try{return await verifyNotificationPreferenceCatalog(c);}finally{c.release();}};

 it('has exact restricted catalog and no preference or external consent seeds',async()=>{
  expect(await catalog()).toMatchObject({ready:true});
  expect((await f.pool.query('SELECT * FROM conversation_notification_preferences')).rowCount).toBe(0);
  expect(await service.preferences(principal())).toEqual({accountId:20,version:'0',inAppAlerts:true,source:'DEFAULT',updatedAt:null,externalChannels:[
   {channel:'EMAIL',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'},
   {channel:'PUSH',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'},
   {channel:'SMS',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'},
  ]});
  expect((await service.evidence(principal())).items).toEqual([]);
 });
 it('commits preference and before/after receipt atomically and replays historical request truth',async()=>{
  const first=change();const receipt=await service.setPreference(principal(),first);
  expect(receipt).toMatchObject({accountId:20,requestId:first.requestId,previousVersion:'0',version:'1',inAppAlerts:false});
  expect(await service.preferences(principal())).toMatchObject({version:'1',source:'SAVED',inAppAlerts:false});
  await service.setPreference(principal(),change('1',true));
  expect(await service.setPreference(principal(),first)).toEqual(receipt);
  expect(await service.preferences(principal())).toMatchObject({version:'2',inAppAlerts:true});
  expect((await f.pool.query('SELECT previous_version,previous_in_app_alerts,version,in_app_alerts FROM conversation_notification_preference_events ORDER BY version')).rows).toEqual([
   {previous_version:'0',previous_in_app_alerts:null,version:'1',in_app_alerts:false},
   {previous_version:'1',previous_in_app_alerts:false,version:'2',in_app_alerts:true},
  ]);
 });
 it('coalesces concurrent UUID replay and rejects distinct stale CAS writers',async()=>{
  const same=change();const receipts=await Promise.all(Array.from({length:5},()=>service.setPreference(principal(),same)));
  expect(receipts.every(r=>JSON.stringify(r)===JSON.stringify(receipts[0]))).toBe(true);
  const concurrent=await Promise.allSettled([service.setPreference(principal(),change('1',true)),service.setPreference(principal(),change('1',false))]);
  expect(concurrent.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(concurrent.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'VERSION_CONFLICT'}});
  expect((await f.pool.query('SELECT count(*) FROM conversation_notification_preference_events')).rows[0].count).toBe('2');
 });
 it('binds replay to original version/value and actor without accepting channel or actor injection',async()=>{
  const body=change();await service.setPreference(principal(),body);
  for(const altered of [{...body,inAppAlerts:true},{...body,expectedVersion:'1'}])await expect(service.setPreference(principal(),altered)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await expect(service.setPreference(principal(),{...body,accountId:10})).rejects.toMatchObject({code:'INPUT_INVALID'});
  await expect(service.setPreference(principal(),{...body,email:true})).rejects.toMatchObject({code:'INPUT_INVALID'});
  await service.setPreference(principal(10),body);
  expect((await f.pool.query('SELECT count(*) FROM conversation_notification_preference_events')).rows[0].count).toBe('2');
  await expect(service.preferences({...principal(),actorKind:'SERVICE'})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 });
 it('rolls back setting if durable audit insertion fails',async()=>{
  await f.pool.query("CREATE FUNCTION test_reject_preference() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FAIL_AUDIT'; END$$; CREATE TRIGGER test_reject_preference BEFORE INSERT ON conversation_notification_preference_events FOR EACH ROW EXECUTE FUNCTION test_reject_preference()");
  // Exercise the database invariant directly; route readiness correctly rejects
  // extra triggers before a mutation, independently of atomic trigger rollback.
  await expect(f.asActor(20,async c=>{await c.query("SELECT set_config('app.notification_request_id',$1,true),set_config('app.notification_expected_version','0',true),set_config('app.correlation_id','test',true)",[randomUUID()]);return c.query('INSERT INTO conversation_notification_preferences(user_id,in_app_alerts,version) VALUES(20,false,1)');})).rejects.toThrow('FAIL_AUDIT');
  expect((await f.pool.query('SELECT count(*) FROM conversation_notification_preferences')).rows[0].count).toBe('0');
 });
 it('does not claim success after a lost commit and safely replays the same UUID',async()=>{
  let lost=false;
  const pool=new Proxy(f.runtime,{get(target,key){if(key==='connect')return async()=>{const client=await target.connect();return new Proxy(client,{get(c,field){if(field==='query')return async(sql:string,values?:unknown[])=>{const result=await c.query(sql,values);if(sql==='COMMIT'&&!lost){lost=true;throw new Error('Injected lost commit');}return result;};const value=Reflect.get(c,field,c);return typeof value==='function'?value.bind(c):value;}});};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}) as pg.Pool;
  const input=change();await expect(new ConversationNotifications(pool).setPreference(principal(),input)).rejects.toMatchObject({code:'OUTCOME_UNKNOWN'});
  expect(await service.setPreference(principal(),input)).toMatchObject({version:'1',requestId:input.requestId});
  expect((await f.pool.query('SELECT count(*) FROM conversation_notification_preference_events')).rows[0].count).toBe('1');
 });
 it('isolates preferences/evidence from other participants, legacy admin bypass and queue role',async()=>{
  await service.setPreference(principal(),change());await send();
  for(const actor of [10,30,90]){
   expect((await service.evidence(principal(actor))).items).toEqual([]);
   expect(await service.preferences(principal(actor))).toMatchObject({version:'0'});
   expect(await f.asActor(actor,async c=>{await c.query("SELECT set_config('app.bypass_rls','true',true),set_config('app.marketing_admin','true',true)");return(await c.query('SELECT * FROM conversation_notification_preference_events')).rows;})).toEqual([]);
  }
  await expect(f.worker.query('SELECT * FROM conversation_notification_preferences')).rejects.toThrow(/permission denied/);
  await expect(f.asActor(10,c=>c.query('UPDATE conversation_notification_preferences SET in_app_alerts=true,version=version+1 WHERE user_id=20'))).resolves.toMatchObject({rowCount:0});
 });
 it('blocks forged audit rows, content mutation, identity rewrite and deletion',async()=>{
  const r=await service.setPreference(principal(),change());
  await expect(f.asActor(20,async c=>{await c.query("SELECT set_config('app.notification_request_id',$1,true),set_config('app.notification_expected_version','0',true)",[randomUUID()]);return c.query("INSERT INTO conversation_notification_preference_events(user_id,request_id,previous_version,version,in_app_alerts,correlation_id) VALUES(20,gen_random_uuid(),0,1,false,'test')");})).rejects.toThrow('NOTIFICATION_PREFERENCE_AUDIT_AUTHORITY_REQUIRED');
  for(const sql of ['UPDATE conversation_notification_preference_events SET in_app_alerts=true','DELETE FROM conversation_notification_preference_events','UPDATE conversation_notification_preferences SET user_id=10','TRUNCATE conversation_notification_preferences'])await expect(f.asActor(20,c=>c.query(sql))).rejects.toThrow(/permission denied/);
  await expect(f.pool.query('UPDATE conversation_notification_preference_events SET in_app_alerts=true WHERE request_id=$1',[r.requestId])).rejects.toThrow('NOTIFICATION_PREFERENCE_AUDIT_IMMUTABLE');
 });
 it('muting optional in-app alerts never cancels canonical intents or hint processing',async()=>{
  await service.setPreference(principal(),change());const m=await send();
  expect(await worker().runOnce()).toMatchObject({completed:1});
  const evidence=(await service.evidence(principal())).items[0];
  expect(evidence).toMatchObject({messageId:m.id,queueState:'SUCCEEDED',attempts:1,socketHint:{state:'DISPATCH_RECORDED'},deviceDelivery:'NOT_RECORDED',readAcknowledgement:{state:'NOT_RECORDED'}});
  expect(evidence.socketHint.recordedAt).not.toBeNull();
  expect(JSON.stringify(evidence)).not.toMatch(/guest@example|recipient_id|claimed_by|correlation|payload|Private/);
  expect((await f.pool.query('SELECT * FROM conversation_read_cursors')).rowCount).toBe(0);
 });
 it('requires exact hint evidence and keeps read acknowledgement separate from job success',async()=>{
  const m=await send();
  const outbox=new DurableOutbox(f.worker,{tables:conversationNotificationTables,payloadSchema:conversationNotificationPayloadSchema});
  const [claim]=await outbox.claimBatch({workerId:'test-queue',limit:1,leaseSeconds:30,topics:['CRM.MESSAGE.NOTIFY']});
  await outbox.succeed(claim,'test-queue',{});
  expect((await service.evidence(principal())).items[0]).toMatchObject({queueState:'SUCCEEDED',socketHint:{state:'NOT_RECORDED'},deviceDelivery:'NOT_RECORDED',readAcknowledgement:{state:'NOT_RECORDED'}});
  await f.asActor(20,c=>c.query('SELECT * FROM conversation_acknowledge_read(1,$1)',[m.id]));
  expect((await service.evidence(principal())).items[0]).toMatchObject({socketHint:{state:'NOT_RECORDED'},deviceDelivery:'NOT_RECORDED',readAcknowledgement:{state:'ACKNOWLEDGED'}});
 });
 it('reports retry/DLQ without false hint, delivery or read receipts',async()=>{
  await send();const outbox=new DurableOutbox(f.worker,{tables:conversationNotificationTables,payloadSchema:conversationNotificationPayloadSchema});
  const [claim]=await outbox.claimBatch({workerId:'test-fail',limit:1,leaseSeconds:30,topics:['CRM.MESSAGE.NOTIFY']});
  expect((await service.evidence(principal())).items[0].queueState).toBe('RUNNING');
  await outbox.fail({...claim,classification:'PERMANENT',errorCode:'TEST_UNAVAILABLE'},'test-fail');
  expect((await service.evidence(principal())).items[0]).toMatchObject({queueState:'DEAD',socketHint:{state:'NOT_RECORDED'},deviceDelivery:'NOT_RECORDED',readAcknowledgement:{state:'NOT_RECORDED'}});
 });
 it('keeps stable timestamp/UUID keyset pages and rejects foreign cursor identities',async()=>{
  const sent=[];for(let i=0;i<5;i++)sent.push(await send());
  const first=await service.evidence(principal(),{limit:2});expect(first.items).toHaveLength(2);expect(first.nextBeforeId).not.toBeNull();
  const newMessage=await send();const second=await service.evidence(principal(),{limit:2,beforeId:first.nextBeforeId});
  const third=await service.evidence(principal(),{limit:2,beforeId:second.nextBeforeId});
  const seen=[...first.items,...second.items,...third.items].map(v=>v.messageId);
  expect(new Set(seen).size).toBe(5);expect(seen).not.toContain(newMessage.id);expect(new Set(seen)).toEqual(new Set(sent.map(v=>v.id)));expect(third.nextBeforeId).toBeNull();
  await expect(service.evidence(principal(10),{beforeId:first.nextBeforeId})).rejects.toMatchObject({code:'CURSOR_INVALID'});
  await expect(service.evidence(principal(),{beforeId:randomUUID()})).rejects.toMatchObject({code:'CURSOR_INVALID'});
  await expect(service.evidence(principal(),{limit:51})).rejects.toMatchObject({code:'INPUT_INVALID'});
 });
 it.each([
  ['policiesValid','ALTER POLICY notification_preference_boundary ON conversation_notification_preferences USING(user_id=conversation_actor_id() OR true)'],
  ['policiesValid','ALTER POLICY notification_preference_actor ON conversation_notification_preferences TO PUBLIC'],
  ['tablesValid','ALTER TABLE conversation_notification_preferences NO FORCE ROW LEVEL SECURITY'],
  ['columnsValid','ALTER TABLE conversation_notification_preferences ALTER COLUMN in_app_alerts DROP NOT NULL'],
  ['constraintsValid','ALTER TABLE conversation_notification_preferences DROP CONSTRAINT conversation_notification_preferences_version_check'],
  ['indexesValid','ALTER TABLE conversation_notification_preference_events DROP CONSTRAINT conversation_notification_preference_events_user_id_version_key'],
  ['triggersValid','ALTER TABLE conversation_notification_preferences DISABLE TRIGGER conversation_notification_preference_record'],
  ['functionsValid',"CREATE OR REPLACE FUNCTION conversation_guard_notification_preference() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public SET row_security=on AS $$ BEGIN RETURN NEW; END $$"],
  ['functionsValid','GRANT EXECUTE ON FUNCTION conversation_guard_notification_preference() TO PUBLIC'],
  ['grantsValid','GRANT UPDATE ON conversation_notification_preference_events TO cr1_conversation_runtime'],
  ['conversationReady','ALTER POLICY notification_recipient_read ON notification_intents USING(true)'],
 ] as const)('fails closed when %s catalog authority drifts',async(field,sql)=>{
  await f.pool.query(sql);expect(await catalog()).toMatchObject({ready:false,[field]:false});
  await expect(service.preferences(principal())).rejects.toMatchObject({code:'NOT_READY'});
 });
 it('rejects SQL-shaped rollout role names',()=>{expect(()=>notificationPreferenceRuntimeGrants('role; DROP TABLE users')).toThrow('NOTIFICATION_PREFERENCE_ROLE_INVALID');});
});
