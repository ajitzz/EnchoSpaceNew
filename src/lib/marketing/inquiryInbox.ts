import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {inTransaction} from './database.js';
import {fingerprint,MarketingError,type Actor} from './domain.js';
import type {MarketingTouchpoints} from './portfolio/touchpoints.js';

const id=z.coerce.number().int().positive().safe();
const forbidden=()=>new MarketingError('THREAD_NOT_FOUND','This conversation was not found.',404);
export class InquiryInbox {
  constructor(private pool:pg.Pool,private mask:(text:string)=>{sanitized:string;wasSanitized:boolean},private touchpoints?:MarketingTouchpoints){}
  private async thread(c:pg.PoolClient,actor:Actor,threadId:number){
    const row=(await c.query('SELECT * FROM threads WHERE id=$1 AND (guest_id=$2 OR host_id=$2) FOR UPDATE',[id.parse(threadId),actor.id])).rows[0];
    if(!row)throw forbidden();return row;
  }
  async create(actor:Actor,input:unknown){
    const body=z.object({listingId:id.nullish(),experienceId:id.nullish(),hostId:id.nullish()}).strict().refine(v=>!!v.listingId!==!!v.experienceId,'Choose one property or experience').parse(input);
    return inTransaction(this.pool,actor,async c=>{
      const target=body.listingId?
        (await c.query("SELECT user_id AS host_id FROM listings WHERE id=$1 AND publication_status='published'",[body.listingId])).rows[0]:
        (await c.query('SELECT host_id FROM experiences WHERE id=$1',[body.experienceId])).rows[0];
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
      await this.thread(c,actor,threadId);
      const result=await c.query('SELECT m.id,m.thread_id,m.sender_id,m.receiver_id,m.content,m.is_read,m.is_sanitized,m.created_at,u.name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.thread_id=$1 AND ($2::int IS NULL OR m.id<$2) ORDER BY m.id DESC LIMIT 200',[threadId,cursor]);
      const readIds=result.rows.filter(m=>m.receiver_id===actor.id).map(m=>m.id);
      await c.query('UPDATE messages SET is_read=true WHERE id=ANY($1::int[]) AND receiver_id=$2',[readIds,actor.id]);
      await c.query(`UPDATE threads SET unread_count_guest=CASE WHEN guest_id=$2 THEN (SELECT count(*) FROM messages WHERE thread_id=$1 AND receiver_id=$2 AND NOT is_read) ELSE unread_count_guest END,unread_count_host=CASE WHEN host_id=$2 THEN (SELECT count(*) FROM messages WHERE thread_id=$1 AND receiver_id=$2 AND NOT is_read) ELSE unread_count_host END WHERE id=$1`,[threadId,actor.id]);
      return result.rows.reverse();
    });
  }
  async send(actor:Actor,threadId:number,input:unknown,visitor?:string){
    const body=z.object({content:z.string().trim().min(1).max(10000),receiverId:id.nullish(),clientEventId:z.string().uuid().optional(),measurementVisitId:z.string().uuid().optional()}).strict().parse(input);
    const write=async(c:pg.PoolClient,visit?:any)=>{
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
      await c.query('UPDATE threads SET last_message=$2,updated_at=now(),unread_count_guest=unread_count_guest+CASE WHEN guest_id=$3 THEN 1 ELSE 0 END,unread_count_host=unread_count_host+CASE WHEN host_id=$3 THEN 1 ELSE 0 END WHERE id=$1',[threadId,sanitized,recipient]);
      // Attribution shares the message commit and the consent lock: no lost post-commit task.
      if(visit&&actor.id===thread.guest_id&&thread.listing_id===visit.listing_id&&thread.host_id===visit.host_id){
        const owner=(await c.query('SELECT user_id FROM listings WHERE id=$1',[thread.listing_id])).rows[0];
        if(owner?.user_id===thread.host_id)await c.query('INSERT INTO marketing_inquiry_attributions(id,thread_id,message_id,campaign_id,revision,host_id,listing_id,visit_id,consent_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(thread_id,campaign_id) DO NOTHING',[randomUUID(),thread.id,message.id,visit.campaign_id,visit.revision,thread.host_id,thread.listing_id,visit.event_id,visit.current_consent_id]);
      }
      const {client_request_hash:_hash,...publicMessage}=message;return {message:publicMessage,thread,duplicate:false};
    };
    if(visitor&&body.measurementVisitId&&this.touchpoints){
      try{return await this.touchpoints.withCurrent(visitor,body.measurementVisitId,write);}
      catch(error){
        // A declined/expired optional measurement choice must not block a legitimate inquiry.
        // Database/transaction failures are retried by the client using its stable message UUID.
        if(!(error instanceof MarketingError)||!['CONVERSION_CONSENT_REQUIRED','ATTRIBUTION_INVALID'].includes(error.code))throw error;
      }
    }
    return inTransaction(this.pool,actor,c=>write(c));
  }
}
