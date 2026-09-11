import { enforceTestDatabaseSafety } from './db_safety';
enforceTestDatabaseSafety();
import '@testing-library/jest-dom';

import { vi } from 'vitest';

vi.mock('pg', async (importOriginal) => {
  const { newDb } = await import('pg-mem');
  const db = newDb();

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

  // Seed essential schema for FSM and reconciliation tests
  db.public.none(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      google_id VARCHAR(255) UNIQUE,
      role VARCHAR(50) DEFAULT 'user',
      wallet_balance FLOAT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE listings_drafts (
      id SERIAL PRIMARY KEY,
      published_listing_id INTEGER,
      status VARCHAR(50) DEFAULT 'DRAFT'
    );
    CREATE TABLE meta_publishing_events (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER,
      event_type VARCHAR(50),
      status VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE campaigns (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER,
      user_id INTEGER,
      status VARCHAR(50),
      budget FLOAT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE campaign_metrics (
      campaign_id INTEGER,
      date DATE,
      impressions INTEGER,
      clicks INTEGER,
      spend FLOAT,
      leads INTEGER
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
      total_price FLOAT,
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
      listing_id INTEGER,
      status VARCHAR(50) DEFAULT 'draft',
      budget FLOAT DEFAULT 0
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
  `);

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
