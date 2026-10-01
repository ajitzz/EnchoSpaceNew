import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createWorkflowPgFixture,workflowConfig,workflowDraft} from './workflowPgFixture.js';
import {installInquirySchema} from './inquiryPgSchema.js';
import {MarketingWorkflowService} from '../../lib/marketing/workflow.js';
import {CampaignAiReviewer} from '../../lib/marketing/ai.js';
import {WorkflowFinance} from '../../lib/marketing/financeBridge.js';
import {CampaignPaymentGateway} from '../../lib/marketing/payments.js';
import {MarketingAttributionLinks} from '../../lib/marketing/portfolio/attribution.js';
import {MarketingTouchpoints} from '../../lib/marketing/portfolio/touchpoints.js';
import {CampaignOutcomes} from '../../lib/marketing/portfolio/outcomes.js';
import {InquiryInbox} from '../../lib/marketing/inquiryInbox.js';
import {inTransaction} from '../../lib/marketing/database.js';
const admin={id:90,role:'system' as const},host={id:10,role:'host' as const},guest={id:11,role:'host' as const},origin='https://encho.example';
describe('SP7 first-party inquiry authority and tenant rollups',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtime:pg.Pool,workflow:MarketingWorkflowService,inbox:InquiryInbox,touchpoints:MarketingTouchpoints,links:MarketingAttributionLinks,outcomes:CampaignOutcomes;
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();await installInquirySchema(fixture.pool);
  for(const name of ['011_harvo_marketing_measurement.sql','027_marketing_attribution_links.sql','028_marketing_consent_touchpoints.sql','029_marketing_destination_pools.sql','031_marketing_inquiry_attribution.sql'])await fixture.pool.query(readFileSync('src/migrations/'+name,'utf8'));
  await fixture.pool.query(`CREATE ROLE inquiry_runtime LOGIN NOSUPERUSER NOBYPASSRLS;GRANT USAGE ON SCHEMA public TO inquiry_runtime;
   GRANT SELECT ON users,listings,experiences,marketing_campaign_workflows,marketing_attribution_links,marketing_booking_measurements,marketing_pool_memberships TO inquiry_runtime;
   GRANT SELECT,INSERT,UPDATE ON threads,messages TO inquiry_runtime;
   GRANT SELECT,INSERT,DELETE ON marketing_measurement_payloads TO inquiry_runtime;
   GRANT SELECT,INSERT ON marketing_attribution_links,marketing_attribution_touchpoints,marketing_measurement_consents,marketing_inquiry_attributions TO inquiry_runtime;
   GRANT USAGE ON SEQUENCE threads_id_seq,messages_id_seq,marketing_measurement_consents_sequence_seq TO inquiry_runtime;`);
  runtime=new pg.Pool({...fixture.pool.options,user:'inquiry_runtime',max:8});
  links=new MarketingAttributionLinks(runtime,admin,origin,{active:'test',keys:{test:Buffer.alloc(32,8).toString('base64url')}});
  touchpoints=new MarketingTouchpoints(runtime,admin,links);
  inbox=new InquiryInbox(runtime,text=>({sanitized:text.replace('guest@example.com','[REDACTED]'),wasSanitized:text.includes('@')}),touchpoints);
  outcomes=new CampaignOutcomes(runtime,admin,true,false);
  workflow=new MarketingWorkflowService(fixture.pool,{ai:new CampaignAiReviewer({mediaOrigins:new Set()}),finance:new WorkflowFinance(fixture.pool,workflowConfig,new CampaignPaymentGateway(fixture.pool,{origin})),publishingEnabled:false,activationEnabled:false,fundingEnabled:false,configurationReasons:[]});
 });
 beforeEach(async()=>{await fixture.reset();});afterAll(async()=>{await runtime?.end();await fixture?.close();});
 async function visit(){const campaign=await workflow.create(host,workflowDraft()),url=new URL(await links.issue(campaign.campaign_id,1)),eventId=randomUUID();const recorded=await touchpoints.record({eventId,token:url.searchParams.get('enc_ref'),path:url.pathname,disclosureVersion:'encho-measurement-v1',measurement:true,adUserData:false,personalization:false,parameters:{}},undefined,'browser');return {campaignId:campaign.campaign_id,eventId,cookie:recorded.cookie};}
 it('derives listing ownership, rejects manufactured recipients and isolates message reads/writes',async()=>{
  await expect(inbox.create(guest,{listingId:20,hostId:90})).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
  await expect(inbox.create(guest,{listingId:99999})).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
  const threads=await Promise.all(Array.from({length:4},()=>inbox.create(guest,{listingId:20,hostId:10})));
  expect(new Set(threads.map(t=>t.id)).size).toBe(1);const thread=threads[0];
  await expect(inbox.send(guest,thread.id,{content:'Hello',receiverId:90})).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
  await inbox.send(guest,thread.id,{content:'Ask guest@example.com',receiverId:10});
  expect((await inbox.messages(host,thread.id))[0].content).toBe('Ask [REDACTED]');
  await expect(inbox.messages({id:90,role:'host'},thread.id)).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
  await expect(inbox.send({id:90,role:'host'},thread.id,{content:'Spoof'})).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
 });
 it('atomically deduplicates an offline replay and records one consented conversation without cross-host evidence',async()=>{
  const v=await visit(),thread=await inbox.create(guest,{listingId:20}),body={content:'Are these stay dates available?',receiverId:10,clientEventId:randomUUID(),measurementVisitId:v.eventId};
  const results=await Promise.all(Array.from({length:6},()=>inbox.send(guest,thread.id,body,v.cookie)));
  expect(new Set(results.map(r=>r.message.id)).size).toBe(1);
  expect((await fixture.pool.query('SELECT * FROM messages')).rowCount).toBe(1);
  expect((await fixture.pool.query('SELECT * FROM marketing_inquiry_attributions')).rowCount).toBe(1);
  await expect(inbox.send(guest,thread.id,{...body,content:'Changed'},v.cookie)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  const view=await outcomes.decorate(host,{campaigns:[{id:v.campaignId}]});
  expect(view.campaigns[0].firstPartyOutcomes).toMatchObject({propertyVisits:'1',inquiries:'1',unreadMessages:'1',bookings:null,completeness:'RECORDED_EVENTS_ONLY'});
  await expect(outcomes.decorate(guest,{campaigns:[{id:v.campaignId}]})).rejects.toMatchObject({code:'CAMPAIGN_NOT_FOUND'});
  expect((await inTransaction(runtime,guest,c=>c.query('SELECT * FROM marketing_inquiry_attributions'))).rowCount).toBe(0);
  await expect(fixture.pool.query('DELETE FROM marketing_inquiry_attributions')).rejects.toThrow(/append-only/);
  const history=await inbox.messages(host,thread.id);
  expect((await outcomes.decorate(host,{campaigns:[{id:v.campaignId}]})).campaigns[0].firstPartyOutcomes?.unreadMessages).toBe('1');
  await inbox.acknowledgeRead(host,thread.id,{throughMessageId:history.at(-1).id});
  expect((await outcomes.decorate(host,{campaigns:[{id:v.campaignId}]})).campaigns[0].firstPartyOutcomes?.unreadMessages).toBe('0');
 });
 it('does not attribute a revoked or other-visitor touchpoint and still permits legitimate messaging',async()=>{
  const v=await visit(),thread=await inbox.create(guest,{listingId:20});
  await inbox.send(guest,thread.id,{content:'Unrelated browser',measurementVisitId:v.eventId},links.createVisitor());
  await touchpoints.revoke(v.cookie,randomUUID());
  await inbox.send(guest,thread.id,{content:'Permission withdrawn',measurementVisitId:v.eventId},v.cookie);
  expect((await fixture.pool.query('SELECT * FROM marketing_inquiry_attributions')).rowCount).toBe(0);
  expect((await fixture.pool.query('SELECT * FROM messages')).rowCount).toBe(2);
 });
 it('paginates bounded history without revealing a non-participant conversation',async()=>{
  const thread=await inbox.create(guest,{listingId:20});
  await fixture.pool.query("INSERT INTO messages(thread_id,sender_id,receiver_id,content) SELECT $1,11,10,'History '||g FROM generate_series(1,205) g",[thread.id]);
  const recent=await inbox.messages(host,thread.id),older=await inbox.messages(host,thread.id,recent[0].id);
  expect(recent).toHaveLength(200);expect(older).toHaveLength(5);expect(older.at(-1).id).toBeLessThan(recent[0].id);
 });
 it('acknowledges only observed participant history and keeps later incoming messages unread',async()=>{
  const thread=await inbox.create(guest,{listingId:20});
  const first=await inbox.send(guest,thread.id,{content:'First question',clientEventId:randomUUID()});
  const second=await inbox.send(guest,thread.id,{content:'Second question',clientEventId:randomUUID()});
  await inbox.messages(host,thread.id);
  expect((await fixture.pool.query('SELECT count(*)::int AS unread FROM messages WHERE NOT is_read')).rows[0].unread).toBe(2);
  await expect(inbox.acknowledgeRead({id:90,role:'host'},thread.id,{throughMessageId:first.message.id})).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
  await expect(inbox.acknowledgeRead(host,thread.id,{throughMessageId:99999})).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
  const other=await inbox.create({id:90,role:'host'},{listingId:20});
  const foreign=await inbox.send({id:90,role:'host'},other.id,{content:'A different conversation',clientEventId:randomUUID()});
  await expect(inbox.acknowledgeRead(host,thread.id,{throughMessageId:foreign.message.id})).rejects.toMatchObject({code:'THREAD_NOT_FOUND'});
  expect(await inbox.acknowledgeRead(host,thread.id,{throughMessageId:first.message.id})).toMatchObject({unread:1});
  expect(await inbox.acknowledgeRead(host,thread.id,{throughMessageId:second.message.id})).toMatchObject({unread:0});
  expect(await inbox.acknowledgeRead(host,thread.id,{throughMessageId:first.message.id})).toMatchObject({unread:0});
 });
 it('counts distinct canonical booking identities for only the four visible flights and separates terminal states',async()=>{
  const flights=[];
  for(let index=0;index<4;index++)flights.push((await workflow.create(host,workflowDraft({title:`Flight ${index+1}`}))).campaign_id);
  const other=(await workflow.create(guest,workflowDraft({listingId:21,mediaIds:['101'],title:'Other host flight'}))).campaign_id;
  const insert=async(orderId:string,bookingId:string,campaignId:number,hostId:number,listingId:number,state:string,consentStatus:'GRANTED'|'REVOKED'='GRANTED')=>fixture.pool.query(`INSERT INTO marketing_booking_measurements
   (order_id,booking_id,campaign_id,host_id,listing_id,provider,external_campaign_id,currency,captured_minor,refunded_minor,state,sequence,canonical_evidence,consent_status,occurred_at)
   VALUES($1,$2,$3,$4,$5,'META',$6,'INR',100000,$7,$8,1,'{}'::jsonb,$9,now())`,
   [orderId,bookingId,campaignId,hostId,listingId,`external-${campaignId}`,state==='REFUNDED'?100000:0,state,consentStatus]);
  await insert('order-captured','booking-captured',flights[0],10,20,'CAPTURED');
  await insert('order-fulfilled','booking-fulfilled',flights[1],10,20,'FULFILLED');
  await insert('order-cancelled','booking-cancelled',flights[2],10,20,'CANCELLED');
  await insert('order-refunded','booking-refunded',flights[3],10,20,'REFUNDED');
  await insert('order-revoked','booking-revoked',flights[0],10,20,'CAPTURED','REVOKED');
  await insert('order-other','booking-other',other,11,21,'FULFILLED');
  await expect(insert('order-duplicate','booking-captured',flights[1],10,20,'CAPTURED')).rejects.toThrow(/duplicate key/);
  const canonical=new CampaignOutcomes(runtime,admin,true,true);
  const view=await canonical.decorate(host,{campaigns:flights.map(id=>({id}))});
  expect(view.portfolioOutcomes).toMatchObject({source:'CANONICAL_CHECKOUT',scope:'CURRENT_WORKSPACE_PAGE',completeness:'RECORDED_VERIFIED_EVENTS_ONLY',activeAttributedBookings:'2',capturedBookings:'1',fulfilledStays:'1',cancelledBookings:'1',refundedBookings:'1'});
  expect(view.campaigns).toMatchObject([{firstPartyOutcomes:{bookings:'1'}},{firstPartyOutcomes:{bookings:'1'}},{firstPartyOutcomes:{bookings:'0'}},{firstPartyOutcomes:{bookings:'0'}}]);
  expect((await canonical.decorate(host,{campaigns:[{id:flights[0]}]})).portfolioOutcomes?.activeAttributedBookings).toBe('1');
  expect((await canonical.decorate(host,{campaigns:[]})).portfolioOutcomes?.activeAttributedBookings).toBe('0');
  expect((await outcomes.decorate(host,{campaigns:flights.map(id=>({id}))})).portfolioOutcomes?.activeAttributedBookings).toBeNull();
  await expect(canonical.decorate(guest,{campaigns:[{id:flights[0]}]})).rejects.toMatchObject({code:'CAMPAIGN_NOT_FOUND'});
  expect((await canonical.decorate(guest,{campaigns:[{id:other}]})).portfolioOutcomes?.activeAttributedBookings).toBe('1');
 });
 it('projects later verified-booking rows and withdrawn consent without retaining attributed host counts',async()=>{
  const c1=(await workflow.create(host,workflowDraft({title:'R6-02 Active Flight 1'}))).campaign_id;
  const c2=(await workflow.create(host,workflowDraft({title:'R6-02 Active Flight 2'}))).campaign_id;
  const canonical=new CampaignOutcomes(runtime,admin,true,true);

  // 1. Initial state: visitor touchpoint and inquiry without booking
  const url=new URL(await links.issue(c1,1)),eventId=randomUUID();
  const recorded=await touchpoints.record({eventId,token:url.searchParams.get('enc_ref'),path:url.pathname,disclosureVersion:'encho-measurement-v1',measurement:true,adUserData:false,personalization:false,parameters:{}},undefined,'browser');
  const thread=await inbox.create(guest,{listingId:20});
  await inbox.send(guest,thread.id,{content:'Is this available next week?',receiverId:10,clientEventId:randomUUID(),measurementVisitId:eventId},recorded.cookie);

  let view=await canonical.decorate(host,{campaigns:[{id:c1},{id:c2}]});
  expect(view.portfolioOutcomes).toMatchObject({
   activeAttributedBookings:'0',
   capturedBookings:'0',
   fulfilledStays:'0',
   cancelledBookings:'0',
   refundedBookings:'0',
  });
  expect(view.campaigns[0].firstPartyOutcomes).toMatchObject({
   bookings:'0',
   inquiries:'1',
  });
  expect(view.campaigns[1].firstPartyOutcomes).toMatchObject({
   bookings:'0',
   inquiries:'0',
  });

  // Projection fixture only: this bypasses the canonical booking verifier and
  // conversion outbox, whose ingestion and export contracts need separate tests.
  const recordBooking=async(orderId:string,bookingId:string,campaignId:number,state:'CAPTURED'|'FULFILLED'|'CANCELLED'|'REFUNDED',consentStatus:'GRANTED'|'REVOKED'='GRANTED',seq=1)=>fixture.pool.query(
   `INSERT INTO marketing_booking_measurements
    (order_id,booking_id,campaign_id,host_id,listing_id,provider,external_campaign_id,currency,captured_minor,refunded_minor,state,sequence,canonical_evidence,consent_status,occurred_at)
    VALUES($1,$2,$3,10,20,'META',$4,'INR',150000,0,$5,$6,'{"captureEvidenceId":"gw-cap-1"}'::jsonb,$7,now())
    ON CONFLICT (order_id) DO UPDATE SET state=EXCLUDED.state, consent_status=EXCLUDED.consent_status, sequence=EXCLUDED.sequence, verified_at=now()`,
   [orderId,bookingId,campaignId,`ext-${campaignId}`,state,seq,consentStatus]
  );

  // 2. Late booking capture occurs for flight 1 after inquiry interaction
  await recordBooking('order-r6-late-1','booking-r6-late-1',c1,'CAPTURED','GRANTED',1);
  view=await canonical.decorate(host,{campaigns:[{id:c1},{id:c2}]});
  expect(view.portfolioOutcomes?.activeAttributedBookings).toBe('1');
  expect(view.portfolioOutcomes?.capturedBookings).toBe('1');
  expect(view.campaigns[0].firstPartyOutcomes?.bookings).toBe('1');
  expect(view.campaigns[1].firstPartyOutcomes?.bookings).toBe('0');

  // 3. Late booking capture occurs for flight 2
  await recordBooking('order-r6-late-2','booking-r6-late-2',c2,'CAPTURED','GRANTED',1);
  view=await canonical.decorate(host,{campaigns:[{id:c1},{id:c2}]});
  expect(view.portfolioOutcomes?.activeAttributedBookings).toBe('2');
  expect(view.portfolioOutcomes?.capturedBookings).toBe('2');
  expect(view.campaigns[0].firstPartyOutcomes?.bookings).toBe('1');
  expect(view.campaigns[1].firstPartyOutcomes?.bookings).toBe('1');

  // 4. Guest withdraws consent for flight 1's booking
  await recordBooking('order-r6-late-1','booking-r6-late-1',c1,'CAPTURED','REVOKED',2);
  view=await canonical.decorate(host,{campaigns:[{id:c1},{id:c2}]});
  expect(view.campaigns[0].firstPartyOutcomes?.bookings).toBe('0');
  expect(view.campaigns[1].firstPartyOutcomes?.bookings).toBe('1');
  expect(view.portfolioOutcomes?.activeAttributedBookings).toBe('1');
  expect(view.portfolioOutcomes?.capturedBookings).toBe('1');

  // 5. Late booking capture recorded when consent is ALREADY revoked
  await recordBooking('order-r6-late-3','booking-r6-late-3',c1,'CAPTURED','REVOKED',1);
  view=await canonical.decorate(host,{campaigns:[{id:c1}]});
  expect(view.campaigns[0].firstPartyOutcomes?.bookings).toBe('0');
  expect(view.portfolioOutcomes?.activeAttributedBookings).toBe('0');

  // 6. Advancement of late capture to FULFILLED and subsequent consent revocation
  await recordBooking('order-r6-late-2','booking-r6-late-2',c2,'FULFILLED','GRANTED',2);
  view=await canonical.decorate(host,{campaigns:[{id:c2}]});
  expect(view.portfolioOutcomes?.activeAttributedBookings).toBe('1');
  expect(view.portfolioOutcomes?.capturedBookings).toBe('0');
  expect(view.portfolioOutcomes?.fulfilledStays).toBe('1');
  expect(view.campaigns[0].firstPartyOutcomes?.bookings).toBe('1');

  await recordBooking('order-r6-late-2','booking-r6-late-2',c2,'FULFILLED','REVOKED',3);
  view=await canonical.decorate(host,{campaigns:[{id:c2}]});
  expect(view.portfolioOutcomes?.activeAttributedBookings).toBe('0');
  expect(view.portfolioOutcomes?.fulfilledStays).toBe('0');
  expect(view.campaigns[0].firstPartyOutcomes?.bookings).toBe('0');

  // 7. Cancellation and refund terminal states obey consent status
  await recordBooking('order-r6-late-4','booking-r6-late-4',c1,'CANCELLED','REVOKED',1);
  await recordBooking('order-r6-late-5','booking-r6-late-5',c1,'REFUNDED','REVOKED',1);
  view=await canonical.decorate(host,{campaigns:[{id:c1}]});
  expect(view.portfolioOutcomes?.cancelledBookings).toBe('0');
  expect(view.portfolioOutcomes?.refundedBookings).toBe('0');

  await recordBooking('order-r6-late-6','booking-r6-late-6',c1,'CANCELLED','GRANTED',1);
  await recordBooking('order-r6-late-7','booking-r6-late-7',c1,'REFUNDED','GRANTED',1);
  view=await canonical.decorate(host,{campaigns:[{id:c1}]});
  expect(view.portfolioOutcomes?.cancelledBookings).toBe('1');
  expect(view.portfolioOutcomes?.refundedBookings).toBe('1');
 });
});
