import type pg from 'pg';
import {z} from 'zod';
import {DurableOutbox,DurableOutboxError,durableRequestFingerprint,type ClaimedOutboxItem} from '../../lib/platform/durableOutbox.js';
import {conversationNotificationPayloadSchema,conversationNotificationTables,type ConversationNotificationPayload} from '../../shared/conversation/delivery.js';
import {verifyConversationCatalog} from '../deployment/conversationReadiness.js';

const dispatchReceiptSchema=z.object({outcome:z.literal('SOCKET_HINT_DISPATCHED')}).strict();
const workerOptionsSchema=z.object({
 workerId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/),
 batchSize:z.number().int().min(1).max(100).default(20),
 leaseSeconds:z.number().int().min(10).max(300).default(30),
 dispatchTimeoutMs:z.number().int().min(10).max(5000).default(2000),
}).strict();
const recipientRowSchema=z.object({recipient_id:z.number().int().positive().safe(),payload:conversationNotificationPayloadSchema});

export interface ConversationHintDispatchPort {
 /** Resolve only after accepting this socket hint. Respect abort and never emit
  * after abort; recipient presence/delivery must not be inferred from this result. */
 dispatch(input:{recipientId:number;payload:ConversationNotificationPayload},signal:AbortSignal):Promise<z.infer<typeof dispatchReceiptSchema>>;
}
export class ConversationNotificationWorkerError extends Error {
 constructor(public readonly code:string){super(code);this.name='ConversationNotificationWorkerError';}
}
export interface ConversationNotificationRun {
 claimed:number;
 completed:number;
 retried:number;
 dead:number;
 claimLost:number;
}

/** No user/content pool, environment loading, timer loop or remote channel adapter.
 * LOCAL_EFFECT completion proves only that the injected socket port accepted a hint. */
export class ConversationNotificationWorker {
 private readonly options:z.infer<typeof workerOptionsSchema>;
 private readonly outbox:DurableOutbox<ConversationNotificationPayload>;
 private running=false;
 constructor(private readonly pool:pg.Pool,private readonly port:ConversationHintDispatchPort,options:z.input<typeof workerOptionsSchema>){
  this.options=workerOptionsSchema.parse(options);
  this.outbox=new DurableOutbox(pool,{tables:conversationNotificationTables,payloadSchema:conversationNotificationPayloadSchema});
 }
 async runOnce():Promise<ConversationNotificationRun>{
  if(this.running)throw new ConversationNotificationWorkerError('NOTIFICATION_WORKER_BUSY');
  this.running=true;
  try{
   const c=await this.pool.connect();
   try{if(!(await verifyConversationCatalog(c,'worker')).ready)throw new ConversationNotificationWorkerError('NOTIFICATION_WORKER_NOT_READY');}
   finally{c.release();}
   const claims=await this.outbox.claimBatch({workerId:this.options.workerId,limit:this.options.batchSize,leaseSeconds:this.options.leaseSeconds,topics:['CRM.MESSAGE.NOTIFY']});
   const result:ConversationNotificationRun={claimed:claims.length,completed:0,retried:0,dead:0,claimLost:0};
   for(const claim of claims)await this.process(claim,result);
   return result;
  }catch(error){if(error instanceof ConversationNotificationWorkerError)throw error;throw new ConversationNotificationWorkerError('NOTIFICATION_QUEUE_UNAVAILABLE');}
  finally{this.running=false;}
 }
 private async process(claim:ClaimedOutboxItem<ConversationNotificationPayload>,result:ConversationNotificationRun){
  try{await this.outbox.heartbeat(claim,this.options.workerId,this.options.leaseSeconds);}
  catch(error){if(this.isLost(error)){result.claimLost++;return;}throw new ConversationNotificationWorkerError('NOTIFICATION_QUEUE_UNAVAILABLE');}
  const stored=(await this.pool.query(`SELECT recipient_id,payload FROM notification_intents
   WHERE id=$1 AND fence=$2::bigint AND state='RUNNING' AND claimed_by=$3 AND lease_until>clock_timestamp()`,[claim.id,claim.fence,this.options.workerId])).rows[0];
  if(!stored){result.claimLost++;return;}
  const parsed=recipientRowSchema.safeParse(stored);
  const expectedFingerprint=durableRequestFingerprint({topic:claim.topic,partitionKey:claim.partitionKey,payload:claim.payload,executionClass:claim.executionClass,principalId:claim.principalId,organizationId:claim.organizationId});
  if(!parsed.success||claim.payload.notificationId!==claim.id||claim.requestFingerprint!==expectedFingerprint||claim.executionClass!=='LOCAL_EFFECT'
   ||JSON.stringify(parsed.data.payload)!==JSON.stringify(claim.payload)){
   await this.fail(claim,'PERMANENT','NOTIFICATION_INTENT_INVALID',result);return;
  }
  try{await this.dispatch(parsed.data);}
  catch(error){
   const protocol=error instanceof ConversationNotificationWorkerError&&error.code==='NOTIFICATION_DISPATCH_PROTOCOL_INVALID';
   await this.fail(claim,protocol?'PERMANENT':'TRANSIENT',protocol?'NOTIFICATION_DISPATCH_PROTOCOL_INVALID':'NOTIFICATION_HINT_TEMPORARILY_UNAVAILABLE',result);return;
  }
  try{await this.outbox.succeed(claim,this.options.workerId,{outcome:'SOCKET_HINT_DISPATCHED'});result.completed++;}
  catch(error){
   if(this.isLost(error)){result.claimLost++;return;}
   // A lost COMMIT reply may hide successful finalization. Do not overwrite it
   // with RETRY or report completion. Lease recovery handles a genuine rollback.
   throw new ConversationNotificationWorkerError('NOTIFICATION_FINALIZATION_UNAVAILABLE');
  }
 }
 private async dispatch(input:{recipient_id:number;payload:ConversationNotificationPayload}){
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ConversationNotificationWorkerError('NOTIFICATION_DISPATCH_TIMEOUT'));},this.options.dispatchTimeoutMs);});
   const receipt=await Promise.race([Promise.resolve().then(()=>this.port.dispatch({recipientId:input.recipient_id,payload:input.payload},controller.signal)),deadline]);
   if(!dispatchReceiptSchema.safeParse(receipt).success)throw new ConversationNotificationWorkerError('NOTIFICATION_DISPATCH_PROTOCOL_INVALID');
  }finally{if(timer)clearTimeout(timer);controller.abort();}
 }
 private async fail(claim:ClaimedOutboxItem<ConversationNotificationPayload>,classification:'TRANSIENT'|'PERMANENT',errorCode:string,result:ConversationNotificationRun){
  try{const state=await this.outbox.fail({...claim,classification,errorCode},this.options.workerId);if(state==='RETRY')result.retried++;else if(state==='DEAD')result.dead++;}
  catch(error){if(this.isLost(error)){result.claimLost++;return;}throw new ConversationNotificationWorkerError('NOTIFICATION_FINALIZATION_UNAVAILABLE');}
 }
 private isLost(error:unknown){return error instanceof DurableOutboxError&&error.code==='OUTBOX_CLAIM_LOST';}
}
