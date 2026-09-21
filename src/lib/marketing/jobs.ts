import type pg from 'pg';
import {randomUUID} from 'node:crypto';
import {fingerprint,MarketingError} from './domain.js';
export type JobKind='PUBLISH'|'ACTIVATE'|'PAUSE'|'TELEMETRY'|'PAYMENT'|'REFUND'|'META_EVENT'|'PROTECTION';
export interface MarketingJob{id:string;campaign_id:number|null;revision:number|null;kind:JobKind;dedupe_key:string;payload:Record<string,unknown>;fence:string;attempts:number;}
export async function enqueue(c:pg.PoolClient|pg.Pool,input:{campaignId?:number;revision?:number;kind:JobKind;key:string;payload?:Record<string,unknown>;runAfter?:string}){
 const payload=input.payload||{};
 const r=await c.query(`INSERT INTO marketing_jobs(id,campaign_id,revision,kind,dedupe_key,payload,run_after) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now())) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`,[randomUUID(),input.campaignId??null,input.revision??null,input.kind,input.key,JSON.stringify(payload),input.runAfter??null]);
 if(r.rows.length)return r.rows[0].id as string;
 const old=(await c.query('SELECT * FROM marketing_jobs WHERE dedupe_key=$1',[input.key])).rows[0];
 if(!old||old.kind!==input.kind||old.campaign_id!==(input.campaignId??null)||old.revision!==(input.revision??null)||fingerprint(old.payload)!==fingerprint(payload))throw new MarketingError('IDEMPOTENCY_CONFLICT','This operation key already identifies a different request');
 return old.id as string;
}
/** Database fencing protects local completion. Irreversible sends are never reclaimed automatically. */
export class MarketingJobQueue{
 constructor(private pool:pg.Pool){}
 async claim():Promise<MarketingJob|null>{
  await this.pool.query(`UPDATE marketing_jobs SET state=CASE WHEN kind IN ('PUBLISH','ACTIVATE','PAUSE') THEN 'RECONCILIATION_REQUIRED' ELSE 'RETRY' END, fence=fence+1,last_error='WORKER_LEASE_EXPIRED',lease_until=NULL,run_after=now()+interval '10 seconds',updated_at=now() WHERE state='RUNNING' AND lease_until<now()`);
  const r=await this.pool.query(`WITH picked AS(SELECT id FROM marketing_jobs WHERE state IN ('PENDING','RETRY') AND run_after<=now() ORDER BY run_after,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE marketing_jobs j SET state='RUNNING',fence=fence+1,attempts=attempts+1,lease_until=now()+interval '120 seconds',updated_at=now() FROM picked WHERE j.id=picked.id RETURNING j.*`);
  return r.rows[0]||null;
 }
 async heartbeat(job:MarketingJob){const r=await this.pool.query(`UPDATE marketing_jobs SET lease_until=now()+interval '120 seconds' WHERE id=$1 AND fence=$2 AND state='RUNNING' AND lease_until>now()`,[job.id,job.fence]);if(!r.rowCount)throw new MarketingError('STALE_WORKER','Worker lease no longer belongs to this attempt');}
 async assertFence(c:pg.PoolClient,job:MarketingJob){const r=await c.query(`SELECT id FROM marketing_jobs WHERE id=$1 AND fence=$2 AND state='RUNNING' AND lease_until>now() FOR UPDATE`,[job.id,job.fence]);if(!r.rowCount)throw new MarketingError('STALE_WORKER','Worker lease no longer belongs to this attempt');}
 async complete(job:MarketingJob){const r=await this.pool.query(`UPDATE marketing_jobs SET state='SUCCEEDED',lease_until=NULL,updated_at=now(),last_error=NULL WHERE id=$1 AND fence=$2 AND state='RUNNING' AND lease_until>now()`,[job.id,job.fence]);if(!r.rowCount)throw new MarketingError('STALE_WORKER','Stale worker cannot complete this job');}
 async fail(job:MarketingJob,code:string,uncertain=false){
  const mutation=job.kind==='PUBLISH'||job.kind==='ACTIVATE'||job.kind==='PAUSE';const state=uncertain||mutation?'RECONCILIATION_REQUIRED':job.attempts>=8?'DEAD':'RETRY';
  const delay=Math.min(3600,2**Math.min(job.attempts,11)*5)+Math.floor(Math.random()*15);
  await this.pool.query(`UPDATE marketing_jobs SET state=$3,last_error=$4,run_after=now()+make_interval(secs=>$5),lease_until=NULL,updated_at=now() WHERE id=$1 AND fence=$2 AND state='RUNNING'`,[job.id,job.fence,state,/^[A-Z_0-9]{1,100}$/.test(code)?code:'JOB_FAILED',delay]);
 }
}
