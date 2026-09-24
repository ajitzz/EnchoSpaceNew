import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {inTransaction} from './database.js';
import {fingerprint,MarketingError,type Actor} from './domain.js';
import type {MarketingTouchpoints} from './portfolio/touchpoints.js';
import {currentExecutionContext} from '../observability/executionContext.js';
import {PlatformDomainError} from '../../shared/platform/apiError.js';

const id=z.coerce.number().int().positive().safe();
const forbidden=()=>new MarketingError('THREAD_NOT_FOUND','This conversation was not found.',404);
const touchpointSchema=z.object({listing_id:id,host_id:id,campaign_id:id,revision:id,event_id:z.string().uuid(),current_consent_id:z.string().uuid()});
/** Once the callback completes, transport failure may hide a committed write.
 * Retain the message UUID for reconciliation instead of claiming failure. */
async function commitMessage<T>(run:(write:(c:pg.PoolClient,visit?:unknown)=>Promise<T>)=>Promise<T>,write:(c:pg.PoolClient,visit?:unknown)=>Promise<T>):Promise<T>{
  let workCompleted=false;
  try{return await run(async(c,visit)=>{const value=await write(c,visit);workCompleted=true;return value;});}
  catch(error){if(workCompleted)throw new PlatformDomainError('OPERATION_OUTCOME_UNKNOWN');throw error;}
}
export class InquiryInbox {
  constructor(private pool:pg.Pool,private mask:(text:string)=>{sanitized:string;wasSanitized:boolean},private touchpoints?:MarketingTouchpoints,private options:{deliveryRequired?:boolean}={}){}
  private async thread(c:pg.PoolClient,actor:Actor,threadId:number,lock=true){
    const row=(await c.query(`SELECT * FROM threads WHERE id=$1 AND (guest_id=$2 OR host_id=$2)${lock?' FOR UPDATE':''}`,[id.parse(threadId),actor.id])).rows[0];
    if(!row)throw forbidden();return row;
  }
  async create(actor:Actor,input:unknown){
    const body=z.object({listingId:id.nullish(),experienceId:id.nullish(),hostId:id.nullish()}).strict().refine(v=>!!v.listingId!==!!v.experienceId,'Choose one property or experience').parse(input);
    return inTransaction(this.pool,actor,async c=>{
      const target=body.listingId?
        (await c.query("SELECT user_id AS host_id FROM listings WHERE id=$1 AND publication_status='published'",[body.listingId])).rows[0]:
        (await c.query("SELECT host_id FROM experiences WHERE id=$1 AND status='published'",[body.experienceId])).rows[0];
      if(!target?.host_id||target.host_id===actor.id||body.hostId&&body.hostId!==target.host_id)throw forbidden();
      const field=body.listingId?'listing_id':'experience_id',targetId=body.listingId??body.experienceId;
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`inbox:${field}:${targetId}:${actor.id}`]);
      const old=(await c.query(`SELECT * FROM threads WHERE ${field}=$1 AND guest_id=$2 AND host_id=$3 ORDER BY id LIMIT 1`,[targetId,actor.id,target.host_id])).rows[0];
      return old??(await c.query(`INSERT INTO threads(${field},guest_id,host_id) VALUES($1,$2,$3) RETURNING *`,[targetId,actor.id,target.host_id])).rows[0];
    });
  }
  async messages(actor:Actor,threadId:number,before?:unknown){
    const cursor=before===undefined?null:id.parse(before);
    return inTransaction(this.pool,actor,async c=>{
      await this.thread(c,actor,threadId,false);
      const sequence=this.options.deliveryRequired?',m.conversation_sequence':'';
      const result=await c.query(`SELECT m.id,m.thread_id,m.sender_id,m.receiver_id,m.content,coalesce(m.is_read,false) AS is_read,m.is_sanitized,m.created_at,m.client_event_id${sequence},u.name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.thread_id=$1 AND ($2::int IS NULL OR m.id<$2) ORDER BY m.id DESC LIMIT 200`,[threadId,cursor]);
      return result.rows.reverse();
    });
  }
  /** Preserve old booking history read-only until an audited context bridge can
   * identify it. Neither a booking ID nor the legacy admin role grants access. */
  async bookingHistory(actor:Actor,bookingId:number,before?:unknown){
    const cursor=before===undefined?null:id.parse(before);
    return inTransaction(this.pool,actor,async c=>{
      const booking=(await c.query('SELECT b.user_id AS guest_id,l.user_id AS host_id FROM bookings b JOIN listings l ON l.id=b.listing_id WHERE b.id=$1',[id.parse(bookingId)])).rows[0];
      if(!booking||![booking.guest_id,booking.host_id].includes(actor.id))throw forbidden();
      const rows=(await c.query(`SELECT m.id,m.booking_id,m.thread_id,m.sender_id,m.receiver_id,m.content,coalesce(m.is_read,false) AS is_read,m.created_at,u.name AS sender_name
        FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.booking_id=$1
        AND (m.sender_id=$2 OR m.receiver_id=$2) AND ($3::int IS NULL OR m.id<$3)
        ORDER BY m.id DESC LIMIT 200`,[bookingId,actor.id,cursor])).rows;
      return rows.reverse();
    });
  }
  async list(actor:Actor,input:unknown={}){
    const query=z.object({role:z.enum(['guest','host']).optional(),before:z.string().regex(/^[A-Za-z0-9_-]+$/).max(300).optional()}).strict().parse(input);
    const cursorSchema=z.object({id,updatedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/)}).strict();
    let cursor:z.infer<typeof cursorSchema>|null=null;
    if(query.before){
      try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(query.before,'base64url').toString('utf8')));}
      catch{throw new PlatformDomainError('INVALID_REQUEST');}
    }
    return inTransaction(this.pool,actor,async c=>{
      const result=await c.query(`SELECT t.id,t.listing_id,t.experience_id,t.guest_id,t.host_id,t.last_message,coalesce(t.updated_at,'epoch'::timestamp) AS updated_at,
        to_char(coalesce(t.updated_at,'epoch'::timestamp),'YYYY-MM-DD"T"HH24:MI:SS.US') AS cursor_timestamp,
        (SELECT count(*)::integer FROM messages m WHERE m.thread_id=t.id AND m.receiver_id=t.guest_id AND NOT coalesce(m.is_read,false)) AS unread_count_guest,
        (SELECT count(*)::integer FROM messages m WHERE m.thread_id=t.id AND m.receiver_id=t.host_id AND NOT coalesce(m.is_read,false)) AS unread_count_host,COALESCE(l.title,e.title) AS listing_title,
        COALESCE(l.image_url,e.image_urls->>0) AS listing_image,ug.name AS guest_name,uh.name AS host_name
        FROM threads t LEFT JOIN listings l ON l.id=t.listing_id LEFT JOIN experiences e ON e.id=t.experience_id
        LEFT JOIN users ug ON ug.id=t.guest_id LEFT JOIN users uh ON uh.id=t.host_id
        WHERE (t.guest_id=$1 OR t.host_id=$1)
          AND ($2::text IS NULL OR ($2='guest' AND t.guest_id=$1) OR ($2='host' AND t.host_id=$1))
          AND ($3::timestamp IS NULL OR (coalesce(t.updated_at,'epoch'::timestamp),t.id)<($3::timestamp,$4::int))
        ORDER BY coalesce(t.updated_at,'epoch'::timestamp) DESC,t.id DESC LIMIT 100`,[actor.id,query.role??null,cursor?.updatedAt??null,cursor?.id??null]);
      return result.rows.map(({cursor_timestamp,...row})=>({...row,list_cursor:Buffer.from(JSON.stringify({id:row.id,updatedAt:cursor_timestamp})).toString('base64url')}));
    });
  }
  async unread(actor:Actor,input:unknown={}){
    const query=z.object({role:z.enum(['guest','host']).optional()}).strict().parse(input);
    return inTransaction(this.pool,actor,async c=>{
      const result=await c.query(`SELECT count(*)::text AS unread FROM messages m JOIN threads t ON t.id=m.thread_id
        WHERE m.receiver_id=$1 AND NOT coalesce(m.is_read,false) AND (t.guest_id=$1 OR t.host_id=$1)
        AND ($2::text IS NULL OR ($2='guest' AND t.guest_id=$1) OR ($2='host' AND t.host_id=$1))`,[actor.id,query.role??null]);
      return {unread:z.coerce.number().int().nonnegative().safe().parse(result.rows[0].unread)};
    });
  }
  /** Reading history is not evidence that a person viewed it. Only an explicit
   * participant command advances acknowledgement; an older replay is harmless. */
  async acknowledgeRead(actor:Actor,threadId:number,input:unknown){
    const body=z.object({throughMessageId:id}).strict().parse(input);
    return inTransaction(this.pool,actor,async c=>{
      await this.thread(c,actor,threadId);
      const cursor=await c.query('SELECT id FROM messages WHERE id=$1 AND thread_id=$2',[body.throughMessageId,threadId]);
      if(cursor.rowCount!==1)throw forbidden();
      if(this.options.deliveryRequired){
        const receipt=(await c.query('SELECT * FROM conversation_acknowledge_read($1,$2)',[threadId,body.throughMessageId])).rows[0];
        return {threadId,throughMessageId:body.throughMessageId,unread:z.coerce.number().int().nonnegative().safe().parse(receipt.unread),lastReadSequence:String(receipt.last_read_sequence)};
      }
      await c.query('UPDATE messages SET is_read=true WHERE thread_id=$1 AND receiver_id=$2 AND id<=$3 AND NOT is_read',[threadId,actor.id,body.throughMessageId]);
      const unread=Number((await c.query('SELECT count(*)::text AS unread FROM messages WHERE thread_id=$1 AND receiver_id=$2 AND NOT is_read',[threadId,actor.id])).rows[0].unread);
      await c.query(`UPDATE threads SET unread_count_guest=CASE WHEN guest_id=$2 THEN $3 ELSE unread_count_guest END,
        unread_count_host=CASE WHEN host_id=$2 THEN $3 ELSE unread_count_host END WHERE id=$1`,[threadId,actor.id,unread]);
      return {threadId,throughMessageId:body.throughMessageId,unread};
    });
  }
  async send(actor:Actor,threadId:number,input:unknown,visitor?:string){
    const body=z.object({content:z.string().trim().min(1).max(10000),receiverId:id.nullish(),clientEventId:z.string().uuid().optional(),measurementVisitId:z.string().uuid().optional()}).strict().parse(input);
    if(this.options.deliveryRequired)z.string().uuid().parse(body.clientEventId);
    const write=async(c:pg.PoolClient,rawVisit?:unknown)=>{
      const visit=rawVisit===undefined?undefined:touchpointSchema.parse(rawVisit);
      // A consent service transaction may use its own operator identity. The
      // message still belongs to its authenticated participant, never that operator.
      const trace=currentExecutionContext();
      await c.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.correlation_id',$2,true),set_config('app.operation_id',$3,true)",
        [String(actor.id),trace?.correlationId??'',trace?.operationId??'']);
      const thread=await this.thread(c,actor,threadId),recipient=actor.id===thread.guest_id?thread.host_id:thread.guest_id;
      if(!recipient||body.receiverId&&body.receiverId!==recipient)throw forbidden();
      const requestHash=fingerprint({threadId,recipient,content:body.content});
      if(body.clientEventId){
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`inquiry:${actor.id}:${body.clientEventId}`]);
        const old=(await c.query('SELECT * FROM messages WHERE sender_id=$1 AND client_event_id=$2',[actor.id,body.clientEventId])).rows[0];
        if(old){if(old.client_request_hash!==requestHash)throw new MarketingError('IDEMPOTENCY_CONFLICT','This message identity already records another message.');const {client_request_hash:_hash,...publicMessage}=old;return {message:publicMessage,thread,duplicate:true};}
      }
      const {sanitized,wasSanitized}=this.mask(body.content);
      const message=(await c.query('INSERT INTO messages(thread_id,sender_id,receiver_id,content,is_sanitized,client_event_id,client_request_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[threadId,actor.id,recipient,sanitized,wasSanitized,body.clientEventId??null,body.clientEventId?requestHash:null])).rows[0];
      await c.query('UPDATE threads SET last_message=$2,updated_at=now(),unread_count_guest=coalesce(unread_count_guest,0)+CASE WHEN guest_id=$3 THEN 1 ELSE 0 END,unread_count_host=coalesce(unread_count_host,0)+CASE WHEN host_id=$3 THEN 1 ELSE 0 END WHERE id=$1',[threadId,sanitized,recipient]);
      // Attribution shares the message commit and the consent lock: no lost post-commit task.
      if(visit&&actor.id===thread.guest_id&&thread.listing_id===visit.listing_id&&thread.host_id===visit.host_id){
        const owner=(await c.query('SELECT user_id FROM listings WHERE id=$1',[thread.listing_id])).rows[0];
        if(owner?.user_id===thread.host_id)await c.query('INSERT INTO marketing_inquiry_attributions(id,thread_id,message_id,campaign_id,revision,host_id,listing_id,visit_id,consent_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(thread_id,campaign_id) DO NOTHING',[randomUUID(),thread.id,message.id,visit.campaign_id,visit.revision,thread.host_id,thread.listing_id,visit.event_id,visit.current_consent_id]);
      }
      const {client_request_hash:_hash,...publicMessage}=message;return {message:publicMessage,thread,duplicate:false};
    };
    if(visitor&&body.measurementVisitId&&this.touchpoints){
      try{return await commitMessage(work=>this.touchpoints!.withCurrent(visitor,body.measurementVisitId!,work),write);}
      catch(error){
        // A declined/expired optional measurement choice must not block a legitimate inquiry.
        // Database/transaction failures are retried by the client using its stable message UUID.
        if(!(error instanceof MarketingError)||!['CONVERSION_CONSENT_REQUIRED','ATTRIBUTION_INVALID'].includes(error.code))throw error;
      }
    }
    return commitMessage(work=>inTransaction(this.pool,actor,c=>work(c)),write);
  }
}
