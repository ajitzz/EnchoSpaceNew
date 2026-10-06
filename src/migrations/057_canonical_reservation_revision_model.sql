-- Migration: 057_canonical_reservation_revision_model.sql
-- W4-C1: Canonical Reservation Revision and Full Effective Allocation Snapshot Model
-- Invariants:
--   - Stable reservation identity: canonical_reservations.id remains the immutable reservation anchor.
--   - W3 V1 truth is NOT duplicated: canonical_reservations + canonical_reservation_nights remain authoritative.
--   - V2+ revisions: stored in canonical_reservation_revisions with version >= 2 and full commercial snapshot.
--   - Full allocation replacement: canonical_reservation_revision_nights holds complete effective stay allocation for that version (never deltas).
--   - Lockstep authority: allocation and commercial terms are bound immutably under the exact same reservation version.
--   - Immutability: revision headers and snapshot rows strictly reject UPDATE and DELETE.
--   - Projections:
--       * canonical_reservation_revisions_all presents V1 and V2+ in unified logical shape.
--       * canonical_reservation_effective_revisions yields current effective version (V1 if no committed later revision exists, else highest committed).
--       * canonical_reservation_effective_allocations yields full effective allocation rows for the current effective version.
--   - Zero modification writer: NO accepted runtime role or function can publish later revisions.
--   - Zero inventory mutation: migration 057 touches zero physical inventory (inventory_days.booked_units is untouched).
--   - Zero payment / refund side effects: no financial clearance or settlement authority in W4-C1.
--   - W4-B cancellation is unmodified: releases original W3/V1 allocation until version-aware cancellation upgrade.

-- 1. Immutable V2+ Revision Header Table
CREATE TABLE IF NOT EXISTS canonical_reservation_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  version INT NOT NULL CHECK (version >= 2),
  status TEXT NOT NULL CHECK (status IN ('COMMITTED')),
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('ENCHO_DIRECT', 'EXTERNAL_CHANNEL')),
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  room_type_id INT NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  offer_id UUID,
  offer_revision INT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights INT NOT NULL CHECK (nights > 0),
  guest_count INT NOT NULL CHECK (guest_count > 0),
  room_subtotal_paise BIGINT NOT NULL CHECK (room_subtotal_paise >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  FOREIGN KEY (offer_id, offer_revision) REFERENCES sellable_offer_revisions(offer_id, revision) ON DELETE RESTRICT,
  CHECK (check_out_date > check_in_date AND check_out_date - check_in_date = nights),
  CHECK (origin_kind <> 'ENCHO_DIRECT' OR (offer_id IS NOT NULL AND offer_revision IS NOT NULL AND room_subtotal_paise > 0 AND currency = 'INR')),
  UNIQUE (reservation_id, version),
  UNIQUE (id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_reservation_revisions_res_ver
  ON canonical_reservation_revisions(reservation_id, version DESC);

-- 2. Immutable V2+ Full Allocation Snapshot Table
CREATE TABLE IF NOT EXISTS canonical_reservation_revision_nights (
  revision_id UUID NOT NULL REFERENCES canonical_reservation_revisions(id) ON DELETE RESTRICT,
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  inventory_day_id INT NOT NULL REFERENCES inventory_days(id) ON DELETE RESTRICT,
  stay_date DATE NOT NULL,
  room_type_id INT NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  units INT NOT NULL CHECK (units > 0),
  PRIMARY KEY (revision_id, inventory_day_id),
  UNIQUE (revision_id, stay_date),
  FOREIGN KEY (revision_id, reservation_id) REFERENCES canonical_reservation_revisions(id, reservation_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_canonical_res_rev_nights_res_date
  ON canonical_reservation_revision_nights(reservation_id, stay_date);

-- 3. Reject UPDATE / DELETE on Revision Header and Allocation Rows
CREATE OR REPLACE FUNCTION canonical_reservation_revision_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_RESERVATION_REVISION_IMMUTABLE';
END $$;

CREATE TRIGGER canonical_reservation_revisions_immutable
  BEFORE UPDATE OR DELETE ON canonical_reservation_revisions
  FOR EACH ROW EXECUTE FUNCTION canonical_reservation_revision_reject_mutation();

CREATE TRIGGER canonical_reservation_revision_nights_immutable
  BEFORE UPDATE OR DELETE ON canonical_reservation_revision_nights
  FOR EACH ROW EXECUTE FUNCTION canonical_reservation_revision_reject_mutation();

-- 4. Unified Revisions Projection View (V1 Projected from W3 Truth + Committed V2+)
CREATE OR REPLACE VIEW canonical_reservation_revisions_all AS
SELECT
  r.id AS reservation_id,
  1 AS version,
  'COMMITTED' AS status,
  NULL::uuid AS revision_id,
  r.origin_kind,
  r.listing_id,
  r.room_type_id,
  r.offer_id,
  r.offer_revision,
  r.quote_id,
  r.hold_id,
  r.holder_principal,
  r.check_in_date,
  r.check_out_date,
  r.nights,
  r.guest_count,
  r.room_subtotal_paise,
  r.currency,
  r.created_at,
  r.finalized_at
FROM canonical_reservations r
UNION ALL
SELECT
  rev.reservation_id,
  rev.version,
  rev.status,
  rev.id AS revision_id,
  rev.origin_kind,
  rev.listing_id,
  rev.room_type_id,
  rev.offer_id,
  rev.offer_revision,
  r.quote_id,
  r.hold_id,
  r.holder_principal,
  rev.check_in_date,
  rev.check_out_date,
  rev.nights,
  rev.guest_count,
  rev.room_subtotal_paise,
  rev.currency,
  rev.created_at,
  rev.created_at AS finalized_at
FROM canonical_reservation_revisions rev
JOIN canonical_reservations r ON r.id = rev.reservation_id
WHERE rev.status = 'COMMITTED';

-- 5. Deterministic Current Effective Revision Projection View
CREATE OR REPLACE VIEW canonical_reservation_effective_revisions AS
SELECT DISTINCT ON (v.reservation_id)
  v.reservation_id,
  v.version AS effective_version,
  v.status,
  v.revision_id AS effective_revision_id,
  v.origin_kind,
  v.listing_id,
  v.room_type_id,
  v.offer_id,
  v.offer_revision,
  v.quote_id,
  v.hold_id,
  v.holder_principal,
  v.check_in_date,
  v.check_out_date,
  v.nights,
  v.guest_count,
  v.room_subtotal_paise,
  v.currency,
  v.created_at,
  v.finalized_at
FROM canonical_reservation_revisions_all v
ORDER BY v.reservation_id, v.version DESC;

-- 6. Deterministic Current Effective Allocation Projection View
CREATE OR REPLACE VIEW canonical_reservation_effective_allocations AS
SELECT
  eff.reservation_id,
  eff.effective_version,
  rn.inventory_day_id,
  rn.stay_date,
  eff.room_type_id,
  rn.units
FROM canonical_reservation_effective_revisions eff
JOIN canonical_reservation_nights rn ON rn.reservation_id = eff.reservation_id
WHERE eff.effective_version = 1
UNION ALL
SELECT
  eff.reservation_id,
  eff.effective_version,
  rrn.inventory_day_id,
  rrn.stay_date,
  rrn.room_type_id,
  rrn.units
FROM canonical_reservation_effective_revisions eff
JOIN canonical_reservation_revision_nights rrn ON rrn.revision_id = eff.effective_revision_id
WHERE eff.effective_version > 1;

-- 7. Read-Only Query Helpers
CREATE OR REPLACE FUNCTION canonical_get_effective_reservation(target_reservation_id UUID)
RETURNS TABLE (
  reservation_id UUID,
  effective_version INT,
  status TEXT,
  effective_revision_id UUID,
  origin_kind TEXT,
  listing_id INT,
  room_type_id INT,
  offer_id UUID,
  offer_revision INT,
  quote_id UUID,
  hold_id UUID,
  holder_principal TEXT,
  check_in_date DATE,
  check_out_date DATE,
  nights INT,
  guest_count INT,
  room_subtotal_paise BIGINT,
  currency TEXT,
  created_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    reservation_id,
    effective_version,
    status,
    effective_revision_id,
    origin_kind,
    listing_id,
    room_type_id,
    offer_id,
    offer_revision,
    quote_id,
    hold_id,
    holder_principal,
    check_in_date,
    check_out_date,
    nights,
    guest_count,
    room_subtotal_paise,
    currency,
    created_at,
    finalized_at
  FROM public.canonical_reservation_effective_revisions
  WHERE reservation_id = target_reservation_id;
$$;

CREATE OR REPLACE FUNCTION canonical_get_effective_reservation_allocation(target_reservation_id UUID)
RETURNS TABLE (
  reservation_id UUID,
  effective_version INT,
  inventory_day_id INT,
  stay_date DATE,
  room_type_id INT,
  units INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    reservation_id,
    effective_version,
    inventory_day_id,
    stay_date,
    room_type_id,
    units
  FROM public.canonical_reservation_effective_allocations
  WHERE reservation_id = target_reservation_id
  ORDER BY stay_date ASC, inventory_day_id ASC;
$$;

-- 8. Row Level Security Hardening
ALTER TABLE canonical_reservation_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_revision_nights ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_revision_nights FORCE ROW LEVEL SECURITY;

CREATE POLICY canonical_reservation_revisions_owner
  ON canonical_reservation_revisions FOR ALL TO current_user USING (true) WITH CHECK (true);
CREATE POLICY canonical_reservation_revision_nights_owner
  ON canonical_reservation_revision_nights FOR ALL TO current_user USING (true) WITH CHECK (true);

-- 9. Complete Revocation from PUBLIC
REVOKE ALL ON canonical_reservation_revisions, canonical_reservation_revision_nights FROM PUBLIC;
REVOKE ALL ON canonical_reservation_revisions_all, canonical_reservation_effective_revisions, canonical_reservation_effective_allocations FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_get_effective_reservation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_get_effective_reservation_allocation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_reservation_revision_reject_mutation() FROM PUBLIC;

-- 10. Role Isolation: Explicitly Revoke from All Accepted Runtime Roles
-- Ensures zero accepted runtime roles or procedures can create, mutate, or publish later revisions.
DO $runtime_revokes$
DECLARE
  r TEXT;
  runtime_roles TEXT[] := ARRAY[
    'encho_stays_web',
    'encho_reservation_worker',
    'encho_payment_worker',
    'encho_composition_worker',
    'encho_lifecycle_issuer',
    'encho_lifecycle_worker',
    'encho_cancellation_issuer',
    'encho_cancellation_executor'
  ];
BEGIN
  FOREACH r IN ARRAY runtime_roles LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON canonical_reservation_revisions FROM %I', r);
      EXECUTE format('REVOKE ALL ON canonical_reservation_revision_nights FROM %I', r);
      EXECUTE format('REVOKE ALL ON canonical_reservation_revisions_all FROM %I', r);
      EXECUTE format('REVOKE ALL ON canonical_reservation_effective_revisions FROM %I', r);
      EXECUTE format('REVOKE ALL ON canonical_reservation_effective_allocations FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_get_effective_reservation(UUID) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_get_effective_reservation_allocation(UUID) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_reservation_revision_reject_mutation() FROM %I', r);
    END IF;
  END LOOP;
END $runtime_revokes$;
