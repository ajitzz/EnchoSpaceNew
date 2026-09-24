import type pg from 'pg';
import {verifyConversationCatalog} from '../deployment/conversationReadiness.js';

/** Local catalog evidence is cached briefly and coalesced. A schema or role
 * mismatch disables this surface; it never silently selects a legacy writer. */
export function conversationReadiness(pool:pg.Pool,onFailure:()=>void){
  let validUntil=0;
  let pending:Promise<boolean>|null=null;
  return async():Promise<boolean>=>{
    if(Date.now()<validUntil)return true;
    if(pending)return pending;
    pending=(async()=>{
      const client=await pool.connect();
      try{
        const result=await verifyConversationCatalog(client);
        if(result.ready)validUntil=Date.now()+30_000;
        else onFailure();
        return result.ready;
      }finally{client.release();}
    })().catch(()=>{onFailure();return false;});
    try{return await pending;}finally{pending=null;}
  };
}
