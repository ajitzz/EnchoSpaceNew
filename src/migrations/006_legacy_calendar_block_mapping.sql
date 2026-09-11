-- Migration: 006_legacy_calendar_block_mapping.sql
-- Milestone: Phase 3 Milestone 4 (Legacy Calendar Block Relational Authority & Principal Holds)
-- Purpose:
--   1. Add room_type_id foreign key to room_calendar_blocks
--   2. Add mapping_status ('mapped', 'unmapped', 'ambiguous')
--   3. Create unmapped/ambiguous block conflict ledger
--   4. Update booking_holds with holder_principal, request_fingerprint, and composite uniqueness

-- 1. Alter room_calendar_blocks to add relational room_type_id and mapping status
ALTER TABLE room_calendar_blocks ADD COLUMN IF NOT EXISTS room_type_id INT REFERENCES room_types(id) ON DELETE CASCADE;
ALTER TABLE room_calendar_blocks ADD COLUMN IF NOT EXISTS mapping_status VARCHAR(50) DEFAULT 'unmapped';

CREATE INDEX IF NOT EXISTS idx_room_calendar_blocks_room_type ON room_calendar_blocks (room_type_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_room_calendar_blocks_mapping ON room_calendar_blocks (listing_id, mapping_status);

-- 2. Create legacy_block_conflict_ledger for unmapped/ambiguous blocks that fail closed
CREATE TABLE IF NOT EXISTS legacy_block_conflict_ledger (
  id SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  block_id INT REFERENCES room_calendar_blocks(id) ON DELETE SET NULL,
  room_tier_key VARCHAR(100),
  room_name VARCHAR(255),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  conflict_reason VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTION_REQUIRED',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_legacy_block_conflict_listing ON legacy_block_conflict_ledger (listing_id, status);

-- 3. Upgrade booking_holds for principal-bound idempotency and request fingerprinting
ALTER TABLE booking_holds ADD COLUMN IF NOT EXISTS holder_principal VARCHAR(255);
ALTER TABLE booking_holds ADD COLUMN IF NOT EXISTS request_fingerprint VARCHAR(64);

-- Populate holder_principal for existing rows if any
UPDATE booking_holds
SET holder_principal = COALESCE('user:' || user_id, 'session:' || guest_session_id, 'anon:' || id)
WHERE holder_principal IS NULL;

-- Make holder_principal NOT NULL once backfilled
ALTER TABLE booking_holds ALTER COLUMN holder_principal SET NOT NULL;

-- Drop legacy global uniqueness constraint on idempotency_key alone
ALTER TABLE booking_holds DROP CONSTRAINT IF EXISTS uq_booking_holds_idempotency;

-- Add composite uniqueness on (holder_principal, idempotency_key)
ALTER TABLE booking_holds ADD CONSTRAINT uq_booking_holds_principal_idempotency UNIQUE (holder_principal, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_booking_holds_principal ON booking_holds (holder_principal);
