import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {createConversationFixture} from './helpers/conversationFixture.js';
import {InquiryInbox} from '../../lib/marketing/inquiryInbox.js';
import {runWithExecutionContext,createRootExecutionContext} from '../../lib/observability/executionContext.js';

const guest={id:10,role:'host' as const},host={id:20,role:'host' as const};
describe('CR1 participant conversation service with delivery schema',()=>{
 let fixture:Awaited<ReturnType<typeof createConversationFixture>>,inbox:InquiryInbox;
 beforeAll(async()=>{fixture=await createConversationFixture();await fixture.pool.query('CREATE TABLE bookings(id integer PRIMARY KEY,user_id integer,listing_id integer);INSERT INTO bookings VALUES(77,10,1);GRANT SELECT ON bookings TO cr1_conversation_runtime');inbox=new InquiryInbox(fixture.runtime,text=>({sanitized:text,wasSanitized:false}),undefined,{deliveryRequired:true});});
 afterAll(async()=>{await fixture?.close();});
 it('coalesces concurrent replay into one ordered message and one content-free durable intent',async()=>{
  const input={content:'Can we bring our pet?',clientEventId:randomUUID()};
  const trace=createRootExecutionContext({source:'HTTP',correlationId:'conversation-test',operationId:'send-test'});
  const results=await runWithExecutionContext(trace,()=>Promise.all(Array.from({length:5},()=>inbox.send(guest,1,input))));
  const message=results[0].message;
  expect(new Set(results.map(result=>result.message.id)).size).toBe(1);
  expect(results.filter(result=>!result.duplicate)).toHaveLength(1);
  expect(message.conversation_sequence).toBe('3');
  const intent=(await fixture.pool.query('SELECT * FROM notification_intents WHERE message_id=$1',[message.id])).rows;
  expect(intent).toHaveLength(1);
  expect(intent[0]).toMatchObject({correlation_id:'conversation-test',causation_id:'send-test',state:'PENDING',recipient_id:20});
  expect(intent[0].payload).toEqual({type:'new_message',threadId:1,messageId:message.id,notificationId:message.notification_intent_id});
  const event=(await fixture.pool.query('SELECT * FROM notification_intent_events WHERE outbox_id=$1',[intent[0].id])).rows;
  expect(event).toHaveLength(1);
  await expect(inbox.send(guest,1,{...input,content:'Different'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 });
 it('returns canonical client identity and does not mutate read state on history access',async()=>{
  const before=await inbox.unread(host);
  const messages=await inbox.messages(host,1);
  expect(messages.at(-1)).toMatchObject({conversation_sequence:'3',client_event_id:expect.any(String),is_read:false});
  expect(await inbox.unread(host)).toEqual(before);
  const cursor=messages.at(-1).id;
  const later=await inbox.send(guest,1,{content:'A later question',clientEventId:randomUUID()});
  expect(await inbox.acknowledgeRead(host,1,{throughMessageId:cursor})).toMatchObject({lastReadSequence:'3',unread:1});
  expect(await inbox.acknowledgeRead(host,1,{throughMessageId:1})).toMatchObject({lastReadSequence:'3',unread:1});
  expect((await fixture.pool.query('SELECT is_read FROM messages WHERE id=$1',[later.message.id])).rows[0].is_read).toBe(false);
 });
 it('preserves participant isolation despite a legacy admin claim and scopes list/unread consistently',async()=>{
  expect(await inbox.list(guest,{role:'host'})).toEqual([]);
  expect((await inbox.list(guest,{role:'guest'})).map(row=>row.id)).toEqual([1]);
  expect((await inbox.list(host,{role:'host'})).map(row=>row.id)).toEqual([1,2]);
  await expect(inbox.messages({id:90,role:'admin'},1)).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
  await expect(inbox.send(guest,2,{content:'Not my conversation',clientEventId:randomUUID()})).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
  await expect(inbox.send(guest,1,{content:'No durable command ID'})).rejects.toThrow();
  await expect(inbox.acknowledgeRead(host,1,{throughMessageId:999})).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
 });
 it('paginates activity-ordered threads with a validated stable cursor',async()=>{
  const current=await inbox.list(host,{role:'host'});
  expect(current.map(row=>row.id)).toEqual([1,2]);
  expect((await inbox.list(host,{role:'host',before:current[0].list_cursor})).map(row=>row.id)).toEqual([2]);
  await expect(inbox.list(host,{before:'invalid'})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 });
 it('keeps historical booking-only messages participant-readable without inventing a new conversation',async()=>{
  expect(await inbox.bookingHistory(guest,77)).toEqual([expect.objectContaining({id:3,thread_id:null,content:'Legacy booking-only message'})]);
  expect(await inbox.bookingHistory(host,77)).toHaveLength(1);
  await expect(inbox.bookingHistory({id:90,role:'admin'},77)).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
  expect((await fixture.pool.query('SELECT count(*)::int AS count FROM notification_intents WHERE message_id=3')).rows[0].count).toBe(0);
 });
 it('rolls message, counter, sequence and notification back together on later transaction failure',async()=>{
  const before=(await fixture.pool.query('SELECT last_message_sequence FROM threads WHERE id=1')).rows[0];
  const eventId=randomUUID();
  const failing=new InquiryInbox(new Proxy(fixture.runtime,{get(target,key){
   if(key==='connect')return async()=>{const c=await target.connect();return new Proxy(c,{get(client,field){
    if(field==='query')return async(sql:string,values?:unknown[])=>{if(sql.startsWith('UPDATE threads SET last_message='))throw new Error('Injected counter failure');return client.query(sql,values);};
    const value=Reflect.get(client,field,client);return typeof value==='function'?value.bind(client):value;
   }});};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }}) as pg.Pool,text=>({sanitized:text,wasSanitized:false}),undefined,{deliveryRequired:true});
  await expect(failing.send(guest,1,{content:'Must rollback',clientEventId:eventId})).rejects.toThrow('Injected counter failure');
  expect((await fixture.pool.query('SELECT id FROM messages WHERE client_event_id=$1',[eventId])).rows).toEqual([]);
  expect((await fixture.pool.query('SELECT last_message_sequence FROM threads WHERE id=1')).rows[0]).toEqual(before);
  expect((await fixture.pool.query('SELECT count(*)::int AS count FROM notification_intents')).rows[0].count).toBe(2);
 });
 it('classifies a lost commit reply as unknown and reconciles with the same event identity',async()=>{
  let failCommit=true;
  const transport=new Proxy(fixture.runtime,{get(target,key){
   if(key==='connect')return async()=>{const c=await target.connect();return new Proxy(c,{get(client,field){
    if(field==='query')return async(sql:string,values?:unknown[])=>{const result=await client.query(sql,values);if(sql==='COMMIT'&&failCommit){failCommit=false;throw new Error('Lost commit acknowledgement');}return result;};
    const value=Reflect.get(client,field,client);return typeof value==='function'?value.bind(client):value;
   }});};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }}) as pg.Pool;
  const uncertain=new InquiryInbox(transport,text=>({sanitized:text,wasSanitized:false}),undefined,{deliveryRequired:true});
  const input={content:'Same event on recovery',clientEventId:randomUUID()};
  await expect(uncertain.send(guest,1,input)).rejects.toMatchObject({code:'OPERATION_OUTCOME_UNKNOWN'});
  const recovered=await inbox.send(guest,1,input);
  expect(recovered.duplicate).toBe(true);
  expect((await fixture.pool.query('SELECT id FROM notification_intents WHERE message_id=$1',[recovered.message.id])).rows).toHaveLength(1);
 });
});
