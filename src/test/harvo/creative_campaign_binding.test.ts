import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createWorkflowPgFixture,workflowDraft} from './workflowPgFixture.js';
import {MarketingWorkflowService,type WorkflowFinancePort} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {fingerprint,draftSchema,type CampaignCreativeEvidence} from '../../lib/marketing/domain.js';
import {inTransaction} from '../../lib/marketing/database.js';

const host={id:10,role:'host' as const},admin={id:90,role:'admin' as const};
const derivative:CampaignCreativeEvidence={derivativeId:'b77ad911-b37b-418d-b4dd-3a66b0b00e89',sourceAssetId:'100',manifestHash:'a'.repeat(64),outputHash:'b'.repeat(64),url:'https://media.encho.example/harvo/reviewed-image.jpg',originalSourceUrl:'https://media.encho.example/villa.jpg'};
const selection={creativeDerivativeId:derivative.derivativeId,creativeManifestHash:derivative.manifestHash};
describe('Campaign binding to trusted reviewed derivative evidence',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>;
 beforeAll(async()=>{fixture=await createWorkflowPgFixture();});afterAll(async()=>fixture?.close());beforeEach(async()=>fixture.reset());
 function setup(){
  const ai=new CampaignAiReviewer({mediaOrigins:new Set()}),resolve=vi.fn(async()=>structuredClone(derivative));
  const evaluate=vi.spyOn(ai,'evaluate').mockImplementation(async(draft,listing,revision)=>({status:'PASSED',score:8.5,notes:['Isolated reviewed-pixel fixture.'],evaluatedAt:new Date().toISOString(),revision,evidenceHash:fingerprint({draft,listing}),mediaReviewed:['100'],model:'isolated-fixture'}));
  const service=new MarketingWorkflowService(fixture.pool,{ai,resolveCreative:resolve,finance:{} as WorkflowFinancePort,publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:[]});
  return {service,resolve,evaluate};
 }
 it('rejects missing authority, unmatched hashes and request-body approval flags before creating a campaign',async()=>{
  const {service}=setup();delete service.options.resolveCreative;
  await expect(service.create(host,workflowDraft(selection),'missing-creative-authority')).rejects.toMatchObject({code:'CREATIVE_NOT_CONFIGURED'});
  expect((await fixture.pool.query('SELECT * FROM host_marketing_campaigns')).rows).toEqual([]);
  expect(draftSchema.safeParse(workflowDraft({creativeDerivativeId:derivative.derivativeId})).success).toBe(false);
  expect(draftSchema.safeParse(workflowDraft({...selection,creativeApproved:true})).success).toBe(false);
  expect(draftSchema.safeParse(workflowDraft({...selection,provider:'GOOGLE'})).success).toBe(false);
 });
 it('preserves original property evidence while AI and the immutable revision identify the reviewed variant',async()=>{
  const {service,evaluate}=setup();const row=await service.create(host,workflowDraft(selection),'reviewed-variant');
  expect(row.listing_snapshot.media[0].url).toBe(derivative.originalSourceUrl);expect(row.listing_snapshot.campaignCreative).toEqual(derivative);
  const {campaignCreative,...original}=row.listing_snapshot;expect(row.listing_hash).toBe(fingerprint(original));
  await service.evaluate(row.campaign_id,host,1);
  expect(evaluate.mock.calls[0][1].media[0].url).toBe(derivative.url);expect(evaluate.mock.calls[0][0]).toMatchObject(selection);
  const history=(await fixture.pool.query('SELECT listing_snapshot FROM marketing_campaign_revisions WHERE campaign_id=$1',[row.campaign_id])).rows[0];expect(history.listing_snapshot.campaignCreative).toEqual(derivative);
  expect((await fixture.pool.query('SELECT url FROM media_assets WHERE id=100')).rows[0].url).toBe(derivative.originalSourceUrl);
 });
 it('rechecks variant approval before human approval and before dispatch; original approval cannot mask drift',async()=>{
  const {service,resolve}=setup();const row=await service.create(host,workflowDraft(selection),'drifting-variant');await service.evaluate(row.campaign_id,host,1);
  resolve.mockResolvedValue({...derivative,outputHash:'c'.repeat(64)});
  await expect(service.review(row.campaign_id,admin,{revision:1,decision:'APPROVE',note:'Independent exact revision review.',policyConfirmed:true,mediaConfirmed:true})).rejects.toMatchObject({code:'CREATIVE_EVIDENCE_CHANGED'});
  await expect(inTransaction(fixture.pool,host,c=>service.assertCurrentListing(c,row,host))).rejects.toMatchObject({code:'CREATIVE_EVIDENCE_CHANGED'});
  expect((await service.get(row.campaign_id,host)).content_approval.status).toBe('PENDING');
 });
 it('refuses a trusted-port response bound to another original asset, and resets approval when a host removes a variant',async()=>{
  const {service,resolve}=setup();resolve.mockResolvedValueOnce({...derivative,sourceAssetId:'101'});
  await expect(service.create(host,workflowDraft(selection),'wrong-source')).rejects.toMatchObject({code:'CREATIVE_EVIDENCE_MISMATCH'});
  const row=await service.create(host,workflowDraft(selection),'remove-variant');await service.evaluate(row.campaign_id,host,1);await service.review(row.campaign_id,admin,{revision:1,decision:'APPROVE',note:'Independent exact revision review.',policyConfirmed:true,mediaConfirmed:true});
  const updated=await service.update(row.campaign_id,host,1,workflowDraft());
  expect(updated.revision).toBe(2);expect(updated.listing_snapshot.campaignCreative).toBeUndefined();expect(updated.ai.status).toBe('NOT_EVALUATED');expect(updated.content_approval.status).toBe('PENDING');
 });
});
