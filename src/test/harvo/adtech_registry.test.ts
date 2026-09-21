import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import express from 'express';
import request from 'supertest';
import {createAdtechFixture} from './adtechFixture.js';
import {AdtechStrategyRegistry} from '../../lib/marketing/adtech/registry.js';
import {inTransaction} from '../../lib/marketing/database.js';
import {createAdtechAdminRouter} from '../../server/marketing/adtechRoutes.js';
import {marketingErrorHandler} from '../../server/marketing/router.js';
const admin={id:90,role:'admin'} as const,otherAdmin={id:91,role:'admin'} as const,host={id:10,role:'host'} as const;
describe('ADT registry on real PostgreSQL with non-bypass roles',()=>{
 let fixture:Awaited<ReturnType<typeof createAdtechFixture>>,registry:AdtechStrategyRegistry;
 beforeAll(async()=>{fixture=await createAdtechFixture();registry=new AdtechStrategyRegistry(fixture.runtime);});
 afterAll(async()=>{await fixture?.close();});
 it('seeds exact founder intervals in forced-RLS tables and no spending state',async()=>{
  const state=await registry.list(admin);expect(state.profiles.map(p=>p.config.minPriceMinor)).toEqual(['100000','400000','700000']);expect(state.currentReleaseId).toBe(1);
  const r=await fixture.pool.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname LIKE 'marketing_adtech_%' AND relkind='r'");expect(r.rows).toHaveLength(6);expect(r.rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity)).toBe(true);
  expect((await fixture.pool.query("SELECT rolbypassrls,rolsuper FROM pg_roles WHERE rolname IN ('authenticated_host','marketing_worker')")).rows.every(r=>!r.rolbypassrls&&!r.rolsuper)).toBe(true);
 });
 it('hides strategy tables and rejects forged administrator identity',async()=>{
  expect((await inTransaction(fixture.hostPool,host,c=>c.query('SELECT * FROM marketing_adtech_profile_versions'))).rowCount).toBe(0);
  await expect(registry.list({...host,role:'admin'})).rejects.toMatchObject({code:'ADMIN_REQUIRED'});
  await expect(inTransaction(fixture.hostPool,{...host,role:'admin'},c=>c.query("INSERT INTO marketing_adtech_tier_profiles(tier_code) VALUES('BUDGET')"))).rejects.toThrow(/row-level security/);
 });
 it('creates immutable versions, records both audit projections, and replays exactly once',async()=>{
  const state=await registry.list(admin);const p=state.profiles[0];
  const input={expectedVersion:p.version,profile:{...p.config,ai:{minimumScore:7.5}},reason:'Validate reviewed quality threshold change'};
  const results=await Promise.all(Array.from({length:4},()=>registry.save(admin,input,'same-profile-change',p.id)));
  expect(new Set(results.map(r=>r.id)).size).toBe(1);
  expect((await fixture.pool.query("SELECT count(*)::int n FROM marketing_adtech_strategy_audits WHERE request_key='same-profile-change'")).rows[0].n).toBe(1);
  expect((await fixture.pool.query("SELECT count(*)::int n FROM admin_audit_logs WHERE entity_type='ADTECH_PROFILE'")).rows[0].n).toBe(1);
  await expect(registry.save(admin,{...input,reason:'Different semantic request same key'},'same-profile-change',p.id)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await expect(fixture.pool.query("UPDATE marketing_adtech_profile_versions SET reason='Tamper with old history' WHERE id=$1",[results[0].id])).rejects.toThrow(/IMMUTABLE/);
  await expect(fixture.pool.query('DELETE FROM marketing_adtech_strategy_audits')).rejects.toThrow(/IMMUTABLE/);
  await expect(fixture.pool.query("DELETE FROM admin_audit_logs WHERE entity_type='ADTECH_PROFILE'")).rejects.toThrow(/IMMUTABLE/);
 });
 it('allows only one concurrent CAS publication and rolls back by publishing a new release',async()=>{
  const state=await registry.list(admin);const input={expectedReleaseId:state.currentReleaseId,versionIds:state.profiles.map(p=>p.version_id),reason:'Publish tested strategies for future drafts'};
  const results=await Promise.allSettled([registry.publish(admin,input,'release-publish-a'),registry.publish(otherAdmin,input,'release-publish-b')]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  const current=(await registry.list(admin)).currentReleaseId;
  const rollback=await registry.rollback(admin,1,current,'rollback-release-1','Restore the original immutable tier versions');
  expect(rollback.id).toBeGreaterThan(current);expect(rollback.previous_release_id).toBe(current);
  expect((await registry.list(admin)).currentReleaseId).toBe(rollback.id);
 });
 it('rejects interval gaps both through service and raw database publication',async()=>{
  const state=await registry.list(admin),p=state.profiles[0];
  const saved=await registry.save(admin,{expectedVersion:p.version,profile:{...p.config,maxPriceMinor:'410000'},reason:'Draft deliberately invalid release overlap'},'overlap-profile');
  const versionIds=state.profiles.map(x=>x.id===p.id?saved.id:x.version_id);
  await expect(registry.publish(admin,{expectedReleaseId:state.currentReleaseId,versionIds,reason:'Should reject overlapping interval release'},'overlap-release')).rejects.toMatchObject({code:'STRATEGY_INTERVALS_INVALID'});
  await expect(inTransaction(fixture.runtime,admin,async c=>{
   const r=(await c.query("INSERT INTO marketing_adtech_releases(previous_release_id,created_by,reason) VALUES($1,90,'Raw malformed release test') RETURNING id",[state.currentReleaseId])).rows[0];
   await c.query('INSERT INTO marketing_adtech_release_members SELECT $1,profile_id,id FROM marketing_adtech_profile_versions WHERE id=ANY($2::int[])',[r.id,versionIds]);
   await c.query('UPDATE marketing_adtech_current_release SET release_id=$1',[r.id]);
  })).rejects.toThrow(/INTERVALS_INVALID/);
 });
 it('rejects JSON null money and denies runtime truncation',async()=>{
  const p=(await registry.list(admin)).profiles[0];
  await expect(inTransaction(fixture.runtime,admin,c=>c.query('INSERT INTO marketing_adtech_profile_versions(profile_id,version,config,created_by,reason) VALUES($1,99,$2,90,$3)',[p.id,JSON.stringify({...p.config,budget:{...p.config.budget,total:{min:null,max:'250000'}}}),'Reject malformed money despite SQL NULL']))).rejects.toThrow(/BUDGET_INVALID/);
  await expect(inTransaction(fixture.runtime,admin,c=>c.query('TRUNCATE marketing_adtech_strategy_audits'))).rejects.toThrow(/permission denied/);
 });
 it('mounts authenticated admin-only HTTP routes and denies host access with 403',async()=>{
  const app=express();app.use(express.json());app.use((req,res,next)=>{res.locals.actor=req.get('Test-Role')==='admin'?admin:host;next();});app.use('/admin/adtech',createAdtechAdminRouter(registry));app.use(marketingErrorHandler);
  expect((await request(app).get('/admin/adtech/profiles')).status).toBe(403);
  const ok=await request(app).get('/admin/adtech/profiles').set('Test-Role','admin');expect(ok.status).toBe(200);expect(ok.body.profiles).toHaveLength(3);
 });
});
