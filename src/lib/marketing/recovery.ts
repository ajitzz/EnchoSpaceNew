import type pg from 'pg';
import {inTransaction} from './database.js';
import {MarketingError,type Actor} from './domain.js';

/** Evidence inspection only. No absence of local rows proves a remote request was not sent. */
export async function inspectCampaignRecovery(pool:pg.Pool,actor:Actor,campaignId:number,revision:number){
 return inTransaction(pool,actor,async c=>{
  await c.query('SET TRANSACTION READ ONLY');
  const principal=(await c.query('SELECT role FROM users WHERE id=$1',[actor.id])).rows[0];
  if(actor.role!=='admin'||principal?.role!=='admin')throw new MarketingError('ADMIN_REQUIRED','Current administrator access is required.',403);
  const row=(await c.query('SELECT campaign_id,revision,state,provider,provider_truth,last_error,quote_id FROM marketing_campaign_workflows WHERE campaign_id=$1',[campaignId])).rows[0];
  if(!row)throw new MarketingError('CAMPAIGN_NOT_FOUND','Campaign not found.',404);
  if(row.revision!==revision)throw new MarketingError('REVISION_CONFLICT','Reload the current campaign revision before inspecting recovery.');
  const jobs=(await c.query('SELECT id,revision,kind,state,attempts,last_error,updated_at FROM marketing_jobs WHERE campaign_id=$1 ORDER BY created_at DESC,id LIMIT 51',[campaignId])).rows;
  const operations=(await c.query('SELECT id,provider,operation_type,publish_status,is_unknown_outcome,external_campaign_id,correlation_id,updated_at FROM provider_publishing_transactions WHERE campaign_id=$1 ORDER BY id DESC LIMIT 51',[campaignId])).rows;
  const entities=(await c.query('SELECT provider,entity_type,external_id,account_id,configured_status,effective_status,updated_at FROM provider_entities WHERE campaign_id=$1 ORDER BY id LIMIT 101',[campaignId])).rows;
  const recoveries=(await c.query('SELECT id,revision,job_id,operation_id,created_at FROM marketing_pause_recoveries WHERE campaign_id=$1 ORDER BY created_at DESC,id LIMIT 20',[campaignId])).rows;
  const attempts=(await c.query('SELECT id,revision,job_id,state,error_code,created_at,finished_at,lease_until FROM marketing_pause_recovery_attempts WHERE campaign_id=$1 ORDER BY created_at DESC,id LIMIT 21',[campaignId])).rows;
  const uncertain=row.state==='RECONCILIATION_REQUIRED'||jobs.some(j=>j.state==='RECONCILIATION_REQUIRED')||operations.some(o=>o.is_unknown_outcome||['UNKNOWN','DISPATCHING','PUBLISHING','EXTERNAL_OUTCOME_UNKNOWN','CLAIMED'].includes(o.publish_status));
  return {campaignId,revision,state:row.state,provider:row.provider,observedAt:new Date().toISOString(),assessment:uncertain?'QUARANTINED_REVIEW_REQUIRED':'INSPECTION_ONLY',
   quoteId:row.quote_id,externalCampaignId:row.provider_truth?.externalCampaignId??null,recoveries,attempts:attempts.slice(0,20),
   jobs:jobs.slice(0,50),operations:operations.slice(0,50),entities:entities.slice(0,100),truncated:attempts.length>20||jobs.length>50||operations.length>50||entities.length>100,
   automaticRetryAllowed:false,
   nextSteps:[...(row.provider_truth?.externalCampaignId?['Request fresh network evidence using the campaign refresh action.']:['Establish the original provider account and external identity from the operation correlation reference.']),
    'Reconcile the original operation and financial reservation before considering another publication.',
    'No retry, release of funds, or successful remote stop is established by this report.']};
 });
}
