import type pg from 'pg';
import type {Actor} from './domain.js';
import {MarketingError} from './domain.js';
export async function inTransaction<T>(pool:pg.Pool,actor:Actor,work:(client:pg.PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();let broken:Error|undefined;try{await c.query('BEGIN');await c.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.marketing_admin',$2,true),set_config('app.bypass_rls',$2,true),set_config('statement_timeout','8000',true),set_config('lock_timeout','3000',true)",[String(actor.id),String(actor.role==='admin'||actor.role==='system')]);const value=await work(c);await c.query('COMMIT');return value;}catch(e){try{await c.query('ROLLBACK');}catch(rollbackError){broken=rollbackError as Error;}throw e;}finally{c.release(broken);}
}
export async function lockWorkflow(c:pg.PoolClient,id:number,actor:Actor){
 // Use the same parent lock order as provider/finance operations.
 await c.query('SELECT id FROM host_marketing_campaigns WHERE id=$1 FOR UPDATE',[id]);
 const r=await c.query('SELECT * FROM marketing_campaign_workflows WHERE campaign_id=$1 AND ($2 OR host_id=$3) FOR UPDATE',[id,actor.role==='admin'||actor.role==='system',actor.id]);
 if(!r.rows[0])throw new MarketingError('CAMPAIGN_NOT_FOUND','Campaign not found',404);return r.rows[0];
}
export async function event(c:pg.PoolClient,row:{campaign_id:number;host_id:number;revision:number},actor:Actor,type:string,evidence:unknown){await c.query('INSERT INTO marketing_workflow_events(campaign_id,host_id,revision,actor_id,actor_role,event_type,evidence) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.campaign_id,row.host_id,row.revision,String(actor.id),actor.role,type,JSON.stringify(evidence)]);}
/** Scoped adapter for provider modules owning their own BEGIN/COMMIT. Context never leaks to a pooled session. */
export function actorPool(pool:pg.Pool,actor:Actor):pg.Pool{
 return new Proxy(pool,{get(target,key){
  if(key==='query')return (sql:string,values?:unknown[])=>inTransaction(target,actor,c=>c.query(sql,values));
  if(key==='connect')return async()=>{const client=await target.connect();return new Proxy(client,{get(c,k){if(k==='query')return async(sql:string,...args:any[])=>{const value=await (c.query as any)(sql,...args);if(/^\s*BEGIN\b/i.test(sql))await c.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.marketing_admin',$2,true),set_config('app.bypass_rls',$2,true)",[String(actor.id),String(actor.role==='admin'||actor.role==='system')]);return value;};const value=Reflect.get(c,k,c);return typeof value==='function'?value.bind(c):value;}});};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }}) as pg.Pool;
}
