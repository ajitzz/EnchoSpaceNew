import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import {workflowConfig,workflowDraft} from './workflowPgFixture.js';
import {afterAll,beforeAll,beforeEach,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import pg from 'pg';
import {createWorkflowPgFixture} from './workflowPgFixture.js';
import {inTransaction} from '../../lib/marketing/database.js';
import {CanonicalMarketingFacts} from '../../lib/marketing/portfolio/facts.js';
import {SpatialStories} from '../../lib/marketing/portfolio/spatialStories.js';
import {CreativeWorkflowService} from '../../lib/marketing/creativeWorkflow.js';
import {CampaignImagePreparer} from '../../lib/marketing/creativeImages.js';
import {spatialSections,spatialStoryCopy} from '../../shared/marketingStory.js';
import {buildGoogleSearchPlan} from '../../lib/providers/google/GoogleSearchPlan.js';
import {buildMetaCampaignPlan} from '../../lib/providers/meta/MetaCampaignPlan.js';
import {request as googleRequest,customer,origin as googleOrigin} from './googleProviderFixture.js';
import {request as metaRequest,origin as metaOrigin} from './metaProviderFixture.js';
import type {Actor} from '../../lib/marketing/domain.js';
const host:Actor={id:10,role:'host'},other:Actor={id:11,role:'host'},admin:Actor={id:90,role:'admin'};

describe('reviewed spatial creative: exact property facts, real prepared image bytes and tenant boundaries',()=>{
  let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtime:pg.Pool,facts:CanonicalMarketingFacts,stories:SpatialStories,creative:CreativeWorkflowService;
  beforeAll(async()=>{
    fixture=await createWorkflowPgFixture();
    await fixture.pool.query('ALTER TABLE listings ADD COLUMN amenities JSONB;ALTER TABLE room_types ADD COLUMN name TEXT,ADD COLUMN description TEXT,ADD COLUMN amenities JSONB');
    for(const name of ['014_harvo_marketing_request_limits.sql','015_harvo_marketing_creative_review.sql','023_marketing_product_facts.sql','030_marketing_spatial_stories.sql'])await fixture.pool.query(readFileSync(`src/migrations/${name}`,'utf8'));
    await fixture.pool.query(`CREATE ROLE story_runtime LOGIN NOSUPERUSER NOBYPASSRLS;GRANT USAGE ON SCHEMA public TO story_runtime;
      GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO story_runtime;GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO story_runtime;`);
    runtime=new pg.Pool({...fixture.pool.options,user:'story_runtime'});
    const source=await sharp({create:{width:1200,height:1200,channels:3,background:'#ddeedd'}}).jpeg().toBuffer();
    const stored=new Map<string,Buffer>();
    creative=new CreativeWorkflowService(runtime,{serviceActor:{id:90,role:'system'},preparer:new CampaignImagePreparer({allowedOrigins:new Set(['https://media.encho.example']),loadImage:async()=>({data:source,mimeType:'image/jpeg',width:1200,height:1200})}),
      storage:{put:async image=>{const url=`https://cdn.encho.co.in/${image.manifestHash}.jpg`;stored.set(url,image.bytes);return {status:'STORED',manifest:image.manifest,manifestHash:image.manifestHash,url,image:{key:'image',checksumSha256:createHash('sha256').update(image.bytes).digest('base64'),versionId:null},provenance:{key:'manifest',checksumSha256:'fixture',versionId:null},reviewRequired:true,providerApproved:false,cdnAccessibilityVerified:false};}},
      verifyCdn:async input=>{expect(createHash('sha256').update(stored.get(input.url)!).digest('hex')).toBe(input.sha256);}});
    facts=new CanonicalMarketingFacts(runtime,(c,actor,input)=>creative.resolveForCampaign(c,actor,input));
    stories=new SpatialStories(runtime,facts,creative,admin);
  });
  beforeEach(async()=>{
    await fixture.reset();
    await fixture.pool.query(`UPDATE listings SET amenities='["Garden","Terrace","Pool","Dining room"]' WHERE id=20;
      INSERT INTO media_assets(id,entity_type,entity_id,url,category,moderation_status) VALUES(103,'listing',20,'https://media.encho.example/a.jpg','image','approved'),(104,'listing',20,'https://media.encho.example/b.jpg','image','approved'),(105,'listing',20,'https://media.encho.example/c.jpg','image','approved')`);
  });
  afterAll(async()=>{await runtime?.end();await fixture?.close();});
  async function input(){
    for(const sourceAssetId of ['100','103','104','105'])await creative.request(host,{listingId:20,sourceAssetId,formats:sourceAssetId==='100'?['SQUARE','LANDSCAPE']:['SQUARE'],rightsConfirmed:true},`prepare-story-${sourceAssetId}`);
    for(let i=0;i<5;i++)expect(await creative.runOnce()).toMatchObject({state:'HOST_REVIEW'});
    const records=(await creative.list(host,{limit:20})).items;
    for(const image of records){await creative.confirm(host,image.id,{manifestHash:image.manifestHash,rightsConfirmed:true,appearanceConfirmed:true});await creative.review(admin,image.id,{manifestHash:image.manifestHash,decision:'APPROVE',appearanceConfirmed:true,note:'Reviewed the exact source and provider image canvas.'});}
    const p=await facts.preview(host,20),select=(image:any)=>({sourceAssetId:image.sourceAssetId,derivativeId:image.id,manifestHash:image.manifestHash});
    return {listingId:20,factHash:p.factHash,rightsConfirmed:true,cards:spatialSections.map((section,index)=>({section,factId:p.facts.filter(f=>f.field==='amenity')[index].id,image:select(records.find(r=>r.sourceAssetId===['100','103','104','105'][index]&&r.format==='SQUARE'))})),landscapeImage:select(records.find(r=>r.format==='LANDSCAPE'))};
  }
  async function approve(story:any){return stories.review(admin,story.id,{manifestHash:story.manifestHash,decision:'APPROVE',reason:'Each selected photograph corresponds to its exact listing fact and section.',spatialAccuracyConfirmed:true},'review-approved-story');}
  it('records one immutable manifest under concurrent host requests and refuses invented or duplicated labels',async()=>{
    const body=await input(),created=await Promise.all(Array.from({length:4},()=>stories.capture(host,body,'capture-story-evidence')));
    expect(new Set(created.map(s=>s.id)).size).toBe(1);
    expect(created[0].manifest.cards.map(c=>c.title)).toEqual(['Dining room','Garden','Pool','Terrace']);
    await expect(stories.capture(host,{...body,cards:body.cards.map((c,i)=>i?c:{...c,title:'Royal suite'})},'invented-description')).rejects.toThrow();
    await expect(stories.capture(host,{...body,cards:body.cards.map(c=>({...c,factId:body.cards[0].factId}))},'duplicate-fact-values')).rejects.toThrow();
    await expect(fixture.pool.query('UPDATE marketing_spatial_stories SET manifest_hash=repeat(\'a\',64)')).rejects.toThrow(/append-only/);
    expect(await stories.publicStory('garden-villa-20')).toBeNull();
    await approve(created[0]);
    const publicStory=await stories.publicStory('garden-villa-20');expect(publicStory?.cards).toHaveLength(4);expect(JSON.stringify(publicStory)).not.toMatch(/hostId|manifestHash|factId|sourceAssetId/);
  });
  it('enforces ownership, independent review and revocation without deleting historical evidence',async()=>{
    const story=await stories.capture(host,await input(),'owner-story-evidence');
    await expect(stories.list(other,20)).rejects.toMatchObject({code:'LISTING_NOT_AVAILABLE'});
    await expect(stories.review(host,story.id,{manifestHash:story.manifestHash,decision:'APPROVE',reason:'Host attempted to self-approve own creative.',spatialAccuracyConfirmed:true},'host-review-forged')).rejects.toMatchObject({code:'STORY_ACCESS_DENIED'});
    expect((await inTransaction(runtime,other,c=>c.query('SELECT * FROM marketing_spatial_stories'))).rows).toEqual([]);
    await approve(story);
    await stories.review(admin,story.id,{manifestHash:story.manifestHash,decision:'REVOKE',reason:'The image section assignment requires another editorial check.',spatialAccuracyConfirmed:true},'withdraw-story-review');
    expect(await stories.publicStory('garden-villa-20')).toBeNull();
    await expect(stories.verifyDelivery(host,story)).rejects.toMatchObject({code:'STORY_NOT_APPROVED'});
    expect((await fixture.pool.query('SELECT count(*)::int AS n FROM marketing_spatial_story_reviews')).rows[0].n).toBe(2);
  });
  it('invalidates stale facts and refuses tampered provider captions or image bytes',async()=>{
    const story=await stories.capture(host,await input(),'provider-story-evidence');await approve(story);
    const request=googleRequest(),wire=await stories.compile(host,story,'GOOGLE',async()=>request.creativeAssets.landingPageUrl);
    const copy=spatialStoryCopy('GOOGLE');Object.assign(request.creativeAssets,{headline:copy.headline,description:copy.description});Object.assign(request.metadata!.googleSearch,copy.googleSearch);request.listingId=20;request.hostId=10;request.metadata!.spatialCreative=wire;
    await expect(inTransaction(runtime,host,c=>stories.verifyPayload(c,host,request,story,async()=>{}))).resolves.toBeUndefined();
    request.metadata!.spatialCreative={...wire,cards:wire.cards.map((c,i)=>i?c:{...c,title:'Invented Infinity Pool'})};
    await expect(inTransaction(runtime,host,c=>stories.verifyPayload(c,host,request,story,async()=>{}))).rejects.toMatchObject({code:'STORY_EVIDENCE_CHANGED'});
    request.metadata!.spatialCreative={...wire,images:wire.images.map((image,i)=>i?image:{...image,data:Buffer.from('tampered').toString('base64')})};
    await expect(inTransaction(runtime,host,c=>stories.verifyPayload(c,host,request,story,async()=>{}))).rejects.toThrow('SPATIAL_IMAGE_INVALID');
    await fixture.pool.query("UPDATE listings SET amenities='[\"Garden\"]' WHERE id=20");
    await expect(stories.verifyDelivery(host,story)).rejects.toMatchObject({code:'FACTS_CHANGED'});
    expect(await stories.publicStory('garden-villa-20')).toBeNull();
  });
  it('binds primary framing as well as card labels, rejecting invented headline claims',async()=>{
    const story=await stories.capture(host,await input(),'story-copy-evidence');await approve(story);
    const workflow=new MarketingWorkflowService(fixture.pool,{resolveStory:(c,actor,draft)=>stories.resolve(c,actor,draft.listingId,story.id,story.manifestHash),ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:new WorkflowFinance(fixture.pool,workflowConfig,new CampaignPaymentGateway(fixture.pool,{origin:workflowConfig.origin})),fundingEnabled:false,publishingEnabled:false,activationEnabled:false,configurationReasons:[]});
    const draft=workflowDraft({...spatialStoryCopy('META'),mediaIds:['100','103','104','105'],spatialStoryId:story.id,spatialStoryHash:story.manifestHash});
    await expect(workflow.create(host,{...draft,headline:'Guaranteed luxury infinity pool'})).rejects.toMatchObject({code:'STORY_COPY_CHANGED'});
    expect((await workflow.create(host,draft)).listing_snapshot.spatialStory.manifestHash).toBe(story.manifestHash);
  });
  it('compiles four ordered Meta cards and four Google sitelinks plus two exact image uploads',async()=>{
    const story=await stories.capture(host,await input(),'compiled-story-evidence');await approve(story);
    const google=googleRequest();google.metadata!.spatialCreative=await stories.compile(host,story,'GOOGLE',async()=>google.creativeAssets.landingPageUrl);
    const plan=buildGoogleSearchPlan(google,customer,googleOrigin);
    expect(plan.operations.slice(plan.assetStart)).toHaveLength(12);
    expect(plan.expectedResourceTypes.slice(plan.assetStart)).toEqual(Array.from({length:6},()=>['assets','campaignAssets']).flat());
    const assetOps=plan.operations.filter(op=>'assetOperation' in op) as any[];
    expect(assetOps.slice(0,4).map(op=>op.assetOperation.create.sitelinkAsset.linkText)).toEqual(story.manifest.cards.map(c=>c.title));
    expect(assetOps[4].assetOperation.create.imageAsset.data).toBe(google.metadata!.spatialCreative.images[0].data);
    const meta=metaRequest();meta.metadata!.spatialCreative=await stories.compile(host,story,'META',async()=>meta.creativeAssets.landingPageUrl);
    const compiled=buildMetaCampaignPlan(meta,metaOrigin,{accountId:'act_1001',pageId:'2001',pixelId:'3001',instagramId:'4001'}).creative();
    const link=(compiled.object_story_spec as any).link_data;
    expect(link.child_attachments).toHaveLength(4);expect(link.multi_share_optimized).toBe(false);expect(link.multi_share_end_card).toBe(false);
    expect(link.child_attachments.map((card:any)=>new URL(card.link).hash)).toEqual(spatialSections.map(s=>`#${s}`));
    expect(link).not.toHaveProperty('picture');
  });
});
