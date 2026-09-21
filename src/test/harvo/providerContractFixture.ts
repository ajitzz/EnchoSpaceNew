import {afterAll,beforeAll,beforeEach} from 'vitest';
import type pg from 'pg';
import {createLocalPostgresFixture} from './postgres.js';
/** Actual isolated provider schema and exact canonical listing/authorization. */
export function useProviderContractFixture() {
  let fixture: Awaited<ReturnType<typeof createLocalPostgresFixture>>;
  beforeAll(async () => {fixture=await createLocalPostgresFixture(); await fixture.pool.query("CREATE TABLE media_assets(id SERIAL PRIMARY KEY,entity_type TEXT,entity_id INT,url TEXT,moderation_status TEXT)");});
  afterAll(async () => {await fixture?.close();});
  beforeEach(async () => {
    await fixture.pool.query('TRUNCATE media_assets,provider_entities,provider_publishing_transactions,campaign_financial_contracts,host_marketing_campaigns,listings RESTART IDENTITY CASCADE');
    await fixture.pool.query("INSERT INTO listings VALUES(20,10,'Lake House','lake-house','published'); INSERT INTO host_marketing_campaigns VALUES(1,10,20)");
    await fixture.pool.query("INSERT INTO campaign_financial_contracts(campaign_id,gross_host_charge,encho_fee_amount,meta_authorized_spend,meta_remaining_authorization,currency) VALUES(1,10500,500,10000,10000,'INR')");
    await fixture.pool.query("INSERT INTO media_assets(entity_type,entity_id,url,moderation_status)VALUES('listing',20,'https://assets.example.com/property.jpg','approved')");
  });
  return {get pool():pg.Pool {return fixture.pool;}};
}
