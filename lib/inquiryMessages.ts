import {z} from 'zod';

const id=z.number().int().positive().safe();
export const canonicalInquiryMessageSchema=z.object({
  id,thread_id:id,sender_id:id,receiver_id:id,content:z.string(),is_read:z.boolean(),
  created_at:z.string().datetime({offset:true}),sender_name:z.string().nullable().optional(),
  client_event_id:z.string().uuid().nullable().optional(),
  conversation_sequence:z.string().regex(/^[1-9]\d*$/).nullable().optional(),
});
export type CanonicalInquiryMessage=z.infer<typeof canonicalInquiryMessageSchema>;
export type InboxMessage=Omit<CanonicalInquiryMessage,'id'>&{id:number;sync_state?:'PENDING'|'QUEUED'|'FAILED'};

/** Keep one DOM identity while a queued local message receives its server ID.
 * Sender scope mirrors UNIQUE(sender_id, client_event_id) in the database. */
export function inquiryMessageRenderKey(message:InboxMessage):string{
  return message.client_event_id
    ? `${message.thread_id}:event:${message.sender_id}:${message.client_event_id}`
    : `${message.thread_id}:message:${message.id}`;
}

export function parseInquiryHistory(value:unknown,threadId:number):CanonicalInquiryMessage[]{
  const messages=z.array(canonicalInquiryMessageSchema).max(200).parse(value);
  if(messages.some(message=>message.thread_id!==threadId))throw new Error('Conversation history did not match this thread.');
  return messages;
}

/** HTTP replay, socket hints and reconnect fetches may overlap. Canonical IDs
 * win over optimistic UUIDs, while unrelated threads can never be merged. */
export function mergeInquiryMessages(previous:readonly InboxMessage[],incoming:readonly CanonicalInquiryMessage[],threadId:number):InboxMessage[]{
  if(incoming.some(message=>message.thread_id!==threadId))throw new Error('Message belongs to another conversation.');
  const byId=new Map<number,InboxMessage>();
  const byEvent=new Map<string,number>();
  for(const message of [...previous.filter(message=>message.thread_id===threadId),...incoming]){
    if(message.client_event_id){
      const eventKey=`${message.sender_id}:${message.client_event_id}`;
      const old=byEvent.get(eventKey);
      // A late local-state update cannot replace a committed canonical row.
      if(old!==undefined&&old>0&&message.id<0)continue;
      if(old!==undefined&&old!==message.id)byId.delete(old);
      byEvent.set(eventKey,message.id);
    }
    const old=byId.get(message.id);
    byId.set(message.id,{...message,is_read:message.is_read||!!old?.is_read});
  }
  return [...byId.values()].sort((a,b)=>{
    if(a.id<0||b.id<0)return a.id<0?(b.id<0?Date.parse(a.created_at)-Date.parse(b.created_at):1):-1;
    if(a.conversation_sequence&&b.conversation_sequence){
      const left=BigInt(a.conversation_sequence),right=BigInt(b.conversation_sequence);
      return left<right?-1:left>right?1:0;
    }
    return a.id-b.id;
  });
}


export const inquiryThreadSchema=z.object({
  id,listing_id:id.nullable(),experience_id:id.nullable().optional(),guest_id:id,host_id:id,
  last_message:z.string().nullable(),unread_count_guest:z.number().int().nonnegative().safe(),unread_count_host:z.number().int().nonnegative().safe(),
  updated_at:z.string().datetime({offset:true}),listing_title:z.string().nullable(),listing_image:z.string().nullable(),
  guest_name:z.string().nullable(),host_name:z.string().nullable(),list_cursor:z.string().regex(/^[A-Za-z0-9_-]+$/).max(300),
});
export type InquiryThread=z.infer<typeof inquiryThreadSchema>;
export function parseInquiryThreads(value:unknown,actorId:number,role?:'guest'|'host'):InquiryThread[]{
  const rows=z.array(inquiryThreadSchema).max(100).parse(value);
  if(rows.some(row=>role==='guest'?row.guest_id!==actorId:role==='host'?row.host_id!==actorId:row.guest_id!==actorId&&row.host_id!==actorId))throw new Error('Conversation participant mismatch.');
  return rows;
}
export function mergeInquiryThreads(previous:readonly InquiryThread[],incoming:readonly InquiryThread[]):InquiryThread[]{
  const rows=new Map(previous.map(row=>[row.id,row]));
  incoming.forEach(row=>rows.set(row.id,row));
  return [...rows.values()].sort((left,right)=>Date.parse(right.updated_at)-Date.parse(left.updated_at)||right.id-left.id);
}
