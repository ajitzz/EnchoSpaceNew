-- Migration: 003_canonical_room_and_media_authority.sql
-- Milestone: Phase 3 Milestone 3 (Canonical Relational Room & Media Authority)
-- Purpose: Canonical relational tables for room_types, media_assets, and durable backfill_conflict_records.
-- Contract: Non-destructive, idempotent. Rollback preserves all listings, rooms, and media rows.
-- Concurrency: Uses standard transactional DDL with advisory lock in runner.

-- 1. Ensure room_types table exists with canonical schema
CREATE TABLE IF NOT EXISTS room_types (
  id SERIAL PRIMARY KEY,
  listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  icon VARCHAR(20) DEFAULT '🛏️',
  tag VARCHAR(100),
  base_price DECIMAL NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'INR',
  max_occupancy INT DEFAULT 2,
  inventory_count INT DEFAULT 1,
  description TEXT,
  specs VARCHAR(500),
  features JSONB DEFAULT '[]'::jsonb,
  amenities JSONB DEFAULT '[]'::jsonb,
  min_stay_nights INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure room_types has all canonical columns if table pre-existed
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS type VARCHAR(100);
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS specs VARCHAR(500);
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS icon VARCHAR(20) DEFAULT '🛏️';
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS tag VARCHAR(100);
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS min_stay_nights INT DEFAULT 1;
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb;
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS amenities JSONB DEFAULT '[]'::jsonb;

-- 2. Ensure media_assets table exists with canonical schema (moderation defaults to 'pending_review')
CREATE TABLE IF NOT EXISTS media_assets (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INT NOT NULL,
  url TEXT NOT NULL,
  tier VARCHAR(100) DEFAULT 'common',
  category VARCHAR(50) NOT NULL DEFAULT 'other',
  title VARCHAR(255),
  description TEXT,
  specs VARCHAR(255),
  lighting_time VARCHAR(255),
  is_hero BOOLEAN DEFAULT false,
  order_index INT DEFAULT 0,
  room_type_id INT,
  moderation_status VARCHAR(50) DEFAULT 'pending_review',
  is_sleeping_area BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure media_assets has all canonical columns if table pre-existed
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS tier VARCHAR(100) DEFAULT 'common';
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS room_type_id INT;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(50) DEFAULT 'pending_review';
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS is_sleeping_area BOOLEAN DEFAULT false;

-- 3. Safely establish foreign key on media_assets.room_type_id -> room_types(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_assets_room_type_id_fkey'
  ) THEN
    ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_room_type_id_fkey
      FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Create durable backfill audit / conflict records table
CREATE TABLE IF NOT EXISTS backfill_conflict_records (
  id SERIAL PRIMARY KEY,
  listing_id INT NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_item_id VARCHAR(255),
  reason TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'manual_review',
  diagnostic_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create indexes for room, media, and conflict lookup performance
CREATE INDEX IF NOT EXISTS idx_room_types_listing_id ON room_types (listing_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_entity ON media_assets (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_room_type_id ON media_assets (room_type_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_moderation ON media_assets (moderation_status);
CREATE INDEX IF NOT EXISTS idx_backfill_conflicts_listing ON backfill_conflict_records (listing_id);
CREATE INDEX IF NOT EXISTS idx_backfill_conflicts_status ON backfill_conflict_records (status);

-- ============================================================================
-- ROLLBACK NOTES (DO NOT RUN AUTOMATICALLY):
-- To revert this migration non-destructively:
--   DROP INDEX IF EXISTS idx_backfill_conflicts_status;
--   DROP INDEX IF EXISTS idx_backfill_conflicts_listing;
--   DROP INDEX IF EXISTS idx_media_assets_moderation;
--   DROP INDEX IF EXISTS idx_media_assets_room_type_id;
--   DROP INDEX IF EXISTS idx_media_assets_entity;
--   DROP INDEX IF EXISTS idx_room_types_listing_id;
--   ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_room_type_id_fkey;
--   DROP TABLE IF EXISTS backfill_conflict_records;
-- ============================================================================
