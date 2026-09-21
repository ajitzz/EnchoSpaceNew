import { enforceTestDatabaseSafety } from './db_safety';
enforceTestDatabaseSafety();
import '@testing-library/jest-dom';

import { afterAll, vi } from 'vitest';

const legacyFixture = vi.hoisted(() => ({close: null as null | (() => Promise<void>)}));
afterAll(async () => {await legacyFixture.close?.();}, 30000);

vi.mock('pg', async (importOriginal) => {
  const { newDb } = await import('pg-mem');
  const db = newDb();
  const { readFileSync } = await import('node:fs');
  const { randomUUID } = await import('node:crypto');
  db.public.registerFunction({name: 'gen_random_uuid', returns: (await import('pg-mem')).DataType.uuid, impure: true, implementation: randomUUID});

  // Fix pg-mem DECIMAL(10,2), set_config and DO $$ procedural blocks AST bug by intercepting queries
  (db.public as any).interceptQueries((queryText: string) => {
    if (queryText.includes('set_config')) {
      return [{ set_config: '' }]; // Mock set_config for RLS
    }
    if (queryText.includes('DECIMAL(10, 2)')) {
      return null; // let pg-mem continue
    }
    // pg-mem crashes or loops on procedural PL/pgSQL DO $$ blocks
    if (queryText.trim().startsWith('DO $$') || queryText.includes('DO $$')) {
      return []; // Return empty result set without executing procedural block
    }
    return null;
  });

  // Legacy pg-mem fixture: baseline columns mirror ensureUsersTable and
  // ensureListingsTable/ensureMarketingSchema in server.ts. This is not RLS,
  // foreign-key, migration, or transaction acceptance; those use real Postgres.
  const baselineSql = `
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password_hash VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      google_id VARCHAR(255) UNIQUE,
      phone VARCHAR(255) UNIQUE,
      avatar TEXT,
      editorial_quote VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user',
      wallet_balance FLOAT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE listings_drafts (
      id SERIAL PRIMARY KEY,
      published_listing_id INTEGER,
      status VARCHAR(50) DEFAULT 'DRAFT'
    );
    CREATE TABLE campaigns (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER,
      user_id INTEGER,
      status VARCHAR(50),
      budget FLOAT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE inbound_webhooks (
      webhook_id SERIAL PRIMARY KEY,
      provider VARCHAR(50),
      event_type VARCHAR(100),
      payload JSONB,
      status VARCHAR(50),
      attempts INTEGER DEFAULT 0,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      next_retry_at TIMESTAMP,
      error_state TEXT,
      processed_at TIMESTAMP
    );
    CREATE TABLE bookings (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER,
      user_id INTEGER,
      status VARCHAR(50),
      move_in_date VARCHAR(50) NOT NULL,
      configuration VARCHAR(50),
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      total_rent DECIMAL NOT NULL,
      check_out_date VARCHAR(255),
      payment_intent_id VARCHAR(255),
      payment_gateway VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE calendar_prices (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER,
      date DATE,
      price FLOAT,
      offer_id INTEGER
    );
    CREATE TABLE listings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price FLOAT NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      type VARCHAR(50) NOT NULL,
      address VARCHAR(255),
      city VARCHAR(100),
      country VARCHAR(100) DEFAULT '',
      image_url TEXT,
      image_urls JSONB,
      photos JSONB,
      rooms JSONB,
      max_guests INTEGER DEFAULT 2,
      bedrooms INTEGER DEFAULT 1,
      beds INTEGER DEFAULT 1,
      bathrooms INTEGER DEFAULT 1,
      amenities JSONB,
      amenity_clusters JSONB,
      child_safety_specs JSONB,
      nearby JSONB,
      lat FLOAT,
      lng FLOAT,
      dynamic_pricing JSONB,
      seo_title TEXT,
      seo_description TEXT,
      seo_keywords TEXT,
      seo_image_url TEXT,
      hero_video_url TEXT,
      hero_fallback_url TEXT,
      dominant_color_hex VARCHAR(50),
      raw_rules TEXT,
      curated_guidelines TEXT,
      experience_tags JSONB,
      concierge_privileges TEXT,
      host_philosophy TEXT,
      brand VARCHAR(100),
      brand_font VARCHAR(100),
      brand_color VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      video_url TEXT,
      slug VARCHAR(255),
      rental_mode VARCHAR(50) DEFAULT 'entire_place',
      publication_status VARCHAR(50) DEFAULT 'draft'
    );
    CREATE TABLE room_types (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER,
      name VARCHAR(255),
      type VARCHAR(100),
      icon VARCHAR(20) DEFAULT '🛏️',
      tag VARCHAR(100),
      base_price FLOAT DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'INR',
      max_occupancy INTEGER DEFAULT 2,
      inventory_count INTEGER DEFAULT 1,
      description TEXT,
      specs VARCHAR(500),
      features JSONB,
      amenities JSONB,
      min_stay_nights INTEGER DEFAULT 1,
      CONSTRAINT chk_room_types_base_price CHECK (base_price >= 0),
      CONSTRAINT chk_room_types_max_occupancy CHECK (max_occupancy >= 1),
      CONSTRAINT chk_room_types_inventory_count CHECK (inventory_count >= 1),
      CONSTRAINT chk_room_types_min_stay_nights CHECK (min_stay_nights >= 1)
    );
    CREATE TABLE media_assets (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(50),
      entity_id INTEGER,
      url TEXT,
      tier VARCHAR(100) DEFAULT 'common',
      category VARCHAR(50) DEFAULT 'other',
      title VARCHAR(255),
      description TEXT,
      specs VARCHAR(500),
      is_hero BOOLEAN DEFAULT false,
      order_index INTEGER DEFAULT 0,
      room_type_id INTEGER,
      moderation_status VARCHAR(50) DEFAULT 'pending_review',
      is_sleeping_area BOOLEAN DEFAULT false,
      CONSTRAINT chk_media_assets_moderation_status CHECK (moderation_status IS NULL OR moderation_status IN ('pending_review', 'approved', 'rejected'))
    );
    CREATE TABLE backfill_conflict_records (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER,
      source_type VARCHAR(50),
      source_item_id VARCHAR(255),
      reason TEXT,
      status VARCHAR(50) DEFAULT 'manual_review',
      diagnostic_metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE host_marketing_campaigns (
      id SERIAL PRIMARY KEY,
      host_id INTEGER,
      listing_id INTEGER,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      video_url TEXT,
      media_urls JSONB DEFAULT '[]'::jsonb,
      platforms JSONB DEFAULT '[]'::jsonb,
      status VARCHAR(50) DEFAULT 'draft',
      budget DECIMAL DEFAULT 2500,
      admin_feedback TEXT,
      subscription_active BOOLEAN DEFAULT false,
      analytics JSONB DEFAULT '{"impressions":0,"clicks":0,"ctr":0,"conversions":0,"spent":0}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMP
    );
    CREATE TABLE inventory_days (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER,
      room_type_id INTEGER,
      calendar_date DATE,
      total_units INTEGER DEFAULT 1,
      held_units INTEGER DEFAULT 0,
      booked_units INTEGER DEFAULT 0,
      blocked_units INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_inventory_days_room_date UNIQUE (room_type_id, calendar_date),
      CONSTRAINT chk_inventory_days_total_positive CHECK (total_units >= 0),
      CONSTRAINT chk_inventory_days_held_positive CHECK (held_units >= 0),
      CONSTRAINT chk_inventory_days_booked_positive CHECK (booked_units >= 0),
      CONSTRAINT chk_inventory_days_blocked_positive CHECK (blocked_units >= 0),
      CONSTRAINT chk_inventory_days_capacity CHECK (held_units + booked_units + blocked_units <= total_units)
    );
    CREATE TABLE room_calendar_blocks (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER,
      room_type_id INTEGER,
      room_tier_key VARCHAR(100),
      room_name VARCHAR(255),
      room_unit_number INTEGER DEFAULT 0,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      block_source VARCHAR(50) DEFAULT 'manual',
      guest_name VARCHAR(255),
      note TEXT,
      mapping_status VARCHAR(50) DEFAULT 'unmapped',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE legacy_block_conflict_ledger (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER,
      block_id INTEGER,
      room_tier_key VARCHAR(100),
      room_name VARCHAR(255),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      conflict_reason VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'ACTION_REQUIRED',
      dedupe_key VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_legacy_block_conflict_dedupe_key UNIQUE (dedupe_key)
    );
    CREATE TABLE booking_holds (
      id VARCHAR(36) PRIMARY KEY,
      room_type_id INTEGER,
      user_id INTEGER,
      guest_session_id VARCHAR(255),
      holder_principal VARCHAR(255) NOT NULL,
      idempotency_key VARCHAR(255) NOT NULL,
      request_fingerprint VARCHAR(64),
      check_in_date DATE,
      check_out_date DATE,
      units_held INTEGER DEFAULT 1,
      status VARCHAR(50) DEFAULT 'ACTIVE',
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      released_at TIMESTAMPTZ,
      release_reason VARCHAR(100),
      CONSTRAINT uq_booking_holds_principal_idempotency UNIQUE (holder_principal, idempotency_key),
      CONSTRAINT chk_booking_holds_units_positive CHECK (units_held >= 1),
      CONSTRAINT chk_booking_holds_status CHECK (status IN ('ACTIVE', 'CONSUMED', 'EXPIRED', 'RELEASED'))
    );
    CREATE TABLE booking_hold_nights (
      id SERIAL PRIMARY KEY,
      hold_id VARCHAR(36),
      inventory_day_id INTEGER,
      stay_date DATE,
      units INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_booking_hold_nights UNIQUE (hold_id, inventory_day_id),
      CONSTRAINT chk_booking_hold_nights_units CHECK (units >= 1)
    );
  `;
  const marketingSql = readFileSync(new URL('../../scripts/testing/fixtures/legacy-marketing.sql', import.meta.url), 'utf8');
  if (process.env.ENCHO_LEGACY_POSTGRES === '1') {
    const real = await importOriginal<typeof import('pg')>();
    const {createLocalPostgresFixture} = await import('./harvo/postgres.js');
    const fixture = await createLocalPostgresFixture({schema: 'empty', driver: real.default});
    const pools = new Set<InstanceType<typeof real.Pool>>();
    const clients = new Set<InstanceType<typeof real.Client>>();
    legacyFixture.close = async () => {
      try {
        const results = await Promise.allSettled([...pools].map(pool => pool.end()).concat([...clients].map(client => client.end())));
        const failures = results.filter(result => result.status === 'rejected');
        if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Legacy fixture connection cleanup failed');
      } finally { await fixture.close(); }
    };
    await fixture.pool.query(baselineSql + marketingSql);
    class Pool extends real.Pool {
      constructor(_options?: unknown) {super({...fixture.pool.options}); pools.add(this);}
      override end() {pools.delete(this); return super.end();}
    }
    class Client extends real.Client {
      constructor(_options?: unknown) {super({...fixture.pool.options}); clients.add(this);}
      override end() {clients.delete(this); return super.end();}
    }
    return {...real, default: {...real.default, Pool, Client}, Pool, Client};
  }
  db.public.none(baselineSql + marketingSql);

  const { Pool, Client } = db.adapters.createPg();
  return {
    default: { Pool, Client },
    Pool,
    Client,
  };
});

// In-memory Redis store for test isolation and namespace validation
export const __mockRedisStore = new Map<string, any>();

vi.mock('@upstash/redis', () => {
  class MockRedis {
    async get(key: string) {
      return __mockRedisStore.has(key) ? __mockRedisStore.get(key) : null;
    }
    async set(key: string, value: any, options?: any) {
      __mockRedisStore.set(key, value);
      return 'OK';
    }
    async del(...keys: string[]) {
      let count = 0;
      for (const k of keys) {
        if (__mockRedisStore.delete(k)) count++;
      }
      return count;
    }
    async keys(pattern: string) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(__mockRedisStore.keys()).filter(k => regex.test(k));
    }
  }

  return {
    Redis: MockRedis,
  };
});
