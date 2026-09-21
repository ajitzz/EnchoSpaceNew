import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {inTransaction} from '../database.js';
import {MarketingError, fingerprint, type Actor} from '../domain.js';
import {profileSchema, publishReleaseSchema, saveProfileSchema, validateTierIntervals} from './contracts.js';
import {adtechCapabilities, strategyCapabilityIssues} from './capabilities.js';

export async function requireAdtechAdmin(c:pg.PoolClient,actor:Actor) {
  if (!['admin','system'].includes(actor.role) || !(await c.query("SELECT id FROM users WHERE id=$1 AND role='admin'",[actor.id])).rowCount)
    throw new MarketingError('ADMIN_REQUIRED','Administrator access required.',403);
}

export async function adtechMutation<T>(pool:pg.Pool,actor:Actor,key:string,operation:string,input:unknown,work:(c:pg.PoolClient)=>Promise<{entityType:'PROFILE'|'RELEASE'|'CORRIDOR'|'INFERENCE';entityId:number;before:unknown;after:unknown;reason:string;result:T}>):Promise<T> {
  z.string().min(8).max(160).regex(/^[a-zA-Z0-9:_-]+$/).parse(key);
  const requestHash=fingerprint({operation,input});
  return inTransaction(pool,actor,async c=>{
    await requireAdtechAdmin(c,actor);
    await c.query('SELECT pg_advisory_xact_lock(82749103,$1)',[actor.id]);
    const prior=(await c.query('SELECT request_hash,result FROM marketing_adtech_strategy_audits WHERE actor_id=$1 AND request_key=$2',[actor.id,key])).rows[0];
    if(prior){if(prior.request_hash!==requestHash)throw new MarketingError('IDEMPOTENCY_CONFLICT','This request key was used for a different strategy change.',409);return prior.result as T;}
    const change=await work(c);
    await c.query(`INSERT INTO marketing_adtech_strategy_audits(id,actor_id,request_key,request_hash,entity_type,entity_id,action,previous_state,new_state,result,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[randomUUID(),actor.id,key,requestHash,change.entityType,change.entityId,operation,JSON.stringify(change.before),JSON.stringify(change.after),JSON.stringify(change.result),change.reason]);
    await c.query(`INSERT INTO admin_audit_logs(admin_id,entity_type,entity_id,action,previous_state,new_state)
      VALUES($1,$2,$3,$4,$5,$6)`,[actor.id,`ADTECH_${change.entityType}`,change.entityId,operation,JSON.stringify(change.before),JSON.stringify(change.after)]);
    return change.result;
  });
}

export class AdtechStrategyRegistry {
  constructor(readonly pool:pg.Pool){}
  async list(actor:Actor){return inTransaction(this.pool,actor,async c=>{
    await requireAdtechAdmin(c,actor);
    const profiles=(await c.query(`SELECT p.id,p.tier_code,v.id AS version_id,v.version,v.config,v.profile_hash FROM marketing_adtech_tier_profiles p
      JOIN LATERAL(SELECT * FROM marketing_adtech_profile_versions WHERE profile_id=p.id ORDER BY version DESC LIMIT 1)v ON true ORDER BY p.id`)).rows;
    const release=(await c.query('SELECT release_id FROM marketing_adtech_current_release WHERE singleton')).rows[0];
    const versions=(await c.query('SELECT id,profile_id,version,config,profile_hash,created_at FROM marketing_adtech_profile_versions WHERE id IN (SELECT id FROM marketing_adtech_profile_versions ORDER BY id DESC LIMIT 100) OR id IN (SELECT version_id FROM marketing_adtech_release_members WHERE release_id=$1) ORDER BY id DESC',[release?.release_id??null])).rows;
    const releases=(await c.query(`SELECT r.*,COALESCE((SELECT jsonb_agg(m.version_id ORDER BY m.profile_id) FROM marketing_adtech_release_members m WHERE m.release_id=r.id),'[]'::jsonb) AS version_ids FROM marketing_adtech_releases r ORDER BY r.id DESC LIMIT 50`)).rows;
    const audits=(await c.query('SELECT id,actor_id,entity_type,entity_id,action,previous_state,new_state,reason,created_at FROM marketing_adtech_strategy_audits ORDER BY created_at DESC,id DESC LIMIT 50')).rows;
    return {profiles:profiles.map(p=>({...p,capabilityIssues:{META:strategyCapabilityIssues(profileSchema.parse(p.config),'META'),GOOGLE:strategyCapabilityIssues(profileSchema.parse(p.config),'GOOGLE')}})),versions,releases,audits,currentReleaseId:release?.release_id??null,capabilities:adtechCapabilities};
  });}
  async save(actor:Actor,input:unknown,key:string,profileId?:number){
    const body=saveProfileSchema.parse(input);
    return adtechMutation(this.pool,actor,key,'SAVE_PROFILE',{...body,profileId},async c=>{
      const p=(await c.query('SELECT * FROM marketing_adtech_tier_profiles WHERE tier_code=$1',[body.profile.tier])).rows[0];
      if(!p||profileId!==undefined&&p.id!==profileId)throw new MarketingError('PROFILE_NOT_FOUND','The strategy profile does not match this tier.',404);
      await c.query('SELECT pg_advisory_xact_lock(82749104,$1)',[p.id]);
      const previous=(await c.query('SELECT * FROM marketing_adtech_profile_versions WHERE profile_id=$1 ORDER BY version DESC LIMIT 1',[p.id])).rows[0];
      if((previous?.version??0)!==body.expectedVersion)throw new MarketingError('STRATEGY_VERSION_CONFLICT','Another administrator updated this tier. Reload and compare changes.',409);
      const row=(await c.query('INSERT INTO marketing_adtech_profile_versions(profile_id,version,config,created_by,reason) VALUES($1,$2,$3,$4,$5) RETURNING *',[p.id,body.expectedVersion+1,JSON.stringify(body.profile),actor.id,body.reason])).rows[0];
      return {entityType:'PROFILE',entityId:p.id,before:previous?.config??null,after:row.config,reason:body.reason,result:row};
    });
  }
  async publish(actor:Actor,input:unknown,key:string){
    const body=publishReleaseSchema.parse(input);
    if(new Set(body.versionIds).size!==3)throw new MarketingError('STRATEGY_INTERVALS_INVALID','Choose one version for each tier.',422);
    return adtechMutation(this.pool,actor,key,'PUBLISH_RELEASE',body,async c=>{
      const current=(await c.query('SELECT release_id FROM marketing_adtech_current_release WHERE singleton FOR UPDATE')).rows[0];
      if(!current||current.release_id!==body.expectedReleaseId)throw new MarketingError('STRATEGY_VERSION_CONFLICT','The published release changed. Reload before publishing.',409);
      const versions=(await c.query('SELECT * FROM marketing_adtech_profile_versions WHERE id=ANY($1::int[]) ORDER BY profile_id',[body.versionIds])).rows;
      validateTierIntervals(versions.map(v=>v.config));
      const before=(await c.query('SELECT profile_id,version_id FROM marketing_adtech_release_members WHERE release_id=$1 ORDER BY profile_id',[current.release_id])).rows;
      const release=(await c.query('INSERT INTO marketing_adtech_releases(previous_release_id,created_by,reason) VALUES($1,$2,$3) RETURNING *',[current.release_id,actor.id,body.reason])).rows[0];
      await c.query('INSERT INTO marketing_adtech_release_members(release_id,profile_id,version_id) SELECT $1,profile_id,id FROM marketing_adtech_profile_versions WHERE id=ANY($2::int[])',[release.id,body.versionIds]);
      await c.query('UPDATE marketing_adtech_current_release SET release_id=$1 WHERE singleton',[release.id]);
      const result={...release,versionIds:versions.map(v=>v.id)};
      return {entityType:'RELEASE',entityId:release.id,before:{releaseId:current.release_id,members:before},after:result,reason:body.reason,result};
    });
  }
  /** Rollback publishes a new receipt referencing old immutable versions; history is never rewritten. */
  async rollback(actor:Actor,releaseId:number,expectedReleaseId:number,key:string,reason:string){
    const versionIds=await inTransaction(this.pool,actor,async c=>{await requireAdtechAdmin(c,actor);return (await c.query('SELECT version_id FROM marketing_adtech_release_members WHERE release_id=$1 ORDER BY profile_id',[releaseId])).rows.map(r=>r.version_id);});
    return this.publish(actor,{expectedReleaseId,versionIds,reason},key);
  }
  async current(c:pg.PoolClient){
    const rows=(await c.query(`SELECT m.release_id,v.id AS version_id,v.config,v.profile_hash FROM marketing_adtech_current_release r
      JOIN marketing_adtech_release_members m ON m.release_id=r.release_id JOIN marketing_adtech_profile_versions v ON v.id=m.version_id WHERE r.singleton ORDER BY v.min_price_minor`)).rows;
    validateTierIntervals(rows.map(r=>r.config));return rows;
  }
}
