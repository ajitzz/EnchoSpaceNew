-- Migration: 041_stays_canonical_commerce.sql
-- Milestone: Sprint 1 / Phase 3 Milestone 5 & 8 (Canonical Stays Commerce Pipeline)
-- Purpose: Authoritative tables for server quotes, atomic holds, idempotent orders, and monotonic webhook tracking.
-- Invariants:
--   - Foreign keys to listings, room_types, users, and bookings.
--   - check_out_date > check_in_date.
--   - Zero guest booking commission invariant (total_paise = base_price_paise + tax_paise).
--   - Idempotency key uniqueness on stays_orders.
--   - Monotonic sequence tracking on stays_webhooks.

CREATE TABLE IF NOT EXISTS stays_quotes (
  id UUID PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  room_type_id INT REFERENCES room_types(id) ON DELETE SET NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights INT NOT NULL CHECK(nights > 0),
  base_price_paise BIGINT NOT NULL CHECK(base_price_paise >= 0),
  tax_paise BIGINT NOT NULL CHECK(tax_paise >= 0),
  total_paise BIGINT NOT NULL CHECK(total_paise >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  guest_count INT NOT NULL DEFAULT 1 CHECK(guest_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_stays_quotes_dates CHECK(check_out_date > check_in_date),
  CONSTRAINT chk_stays_quotes_math CHECK(total_paise = base_price_paise + tax_paise)
);

CREATE INDEX IF NOT EXISTS idx_stays_quotes_listing ON stays_quotes(listing_id);
CREATE INDEX IF NOT EXISTS idx_stays_quotes_expires ON stays_quotes(expires_at);

CREATE TABLE IF NOT EXISTS stays_holds (
  id UUID PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES stays_quotes(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  guest_session_id VARCHAR(255),
  holder_principal VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMPTZ,
  release_reason VARCHAR(100),
  CONSTRAINT chk_stays_holds_status CHECK(status IN ('ACTIVE', 'CONSUMED', 'EXPIRED', 'RELEASED'))
);

CREATE INDEX IF NOT EXISTS idx_stays_holds_quote ON stays_holds(quote_id);
CREATE INDEX IF NOT EXISTS idx_stays_holds_status_expires ON stays_holds(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_stays_holds_principal ON stays_holds(holder_principal);

CREATE TABLE IF NOT EXISTS stays_orders (
  id UUID PRIMARY KEY,
  hold_id UUID REFERENCES stays_holds(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES stays_quotes(id) ON DELETE SET NULL,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  total_paise BIGINT NOT NULL CHECK(total_paise >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'PAYMENT_PENDING',
  sequence_version INT NOT NULL DEFAULT 1 CHECK(sequence_version >= 1),
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  razorpay_order_id VARCHAR(255),
  razorpay_payment_id VARCHAR(255),
  razorpay_signature VARCHAR(255),
  booking_id INT REFERENCES bookings(id) ON DELETE SET NULL,
  guest_name VARCHAR(255),
  guest_phone VARCHAR(50),
  guest_email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_stays_orders_status CHECK(status IN ('PAYMENT_PENDING', 'AUTHORIZED', 'CONFIRMED', 'CANCELLED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_stays_orders_hold ON stays_orders(hold_id);
CREATE INDEX IF NOT EXISTS idx_stays_orders_quote ON stays_orders(quote_id);
CREATE INDEX IF NOT EXISTS idx_stays_orders_user ON stays_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_stays_orders_rzp_order ON stays_orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_stays_orders_status ON stays_orders(status);

CREATE TABLE IF NOT EXISTS stays_webhooks (
  event_id VARCHAR(255) PRIMARY KEY,
  order_id UUID REFERENCES stays_orders(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  sequence_number INT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stays_webhooks_order ON stays_webhooks(order_id);
