-- Migration: 057_canonical_reservation_revision_model.sql
-- W4-C1: Canonical Reservation Revision, Full Effective Allocation Snapshot, and Structural Seal Model
-- Invariants:
--   - Stable reservation identity: canonical_reservations.id remains the immutable reservation anchor.
--   - W3 V1 truth is NOT duplicated: canonical_reservations + canonical_reservation_nights remain authoritative.
--   - V2+ revisions: stored in canonical_reservation_revisions with version >= 2 as assembly data until sealed.
--   - Full allocation replacement: canonical_reservation_revision_nights holds complete effective stay allocation for that version (never deltas).
--   - Separate seal authority: canonical_reservation_revision_seals represents the immutable authority fence.
--     Only sealed V2+ revisions can become current-effective. An unsealed revision is ASSEMBLY_ONLY.
--   - Atomic seal validation: sealing database-validates complete contiguous date coverage, row count == nights,
--     room-type consistency, and inventory-day identity before seal commits.
--   - Snapshot set immutability: once a revision is sealed, NO additional allocation rows can be appended.
--   - Serialization: night append and seal validation serialize via row lock on the revision header.
--   - Cross-bound identities:
--       * Root reservation is the single authority for origin_kind and listing_id (no competing duplicates).
--       * Revision room_type_id must belong to reservation's listing_id.
--       * Revision night room_type_id must match revision header room_type_id (enforced structurally via composite FK).
--       * Inventory day calendar_date, room_type_id, and listing_id must match night stay_date, room_type_id, and listing_id.
--   - Zero modification writer: NO accepted runtime role or function can publish later revisions.
--   - Zero inventory mutation: migration 057 touches zero physical inventory (inventory_days.booked_units is untouched).
--   - Zero payment / refund side effects: no financial clearance or settlement authority in W4-C1.
--   - W4-B cancellation is unmodified: releases original W3/V1 allocation until version-aware cancellation upgrade.

-- 1. Immutable V2+ Revision Header Table (Assembly Data Until Sealed)
CREATE TABLE IF NOT EXISTS canonical_reservation_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  version INT NOT NULL CHECK (version >= 2),
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
  UNIQUE (reservation_id, version),
  UNIQUE (id, reservation_id),
  UNIQUE (id, reservation_id, room_type_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_reservation_revisions_res_ver
  ON canonical_reservation_revisions(reservation_id, version DESC);

-- 2. Immutable V2+ Full Allocation Snapshot Table
CREATE TABLE IF NOT EXISTS canonical_reservation_revision_nights (
  revision_id UUID NOT NULL,
  reservation_id UUID NOT NULL,
  inventory_day_id INT NOT NULL REFERENCES inventory_days(id) ON DELETE RESTRICT,
  stay_date DATE NOT NULL,
  room_type_id INT NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  units INT NOT NULL CHECK (units > 0),
  PRIMARY KEY (revision_id, inventory_day_id),
  UNIQUE (revision_id, stay_date),
  FOREIGN KEY (revision_id, reservation_id, room_type_id)
    REFERENCES canonical_reservation_revisions(id, reservation_id, room_type_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_canonical_res_rev_nights_res_date
  ON canonical_reservation_revision_nights(reservation_id, stay_date);

-- 3. Immutable V2+ Revision Seal Table (Authority Fence)
CREATE TABLE IF NOT EXISTS canonical_reservation_revision_seals (
  revision_id UUID PRIMARY KEY,
  reservation_id UUID NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  FOREIGN KEY (revision_id, reservation_id)
    REFERENCES canonical_reservation_revisions(id, reservation_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_canonical_res_rev_seals_res
  ON canonical_reservation_revision_seals(reservation_id);

-- 4. Header Validation Trigger (Validates Root Facts & Room Type Consistency)
CREATE OR REPLACE FUNCTION canonical_validate_reservation_revision_header()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  root RECORD;
  room RECORD;
BEGIN
  SELECT id, listing_id, origin_kind INTO root
  FROM canonical_reservations
  WHERE id = NEW.reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVISION_RESERVATION_NOT_FOUND';
  END IF;

  SELECT id, listing_id INTO room
  FROM room_types
  WHERE id = NEW.room_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVISION_ROOM_TYPE_NOT_FOUND';
  END IF;

  IF room.listing_id IS DISTINCT FROM root.listing_id THEN
    RAISE EXCEPTION 'REVISION_ROOM_TYPE_LISTING_MISMATCH';
  END IF;

  IF root.origin_kind = 'ENCHO_DIRECT' THEN
    IF NEW.offer_id IS NULL OR NEW.offer_revision IS NULL OR NEW.room_subtotal_paise <= 0 OR NEW.currency <> 'INR' THEN
      RAISE EXCEPTION 'REVISION_ENCHO_DIRECT_COMMERCIAL_INVALID';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER canonical_reservation_revisions_validate_header
  BEFORE INSERT ON canonical_reservation_revisions
  FOR EACH ROW EXECUTE FUNCTION canonical_validate_reservation_revision_header();

-- 5. Reject UPDATE / DELETE on Revision Header and Allocation Rows
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

-- 6. Reject UPDATE / DELETE on Revision Seals
CREATE OR REPLACE FUNCTION canonical_reservation_revision_seal_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_RESERVATION_REVISION_SEAL_IMMUTABLE';
END $$;

CREATE TRIGGER canonical_reservation_revision_seals_immutable
  BEFORE UPDATE OR DELETE ON canonical_reservation_revision_seals
  FOR EACH ROW EXECUTE FUNCTION canonical_reservation_revision_seal_reject_mutation();

-- 7. Snapshot Night Validation Trigger (Lock Serialization, Inventory-Day Cross-Binding, Post-Seal Append Rejection)
CREATE OR REPLACE FUNCTION canonical_validate_reservation_revision_night()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  header RECORD;
  inv RECORD;
  root RECORD;
BEGIN
  -- Serialize against concurrent sealing by locking the revision header row
  SELECT * INTO header
  FROM canonical_reservation_revisions
  WHERE id = NEW.revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVISION_HEADER_NOT_FOUND';
  END IF;

  -- Fail-closed: once a revision is sealed, NO further allocation rows can be appended
  IF EXISTS (SELECT 1 FROM canonical_reservation_revision_seals WHERE revision_id = NEW.revision_id) THEN
    RAISE EXCEPTION 'CANONICAL_RESERVATION_REVISION_SEALED';
  END IF;

  -- Validate stay_date falls within [check_in_date, check_out_date)
  IF NEW.stay_date < header.check_in_date OR NEW.stay_date >= header.check_out_date THEN
    RAISE EXCEPTION 'REVISION_NIGHT_DATE_OUT_OF_RANGE';
  END IF;

  -- Fetch root reservation for property consistency
  SELECT id, listing_id INTO root
  FROM canonical_reservations
  WHERE id = header.reservation_id;

  -- Fetch inventory day authority and cross-validate identity
  SELECT id, listing_id, room_type_id, calendar_date INTO inv
  FROM inventory_days
  WHERE id = NEW.inventory_day_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVISION_NIGHT_INVENTORY_DAY_NOT_FOUND';
  END IF;

  IF inv.calendar_date IS DISTINCT FROM NEW.stay_date THEN
    RAISE EXCEPTION 'REVISION_NIGHT_DATE_INVENTORY_MISMATCH';
  END IF;

  IF inv.room_type_id IS DISTINCT FROM NEW.room_type_id THEN
    RAISE EXCEPTION 'REVISION_NIGHT_ROOM_TYPE_INVENTORY_MISMATCH';
  END IF;

  IF inv.listing_id IS DISTINCT FROM root.listing_id THEN
    RAISE EXCEPTION 'REVISION_NIGHT_LISTING_INVENTORY_MISMATCH';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER canonical_reservation_revision_nights_validate
  BEFORE INSERT ON canonical_reservation_revision_nights
  FOR EACH ROW EXECUTE FUNCTION canonical_validate_reservation_revision_night();

-- 8. Atomic Seal Validation Trigger (Enforces Complete Snapshot Coverage Before Seal Can Commit)
CREATE OR REPLACE FUNCTION canonical_validate_and_seal_reservation_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  header RECORD;
  actual_nights INT;
BEGIN
  -- Serialize against concurrent night appends by locking revision header row
  SELECT * INTO header
  FROM canonical_reservation_revisions
  WHERE id = NEW.revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVISION_SEAL_HEADER_NOT_FOUND';
  END IF;

  IF header.reservation_id IS DISTINCT FROM NEW.reservation_id THEN
    RAISE EXCEPTION 'REVISION_SEAL_RESERVATION_MISMATCH';
  END IF;

  -- Validate total allocation row count matches expected nights
  SELECT count(*)::int INTO actual_nights
  FROM canonical_reservation_revision_nights
  WHERE revision_id = NEW.revision_id;

  IF actual_nights <> header.nights THEN
    RAISE EXCEPTION 'REVISION_SEAL_NIGHTS_COUNT_MISMATCH';
  END IF;

  -- Validate all stay_dates are strictly within [check_in_date, check_out_date)
  IF EXISTS (
    SELECT 1 FROM canonical_reservation_revision_nights
    WHERE revision_id = NEW.revision_id
      AND (stay_date < header.check_in_date OR stay_date >= header.check_out_date)
  ) THEN
    RAISE EXCEPTION 'REVISION_SEAL_DATE_OUT_OF_RANGE';
  END IF;

  -- Validate contiguous date coverage with ZERO gaps against generate_series
  IF EXISTS (
    SELECT d::date FROM generate_series(header.check_in_date, header.check_out_date - 1, '1 day'::interval) d
    EXCEPT
    SELECT stay_date FROM canonical_reservation_revision_nights WHERE revision_id = NEW.revision_id
  ) THEN
    RAISE EXCEPTION 'REVISION_SEAL_DATES_INCOMPLETE';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER canonical_reservation_revision_seals_validate
  BEFORE INSERT ON canonical_reservation_revision_seals
  FOR EACH ROW EXECUTE FUNCTION canonical_validate_and_seal_reservation_revision();

-- 9. Unified Revisions Projection View (Exposes Truthful State: V1=COMMITTED, V2+=SEALED or ASSEMBLING)
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
  r.quote_id AS initial_quote_id,
  r.hold_id AS initial_hold_id,
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
  CASE WHEN s.revision_id IS NOT NULL THEN 'SEALED' ELSE 'ASSEMBLING' END AS status,
  rev.id AS revision_id,
  r.origin_kind,
  r.listing_id,
  rev.room_type_id,
  rev.offer_id,
  rev.offer_revision,
  NULL::uuid AS quote_id,
  NULL::uuid AS hold_id,
  r.quote_id AS initial_quote_id,
  r.hold_id AS initial_hold_id,
  r.holder_principal,
  rev.check_in_date,
  rev.check_out_date,
  rev.nights,
  rev.guest_count,
  rev.room_subtotal_paise,
  rev.currency,
  rev.created_at,
  COALESCE(s.sealed_at, rev.created_at) AS finalized_at
FROM canonical_reservation_revisions rev
JOIN canonical_reservations r ON r.id = rev.reservation_id
LEFT JOIN canonical_reservation_revision_seals s ON s.revision_id = rev.id;

-- 10. Deterministic Current Effective Revision Projection View (Selects ONLY Committed V1 or Sealed V2+)
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
  v.initial_quote_id,
  v.initial_hold_id,
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
WHERE v.status IN ('COMMITTED', 'SEALED')
ORDER BY v.reservation_id, v.version DESC;

-- 11. Deterministic Current Effective Allocation Projection View
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

-- 12. Read-Only Query Helpers & Owner-Only Sealing Helper
CREATE OR REPLACE FUNCTION canonical_seal_reservation_revision(target_revision_id UUID)
RETURNS TABLE (
  revision_id UUID,
  reservation_id UUID,
  sealed_at TIMESTAMPTZ
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  rev RECORD;
  saved_seal RECORD;
BEGIN
  SELECT crr.id, crr.reservation_id INTO rev
  FROM public.canonical_reservation_revisions crr
  WHERE crr.id = target_revision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVISION_NOT_FOUND';
  END IF;

  INSERT INTO public.canonical_reservation_revision_seals (revision_id, reservation_id)
  VALUES (target_revision_id, rev.reservation_id)
  RETURNING * INTO saved_seal;

  RETURN QUERY SELECT saved_seal.revision_id, saved_seal.reservation_id, saved_seal.sealed_at;
END $$;

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
  initial_quote_id UUID,
  initial_hold_id UUID,
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
    eff.reservation_id,
    eff.effective_version,
    eff.status,
    eff.effective_revision_id,
    eff.origin_kind,
    eff.listing_id,
    eff.room_type_id,
    eff.offer_id,
    eff.offer_revision,
    eff.quote_id,
    eff.hold_id,
    eff.initial_quote_id,
    eff.initial_hold_id,
    eff.holder_principal,
    eff.check_in_date,
    eff.check_out_date,
    eff.nights,
    eff.guest_count,
    eff.room_subtotal_paise,
    eff.currency,
    eff.created_at,
    eff.finalized_at
  FROM public.canonical_reservation_effective_revisions eff
  WHERE eff.reservation_id = target_reservation_id;
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
    eff.reservation_id,
    eff.effective_version,
    eff.inventory_day_id,
    eff.stay_date,
    eff.room_type_id,
    eff.units
  FROM public.canonical_reservation_effective_allocations eff
  WHERE eff.reservation_id = target_reservation_id
  ORDER BY eff.stay_date ASC, eff.inventory_day_id ASC;
$$;

-- 13. Row Level Security Hardening
ALTER TABLE canonical_reservation_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_revision_nights ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_revision_nights FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_revision_seals ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_revision_seals FORCE ROW LEVEL SECURITY;

CREATE POLICY canonical_reservation_revisions_owner
  ON canonical_reservation_revisions FOR ALL TO current_user USING (true) WITH CHECK (true);
CREATE POLICY canonical_reservation_revision_nights_owner
  ON canonical_reservation_revision_nights FOR ALL TO current_user USING (true) WITH CHECK (true);
CREATE POLICY canonical_reservation_revision_seals_owner
  ON canonical_reservation_revision_seals FOR ALL TO current_user USING (true) WITH CHECK (true);

-- 14. Complete Revocation from PUBLIC
REVOKE ALL ON canonical_reservation_revisions, canonical_reservation_revision_nights, canonical_reservation_revision_seals FROM PUBLIC;
REVOKE ALL ON canonical_reservation_revisions_all, canonical_reservation_effective_revisions, canonical_reservation_effective_allocations FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_seal_reservation_revision(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_get_effective_reservation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_get_effective_reservation_allocation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_reservation_revision_reject_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_reservation_revision_seal_reject_mutation() FROM PUBLIC;

-- 15. Role Isolation: Explicitly Revoke from All Accepted Runtime Roles
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
      EXECUTE format('REVOKE ALL ON canonical_reservation_revision_seals FROM %I', r);
      EXECUTE format('REVOKE ALL ON canonical_reservation_revisions_all FROM %I', r);
      EXECUTE format('REVOKE ALL ON canonical_reservation_effective_revisions FROM %I', r);
      EXECUTE format('REVOKE ALL ON canonical_reservation_effective_allocations FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_seal_reservation_revision(UUID) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_get_effective_reservation(UUID) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_get_effective_reservation_allocation(UUID) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_reservation_revision_reject_mutation() FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_reservation_revision_seal_reject_mutation() FROM %I', r);
    END IF;
  END LOOP;
END $runtime_revokes$;
