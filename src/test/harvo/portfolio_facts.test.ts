import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {CreativeWorkflowService} from '../../lib/marketing/creativeWorkflow.js';
import {CampaignImagePreparer} from '../../lib/marketing/creativeImages.js';
import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createWorkflowPgFixture,workflowConfig,workflowDraft} from './workflowPgFixture.js';
import {CanonicalMarketingFacts} from '../../lib/marketing/portfolio/facts.js';
import {productSchema,poolContributionSchema} from '../../lib/marketing/portfolio/contracts.js';
import {inTransaction} from '../../lib/marketing/database.js';
import type {Actor} from '../../lib/marketing/domain.js';
const host:Actor={id:10,role:'host'},other:Actor={id:11,role:'host'},admin:Actor={id:90,role:'admin'};

describe('canonical product facts are immutable, owned and non-spending',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtime:pg.Pool,facts:CanonicalMarketingFacts;
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();
  await fixture.pool.query("ALTER TABLE listings ADD COLUMN amenities JSONB; ALTER TABLE room_types ADD COLUMN name TEXT,ADD COLUMN description TEXT,ADD COLUMN amenities JSONB");
  for(const name of ['014_harvo_marketing_request_limits.sql','015_harvo_marketing_creative_review.sql','023_marketing_product_facts.sql','025_marketing_revision_products.sql'])await fixture.pool.query(readFileSync(`src/migrations/${name}`,'utf8'));
  await fixture.pool.query(`CREATE ROLE facts_runtime LOGIN NOSUPERUSER NOBYPASSRLS;GRANT USAGE ON SCHEMA public TO facts_runtime;
   GRANT SELECT,UPDATE ON users,listings,media_assets,room_types TO facts_runtime;
   GRANT SELECT,INSERT ON marketing_fact_snapshots,marketing_revision_products TO facts_runtime;
   GRANT SELECT,INSERT,UPDATE ON marketing_creative_derivatives,marketing_creative_events TO facts_runtime;
   GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO facts_runtime;`);
  runtime=new pg.Pool({...fixture.pool.options,user:'facts_runtime'});facts=new CanonicalMarketingFacts(runtime);
 });
 beforeEach(async()=>{await fixture.reset();await fixture.pool.query("UPDATE listings SET amenities='[\"Garden\",\"Garden\"]' WHERE id=20");await fixture.pool.query("INSERT INTO room_types(id,listing_id,currency,name,description,amenities) VALUES(30,20,'INR','Garden room','Faces the garden','[\"Desk\"]')");});
 afterAll(async()=>{await runtime?.end();await fixture?.close();});
 async function capture(){const projection=await facts.preview(host,20);return facts.capture(host,{listingId:20,expectedHash:projection.factHash,assets:[]},'capture-facts-1');}
 it('projects exact supplied room/listing evidence without inferring spatial labels or amenities',async()=>{
  const p=await facts.preview(host,20);expect(p.canonicalPath).toBe('/stay/garden-villa-20');expect(p.facts.map(f=>f.value)).toEqual(['Garden Villa','A garden villa with three guest rooms.','Bengaluru','Garden','Garden room','Faces the garden','Desk']);
  expect(p.facts.every(f=>f.authority==='HOST_SUPPLIED_PUBLISHED'&&/^[a-f0-9]{64}$/.test(f.id))).toBe(true);
  expect(JSON.stringify(p)).not.toMatch(/Infinity|Royal|Wellness/);
 });
 it('persists one immutable snapshot for concurrent identical requests without any financial writes',async()=>{
  const p=await facts.preview(host,20),input={listingId:20,expectedHash:p.factHash,assets:[]};
  const results=await Promise.all(Array.from({length:5},()=>facts.capture(host,input,'concurrent-facts')));
  expect(new Set(results.map(r=>r.id)).size).toBe(1);expect(results.filter(r=>!r.idempotent)).toHaveLength(1);
  await expect(fixture.pool.query("UPDATE marketing_fact_snapshots SET projection='{}'")).rejects.toThrow(/append-only/);
  await expect(fixture.pool.query('DELETE FROM marketing_fact_snapshots')).rejects.toThrow(/append-only/);
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_reservations')).rows).toHaveLength(0);
 });
 it.each(['room','amenity','unpublish','slug','price'])('invalidates downstream evidence after a canonical %s change',async kind=>{
  const snapshot=await capture();
  const queries={room:"UPDATE room_types SET description='Changed room' WHERE id=30",amenity:"UPDATE listings SET amenities='[\"Terrace\"]' WHERE id=20",unpublish:"UPDATE listings SET publication_status='draft' WHERE id=20",slug:"UPDATE listings SET slug='changed-slug' WHERE id=20",price:'UPDATE listings SET price=6000 WHERE id=20'};
  await fixture.pool.query(queries[kind as keyof typeof queries]);
  await expect(inTransaction(runtime,host,c=>facts.verify(c,host,snapshot.id))).rejects.toMatchObject({code:kind==='unpublish'?'LISTING_NOT_AVAILABLE':'FACTS_CHANGED'});
 });
 it('rejects changed request identity, stale preview, arbitrary asset URL and unconfigured hash authority',async()=>{
  const snapshot=await capture();
  await expect(facts.capture(host,{listingId:20,expectedHash:'a'.repeat(64),assets:[]},'capture-facts-1')).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await expect(facts.capture(host,{listingId:20,expectedHash:'a'.repeat(64),assets:[]},'capture-new')).rejects.toMatchObject({code:'FACTS_CHANGED'});
  await expect(facts.capture(host,{listingId:20,expectedHash:snapshot.fact_hash,assets:[],url:'https://untrusted.invalid'},'injected-url')).rejects.toThrow();
  await expect(facts.capture(host,{listingId:20,expectedHash:snapshot.fact_hash,assets:[{sourceAssetId:'100',derivativeId:snapshot.id,manifestHash:'a'.repeat(64)}]},'no-asset-authority')).rejects.toMatchObject({code:'CREATIVE_NOT_CONFIGURED'});
 });
 it('hides another host’s facts and refuses forged administrator authority',async()=>{
  const snapshot=await capture();
  await expect(facts.preview(other,20)).rejects.toMatchObject({code:'LISTING_NOT_AVAILABLE'});
  await expect(facts.preview({id:11,role:'admin'},20)).rejects.toMatchObject({code:'FACT_ACCESS_DENIED'});
  expect((await facts.preview(admin,20)).hostId).toBe(10);
  expect(await inTransaction(runtime,other,c=>c.query('SELECT * FROM marketing_fact_snapshots'))).toMatchObject({rowCount:0});
  await expect(inTransaction(runtime,other,c=>facts.verify(c,other,snapshot.id))).rejects.toMatchObject({code:'FACTS_NOT_FOUND'});
  await expect(inTransaction(runtime,other,c=>c.query('INSERT INTO marketing_fact_snapshots SELECT gen_random_uuid(),host_id,listing_id,request_key,request_fingerprint,fact_hash,manifest_hash,projection,assets,created_at FROM marketing_fact_snapshots'))).resolves.toMatchObject({rowCount:0});
  await expect(inTransaction(runtime,other,c=>c.query(`INSERT INTO marketing_fact_snapshots(id,host_id,listing_id,request_key,request_fingerprint,fact_hash,manifest_hash,projection,assets) VALUES(gen_random_uuid(),11,20,'foreign-listing',repeat('a',64),repeat('b',64),repeat('c',64),'{"version":1}','[]')`))).rejects.toThrow(/row-level security/);
 });
 it('rejects JSON null instead of allowing SQL unknown to satisfy the fact version constraint',async()=>{
  await expect(inTransaction(runtime,host,c=>c.query(`INSERT INTO marketing_fact_snapshots(id,host_id,listing_id,request_key,request_fingerprint,fact_hash,manifest_hash,projection,assets) VALUES(gen_random_uuid(),10,20,'null-version',repeat('a',64),repeat('b',64),repeat('c',64),'{"version":null}','[]')`))).rejects.toThrow(/check constraint/);
 });
 it('binds real prepared image bytes only after host confirmation and independent admin review',async()=>{
  const source=await sharp({create:{width:800,height:800,channels:3,background:'#ddeedd'}}).jpeg().toBuffer();
  const stored=new Map<string,Buffer>();
  const verifyCdn=vi.fn(async(input:{url:string;sha256:string;byteLength:number})=>{
   const bytes=stored.get(input.url)!;expect(bytes.length).toBe(input.byteLength);expect(createHash('sha256').update(bytes).digest('hex')).toBe(input.sha256);
  });
  const creative=new CreativeWorkflowService(runtime,{serviceActor:{id:90,role:'system'},
   preparer:new CampaignImagePreparer({allowedOrigins:new Set(['https://media.encho.example']),loadImage:async()=>({data:source,mimeType:'image/jpeg',width:800,height:800})}),
   storage:{put:async image=>{const url=`https://cdn.encho.example/${image.manifestHash}.jpg`;stored.set(url,Buffer.from(image.bytes));return{status:'STORED',manifest:image.manifest,manifestHash:image.manifestHash,url,image:{key:'fixture-image',checksumSha256:createHash('sha256').update(image.bytes).digest('base64'),versionId:null},provenance:{key:'fixture-manifest',checksumSha256:'fixture',versionId:null},reviewRequired:true,providerApproved:false,cdnAccessibilityVerified:false};}},verifyCdn});
  const connected=new CanonicalMarketingFacts(runtime,(c,actor,input)=>creative.resolveForCampaign(c,actor,input));
  const request=await creative.request(host,{listingId:20,sourceAssetId:'100',formats:['SQUARE'],rightsConfirmed:true},'actual-image-preparation');
  expect(await creative.runOnce()).toMatchObject({state:'HOST_REVIEW'});
  const image=(await creative.list(host)).items[0],projection=await connected.preview(host,20);
  const body={listingId:20,expectedHash:projection.factHash,assets:[{sourceAssetId:'100',derivativeId:request.items[0].id,manifestHash:image.manifestHash}]};
  await expect(connected.capture(host,body,'before-image-approval')).rejects.toMatchObject({code:'CREATIVE_NOT_APPROVED'});
  await creative.confirm(host,image.id,{manifestHash:image.manifestHash,rightsConfirmed:true,appearanceConfirmed:true});
  await creative.review(admin,image.id,{manifestHash:image.manifestHash,decision:'APPROVE',note:'Compared the actual source pixels and prepared image.',appearanceConfirmed:true});
  const snapshot=await connected.capture(host,body,'after-image-approval');expect(snapshot.assets[0]).toMatchObject({derivativeId:image.id,outputHash:image.output!.hash});
  await expect(inTransaction(runtime,host,c=>connected.verify(c,host,snapshot.id))).resolves.toMatchObject({id:snapshot.id});
  expect(verifyCdn).toHaveBeenCalledOnce();
  await fixture.pool.query("UPDATE media_assets SET moderation_status='rejected' WHERE id=100");
  await expect(inTransaction(runtime,host,c=>connected.verify(c,host,snapshot.id))).rejects.toMatchObject({code:'FACTS_CHANGED'});
 });
 it('atomically binds each new revision and detects room changes before review/publication without rewriting history',async()=>{
  const boundFacts=new CanonicalMarketingFacts(fixture.pool);
  const service=new MarketingWorkflowService(fixture.pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:new WorkflowFinance(fixture.pool,workflowConfig,new CampaignPaymentGateway(fixture.pool,{origin:workflowConfig.origin})),publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:[],
   bindProduct:(c,actor,listing)=>boundFacts.bindDedicated(c,actor,listing),verifyProduct:(c,actor,product)=>boundFacts.verifyProduct(c,actor,product)});
  const row=await service.create(host,workflowDraft(),'bound-product-draft');
  await expect(inTransaction(fixture.pool,host,c=>service.assertCurrentListing(c,row,host))).resolves.toBeUndefined();
  const product=row.listing_snapshot.marketingProduct;expect(product).toMatchObject({kind:'DEDICATED_STAY',listingId:20,canonicalPath:'/stay/garden-villa-20'});
  expect((await fixture.pool.query('SELECT contract FROM marketing_revision_products')).rows).toEqual([{contract:product}]);
  await expect(inTransaction(runtime,{id:90,role:'system'},c=>boundFacts.verifyProduct(c,{id:10,role:'system'},product))).resolves.toMatchObject({id:product.factSnapshotId});
  await expect(inTransaction(runtime,{id:90,role:'system'},c=>boundFacts.verifyProduct(c,{id:90,role:'system'},product))).resolves.toMatchObject({id:product.factSnapshotId});
  expect(await inTransaction(runtime,other,c=>c.query('SELECT * FROM marketing_revision_products'))).toMatchObject({rowCount:0});
  await fixture.pool.query("UPDATE room_types SET description='A different room description' WHERE id=30");
  await expect(inTransaction(fixture.pool,host,c=>service.assertCurrentListing(c,row,host))).rejects.toMatchObject({code:'FACTS_CHANGED'});
  const updated=await service.update(row.campaign_id,host,1,workflowDraft());expect(updated.listing_snapshot.marketingProduct.factHash).not.toBe(product.factHash);
  expect((await fixture.pool.query('SELECT revision FROM marketing_revision_products ORDER BY revision')).rows).toEqual([{revision:1},{revision:2}]);
  await expect(fixture.pool.query('DELETE FROM marketing_revision_products')).rejects.toThrow(/append-only/);
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_reservations')).rows).toHaveLength(0);
 });
 it('keeps product and contribution contracts distinct and refuses cross-subsidy claims',async()=>{
  const snapshot=await capture();
  expect(productSchema.parse({version:1,kind:'DEDICATED_STAY',listingId:20,canonicalPath:'/stay/garden-villa-20',factSnapshotId:snapshot.id,factHash:snapshot.fact_hash}).kind).toBe('DEDICATED_STAY');
  expect(productSchema.safeParse({version:1,kind:'DESTINATION_POOL',listingId:20}).success).toBe(false);
  const contribution={version:1,membershipId:snapshot.id,acceptedQuoteId:snapshot.id,reservationId:snapshot.id,hostId:10,currency:'INR',authorizedMinor:'50000',policyVersion:1,allocationUnit:'COLLECTION_EXPOSURE',providerImpressionGuarantee:false,transferable:false};
  expect(poolContributionSchema.parse(contribution).transferable).toBe(false);
  for(const invalid of [{...contribution,transferable:true},{...contribution,providerImpressionGuarantee:true},{...contribution,allocationUnit:'GUARANTEED_AD_IMPRESSIONS'}])expect(poolContributionSchema.safeParse(invalid).success).toBe(false);
 });
});
