import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import express from 'express';
import request from 'supertest';
import {MarketingAttributionLinks} from '../../lib/marketing/portfolio/attribution.js';
import {MarketingTouchpoints} from '../../lib/marketing/portfolio/touchpoints.js';
import {createMeasurementRouter} from '../../server/marketing/measurementRouter.js';
import {createWorkflowPgFixture,workflowConfig,workflowDraft} from './workflowPgFixture.js';
import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import {inTransaction} from '../../lib/marketing/database.js';
const origin='https://encho.example',admin={id:90,role:'system' as const};
describe('RFC-M1 explicit consent and scoped visit evidence',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtime:pg.Pool,links:MarketingAttributionLinks,service:MarketingTouchpoints,workflow:MarketingWorkflowService;
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();for(const file of ['027_marketing_attribution_links.sql','028_marketing_consent_touchpoints.sql'])await fixture.pool.query(readFileSync('src/migrations/'+file,'utf8'));
  await fixture.pool.query(`CREATE ROLE consent_runtime LOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO consent_runtime;GRANT SELECT ON users,listings,marketing_campaign_workflows TO consent_runtime;GRANT SELECT,INSERT ON marketing_attribution_links,marketing_measurement_consents,marketing_attribution_touchpoints TO consent_runtime;GRANT SELECT,INSERT,DELETE ON marketing_measurement_payloads TO consent_runtime;GRANT USAGE ON SEQUENCE marketing_measurement_consents_sequence_seq TO consent_runtime`);
  runtime=new pg.Pool({...fixture.pool.options,user:'consent_runtime',max:5});links=new MarketingAttributionLinks(runtime,admin,origin,{active:'test',keys:{test:Buffer.alloc(32,3).toString('base64url')}});service=new MarketingTouchpoints(runtime,admin,links);
  workflow=new MarketingWorkflowService(fixture.pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:new WorkflowFinance(fixture.pool,workflowConfig,new CampaignPaymentGateway(fixture.pool,{origin})),publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:[]});
 });
 beforeEach(async()=>{await fixture.reset();});afterAll(async()=>{await runtime?.end();await fixture?.close();});
 async function visit(){const campaign=await workflow.create({id:10,role:'host'},workflowDraft()),url=new URL(await links.issue(campaign.campaign_id,1));return {eventId:randomUUID(),token:url.searchParams.get('enc_ref')!,path:url.pathname,disclosureVersion:'encho-measurement-v1',measurement:true,adUserData:false,personalization:false,parameters:{gclid:'observed-click'}};}
 it('accepts only a signed campaign visit and does not grant provider advertising consent implicitly',async()=>{
  const body=await visit();await expect(service.record({...body,measurement:false},undefined,'browser')).rejects.toThrow();
  await expect(service.record({...body,path:'/stay/another-property'},undefined,'browser')).rejects.toMatchObject({code:'ATTRIBUTION_INVALID'});
  const recorded=await service.record(body,undefined,'browser'),view=await service.current(recorded.cookie,body.eventId);
  expect(view).toMatchObject({measurement:true,ad_user_data:false,personalization:false,observed_parameters:{},host_id:10,listing_id:20});
  expect(recorded.receipt).not.toHaveProperty('campaign_id');
  expect((await fixture.pool.query('SELECT * FROM marketing_finance_journals')).rowCount).toBe(0);
 });
 it('serializes retries without regranting revoked consent or accepting another visitor',async()=>{
  const body=await visit(),cookie=links.createVisitor();await Promise.all(Array.from({length:8},()=>service.record(body,cookie,'browser')));
  expect((await fixture.pool.query('SELECT * FROM marketing_attribution_touchpoints')).rowCount).toBe(1);
  await expect(service.record(body,links.createVisitor(),'browser')).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await service.revoke(cookie,randomUUID());await service.record(body,cookie,'browser');
  await expect(service.current(cookie,body.eventId)).rejects.toMatchObject({code:'CONVERSION_CONSENT_REQUIRED'});
  await expect(service.current(links.createVisitor(),body.eventId)).rejects.toMatchObject({code:'CONVERSION_CONSENT_REQUIRED'});
 });
 it('enforces RLS, immutable consent history and authenticates visitor cookies',async()=>{
  const body=await visit(),result=await service.record(body,undefined,'browser');
  for(const table of ['marketing_measurement_consents','marketing_attribution_touchpoints'])expect((await inTransaction(runtime,{id:10,role:'host'},c=>c.query(`SELECT * FROM ${table}`))).rowCount).toBe(0);
  await expect(fixture.pool.query('UPDATE marketing_measurement_consents SET measurement=false')).rejects.toThrow(/append-only/);
  await expect(service.current(result.cookie+'x',body.eventId)).rejects.toThrow();
  await expect(service.record({...body,eventId:randomUUID(),personalization:true},result.cookie,'browser')).rejects.toMatchObject({code:'CONSENT_INVALID'});
 });
 it('erases optional browser identifiers on withdrawal and expires bounded payload batches',async()=>{
  const body={...await visit(),adUserData:true},cookie=links.createVisitor();await service.record(body,cookie,'browser');
  expect((await fixture.pool.query('SELECT * FROM marketing_measurement_payloads')).rowCount).toBe(1);
  await service.revoke(cookie,randomUUID());expect((await fixture.pool.query('SELECT * FROM marketing_measurement_payloads')).rowCount).toBe(0);
  await service.record({...body,eventId:randomUUID()},cookie,'browser');
  await fixture.pool.query("UPDATE marketing_measurement_payloads SET expires_at=now()-interval '1 second'");
  expect(await service.purgeExpired()).toBe(1);expect(await service.purgeExpired()).toBe(0);
  expect((await fixture.pool.query('SELECT * FROM marketing_attribution_touchpoints')).rowCount).toBe(2);
  await expect(inTransaction(runtime,{id:10,role:'host'},c=>c.query('DELETE FROM marketing_measurement_payloads'))).resolves.toMatchObject({rowCount:0});
 });
 it('requires same-origin JSON, issues a secure first-party cookie and offers withdrawal',async()=>{
  const app=express();app.use(express.json());app.use('/measurement',createMeasurementRouter(origin,service));app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.status??500).json({code:err.code}));
  const body=await visit();expect((await request(app).post('/measurement/visit').set('Origin','https://attacker.example').send(body)).status).toBe(403);
  expect((await request(app).post('/measurement/visit').set('Origin',origin).send(body)).status).toBe(409);
  const session=await request(app).post('/measurement/session').set('Origin',origin).send({});const identity=String(session.headers['set-cookie'][0]).split(';')[0];
  expect((await fixture.pool.query('SELECT * FROM marketing_attribution_touchpoints')).rowCount).toBe(0);
  const accepted=await request(app).post('/measurement/visit').set('Origin',origin).set('Cookie',identity).send(body);expect(accepted.status).toBe(201);
  const retry=await request(app).post('/measurement/visit').set('Origin',origin).set('Cookie',identity).send(body);expect(retry.body.duplicate).toBe(true);
  const cookie=String(accepted.headers['set-cookie'][0]);expect(cookie).toMatch(/__Host-encho_measurement=/);for(const flag of ['HttpOnly','Secure','SameSite=Lax','Path=/'])expect(cookie).toContain(flag);
  expect((await request(app).post('/measurement/revoke').set('Origin',origin).set('Cookie',cookie.split(';')[0]).send({requestId:randomUUID()})).status).toBe(200);
 });
});
