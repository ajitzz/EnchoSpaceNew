-- Migration: 005_inventory_days_and_atomic_holds.sql
-- Milestone: Phase 3 Milestone 4 (Inventory Days & Atomic Holds)
-- Purpose: Create relational tables for physical room inventory days, atomic checkout holds, and per-night allocations.
-- Rules:
--   - Foreign keys to room_types(id) and listings(id)
--   - Uniqueness constraint on (room_type_id, calendar_date)
--   - Positive capacity check constraints (total_units >= 0, held_units >= 0, booked_units >= 0, blocked_units >= 0)
--   - (held_units + booked_units + blocked_units <= total_units) check constraint
--   - Immutable audit timestamps (created_at, updated_at)
--   - Targeted btree index on (room_type_id, calendar_date ASC) to optimize ordered SELECT ... FOR UPDATE

-- 1. inventory_days table
CREATE TABLE IF NOT EXISTS inventory_days (
  id SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  room_type_id INT NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  calendar_date DATE NOT NULL,
  total_units INT NOT NULL DEFAULT 1,
  held_units INT NOT NULL DEFAULT 0,
  booked_units INT NOT NULL DEFAULT 0,
  blocked_units INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_inventory_days_room_date UNIQUE (room_type_id, calendar_date),
  CONSTRAINT chk_inventory_days_total_positive CHECK (total_units >= 0),
  CONSTRAINT chk_inventory_days_held_positive CHECK (held_units >= 0),
  CONSTRAINT chk_inventory_days_booked_positive CHECK (booked_units >= 0),
  CONSTRAINT chk_inventory_days_blocked_positive CHECK (blocked_units >= 0),
  CONSTRAINT chk_inventory_days_capacity CHECK (held_units + booked_units + blocked_units <= total_units)
);

CREATE INDEX IF NOT EXISTS idx_inventory_days_room_date ON inventory_days (room_type_id, calendar_date ASC);
CREATE INDEX IF NOT EXISTS idx_inventory_days_listing ON inventory_days (listing_id);

-- 2. booking_holds table
CREATE TABLE IF NOT EXISTS booking_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id INT NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  guest_session_id VARCHAR(255),
  idempotency_key VARCHAR(255) NOT NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  units_held INT NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP WITH TIME ZONE,
  release_reason VARCHAR(100),
  CONSTRAINT uq_booking_holds_idempotency UNIQUE (idempotency_key),
  CONSTRAINT chk_booking_holds_units_positive CHECK (units_held >= 1),
  CONSTRAINT chk_booking_holds_status CHECK (status IN ('ACTIVE', 'CONSUMED', 'EXPIRED', 'RELEASED')),
  CONSTRAINT chk_booking_holds_date_range CHECK (check_out_date > check_in_date)
);

CREATE INDEX IF NOT EXISTS idx_booking_holds_status_expires ON booking_holds (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_booking_holds_room_type ON booking_holds (room_type_id);

-- 3. booking_hold_nights table
CREATE TABLE IF NOT EXISTS booking_hold_nights (
  id SERIAL PRIMARY KEY,
  hold_id UUID NOT NULL REFERENCES booking_holds(id) ON DELETE CASCADE,
  inventory_day_id INT NOT NULL REFERENCES inventory_days(id) ON DELETE CASCADE,
  stay_date DATE NOT NULL,
  units INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_booking_hold_nights UNIQUE (hold_id, inventory_day_id),
  CONSTRAINT chk_booking_hold_nights_units CHECK (units >= 1)
);

CREATE INDEX IF NOT EXISTS idx_booking_hold_nights_hold ON booking_hold_nights (hold_id);
CREATE INDEX IF NOT EXISTS idx_booking_hold_nights_day ON booking_hold_nights (inventory_day_id);
