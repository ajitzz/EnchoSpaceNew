-- Migration: 004_canonical_constraints.sql
-- Milestone: Phase 3 Milestone 3 (Canonical Relational Room & Media Authority - Data Invariant Constraints)
-- Purpose: Enforces database-level check constraints on room_types pricing/capacity and media_assets moderation status.
-- Strategy: Safe expand/validate using conditional constraint creation.
-- Invariants:
--   - media_assets.moderation_status IN ('pending_review', 'approved', 'rejected') OR NULL
--   - room_types.base_price >= 0
--   - room_types.max_occupancy >= 1
--   - room_types.inventory_count >= 1
--   - room_types.min_stay_nights >= 1

DO $$
BEGIN
  -- 1. media_assets.moderation_status check constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_media_assets_moderation_status'
  ) THEN
    ALTER TABLE media_assets
      ADD CONSTRAINT chk_media_assets_moderation_status
      CHECK (moderation_status IS NULL OR moderation_status IN ('pending_review', 'approved', 'rejected')) NOT VALID;
  END IF;

  -- 2. room_types.base_price >= 0
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_room_types_base_price'
  ) THEN
    ALTER TABLE room_types
      ADD CONSTRAINT chk_room_types_base_price
      CHECK (base_price >= 0) NOT VALID;
  END IF;

  -- 3. room_types.max_occupancy >= 1
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_room_types_max_occupancy'
  ) THEN
    ALTER TABLE room_types
      ADD CONSTRAINT chk_room_types_max_occupancy
      CHECK (max_occupancy >= 1) NOT VALID;
  END IF;

  -- 4. room_types.inventory_count >= 1
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_room_types_inventory_count'
  ) THEN
    ALTER TABLE room_types
      ADD CONSTRAINT chk_room_types_inventory_count
      CHECK (inventory_count >= 1) NOT VALID;
  END IF;

  -- 5. room_types.min_stay_nights >= 1
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_room_types_min_stay_nights'
  ) THEN
    ALTER TABLE room_types
      ADD CONSTRAINT chk_room_types_min_stay_nights
      CHECK (min_stay_nights >= 1) NOT VALID;
  END IF;
END $$;
