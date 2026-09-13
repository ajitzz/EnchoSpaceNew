import type pg from 'pg';
import {MarketingError} from './domain.js';

/** A signed session identifies an account; only the current database row grants privileges. */
export async function resolvePersistedSession(pool:Pick<pg.Pool,'query'>,claims:unknown):Promise<{id:number;role:string;email?:string}> {
 if(!claims||typeof claims!=='object'||!('id' in claims)||!Number.isSafeInteger(claims.id)||Number(claims.id)<=0)throw new MarketingError('SESSION_INVALID','Invalid account session',401);
 const row=(await pool.query('SELECT id,role,email FROM users WHERE id=$1',[claims.id])).rows[0];
 if(!row||!Number.isSafeInteger(Number(row.id))||Number(row.id)!==claims.id||typeof row.role!=='string'||(row.email!=null&&typeof row.email!=='string'))throw new MarketingError('SESSION_INVALID','Account session is no longer available',401);
 return {id:Number(row.id),role:row.role,...(typeof row.email==='string'?{email:row.email}:{})};
}

export function legacySocialPublishingEnabled(env:NodeJS.ProcessEnv=process.env):boolean{return env.HARVO_LEGACY_SOCIAL_PUBLISHING_ENABLED==='true';}

export async function approveLegacySocialPost(pool:pg.Pool,postId:number,adminId:number,ip:string|null){
 if(!Number.isSafeInteger(postId)||postId<=0)throw new MarketingError('SOCIAL_POST_INVALID','Invalid social post',422);
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const admin=(await c.query("SELECT id FROM users WHERE id=$1 AND role='admin' FOR SHARE",[adminId])).rows[0];
  if(!admin)throw new MarketingError('ADMIN_REQUIRED','Current administrator access required',403);
  const previous=(await c.query('SELECT * FROM host_social_posts WHERE id=$1 FOR UPDATE',[postId])).rows[0];
  if(!previous)throw new MarketingError('SOCIAL_POST_NOT_FOUND','Social post not found',404);
  if(previous.published_at||previous.external_media_id||Number(previous.publish_attempt_count||0)>0)throw new MarketingError('SOCIAL_RECONCILIATION_REQUIRED','Reconcile the previous publication attempt before another publication',409);
  const post=(await c.query("UPDATE host_social_posts SET status='approved',admin_feedback=NULL WHERE id=$1 RETURNING *",[postId])).rows[0];
  await c.query("INSERT INTO admin_audit_logs(admin_id,entity_type,entity_id,action,previous_state,new_state,ip_address) VALUES($1,'social_post',$2,'approve_social_post',$3,$4,$5)",[adminId,postId,JSON.stringify(previous),JSON.stringify(post),ip]);
  await c.query('COMMIT');return post;
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}

/** Exact content reviewed by an account that still has administrator authority. Alias p is a social post. */
export const socialApprovalPredicate=`EXISTS (
 SELECT 1 FROM admin_audit_logs approval JOIN users reviewer ON reviewer.id=approval.admin_id
 WHERE reviewer.role='admin' AND approval.entity_type='social_post' AND approval.entity_id=p.id
 AND approval.action='approve_social_post'
 AND approval.new_state::jsonb->>'status'='approved'
 AND approval.new_state::jsonb->>'caption' IS NOT DISTINCT FROM p.caption
 AND approval.new_state::jsonb->>'media_type' IS NOT DISTINCT FROM p.media_type
 AND approval.new_state::jsonb->'media_urls' IS NOT DISTINCT FROM to_jsonb(p.media_urls)
 AND approval.new_state::jsonb->'hashtags' IS NOT DISTINCT FROM to_jsonb(p.hashtags)
 AND (approval.new_state::jsonb->>'listing_id')::int IS NOT DISTINCT FROM p.listing_id
 AND (approval.new_state::jsonb->>'host_id')::int IS NOT DISTINCT FROM p.host_id
 AND (approval.new_state::jsonb->>'hero_index')::int IS NOT DISTINCT FROM p.hero_index
 AND (approval.new_state::jsonb->>'scheduled_at')::timestamptz IS NOT DISTINCT FROM p.scheduled_at
)`;
