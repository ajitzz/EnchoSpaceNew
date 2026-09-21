import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createWorkflowPgFixture,workflowDraft,workflowConfig} from './workflowPgFixture.js';
import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {CampaignStrategyBindings} from '../../lib/marketing/adtech/bindings.js';
import {FeederCorridorResolver} from '../../lib/marketing/adtech/corridors.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {fingerprint} from '../../lib/marketing/domain.js';
let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,service:MarketingWorkflowService,selection:any;
const host={id:10,role:'host'} as const,admin={id:90,role:'admin'} as const;
beforeAll(async()=>{
 fixture=await createWorkflowPgFixture();await fixture.reset();
 await fixture.pool.query(`ALTER TABLE listings ADD COLUMN rental_mode TEXT DEFAULT 'entire_place';UPDATE listings SET city='Wayanad',price=3500 WHERE id=20;
 CREATE TABLE admin_audit_logs(id SERIAL PRIMARY KEY,admin_id INT REFERENCES users,entity_type TEXT,entity_id INT,action TEXT,previous_state JSONB,new_state JSONB,created_at TIMESTAMPTZ DEFAULT now());`);
 const c=await fixture.pool.connect();try{await c.query('BEGIN');for(const file of ['032_marketing_adtech_registry.sql','033_marketing_adtech_corridors.sql','034_marketing_adtech_bindings.sql'])await c.query(readFileSync('src/migrations/'+file,'utf8'));await c.query('COMMIT');}finally{c.release();}
 const base={provider:'META',apiVersion:'v26.0',country:'IN',verifiedAt:'2026-09-22T00:00:00.000Z'},raw=[{...base,kind:'PROVIDER_CITY_RADIUS',label:'Bengaluru',providerKey:'100',latitude:12.97,longitude:77.59,radiusKm:30},{...base,kind:'PROVIDER_REGION_EXCLUSION',label:'Wayanad',providerKey:'200',administrativeLevel:'DISTRICT'}];
 const geo=raw.map(e=>({...e,evidenceHash:fingerprint(e)})),adapter={search:async()=>[],resolve:async(input:any)=>geo[input.kind==='PROVIDER_CITY_RADIUS'?0:1] as any};
 const corridors=new FeederCorridorResolver(fixture.pool,{META:adapter,GOOGLE:adapter});const version=await corridors.save(admin,1,{tier:'BUDGET',provider:'META',expectedVersion:0,entries:[{kind:'PROVIDER_CITY_RADIUS',query:'Bengaluru',providerKey:'100',radiusKm:30},{kind:'PROVIDER_REGION_EXCLUSION',query:'Wayanad',providerKey:'200'}],reason:'Synthetic exact geography for transactional workflow test.'},'atomic-corridor-save');
 await corridors.publish(admin,1,{versionId:version.id,expectedVersionId:null,reason:'Publish fixture corridor for workflow transaction testing.'},'atomic-corridor-publish');
 const strategies=new CampaignStrategyBindings(fixture.pool,admin,true);selection=(await strategies.defaults(host,20,'META')).selection;
 service=new MarketingWorkflowService(fixture.pool,{strategies,ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:new WorkflowFinance(fixture.pool,workflowConfig,{} as any),publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:[]});
});
afterAll(async()=>{await fixture?.close();});
it('commits one parent, revision and strategy together and replays creation without duplicates',async()=>{
 const input=workflowDraft({locations:['Bengaluru'],strategySelection:selection});const first=await service.create(host,input,'atomic-draft-create'),again=await service.create(host,input,'atomic-draft-create');expect(again.campaign_id).toBe(first.campaign_id);
 for(const table of ['host_marketing_campaigns','marketing_campaign_workflows','marketing_campaign_revisions','marketing_campaign_strategy_bindings'])expect((await fixture.pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(1);
 const row=await service.get(first.campaign_id,host);expect(row.adtechStrategy.price.amountMinor).toBe('350000');
 const projected=await service.project(row);expect(JSON.stringify(projected)).not.toContain('providerKey');expect(projected).not.toHaveProperty('adtechStrategy');
});
it('rolls back parent, draft receipt and revision when strategy resolution fails',async()=>{
 const input=workflowDraft({locations:['Bengaluru'],strategySelection:{...selection,priceHash:'f'.repeat(64)}});
 await expect(service.create(host,input,'atomic-draft-failure')).rejects.toMatchObject({code:'STRATEGY_DEFAULTS_CHANGED'});
 for(const table of ['host_marketing_campaigns','marketing_campaign_workflows','marketing_campaign_revisions','marketing_campaign_strategy_bindings'])expect((await fixture.pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(1);
 expect((await fixture.pool.query("SELECT * FROM marketing_create_requests WHERE request_key='atomic-draft-failure'")).rowCount).toBe(0);
});
