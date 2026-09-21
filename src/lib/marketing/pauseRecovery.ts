import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {event,inTransaction,lockWorkflow} from './database.js';
import {fingerprint,MarketingError,type Actor} from './domain.js';
import type {SettlementProviderBinding,SettlementStopObservation} from './settlementService.js';

export const pauseRecoverySchema=z.object({revision:z.number().int().positive(),reason:z.string().trim().min(20).max(1000)}).strict();
type Input=z.infer<typeof pauseRecoverySchema>;
type PauseReader=(binding:SettlementProviderBinding)=>Promise<SettlementStopObservation>;

/** Adopt an already committed PAUSE after fresh readback. This class cannot send a provider mutation. */
export class MarketingPauseRecovery {
  constructor(private readonly pool:pg.Pool,private readonly readStopped:PauseReader,private readonly readTimeoutMs=20000){
    if(!Number.isInteger(readTimeoutMs)||readTimeoutMs<1||readTimeoutMs>30000)throw new Error('Recovery read timeout must be between 1 and 30000 ms.');
  }

  private async admin(c:pg.PoolClient,actor:Actor){
    const principal=(await c.query('SELECT role FROM users WHERE id=$1 FOR SHARE',[actor.id])).rows[0];
    if(actor.role!=='admin'||principal?.role!=='admin')throw new MarketingError('ADMIN_REQUIRED','Current administrator access is required.',403);
  }
  private async candidate(c:pg.PoolClient,actor:Actor,campaignId:number,revision:number){
    const row=await lockWorkflow(c,campaignId,actor);
    if(row.revision!==revision)throw new MarketingError('REVISION_CONFLICT','Reload the current campaign revision.');
    if(!['RECONCILIATION_REQUIRED','PAUSE_QUEUED'].includes(row.state)||!row.pending_job_id||!row.provider_truth?.externalCampaignId)throw new MarketingError('PAUSE_RECOVERY_UNAVAILABLE','This campaign has no recoverable recorded pause.');
    const job=(await c.query('SELECT * FROM marketing_jobs WHERE id=$1 FOR UPDATE',[row.pending_job_id])).rows[0];
    if(!job||job.campaign_id!==campaignId||job.revision!==revision||job.kind!=='PAUSE'||!['RECONCILIATION_REQUIRED','DEAD'].includes(job.state)||job.lease_until!==null||(row.last_error!==job.last_error&&!(row.state==='PAUSE_QUEUED'&&job.last_error==='WORKER_LEASE_EXPIRED')))throw new MarketingError('PAUSE_RECOVERY_UNAVAILABLE','The original pause must be terminal and its workflow error must still match.');
    const operations=(await c.query('SELECT * FROM provider_publishing_transactions WHERE campaign_id=$1 AND provider=$2 AND idempotency_key=$3 FOR SHARE',[campaignId,row.provider,job.dedupe_key])).rows;
    const operation=operations.length===1?operations[0]:null;
    if(!operation||operation.operation_type!=='PAUSE'||operation.correlation_id!==job.id||operation.publish_status!=='COMMITTED'||operation.is_unknown_outcome!==false
      ||operation.payload?.protocol!=='HARVO_PROVIDER_OPERATION_V2'||operation.response?.success!==true||operation.response.provider!==row.provider
      ||operation.external_campaign_id!==row.provider_truth.externalCampaignId||operation.response.externalCampaignId!==operation.external_campaign_id
      ||operation.response.newStatus!=='PAUSED'||operation.response.normalizedDeliveryState!=='PAUSED')throw new MarketingError('PAUSE_RECOVERY_UNAVAILABLE','A matching committed provider pause receipt is required. Unknown operations remain quarantined.');
    const unresolved=(await c.query("SELECT id FROM provider_publishing_transactions WHERE campaign_id=$1 AND id<>$2 AND (is_unknown_outcome IS DISTINCT FROM FALSE OR publish_status IS NULL OR publish_status NOT IN ('COMMITTED','FAILED')) LIMIT 1",[campaignId,operation.id])).rows;
    const running=(await c.query("SELECT id FROM marketing_jobs WHERE campaign_id=$1 AND id<>$2 AND kind IN ('PUBLISH','ACTIVATE','PAUSE') AND state IN ('PENDING','RETRY','RUNNING') LIMIT 1",[campaignId,job.id])).rows;
    const legacy=(await c.query('SELECT id FROM meta_publishing_transactions WHERE campaign_id=$1 LIMIT 1',[campaignId])).rows;
    if(unresolved.length||running.length||legacy.length)throw new MarketingError('PAUSE_RECOVERY_UNAVAILABLE','Other unresolved or legacy provider operations must remain quarantined.');
    const entities=(await c.query("SELECT external_id,account_id FROM provider_entities WHERE campaign_id=$1 AND provider=$2 AND entity_type='CAMPAIGN' FOR SHARE",[campaignId,row.provider])).rows;
    const entity=entities.length===1?entities[0]:null;
    if(!entity||entity.external_id!==operation.external_campaign_id||typeof entity.account_id!=='string')throw new MarketingError('PAUSE_RECOVERY_UNAVAILABLE','The original provider account binding is required.');
    const accountId=row.provider==='META'?entity.account_id.replace(/^act_/,''):entity.account_id;
    if(!/^[1-9]\d{0,29}$/.test(accountId))throw new MarketingError('PAUSE_RECOVERY_UNAVAILABLE','The original provider account binding is invalid.');
    const binding:SettlementProviderBinding={provider:row.provider,accountId,externalCampaignId:entity.external_id,campaignId,revision};
    const identity=fingerprint({state:row.state,revision,rowError:row.last_error,quoteId:row.quote_id,reservationId:row.reservation_id,
      pendingJobId:row.pending_job_id,jobState:job.state,fence:String(job.fence),jobError:job.last_error,operation,binding});
    return {row,job,operation,binding,identity};
  }
  private async replay(c:pg.PoolClient,actor:Actor,key:string,hash:string){
    const old=(await c.query('SELECT request_fingerprint,result FROM marketing_pause_recoveries WHERE actor_id=$1 AND request_key=$2',[actor.id,key])).rows[0];
    if(old&&old.request_fingerprint!==hash)throw new MarketingError('IDEMPOTENCY_CONFLICT','This recovery key belongs to another request.');
    return old?{...old.result,idempotent:true}:null;
  }
  async adopt(actor:Actor,campaignId:number,input:Input,key:string){
    const body=pauseRecoverySchema.parse(input);
    if(!Number.isSafeInteger(campaignId)||campaignId<=0||!/^[a-zA-Z0-9:_-]{8,160}$/.test(key))throw new MarketingError('INVALID_INPUT','A valid campaign and recovery request key are required.',422);
    const hash=fingerprint({campaignId,...body});
    const start=await inTransaction(this.pool,actor,async c=>{
      await this.admin(c,actor);
      // Serialize same-key requests even when the caller tries a different campaign.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`pause-recovery:${actor.id}:${key}`]);
      const replay=await this.replay(c,actor,key,hash);if(replay)return {replay};
      const candidate=await this.candidate(c,actor,campaignId,body.revision);
      const sameKey=(await c.query('SELECT request_fingerprint,state FROM marketing_pause_recovery_attempts WHERE actor_id=$1 AND request_key=$2',[actor.id,key])).rows[0];
      if(sameKey){
        if(sameKey.request_fingerprint!==hash)throw new MarketingError('IDEMPOTENCY_CONFLICT','This recovery key belongs to another request.');
        throw new MarketingError(sameKey.state==='RUNNING'?'RECOVERY_IN_PROGRESS':'RECOVERY_ATTEMPT_FINISHED',sameKey.state==='RUNNING'?'Recovery inspection is already in progress. Refresh its evidence.':'This recovery attempt has finished. Inspect the evidence and start a new request.');
      }
      const expired=(await c.query("UPDATE marketing_pause_recovery_attempts SET state='EXPIRED',error_code='RECOVERY_LEASE_EXPIRED',finished_at=clock_timestamp() WHERE job_id=$1 AND state='RUNNING' AND lease_until<=clock_timestamp() RETURNING id",[candidate.job.id])).rows;
      for(const attempt of expired)await event(c,candidate.row,actor,'PAUSE_RECOVERY_ATTEMPT_EXPIRED',{attemptId:attempt.id,jobId:candidate.job.id});
      if((await c.query("SELECT id FROM marketing_pause_recovery_attempts WHERE job_id=$1 AND state='RUNNING'",[candidate.job.id])).rows.length)throw new MarketingError('RECOVERY_IN_PROGRESS','Another operator is already inspecting this pause. Refresh its evidence.');
      const attemptId=randomUUID();
      await c.query(`INSERT INTO marketing_pause_recovery_attempts(id,campaign_id,revision,job_id,actor_id,request_key,request_fingerprint,candidate_fingerprint,lease_until)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()+interval '60 seconds')`,[attemptId,campaignId,body.revision,candidate.job.id,actor.id,key,hash,candidate.identity]);
      await event(c,candidate.row,actor,'PAUSE_RECOVERY_ATTEMPT_STARTED',{attemptId,jobId:candidate.job.id});
      return {candidate,attemptId};
    });
    if(start.replay)return start.replay;
    const before=start.candidate!;
    // No DB transaction/row lock is held during a provider read.
    const attemptId=start.attemptId!;
    try {
    let timer:ReturnType<typeof setTimeout>|undefined;
    const proof=await Promise.race([this.readStopped(before.binding),new Promise<never>((_resolve,reject)=>{
      timer=setTimeout(()=>reject(new MarketingError('RECOVERY_READ_TIMEOUT','The provider inspection timed out. No campaign state was changed.')),this.readTimeoutMs);
    })]).finally(()=>{if(timer)clearTimeout(timer);});
    const age=Date.now()-Date.parse(proof.observedAt);
    if(proof.configuredStatus!=='PAUSED'||!Number.isFinite(age)||age< -5000||age>60000||!/^[a-f0-9]{64}$/.test(proof.evidenceHash)
      ||(Object.keys(before.binding) as Array<keyof SettlementProviderBinding>).some(field=>proof[field]!==before.binding[field]))throw new MarketingError('PAUSE_RECOVERY_NOT_VERIFIED','Fresh original-account evidence must confirm that the entire campaign is paused.');
    return await inTransaction(this.pool,actor,async c=>{
      await this.admin(c,actor);
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`pause-recovery:${actor.id}:${key}`]);
      const replay=await this.replay(c,actor,key,hash);if(replay)return replay;
      const current=await this.candidate(c,actor,campaignId,body.revision);
      const attempt=(await c.query("SELECT id FROM marketing_pause_recovery_attempts WHERE id=$1 AND state='RUNNING' AND lease_until>clock_timestamp() FOR UPDATE",[attemptId])).rows[0];
      if(!attempt)throw new MarketingError('RECOVERY_ATTEMPT_EXPIRED','This inspection no longer owns the recovery claim. Refresh the current evidence.');
      if(current.identity!==before.identity||Date.now()-Date.parse(proof.observedAt)>60000)throw new MarketingError('RECOVERY_EVIDENCE_CHANGED','Campaign recovery evidence changed. Inspect the current operation again.');
      const id=randomUUID(),result={id,campaignId,revision:body.revision,state:'PAUSED',jobId:current.job.id,operationId:current.operation.id};
      const evidence={attemptId,beforeFingerprint:before.identity,previousError:current.row.last_error,previousJobState:current.job.state,previousFence:String(current.job.fence),proof};
      await c.query(`INSERT INTO marketing_pause_recoveries(id,campaign_id,revision,actor_id,request_key,request_fingerprint,job_id,operation_id,reason,evidence,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,campaignId,body.revision,actor.id,key,hash,current.job.id,current.operation.id,body.reason,JSON.stringify(evidence),JSON.stringify(result)]);
      await c.query("UPDATE marketing_jobs SET state='SUCCEEDED',fence=fence+1,lease_until=NULL,updated_at=now() WHERE id=$1",[current.job.id]);
      // An expired worker may have left an earlier safety reason on PAUSE_QUEUED.
      // Containment does not resolve that independent inventory/financial condition.
      const remainingError=current.row.last_error===current.job.last_error?null:current.row.last_error;
      await c.query("UPDATE marketing_campaign_workflows SET state='PAUSED',pending_job_id=NULL,last_error=$3,provider_truth=$2,updated_at=now() WHERE campaign_id=$1",[campaignId,JSON.stringify({...current.row.provider_truth,configuredStatus:'PAUSED',observedStatus:'PAUSED',observedAt:proof.observedAt,statusAttemptedAt:proof.observedAt,statusCheck:'AVAILABLE',readiness:'PAUSED',deliveryConfirmed:false}),remainingError]);
      await c.query("UPDATE marketing_pause_recovery_attempts SET state='SUCCEEDED',finished_at=clock_timestamp() WHERE id=$1",[attemptId]);
      await event(c,current.row,actor,'COMMITTED_PAUSE_RECOVERED',{recoveryId:id,...evidence});
      return {...result,idempotent:false};
    });
    } catch(error) {
      const code=error instanceof MarketingError&&/^[A-Z_]{1,100}$/.test(error.code)?error.code:'RECOVERY_READ_FAILED';
      // Release only this attempt. Late completions cannot release a successor's claim.
      try {await inTransaction(this.pool,actor,async c=>{
        await c.query('SELECT campaign_id FROM marketing_campaign_workflows WHERE campaign_id=$1 FOR UPDATE',[campaignId]);
        const finished=(await c.query("UPDATE marketing_pause_recovery_attempts SET state='FAILED',error_code=$2,finished_at=clock_timestamp() WHERE id=$1 AND actor_id=$3 AND state='RUNNING' RETURNING id",[attemptId,code,actor.id])).rows;
        if(finished.length)await event(c,before.row,actor,'PAUSE_RECOVERY_ATTEMPT_FAILED',{attemptId,errorCode:code,jobId:before.job.id});
      });}catch(cleanupError){throw new AggregateError([error,cleanupError],'Recovery failed and its claim could not be finalized; inspect the retained attempt.');}
      throw error;
    }
  }
}
