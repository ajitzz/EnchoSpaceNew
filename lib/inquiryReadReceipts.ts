import {z} from 'zod';

const receiptSchema = z.object({threadId:z.number().int().positive(),throughMessageId:z.number().int().positive(),unread:z.number().int().nonnegative().safe(),lastReadSequence:z.string().regex(/^[1-9][0-9]*$/).optional()}).strict();
export type InquiryReadReceipt = z.infer<typeof receiptSchema>;

/** An explicit visible-history acknowledgement; never queued as offline success. */
export async function acknowledgeInquiryRead(input: {
  threadId:number; throughMessageId:number; token:string; signal:AbortSignal;
  current:()=>boolean; fetcher?:typeof fetch;
}):Promise<InquiryReadReceipt|null>{
  const ids=receiptSchema.pick({threadId:true,throughMessageId:true}).parse({threadId:input.threadId,throughMessageId:input.throughMessageId});
  if(!input.current()||input.signal.aborted)return null;
  const response=await (input.fetcher??fetch)(`/api/threads/${ids.threadId}/read`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${input.token}`},
    body:JSON.stringify({throughMessageId:ids.throughMessageId}),signal:input.signal,cache:'no-store',
  });
  if(!response.ok)throw new Error('Read status could not be synchronized.');
  const receipt=receiptSchema.parse(await response.json());
  if(receipt.threadId!==ids.threadId||receipt.throughMessageId!==ids.throughMessageId)throw new Error('Read acknowledgement did not match this conversation.');
  return input.current()&&!input.signal.aborted?receipt:null;
}
