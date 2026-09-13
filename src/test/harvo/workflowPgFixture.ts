import { readFileSync } from 'node:fs';
import { createLocalPostgresFixture } from './postgres.js';
import { testPolicy } from './financeFixtures.js';
import type { MarketingRuntimeConfig } from '../../lib/marketing/config.js';

/** Extends the isolated M1 cluster. Never loads dotenv, server startup, or an external DB URL. */
export async function createWorkflowPgFixture() {
  const fixture = await createLocalPostgresFixture();
  const pool = fixture.pool!;
  try {
    await pool.query(`
      CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT NOT NULL);
      ALTER TABLE listings ADD COLUMN description TEXT NOT NULL DEFAULT '', ADD COLUMN city TEXT NOT NULL DEFAULT '', ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR', ADD COLUMN price NUMERIC(12,2) NOT NULL DEFAULT 5000;
      CREATE SEQUENCE host_marketing_campaigns_id_seq OWNED BY host_marketing_campaigns.id;
      ALTER TABLE host_marketing_campaigns ALTER COLUMN id SET DEFAULT nextval('host_marketing_campaigns_id_seq');
      ALTER TABLE host_marketing_campaigns ADD COLUMN title TEXT, ADD COLUMN description TEXT, ADD COLUMN platforms JSONB, ADD COLUMN budget NUMERIC(14,2), ADD COLUMN status TEXT;
      CREATE TABLE media_assets(id INT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id INT NOT NULL,url TEXT NOT NULL,category TEXT NOT NULL,moderation_status TEXT NOT NULL,is_hero BOOLEAN NOT NULL DEFAULT false,order_index INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE room_types(id INT PRIMARY KEY,listing_id INT NOT NULL REFERENCES listings(id),currency TEXT NOT NULL);
      CREATE TABLE inventory_days(listing_id INT NOT NULL REFERENCES listings(id),room_type_id INT NOT NULL REFERENCES room_types(id),calendar_date DATE NOT NULL,total_units INT NOT NULL,held_units INT NOT NULL DEFAULT 0,booked_units INT NOT NULL DEFAULT 0,blocked_units INT NOT NULL DEFAULT 0,PRIMARY KEY(room_type_id,calendar_date));
    `);
    const serverSource=readFileSync(new URL('../../../server.ts',import.meta.url),'utf8');
    const legacyMetaDdl=serverSource.match(/CREATE TABLE IF NOT EXISTS meta_publishing_transactions \([\s\S]*?\n\s*\);/)?.[0];
    if(!legacyMetaDdl)throw new Error('The current legacy Meta operation schema is required by the isolated cancellation fixture');
    await pool.query(legacyMetaDdl);
    for (const name of ['009_harvo_marketing_finance.sql', '010_harvo_marketing_workflow.sql']) {
      await pool.query(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
    }
    const reset = async () => {
      const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'marketing_%'")).rows.map(row => `"${row.tablename}"`).join(',');
      await pool.query(`TRUNCATE ${tables},users,host_marketing_campaigns,listings,media_assets RESTART IDENTITY CASCADE`);
      await pool.query("INSERT INTO users VALUES(10,'host'),(11,'host'),(90,'admin')");
      await pool.query("INSERT INTO listings(id,user_id,title,slug,publication_status,description,city,currency,price) VALUES(20,10,'Garden Villa','garden-villa-20','published','A garden villa with three guest rooms.','Bengaluru','INR',5000),(21,11,'Other Villa','other-villa-21','published','An independently owned property.','Mysuru','INR',6000)");
      await pool.query("INSERT INTO media_assets(id,entity_type,entity_id,url,category,moderation_status,is_hero) VALUES(100,'listing',20,'https://media.encho.example/villa.jpg','image','approved',true),(101,'listing',21,'https://media.encho.example/other.jpg','image','approved',true),(102,'listing',20,'https://media.encho.example/pending.jpg','image','pending',false)");
    };
    return { ...fixture, pool, reset };
  } catch (error) { await fixture.close(); throw error; }
}

export const workflowPolicy = { ...testPolicy, id: 'isolated-workflow-cost-policy' };
export const workflowConfig: MarketingRuntimeConfig = {
  origin: 'https://encho.example', mediaOrigins: ['https://media.encho.example'], currency: 'INR', markupBps: 500,
  financialPolicy: workflowPolicy, policyAdminId: 90,
  costRules: [{ code: 'PROCESSING', label: 'Explicit processing cost', base: 'FIXED', fixedMinor: '9000', rateBps: 0 }, { code: 'COST_TAX', label: 'Explicit nonrecoverable cost tax', base: 'FIXED', fixedMinor: '1000', rateBps: 0 }],
  remittanceTax: { base: 'NONE', rateBps: 0 }, fundingEnabled: true, publishingEnabled: true, activationEnabled: true,
  providerClearance: { META: 'isolated-provider-review', GOOGLE: 'isolated-provider-review' }, checkoutAcceptanceReference: 'isolated-checkout-review',
  meta: { countries: ['IN'], placements: ['INSTAGRAM_FEED'], specialAdCategories: ['HOUSING'] },
};

export function workflowDraft(extra: Record<string, unknown> = {}) {
  return { listingId: 20, objective: 'BOOKINGS', provider: 'META', title: 'Garden villa autumn stays',
    startDate: '2099-01-01', endDate: '2099-01-15', mediaBudgetMinor: '90000', dailyBudgetMinor: '6000',
    headline: 'Stay at Garden Villa', description: 'Explore the garden villa and choose your stay dates.',
    mediaIds: ['100'], locations: ['IN'], rightsConfirmed: true, ...extra };
}
