import type pg from 'pg';
import {z} from 'zod';
import {principalContextSchema,type PrincipalContext} from '../../shared/iam/principalContext.js';
import {notificationPreferenceMutationSchema,notificationPreferencesSchema,notificationPreferenceReceiptSchema,notificationEvidenceQuerySchema,notificationEvidencePageSchema} from '../../shared/conversation/notifications.js';
import {verifyNotificationPreferenceCatalog} from '../../server/deployment/notificationPreferencesReadiness.js';

const errorCodes=['INPUT_INVALID','PERMISSION_DENIED','VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','CURSOR_INVALID','NOT_READY','STORE_UNAVAILABLE','OUTCOME_UNKNOWN'] as const;
type ErrorCode=typeof errorCodes[number];
export class ConversationNotificationError extends Error {
 readonly status:number;
 constructor(readonly code:ErrorCode){super(`CONVERSATION_NOTIFICATION_${code}`);this.name='ConversationNotificationError';this.status=['INPUT_INVALID','CURSOR_INVALID'].includes(code)?400:code==='PERMISSION_DENIED'?403:['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT'].includes(code)?409:503;}
}
const externalChannels=[
 {channel:'EMAIL',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'},
 {channel:'PUSH',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'},
 {channel:'SMS',availability:'NOT_CONFIGURED',consent:'NOT_RECORDED'},
] as const;
const iso=(value:unknown)=>z.date().parse(value).toISOString();
const receiptRowSchema=z.object({user_id:z.number().int().positive().safe(),request_id:z.string().uuid(),previous_version:z.string(),version:z.string(),in_app_alerts:z.boolean(),created_at:z.date()});

/** ACCOUNT-only service. Preference controls presentation, never canonical inbox
 * synchronization, transport consent, provider dispatch or message persistence. */
export class ConversationNotifications {
 constructor(private readonly pool:pg.Pool){}
 async preferences(principal:PrincipalContext){
  return this.transaction(principal,false,async(c,actor)=>{
   const row=(await c.query('SELECT in_app_alerts,version,updated_at FROM conversation_notification_preferences WHERE user_id=$1',[actor])).rows[0];
   return notificationPreferencesSchema.parse({accountId:actor,version:row?.version??'0',inAppAlerts:row?.in_app_alerts??true,source:row?'SAVED':'DEFAULT',updatedAt:row?iso(row.updated_at):null,externalChannels});
  });
 }
 async setPreference(principal:PrincipalContext,input:unknown){
  const body=this.parse(notificationPreferenceMutationSchema,input);
  return this.transaction(principal,true,async(c,actor)=>{
   // Serializes both first insert and UUID replay for this account only. CAS is
   // also enforced by the trigger, so stale writers cannot overwrite a setting.
   await c.query('SELECT pg_advisory_xact_lock(82749039,$1)',[actor]);
   const existing=(await c.query('SELECT user_id,request_id,previous_version,version,in_app_alerts,created_at FROM conversation_notification_preference_events WHERE user_id=$1 AND request_id=$2',[actor,body.requestId])).rows[0];
   if(existing){
    const receipt=receiptRowSchema.parse(existing);
    if(receipt.previous_version!==body.expectedVersion||receipt.in_app_alerts!==body.inAppAlerts)throw new ConversationNotificationError('IDEMPOTENCY_CONFLICT');
    return this.receipt(receipt);
   }
   const previous=(await c.query('SELECT version FROM conversation_notification_preferences WHERE user_id=$1 FOR UPDATE',[actor])).rows[0];
   if((previous?.version??'0')!==body.expectedVersion||body.expectedVersion==='9223372036854775807')throw new ConversationNotificationError('VERSION_CONFLICT');
   await c.query("SELECT set_config('app.notification_request_id',$1,true),set_config('app.notification_expected_version',$2,true)",[body.requestId,body.expectedVersion]);
   if(previous)await c.query('UPDATE conversation_notification_preferences SET in_app_alerts=$2,version=version+1 WHERE user_id=$1',[actor,body.inAppAlerts]);
   else await c.query('INSERT INTO conversation_notification_preferences(user_id,in_app_alerts,version) VALUES($1,$2,1)',[actor,body.inAppAlerts]);
   return this.receipt(receiptRowSchema.parse((await c.query('SELECT user_id,request_id,previous_version,version,in_app_alerts,created_at FROM conversation_notification_preference_events WHERE user_id=$1 AND request_id=$2',[actor,body.requestId])).rows[0]));
  });
 }
 async evidence(principal:PrincipalContext,input:unknown={}){
  const body=this.parse(notificationEvidenceQuerySchema,input);
  return this.transaction(principal,false,async(c,actor)=>{
   if(body.beforeId&&!(await c.query('SELECT id FROM notification_intents WHERE recipient_id=$1 AND id=$2',[actor,body.beforeId])).rowCount)throw new ConversationNotificationError('CURSOR_INVALID');
   // The cursor tuple is read from immutable canonical data, retaining PostgreSQL
   // microseconds. A UUID belonging to a sender/other recipient cannot page it.
   const rows=(await c.query(`WITH selected AS (
    SELECT i.id,i.thread_id,i.message_id,i.message_sequence,i.created_at,i.state,i.attempts
    FROM notification_intents i WHERE i.recipient_id=$1
     AND ($2::uuid IS NULL OR (i.created_at,i.id)<(SELECT b.created_at,b.id FROM notification_intents b WHERE b.recipient_id=$1 AND b.id=$2))
    ORDER BY i.created_at DESC,i.id DESC LIMIT $3
   ) SELECT s.*,hint.created_at AS hint_at,CASE WHEN cursor.last_read_sequence>=s.message_sequence THEN cursor.acknowledged_at ELSE NULL END AS acknowledged_at
    FROM selected s LEFT JOIN LATERAL(
     SELECT e.created_at FROM notification_intent_events e WHERE e.outbox_id=s.id AND e.event_type='SUCCEEDED' AND e.evidence->>'outcome'='SOCKET_HINT_DISPATCHED'
     ORDER BY e.id DESC LIMIT 1
    ) hint ON true LEFT JOIN conversation_read_cursors cursor ON cursor.thread_id=s.thread_id AND cursor.user_id=$1
    ORDER BY s.created_at DESC,s.id DESC`,[actor,body.beforeId??null,body.limit+1])).rows;
   const hasMore=rows.length>body.limit;
   const items=rows.slice(0,body.limit).map(row=>({notificationId:row.id,threadId:row.thread_id,messageId:row.message_id,createdAt:iso(row.created_at),queueState:row.state,attempts:row.attempts,
    socketHint:{state:row.hint_at?'DISPATCH_RECORDED':'NOT_RECORDED',recordedAt:row.hint_at?iso(row.hint_at):null},deviceDelivery:'NOT_RECORDED',
    readAcknowledgement:{state:row.acknowledged_at?'ACKNOWLEDGED':'NOT_RECORDED',recordedAt:row.acknowledged_at?iso(row.acknowledged_at):null}}));
   return notificationEvidencePageSchema.parse({accountId:actor,items,nextBeforeId:hasMore?items.at(-1)?.notificationId:null});
  });
 }
 private receipt(row:z.infer<typeof receiptRowSchema>){return notificationPreferenceReceiptSchema.parse({accountId:row.user_id,requestId:row.request_id,previousVersion:row.previous_version,version:row.version,inAppAlerts:row.in_app_alerts,recordedAt:iso(row.created_at)});}
 private parse<T>(schema:z.ZodType<T>,input:unknown):T{const parsed=schema.safeParse(input);if(!parsed.success)throw new ConversationNotificationError('INPUT_INVALID');return parsed.data;}
 private async transaction<T>(raw:PrincipalContext,write:boolean,work:(client:pg.PoolClient,actor:number)=>Promise<T>):Promise<T>{
  const principal=this.parse(principalContextSchema,raw);
  if(principal.actorKind!=='ACCOUNT')throw new ConversationNotificationError('PERMISSION_DENIED');
  const client=await this.pool.connect().catch(()=>{throw new ConversationNotificationError('STORE_UNAVAILABLE');});
  let committing=false,discard=false;
  try{
   await client.query(write?'BEGIN':'BEGIN READ ONLY');await client.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='10s'");
   if(!(await verifyNotificationPreferenceCatalog(client)).ready)throw new ConversationNotificationError('NOT_READY');
   await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.correlation_id',$2,true),set_config('app.bypass_rls','false',true),set_config('app.marketing_admin','false',true),set_config('app.notification_request_id','',true),set_config('app.notification_expected_version','',true)",[String(principal.accountId),principal.correlationId]);
   const value=await work(client,principal.accountId);committing=true;await client.query('COMMIT');return value;
  }catch(error){
   try{await client.query('ROLLBACK');}catch{discard=true;}
   if(committing&&write){discard=true;throw new ConversationNotificationError('OUTCOME_UNKNOWN');}
   if(error instanceof ConversationNotificationError)throw error;
   if(error instanceof Error&&error.message==='NOTIFICATION_PREFERENCE_VERSION_CONFLICT')throw new ConversationNotificationError('VERSION_CONFLICT');
   throw new ConversationNotificationError('STORE_UNAVAILABLE');
  }finally{client.release(discard);}
 }
}
