import {installInquirySchema} from './inquiryPgSchema.js';
import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createWorkflowPgFixture} from './workflowPgFixture.js';
import {verifyPortfolioCatalog} from '../../server/deployment/portfolioReadiness.js';

describe('SP1–SP3 deployment privilege and policy contract',()=>{
 let fixture:Awaited<ReturnType<typeof createWorkflowPgFixture>>,runtime:pg.Pool;
 beforeAll(async()=>{
  fixture=await createWorkflowPgFixture();await installInquirySchema(fixture.pool);
  for(const name of ['014_harvo_marketing_request_limits.sql','023_marketing_product_facts.sql','024_marketing_keyword_research.sql','025_marketing_revision_products.sql','026_search_portfolio_shadow.sql','027_marketing_attribution_links.sql','028_marketing_consent_touchpoints.sql','029_marketing_destination_pools.sql','030_marketing_spatial_stories.sql','031_marketing_inquiry_attribution.sql'])await fixture.pool.query(readFileSync(`src/migrations/${name}`,'utf8'));
  await fixture.pool.query(`CREATE ROLE portfolio_readiness LOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO portfolio_readiness;
   GRANT SELECT,INSERT ON marketing_fact_snapshots,marketing_revision_products,marketing_campaign_search_targets,marketing_campaign_search_scopes,marketing_search_conflict_assessments,marketing_search_conflict_reviews,marketing_attribution_links,marketing_measurement_consents,marketing_attribution_touchpoints TO portfolio_readiness;
   GRANT SELECT,INSERT ON marketing_pool_events,marketing_pool_exposures,marketing_pool_spend_claims,marketing_spatial_stories,marketing_spatial_story_reviews,marketing_inquiry_attributions TO portfolio_readiness;
   GRANT SELECT,INSERT,DELETE ON marketing_measurement_payloads TO portfolio_readiness;
   GRANT SELECT,INSERT,UPDATE ON marketing_destination_pools,marketing_pool_memberships TO portfolio_readiness;
   GRANT USAGE ON SEQUENCE marketing_measurement_consents_sequence_seq,marketing_spatial_story_reviews_sequence_seq TO portfolio_readiness;
   GRANT SELECT,INSERT,UPDATE,DELETE ON marketing_keyword_research TO portfolio_readiness;
   GRANT SELECT,INSERT,UPDATE ON marketing_keyword_customer_slots TO portfolio_readiness;`);
  runtime=new pg.Pool({...fixture.pool.options,user:'portfolio_readiness'});
 });
 afterAll(async()=>{await runtime?.end();await fixture?.close();});
 async function inspect(){const c=await runtime.connect();try{return await verifyPortfolioCatalog(c);}finally{c.release();}}
 it('requires the reviewed policy expressions, immutable triggers, non-owner role and minimum grants',async()=>{
  expect(await inspect()).toEqual({ready:true,policyValid:true,privileges:true,immutable:true});
 });
 it.each([
  ['missing sequence permission','REVOKE USAGE ON SEQUENCE marketing_measurement_consents_sequence_seq FROM portfolio_readiness','GRANT USAGE ON SEQUENCE marketing_measurement_consents_sequence_seq TO portfolio_readiness'],
  ['extra policy',"CREATE POLICY unsafe ON marketing_fact_snapshots USING(true)",'DROP POLICY unsafe ON marketing_fact_snapshots'],
  ['replacement policy',"ALTER POLICY harvo_shadow_admin ON marketing_search_conflict_assessments USING(true)","ALTER POLICY harvo_shadow_admin ON marketing_search_conflict_assessments USING(current_setting('app.marketing_admin',true)='true')"],
  ['changed boolean grouping',"ALTER POLICY harvo_facts_record ON marketing_fact_snapshots WITH CHECK(host_id::text=current_setting('app.current_user_id',true) OR (current_setting('app.marketing_admin',true)='true' AND EXISTS(SELECT 1 FROM listings WHERE id=marketing_fact_snapshots.listing_id AND user_id=marketing_fact_snapshots.host_id AND publication_status='published')))","ALTER POLICY harvo_facts_record ON marketing_fact_snapshots WITH CHECK((host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.marketing_admin',true)='true') AND EXISTS(SELECT 1 FROM listings WHERE id=marketing_fact_snapshots.listing_id AND user_id=marketing_fact_snapshots.host_id AND publication_status='published'))"],
  ['disabled immutability','ALTER TABLE marketing_revision_products DISABLE TRIGGER marketing_product_immutable','ALTER TABLE marketing_revision_products ENABLE TRIGGER marketing_product_immutable'],
  ['alteration grant','GRANT UPDATE ON marketing_fact_snapshots TO portfolio_readiness','REVOKE UPDATE ON marketing_fact_snapshots FROM portfolio_readiness'],
  ['truncation grant','GRANT TRUNCATE ON marketing_search_conflict_assessments TO portfolio_readiness','REVOKE TRUNCATE ON marketing_search_conflict_assessments FROM portfolio_readiness'],
  ['public grant','GRANT SELECT ON marketing_keyword_research TO PUBLIC','REVOKE SELECT ON marketing_keyword_research FROM PUBLIC'],
  ['disabled force RLS','ALTER TABLE marketing_keyword_customer_slots NO FORCE ROW LEVEL SECURITY','ALTER TABLE marketing_keyword_customer_slots FORCE ROW LEVEL SECURITY'],
 ])('refuses deployment after %s',async(_name,damage,restore)=>{
  await fixture.pool.query(damage);try{expect((await inspect()).ready).toBe(false);}finally{await fixture.pool.query(restore);}
  expect((await inspect()).ready).toBe(true);
 });
});
