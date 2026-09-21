import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createAdtechFixture} from './adtechFixture.js';
import {CorridorInferenceWorker,type CorridorInferencePort} from '../../lib/marketing/adtech/inference.js';
import {FeederCorridorResolver} from '../../lib/marketing/adtech/corridors.js';
import type {GeoResolverPort} from '../../lib/marketing/adtech/geography.js';
import {fingerprint} from '../../lib/marketing/domain.js';
import {inTransaction} from '../../lib/marketing/database.js';
const admin={id:90,role:'admin'} as const,host={id:10,role:'host'} as const;
const base={apiVersion:'v26.0',provider:'META',country:'IN',verifiedAt:'2026-09-22T00:00:00.000Z'};
const adapter:GeoResolverPort={search:async(q,kind)=>[{key:kind==='CITY'?'123':'456',name:q,type:kind,country:'IN'}],resolve:async(input)=>{const item=input.kind==='PROVIDER_CITY_RADIUS'?{...base,kind:input.kind,label:input.query,providerKey:input.providerKey,latitude:12.97,longitude:77.59,radiusKm:input.radiusKm}:{...base,kind:'PROVIDER_REGION_EXCLUSION',label:'Wayanad',providerKey:'456',administrativeLevel:'DISTRICT'};return {...item,evidenceHash:fingerprint(item)} as any;}};
describe('durable bounded corridor research',()=>{
 let fixture:Awaited<ReturnType<typeof createAdtechFixture>>,worker:CorridorInferenceWorker,model:CorridorInferencePort;
 beforeAll(async()=>{
  fixture=await createAdtechFixture();const c=await fixture.pool.connect();
  try{await c.query('BEGIN');for(const name of ['033_marketing_adtech_corridors.sql','035_marketing_corridor_inference.sql'])await c.query(readFileSync('src/migrations/'+name,'utf8'));await c.query('COMMIT');}finally{c.release();}
  await fixture.pool.query(`GRANT SELECT,INSERT ON marketing_destination_corridors,marketing_corridor_geography_evidence,marketing_destination_corridor_versions,marketing_corridor_inference_requests TO marketing_worker,authenticated_host;
   GRANT SELECT,INSERT,UPDATE ON marketing_corridor_current_versions,marketing_corridor_inference_jobs,marketing_corridor_inference_proposals TO marketing_worker,authenticated_host;
   GRANT SELECT,INSERT,UPDATE,DELETE ON marketing_corridor_inference_rate TO marketing_worker;
   GRANT SELECT ON marketing_corridor_inference_policy TO marketing_worker;
   GRANT UPDATE(id) ON listings TO marketing_worker,authenticated_host;
   GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO marketing_worker;
   INSERT INTO listings VALUES(22,11,'Another stay','Wayanad',3500,'INR','entire_place','published',11.9,76.2);`);
 });
 beforeEach(async()=>{
  await fixture.pool.query('TRUNCATE marketing_corridor_inference_jobs,marketing_corridor_inference_rate CASCADE');
  await fixture.pool.query('UPDATE marketing_corridor_inference_policy SET calls_per_minute=6');
  model={generate:vi.fn(async()=>({feeders:[{city:'Bengaluru',radiusKm:30,rationale:'Synthetic feeder research hypothesis for review.'}]}))};
  worker=new CorridorInferenceWorker(fixture.runtime,admin,model,new FeederCorridorResolver(fixture.runtime,{META:adapter,GOOGLE:adapter}),{destination:async name=>({name,districtName:name,latitude:11.77,longitude:76.08})},()=>0.5);
 });
 afterAll(async()=>{await fixture?.close();});
 it('coalesces concurrent requests across hosts without sharing customer data',async()=>{
  const jobs=await Promise.all([worker.request(host,20,'META'),worker.request(host,20,'META'),worker.request({id:11,role:'host'},22,'META')]);expect(new Set(jobs.map(j=>j.id)).size).toBe(1);
  expect((await fixture.pool.query('SELECT * FROM marketing_corridor_inference_requests')).rows).toHaveLength(2);
  await expect(worker.request(host,21,'META')).rejects.toMatchObject({code:'LISTING_NOT_AVAILABLE'});
 });
 it('does not expose global jobs or another host request under non-bypass roles',async()=>{
  await worker.request(host,20,'META');
  const result=await inTransaction(fixture.hostPool,{id:11,role:'host'},async c=>({jobs:(await c.query('SELECT * FROM marketing_corridor_inference_jobs')).rows,requests:(await c.query('SELECT * FROM marketing_corridor_inference_requests')).rows}));expect(result).toEqual({jobs:[],requests:[]});
  await expect(worker.list({id:11,role:'host'})).rejects.toMatchObject({code:'ADMIN_REQUIRED'});
 });
 it('only one concurrent claim runs and an expired fence cannot complete',async()=>{
  const job=await worker.request(host,20,'META'),claims=await Promise.all([worker.claim(),worker.claim()]);const first=claims.find(Boolean)!;expect(claims.filter(Boolean)).toHaveLength(1);
  await fixture.pool.query("UPDATE marketing_corridor_inference_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);const next=await worker.claim();expect(next.fence).toBe(first.fence+1);
  await expect(worker.complete(first,{} as any)).rejects.toMatchObject({code:'INFERENCE_LEASE_LOST'});expect((await fixture.pool.query('SELECT * FROM marketing_corridor_inference_proposals')).rows).toHaveLength(0);
 });
 it('enforces the shared model quota across providers and workers',async()=>{
  await worker.request(host,20,'META');await worker.request(host,20,'GOOGLE');await fixture.pool.query('UPDATE marketing_corridor_inference_policy SET calls_per_minute=1');
  const claims=await Promise.all([worker.claim(),worker.claim()]);expect(claims.filter(Boolean)).toHaveLength(1);expect((await fixture.pool.query('SELECT sum(calls)::int n FROM marketing_corridor_inference_rate')).rows[0].n).toBe(1);
 });
 it('stores a verified proposal with no publication or spending authority',async()=>{
  await worker.request(host,20,'META');await worker.runOnce();
  const input=vi.mocked(model.generate).mock.calls[0][0];expect(input.destination).toEqual({name:'Wayanad',districtName:'Wayanad',latitude:11.77,longitude:76.08});expect(JSON.stringify(input)).not.toMatch(/listingId|hostId|11\.7[,}]|price|guest/);
  const proposal=(await worker.list(admin)).proposals[0];expect(proposal.state).toBe('PROPOSED');expect(proposal.content.geography).toHaveLength(2);
  expect((await fixture.pool.query('SELECT * FROM marketing_corridor_current_versions')).rows).toHaveLength(0);expect(await worker.status(host,20,'META')).toMatchObject({state:'DONE',review_state:'PROPOSED'});
 });
 it('rejects malformed and unbounded model output into the dead-letter queue',async()=>{
  vi.mocked(model.generate).mockResolvedValue({feeders:[{city:'Bengaluru',radiusKm:999,rationale:'A plausible but invalid radius.'}]});await worker.request(host,20,'META');await worker.runOnce();
  expect((await worker.list(admin)).jobs[0]).toMatchObject({state:'DEAD',last_error:'INFERENCE_PROPOSAL_INVALID'});expect((await worker.list(admin)).proposals).toHaveLength(0);
 });
 it('retries a dead research attempt only with a matching fence and immutable operator receipt',async()=>{
  vi.mocked(model.generate).mockResolvedValue({bad:'output'});await worker.request(host,20,'META');await worker.runOnce();const dead=(await worker.list(admin)).jobs[0];
  await expect(worker.retry(host,dead.id,{expectedFence:dead.fence,reason:'Host must not override the research worker.'},'host-retry-denied')).rejects.toMatchObject({code:'ADMIN_REQUIRED'});
  const body={expectedFence:dead.fence,reason:'Corrected the synthetic model configuration; retry research.'};const result=await worker.retry(admin,dead.id,body,'admin-retry-inference');expect(result).toMatchObject({state:'PENDING',fence:dead.fence+1});expect(await worker.retry(admin,dead.id,body,'admin-retry-inference')).toEqual(result);
  await expect(worker.retry(admin,dead.id,body,'admin-retry-stale')).rejects.toMatchObject({code:'INFERENCE_RETRY_CONFLICT'});
 });
 it('never accepts a missing district and does not replace it with nationwide targeting',async()=>{
  const unresolved={...adapter,search:async(q:string,kind:'CITY'|'DISTRICT')=>kind==='DISTRICT'?[]:adapter.search(q,kind)};
  worker=new CorridorInferenceWorker(fixture.runtime,admin,model,new FeederCorridorResolver(fixture.runtime,{META:unresolved,GOOGLE:unresolved}),{destination:async name=>({name,districtName:name,latitude:11.77,longitude:76.08})});
  await worker.request(host,20,'META');await worker.runOnce();expect((await worker.list(admin)).jobs[0]).toMatchObject({state:'DEAD',last_error:'EXCLUSION_UNRESOLVED'});
 });
 it('backs off transient failures and stores no raw provider error or secret',async()=>{
  vi.mocked(model.generate).mockRejectedValue(new Error('private-key-do-not-log'));const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try{await worker.request(host,20,'META');await worker.runOnce();const job=(await worker.list(admin)).jobs[0];expect(job.state).toBe('RETRY');expect(new Date(job.available_at).getTime()).toBeGreaterThan(Date.now()+50000);expect(JSON.stringify(job)).not.toContain('private-key');expect(JSON.stringify(warn.mock.calls)).not.toContain('private-key');}finally{warn.mockRestore();}
 });
 it('approves once into an immutable saved version and requires a separate CAS publication',async()=>{
  await worker.request(host,20,'META');await worker.runOnce();const proposal=(await worker.list(admin)).proposals[0];
  const body={action:'APPROVE',expectedHash:proposal.content_hash,expectedVersion:0,reason:'Reviewed synthetic corridor evidence and commercial hypothesis.'};
  const approved=await worker.review(admin,proposal.id,body,'research-approve-1');expect(approved.state).toBe('APPROVED');expect(await worker.review(admin,proposal.id,body,'research-approve-1')).toEqual(approved);
  expect((await fixture.pool.query('SELECT * FROM marketing_corridor_current_versions')).rows).toHaveLength(0);
  await expect(worker.review(admin,proposal.id,{...body,action:'REJECT'},'research-reject-1')).rejects.toMatchObject({code:'INFERENCE_REVIEW_CONFLICT'});
  await expect(fixture.pool.query("UPDATE marketing_corridor_inference_proposals SET content='{}'")).rejects.toThrow(/IMMUTABLE/);
  expect((await fixture.pool.query("SELECT * FROM marketing_adtech_strategy_audits WHERE action='REVIEW_INFERENCE'")).rows).toHaveLength(1);
 });
});
