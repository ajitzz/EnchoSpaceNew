import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createConversationFixture} from './helpers/conversationFixture.js';
import {verifyConversationCatalog} from '../../server/deployment/conversationReadiness.js';
import {DurableOutbox,durableRequestFingerprint} from '../../lib/platform/durableOutbox.js';
import {conversationNotificationPayloadSchema,conversationNotificationTables} from '../../shared/conversation/delivery.js';

describe('CR1 conversation delivery migration037 on restricted PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof createConversationFixture>>;
 beforeAll(async()=>{f=await createConversationFixture();},30_000);
 afterAll(async()=>{await f?.close();});
 const send=(content='New message',event=randomUUID())=>f.asActor(10,async c=>(await c.query(`INSERT INTO messages(thread_id,sender_id,receiver_id,content,client_event_id) VALUES(1,10,20,$1,$2) RETURNING *`,[content,event])).rows[0]);
 it('preserves historical identities/content with deterministic sequences and no historical alerts',async()=>{
  expect((await f.pool.query('SELECT id,thread_id,content,conversation_sequence,notification_intent_id FROM messages ORDER BY id')).rows).toEqual([
   {id:1,thread_id:1,content:'Historical inquiry',conversation_sequence:'1',notification_intent_id:null},
   {id:2,thread_id:1,content:'Historical reply',conversation_sequence:'2',notification_intent_id:null},
   {id:3,thread_id:null,content:'Legacy booking-only message',conversation_sequence:null,notification_intent_id:null},
  ]);
  expect((await f.pool.query('SELECT * FROM notification_intents')).rowCount).toBe(0);
  expect((await f.pool.query('SELECT * FROM conversation_read_cursors')).rowCount).toBe(0);
 });
 it('passes runtime and isolated worker catalog checks',async()=>{
  for(const [pool,mode] of [[f.runtime,'runtime'],[f.worker,'worker']] as const){const c=await pool.connect();try{expect(await verifyConversationCatalog(c,mode)).toMatchObject({ready:true});}finally{c.release();}}
 });
 it.each([
  ['policyValid',"ALTER POLICY conversation_thread_boundary ON threads USING((conversation_actor_id() IN(guest_id,host_id)) OR true)"],
  ['policyValid',"ALTER POLICY conversation_thread_boundary ON threads WITH CHECK(true)"],
  ['policyValid',"ALTER POLICY notification_worker_read ON notification_intents TO PUBLIC"],
  ['policyValid',"CREATE POLICY conversation_thread_access ON notification_intents FOR SELECT USING(true)"],
  ['executeValid','REVOKE EXECUTE ON FUNCTION conversation_acknowledge_read(integer,integer) FROM cr1_conversation_runtime'],
  ['executeValid','GRANT EXECUTE ON FUNCTION conversation_guard_message() TO cr1_conversation_runtime'],
  ['grantsValid','GRANT UPDATE(content) ON messages TO cr1_conversation_runtime'],
  ['sequenceValid','GRANT UPDATE ON SEQUENCE messages_id_seq TO cr1_conversation_runtime'],
  ['constraintsValid','ALTER TABLE messages DROP CONSTRAINT conversation_message_sequence_shape; ALTER TABLE messages ADD CONSTRAINT conversation_message_sequence_shape CHECK(true)'],
  ['indexesValid','DROP INDEX notification_single_enqueue'],
  ['columnsValid','ALTER TABLE notification_intents ALTER COLUMN payload DROP NOT NULL'],
  ['functionsValid',"CREATE OR REPLACE FUNCTION conversation_actor_id() RETURNS integer LANGUAGE sql STABLE SET search_path=pg_catalog,public SET row_security=on AS 'SELECT 20'"],
 ] as const)('fails readiness when %s authority drifts (%s)',async(field,sql)=>{
  const c=await f.pool.connect();
  try{await c.query('BEGIN');await c.query(sql);await c.query('SET LOCAL ROLE cr1_conversation_runtime');expect(await verifyConversationCatalog(c)).toMatchObject({ready:false,[field]:false});}
  finally{await c.query('ROLLBACK');c.release();}
 });
 it('commits one routing-only intent and enqueue receipt per canonical message',async()=>{
  const m=await send('Sensitive contact +91 9999999999 must never enter an alert');
  const intent=(await f.pool.query('SELECT * FROM notification_intents WHERE message_id=$1',[m.id])).rows[0];
  expect(conversationNotificationPayloadSchema.parse(intent.payload)).toEqual({type:'new_message',threadId:1,messageId:m.id,notificationId:m.notification_intent_id});
  expect(JSON.stringify(intent)).not.toContain('9999999999');
  expect(intent.trace_source).toBe('SYSTEM');expect(intent.correlation_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(intent.request_fingerprint).toBe(durableRequestFingerprint({topic:'CRM.MESSAGE.NOTIFY',partitionKey:'conversation:1',payload:intent.payload,executionClass:'LOCAL_EFFECT',principalId:'user:10',organizationId:null}));
  expect((await f.pool.query('SELECT * FROM notification_intent_events WHERE outbox_id=$1',[intent.id])).rowCount).toBe(1);
 });
 it('propagates validated request trace and replaces malformed trace without copying text into alerts',async()=>{
  const traces=[['request.fixture.1','operation.fixture.1','REQUEST'],['private\ncontact@example.test','invalid contact','SYSTEM']] as const;
  for(const [trace,operation,source] of traces){
   const m=await f.asActor(10,async c=>{await c.query("SELECT set_config('app.correlation_id',$1,true),set_config('app.operation_id',$2,true)",[trace,operation]);return(await c.query("INSERT INTO messages(thread_id,sender_id,receiver_id,content) VALUES(1,10,20,'Trace fixture') RETURNING id")).rows[0];});
   const row=(await f.pool.query('SELECT correlation_id,causation_id,trace_source FROM notification_intents WHERE message_id=$1',[m.id])).rows[0];
   expect(row.trace_source).toBe(source);
   if(source==='REQUEST'){expect(row.correlation_id).toBe(trace);expect(row.causation_id).toBe(operation);}
   else{expect(row.correlation_id).toMatch(/^[0-9a-f-]{36}$/);expect(row.causation_id).toBeNull();}
  }
 });
 it('serializes concurrent sends and rolls conflicting duplicates back without an alert or sequence gap',async()=>{
  const start=BigInt((await f.pool.query('SELECT last_message_sequence FROM threads WHERE id=1')).rows[0].last_message_sequence);
  const sent=await Promise.all(Array.from({length:8},(_,n)=>send(`Concurrent fixture ${n}`)));
  expect(sent.map(m=>BigInt(m.conversation_sequence)).sort((a,b)=>a<b?-1:1)).toEqual(Array.from({length:8},(_,n)=>start+BigInt(n+1)));
  const event=randomUUID();const first=await send('Exact identity',event);
  await f.asActor(10,c=>c.query("INSERT INTO messages(thread_id,sender_id,receiver_id,content,client_event_id) VALUES(1,10,20,'Exact identity',$1) ON CONFLICT(sender_id,client_event_id) DO NOTHING",[event]));
  expect((await f.pool.query('SELECT count(*)::int AS n FROM notification_intents WHERE message_id=$1',[first.id])).rows[0].n).toBe(1);
  expect((await f.pool.query('SELECT last_message_sequence FROM threads WHERE id=1')).rows[0].last_message_sequence).toBe(first.conversation_sequence);
 });
 it('rolls back message, counter and intent when enqueue evidence fails',async()=>{
  const before=(await f.pool.query('SELECT last_message_sequence FROM threads WHERE id=1')).rows[0].last_message_sequence;
  await f.pool.query("CREATE FUNCTION test_reject_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_DELIVERY_FAILURE'; END $$; CREATE TRIGGER test_reject_notification BEFORE INSERT ON notification_intent_events FOR EACH ROW EXECUTE FUNCTION test_reject_notification()");
  try{await expect(send('Must roll back')).rejects.toThrow('TEST_DELIVERY_FAILURE');}finally{await f.pool.query('DROP TRIGGER test_reject_notification ON notification_intent_events; DROP FUNCTION test_reject_notification()');}
  expect((await f.pool.query("SELECT * FROM messages WHERE content='Must roll back'")).rowCount).toBe(0);
  expect((await f.pool.query('SELECT last_message_sequence FROM threads WHERE id=1')).rows[0].last_message_sequence).toBe(before);
 });
 it('denies foreign participants, sender spoofing, admin bypass and new unbridged writes',async()=>{
  await expect(f.asActor(30,c=>c.query("INSERT INTO messages(thread_id,sender_id,receiver_id,content) VALUES(1,30,20,'forbidden')"))).rejects.toThrow();
  await expect(f.asActor(10,c=>c.query("INSERT INTO messages(thread_id,sender_id,receiver_id,content) VALUES(1,20,10,'spoofed')"))).rejects.toThrow('CONVERSATION_PARTICIPANT_REQUIRED');
  await expect(f.asActor(10,c=>c.query("INSERT INTO messages(booking_id,sender_id,receiver_id,content) VALUES(77,10,20,'legacy write')"))).rejects.toThrow('CONVERSATION_THREAD_REQUIRED');
  const visible=await f.asActor(90,async c=>{await c.query("SELECT set_config('app.bypass_rls','true',true)");return(await c.query('SELECT * FROM messages')).rows;});expect(visible).toEqual([]);
 });
 it('requires a real published context and canonical guest/host identity for new threads',async()=>{
  await f.pool.query("INSERT INTO listings(id,user_id,title,publication_status) VALUES(91,20,'Unpublished fixture','draft'),(92,10,'Own fixture','published'); INSERT INTO experiences(id,host_id,title,status) VALUES(91,20,'Published experience','published'),(92,20,'Draft experience','draft')");
  const cases=[
   ["INSERT INTO threads(listing_id,guest_id,host_id) VALUES(1,10,30)",'CONVERSATION_CONTEXT_REQUIRED'],
   ["INSERT INTO threads(listing_id,guest_id,host_id) VALUES(91,10,20)",'CONVERSATION_CONTEXT_REQUIRED'],
   ["INSERT INTO threads(experience_id,guest_id,host_id) VALUES(92,10,20)",'CONVERSATION_CONTEXT_REQUIRED'],
   ["INSERT INTO threads(experience_id,guest_id,host_id) VALUES(91,10,30)",'CONVERSATION_CONTEXT_REQUIRED'],
   ["INSERT INTO threads(listing_id,experience_id,guest_id,host_id) VALUES(1,91,10,20)",'CONVERSATION_CONTEXT_REQUIRED'],
   ["INSERT INTO threads(guest_id,host_id) VALUES(10,20)",'CONVERSATION_CONTEXT_REQUIRED'],
   ["INSERT INTO threads(listing_id,guest_id,host_id) VALUES(1,30,20)",'CONVERSATION_PARTICIPANT_REQUIRED'],
   ["INSERT INTO threads(listing_id,guest_id,host_id) VALUES(92,10,10)",'CONVERSATION_PARTICIPANT_REQUIRED'],
   ["INSERT INTO threads(listing_id,guest_id,host_id,last_message) VALUES(1,10,20,'Fabricated message')",'CONVERSATION_INITIAL_STATE_REQUIRED'],
   ["INSERT INTO threads(listing_id,guest_id,host_id,last_message_sequence) VALUES(1,10,20,3)",'CONVERSATION_INITIAL_STATE_REQUIRED'],
   ["INSERT INTO threads(listing_id,guest_id,host_id,unread_count_host) VALUES(1,10,20,1)",'CONVERSATION_INITIAL_STATE_REQUIRED'],
   ["INSERT INTO threads(listing_id,guest_id,host_id,unread_count_guest) VALUES(1,10,20,NULL)",'CONVERSATION_INITIAL_STATE_REQUIRED'],
  ];
  for(const [sql,error] of cases)await expect(f.asActor(10,c=>c.query(sql))).rejects.toThrow(error);
  for(const context of ['listing_id','experience_id']){
   const row=await f.asActor(10,async c=>(await c.query(`INSERT INTO threads(${context},guest_id,host_id,updated_at) VALUES($1,10,20,'2000-01-01') RETURNING *`,[context==='listing_id'?1:91])).rows[0],false);
   expect(row.last_message_sequence).toBe('0');expect(row.last_message).toBeNull();expect(row.unread_count_host).toBe(0);expect(new Date(row.updated_at).getUTCFullYear()).toBeGreaterThan(2000);
  }
 });
 it('does not expose recipient lifecycle to sender and denies worker content access despite forged actor context',async()=>{
  expect(await f.asActor(10,async c=>(await c.query('SELECT * FROM notification_intents')).rows)).toEqual([]);
  expect((await f.asActor(20,async c=>(await c.query('SELECT * FROM notification_intents')).rows)).length).toBeGreaterThan(0);
  const c=await f.worker.connect();try{await c.query("SELECT set_config('app.current_user_id','20',false),set_config('app.bypass_rls','true',false)");await expect(c.query('SELECT content FROM messages')).rejects.toThrow('permission denied');await c.query('RESET ALL');}finally{c.release();}
 });
 it('keeps message meaning, sequence, participant identity, alerts and history immutable',async()=>{
  await expect(f.pool.query("UPDATE messages SET content='rewritten' WHERE id=1")).rejects.toThrow('CONVERSATION_MESSAGE_IMMUTABLE');
  await expect(f.pool.query('UPDATE messages SET conversation_sequence=99 WHERE id=1')).rejects.toThrow('CONVERSATION_MESSAGE_IMMUTABLE');
  await expect(f.pool.query('UPDATE threads SET host_id=90 WHERE id=1')).rejects.toThrow('CONVERSATION_THREAD_IDENTITY_IMMUTABLE');
  await expect(f.pool.query('UPDATE threads SET last_message_sequence=999 WHERE id=1')).rejects.toThrow('CONVERSATION_SEQUENCE_AUTHORITY_REQUIRED');
  await expect(f.pool.query('DELETE FROM threads WHERE id=1')).rejects.toThrow('CONVERSATION_RETENTION_POLICY_REQUIRED');
  await expect(f.pool.query('DELETE FROM messages WHERE id=3')).rejects.toThrow('CONVERSATION_RETENTION_POLICY_REQUIRED');
  await expect(f.pool.query("UPDATE notification_intents SET recipient_id=30")).rejects.toThrow('NOTIFICATION_INTENT_IMMUTABLE');
  await expect(f.pool.query("UPDATE notification_intent_events SET evidence='{}'")).rejects.toThrow('NOTIFICATION_EVENT_IMMUTABLE');
 });
 it('advances explicit read cursors monotonically, preserves newer unread messages and denies foreign cursors',async()=>{
  const first=await send('Read through this');const later=await send('Still unread');
  const receipt=await f.asActor(20,async c=>(await c.query('SELECT * FROM conversation_acknowledge_read(1,$1)',[first.id])).rows[0]);
  expect(receipt.last_read_sequence).toBe(first.conversation_sequence);expect(receipt.unread).toBe('1');
  expect((await f.pool.query('SELECT is_read FROM messages WHERE id=$1',[later.id])).rows[0].is_read).toBe(false);
  const old=await f.asActor(20,async c=>(await c.query('SELECT * FROM conversation_acknowledge_read(1,1)')).rows[0]);expect(old.last_read_sequence).toBe(first.conversation_sequence);
  await expect(f.asActor(30,c=>c.query('SELECT * FROM conversation_acknowledge_read(1,1)'))).rejects.toThrow('CONVERSATION_PARTICIPANT_REQUIRED');
  await expect(f.asActor(20,c=>c.query('SELECT * FROM conversation_acknowledge_read(2,1)'))).rejects.toThrow('CONVERSATION_CURSOR_AUTHORITY_REQUIRED');
 });
 it('uses shared durable claim fencing under the restricted content-free worker role',async()=>{
  const outbox=new DurableOutbox(f.worker,{tables:conversationNotificationTables,payloadSchema:conversationNotificationPayloadSchema});
  const claims=await outbox.claimBatch({workerId:'notification.fixture.worker',limit:2,leaseSeconds:10});expect(claims).toHaveLength(2);
  await outbox.succeed(claims[0],'notification.fixture.worker',{receiptId:randomUUID()});
  await expect(outbox.succeed(claims[0],'notification.fixture.worker')).rejects.toMatchObject({code:'OUTBOX_CLAIM_LOST'});
  expect(await outbox.fail({...claims[1],classification:'TRANSIENT',errorCode:'NOTIFICATION_TEMPORARILY_UNAVAILABLE'},'notification.fixture.worker')).toBe('RETRY');
 });
 it('recovers an expired local-effect lease and rejects the abandoned worker fence',async()=>{
  await f.asActor(30,c=>c.query("INSERT INTO messages(thread_id,sender_id,receiver_id,content) VALUES(2,30,20,'Lease recovery fixture')"));
  const outbox=new DurableOutbox(f.worker,{tables:conversationNotificationTables,payloadSchema:conversationNotificationPayloadSchema});
  const [old]=await outbox.claimBatch({workerId:'notification.old',partitionKey:'conversation:2',limit:1});
  await f.pool.query("UPDATE notification_intents SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[old.id]);
  const [current]=await outbox.claimBatch({workerId:'notification.new',partitionKey:'conversation:2',limit:1});
  expect(current.id).toBe(old.id);expect(BigInt(current.fence)).toBeGreaterThan(BigInt(old.fence));
  await expect(outbox.succeed(old,'notification.old')).rejects.toMatchObject({code:'OUTBOX_CLAIM_LOST'});
  await outbox.succeed(current,'notification.new',{receiptId:randomUUID()});
  expect((await f.pool.query("SELECT event_type FROM notification_intent_events WHERE outbox_id=$1 ORDER BY id",[old.id])).rows.map(row=>row.event_type)).toEqual(['ENQUEUED','CLAIMED','LEASE_EXPIRED','CLAIMED','SUCCEEDED']);
 });
});
