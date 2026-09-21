import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createAdtechFixture} from './adtechFixture.js';
import {MetaGeoResolver,GoogleGeoResolver} from '../../lib/marketing/adtech/geography.js';
import {FeederCorridorResolver} from '../../lib/marketing/adtech/corridors.js';
import {inTransaction} from '../../lib/marketing/database.js';
const admin={id:90,role:'admin'} as const;
const authority={city:vi.fn(async()=>({latitude:12.97,longitude:77.59})),district:vi.fn(async()=>{}),point:vi.fn(async()=>{})};
const get=vi.fn(async(path:string,p:any)=>path==='search'?{data:[p.location_types[0]==='city'?{key:'101',name:'Bengaluru',country_code:'IN',type:'city'}:{key:'202',name:p.q,country_code:'IN',type:'region'}]}:{data:[{estimate_ready:true}]});
const meta=new MetaGeoResolver({get,identity:()=>({accountId:'act_123',pageId:'234',pixelId:'345'})},()=> '2026-09-22T00:00:00.000Z',authority);
const entries=[{kind:'PROVIDER_CITY_RADIUS',query:'Bengaluru',providerKey:'101',radiusKm:30},{kind:'PROVIDER_REGION_EXCLUSION',query:'Wayanad',providerKey:'202'}];
describe('provider-resolved geography and versioned corridors',()=>{
 let fixture:Awaited<ReturnType<typeof createAdtechFixture>>,corridors:FeederCorridorResolver;
 beforeAll(async()=>{
  fixture=await createAdtechFixture();await fixture.pool.query(readFileSync('src/migrations/033_marketing_adtech_corridors.sql','utf8'));
  await fixture.pool.query(`GRANT SELECT,INSERT ON marketing_destination_corridors,marketing_corridor_geography_evidence,marketing_destination_corridor_versions TO marketing_worker,authenticated_host;
   GRANT SELECT,INSERT,UPDATE ON marketing_corridor_current_versions TO marketing_worker,authenticated_host;GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO marketing_worker;`);
  corridors=new FeederCorridorResolver(fixture.runtime,{META:meta,GOOGLE:new GoogleGeoResolver()});
 });
 afterAll(async()=>{await fixture?.close();});
 it('keeps seeded destinations unpublished until evidence exists',async()=>{
  const result=await corridors.list(admin);expect(result.corridors.map(r=>r.destination_key)).toEqual(['wayanad','north-goa','south-goa']);expect(result.versions).toEqual([]);
  await expect(inTransaction(fixture.runtime,admin,c=>corridors.resolve(c,'Wayanad','BUDGET','META'))).rejects.toMatchObject({code:'EXCLUSION_UNRESOLVED'});
 });
 it('verifies native city radius and independent coordinates without assuming undocumented response fields',async()=>{
  const resolved=await meta.resolve(entries[0] as any,'Wayanad');expect(resolved).toMatchObject({kind:'PROVIDER_CITY_RADIUS',providerKey:'101',latitude:12.97,longitude:77.59,radiusKm:30});
  expect(get).toHaveBeenCalledWith('act_123/delivery_estimate',{targeting_spec:{geo_locations:{cities:[{key:'101',radius:30,distance_unit:'kilometer'}]}}});
 });
 it('requires country authority for custom coordinate radii',async()=>{
  const resolved=await meta.resolve({kind:'COORDINATE_RADIUS',label:'Synthetic public feeder',latitude:11.8996,longitude:75.5383,radiusKm:30},'Wayanad');
  expect(resolved.kind).toBe('COORDINATE_RADIUS');expect(authority.point).toHaveBeenCalledWith(11.8996,75.5383);
 });
 it('rejects state substitution for district exclusion',async()=>{
  await expect(meta.resolve({kind:'PROVIDER_REGION_EXCLUSION',query:'Kerala',providerKey:'202'},'Wayanad')).rejects.toMatchObject({code:'EXCLUSION_UNRESOLVED'});
 });
 it('saves immutable evidence and publishes a selected provider/tier corridor with CAS',async()=>{
  const input={provider:'META',tier:'BUDGET',expectedVersion:0,entries,reason:'Synthetic verified Wayanad corridor test'};
  const version=await corridors.save(admin,1,input,'corridor-save-1');
  const replay=await corridors.save(admin,1,input,'corridor-save-1');expect(replay.id).toBe(version.id);
  await corridors.publish(admin,1,{versionId:version.id,expectedVersionId:null,reason:'Publish verified synthetic corridor for tests'},'corridor-publish-1');
  const resolved=await inTransaction(fixture.runtime,admin,c=>corridors.resolve(c,'Wayanad','BUDGET','META'));expect(resolved.geography).toHaveLength(2);
  await expect(corridors.publish(admin,1,{versionId:version.id,expectedVersionId:null,reason:'Stale publication must never overwrite'},'corridor-publish-2')).rejects.toMatchObject({code:'STRATEGY_VERSION_CONFLICT'});
  await expect(fixture.pool.query('DELETE FROM marketing_destination_corridor_versions')).rejects.toThrow(/IMMUTABLE/);
 });
 it('rejects duplicate coordinates and missing exclusion without persisting a version',async()=>{
  await expect(corridors.save(admin,1,{provider:'META',tier:'COMFORT',expectedVersion:0,entries:[entries[0],entries[0]],reason:'Reject duplicate feeder and no district'},'bad-geography-1')).rejects.toMatchObject({code:'EXCLUSION_UNRESOLVED'});
  await expect(corridors.save(admin,1,{provider:'META',tier:'COMFORT',expectedVersion:0,entries:[entries[0],entries[0],entries[1]],reason:'Reject duplicate provider city entries'},'bad-geography-2')).rejects.toMatchObject({code:'DUPLICATE_GEOGRAPHY'});
 });
 it('hides corridor internals from host roles and rejects unsupported evidence inserts',async()=>{
  expect((await inTransaction(fixture.hostPool,{id:10,role:'host'},c=>c.query('SELECT * FROM marketing_destination_corridors'))).rowCount).toBe(0);
  await expect(corridors.list({id:10,role:'admin'})).rejects.toMatchObject({code:'ADMIN_REQUIRED'});
  await expect(fixture.pool.query(`INSERT INTO marketing_destination_corridor_versions(corridor_id,tier_code,provider,version,geography,snapshot_hash,created_by,reason) VALUES(1,'COMFORT','META',1,'[{"evidenceHash":"fake"},{"evidenceHash":"fake2"}]',repeat('a',64),90,'Do not accept fabricated provider evidence')`)).rejects.toThrow(/EVIDENCE_REQUIRED/);
 });
 it('compiles Google city identity with independent geometry and requires actual district target type',async()=>{
  const client={suggestGeoTargets:vi.fn(async()=>[{resourceName:'geoTargetConstants/100',name:'Wayanad',canonicalName:'Wayanad,India',countryCode:'IN',targetType:'District'}])};
  const google=new GoogleGeoResolver(client,()=> '2026-09-22T00:00:00.000Z',authority);
  expect(await google.resolve({kind:'PROVIDER_REGION_EXCLUSION',query:'Wayanad',providerKey:'geoTargetConstants/100'},'Wayanad')).toMatchObject({provider:'GOOGLE',administrativeLevel:'DISTRICT'});
  client.suggestGeoTargets.mockResolvedValueOnce([{resourceName:'geoTargetConstants/100',name:'Wayanad',canonicalName:'Wayanad,India',countryCode:'IN',targetType:'State'}]);
  await expect(google.resolve({kind:'PROVIDER_REGION_EXCLUSION',query:'Wayanad',providerKey:'geoTargetConstants/100'},'Wayanad')).rejects.toMatchObject({code:'EXCLUSION_UNRESOLVED'});
 });
});
