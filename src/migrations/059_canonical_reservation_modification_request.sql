-- Migration: 059_canonical_reservation_modification_request.sql
-- W4-C3: Canonical Pending Modification Request Authority
-- Invariants:
--   - Durable internal W4-C3 pending modification-request contract recording historical intent evidence.
--   - Binds one ACTIVE Encho Direct reservation's exact W4-C1 effective source version
--     (source_effective_version, source_revision_id) to one fresh/current immutable W2 accepted-offer target quote
--     (stays_quotes.id) for the same authenticated holder.
--   - Stable reservation identity: canonical_reservations.id remains the single root anchor.
--   - Same listing: target quote must belong to the exact same listing as the canonical reservation.
--   - Offer succession locking: locks the mutable sellable_offers pointer row during NEW request validation
--     to guarantee offer currentness cannot race with request commit.
--   - Wall-clock quote expiry: evaluates clock_timestamp() strictly AFTER acquiring all relevant locks.
--   - Exact idempotent replay: returns stored result with replayed = true BEFORE mutable gates.
--   - Authorization before replay: authenticates caller against reservation holder before disclosing replay.
--   - Zero inventory reservation: touches zero physical inventory (inventory_days.booked_units is untouched).
--   - Zero target hold: does not require, acquire, extend, or write booking_holds.
--   - Zero revision publication: does not create, mutate, or seal canonical_reservation_revisions.
--   - Zero financial mutation: does not calculate, authorize, or settle payable deltas, refunds, or payments.
--   - Zero public route: internal database contract only; no HTTP/GraphQL/REST endpoints mounted.
--   - Strict immutability: request rows cannot be updated or deleted.
--   - Strict role isolation: only encho_modification_issuer may execute the creation function.
--     Zero direct table DML granted to runtime roles or PUBLIC.

-- 1. Supporting Unique Constraint on canonical_reservation_revisions for Composite Foreign Key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_canonical_res_revisions_id_res_ver'
  ) THEN
    ALTER TABLE canonical_reservation_revisions
      ADD CONSTRAINT uq_canonical_res_revisions_id_res_ver
      UNIQUE (id, reservation_id, version);
  END IF;
END $$;

-- 2. Canonical Immutable Modification Request Table
CREATE TABLE IF NOT EXISTS canonical_reservation_modification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  command_id UUID NOT NULL UNIQUE,
  command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
  request_type TEXT NOT NULL DEFAULT 'REQUEST_MODIFICATION' CHECK (request_type = 'REQUEST_MODIFICATION'),
  holder_principal TEXT NOT NULL,
  source_effective_version INT NOT NULL CHECK (source_effective_version >= 1),
  source_revision_id UUID,
  target_quote_id UUID NOT NULL REFERENCES stays_quotes(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT chk_modification_request_source_version_shape
    CHECK (
      (source_effective_version = 1 AND source_revision_id IS NULL)
      OR
      (source_effective_version >= 2 AND source_revision_id IS NOT NULL)
    ),
  CONSTRAINT fk_modification_request_source_revision
    FOREIGN KEY (source_revision_id, reservation_id, source_effective_version)
    REFERENCES canonical_reservation_revisions(id, reservation_id, version)
    ON DELETE RESTRICT,
  CONSTRAINT fk_modification_request_source_sealed
    FOREIGN KEY (source_revision_id)
    REFERENCES canonical_reservation_revision_seals(revision_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_canonical_res_mod_req_res
  ON canonical_reservation_modification_requests(reservation_id);

CREATE INDEX IF NOT EXISTS idx_canonical_res_mod_req_quote
  ON canonical_reservation_modification_requests(target_quote_id);

-- 3. Immutability Trigger
CREATE OR REPLACE FUNCTION canonical_reservation_modification_requests_prevent_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_MODIFICATION_REQUEST_IMMUTABLE';
END $$;

DROP TRIGGER IF EXISTS canonical_reservation_modification_requests_immutable
  ON canonical_reservation_modification_requests;

CREATE TRIGGER canonical_reservation_modification_requests_immutable
  BEFORE UPDATE OR DELETE ON canonical_reservation_modification_requests
  FOR EACH ROW EXECUTE FUNCTION canonical_reservation_modification_requests_prevent_mutation();

-- 4. Atomic Canonical Modification Request Function
CREATE OR REPLACE FUNCTION canonical_request_reservation_modification(
  target_reservation_id UUID,
  target_command_id UUID,
  target_expected_source_effective_version INT,
  target_quote UUID,
  authenticated_principal TEXT
)
RETURNS TABLE (
  request_id UUID,
  reservation_id UUID,
  command_id UUID,
  holder_principal TEXT,
  source_effective_version INT,
  source_revision_id UUID,
  target_quote_id UUID,
  created_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp SET row_security = on AS $$
DECLARE
  res_row RECORD;
  cmd_fingerprint_input JSONB;
  cmd_fingerprint TEXT;
  existing_req RECORD;
  lifecycle_row RECORD;
  eff_row RECORD;
  v_source_effective_version INT;
  v_source_revision_id UUID;
  quote_row RECORD;
  offer_row RECORD;
  offer_rev_row RECORD;
  room_row RECORD;
  listing_row RECORD;
  new_req_id UUID;
  new_created_at TIMESTAMPTZ;
BEGIN
  -- 1. Input validation
  IF target_reservation_id IS NULL
     OR target_command_id IS NULL
     OR target_expected_source_effective_version IS NULL
     OR target_quote IS NULL
     OR authenticated_principal IS NULL
     OR authenticated_principal !~ '^(user:[0-9]+|session:[0-9a-f-]{36})$'
     OR target_expected_source_effective_version < 1 THEN
    RAISE EXCEPTION 'MODIFICATION_INPUT_INVALID';
  END IF;

  -- 2. Lock root reservation & verify existence
  SELECT * INTO res_row
  FROM public.canonical_reservations
  WHERE id = target_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MODIFICATION_RESERVATION_NOT_FOUND';
  END IF;

  -- 3. Verify origin_kind
  IF res_row.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT' THEN
    RAISE EXCEPTION 'MODIFICATION_ORIGIN_NOT_SUPPORTED';
  END IF;

  -- 4. Principal Authorization: caller must match reservation holder
  IF res_row.holder_principal IS DISTINCT FROM authenticated_principal THEN
    RAISE EXCEPTION 'MODIFICATION_NOT_AUTHORIZED';
  END IF;

  -- 5. Compute deterministic command fingerprint
  cmd_fingerprint_input := jsonb_build_object(
    'command_type', 'REQUEST_MODIFICATION',
    'reservation_id', target_reservation_id,
    'authenticated_principal', authenticated_principal,
    'expected_source_effective_version', target_expected_source_effective_version,
    'target_quote_id', target_quote
  );
  cmd_fingerprint := encode(sha256(convert_to(cmd_fingerprint_input::text, 'UTF8')), 'hex');

  -- 6. Exact Idempotent Replay Check (BEFORE Mutable Gates)
  SELECT * INTO existing_req
  FROM public.canonical_reservation_modification_requests
  WHERE canonical_reservation_modification_requests.command_id = target_command_id;

  IF FOUND THEN
    -- Existing command must match same reservation and holder
    IF existing_req.reservation_id IS DISTINCT FROM target_reservation_id
       OR existing_req.holder_principal IS DISTINCT FROM authenticated_principal THEN
      RAISE EXCEPTION 'MODIFICATION_COMMAND_CONFLICT';
    END IF;

    -- Existing command must match exact semantic fingerprint
    IF existing_req.command_fingerprint IS DISTINCT FROM cmd_fingerprint
       OR existing_req.source_effective_version IS DISTINCT FROM target_expected_source_effective_version
       OR existing_req.target_quote_id IS DISTINCT FROM target_quote THEN
      RAISE EXCEPTION 'MODIFICATION_COMMAND_CONFLICT';
    END IF;

    -- Return exact stored request without checking mutable gates
    RETURN QUERY SELECT
      existing_req.id,
      existing_req.reservation_id,
      existing_req.command_id,
      existing_req.holder_principal,
      existing_req.source_effective_version,
      existing_req.source_revision_id,
      existing_req.target_quote_id,
      existing_req.created_at,
      TRUE;
    RETURN;
  END IF;

  -- 7. Mutable Gate 1: Check Lifecycle State (must be ACTIVE)
  SELECT * INTO lifecycle_row
  FROM public.canonical_reservation_lifecycle_current
  WHERE canonical_reservation_lifecycle_current.reservation_id = target_reservation_id;

  IF NOT FOUND OR lifecycle_row.lifecycle_state IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'MODIFICATION_LIFECYCLE_CONFLICT';
  END IF;

  -- 8. Mutable Gate 2: Check Source Effective Version
  SELECT * INTO eff_row
  FROM public.canonical_reservation_effective_revisions
  WHERE canonical_reservation_effective_revisions.reservation_id = target_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MODIFICATION_SOURCE_VERSION_NOT_FOUND';
  END IF;

  IF eff_row.effective_version IS DISTINCT FROM target_expected_source_effective_version THEN
    RAISE EXCEPTION 'MODIFICATION_SOURCE_VERSION_MISMATCH';
  END IF;

  v_source_effective_version := eff_row.effective_version;
  v_source_revision_id := eff_row.effective_revision_id;

  -- 9. Mutable Gate 3: Target Quote Contract Validation
  SELECT * INTO quote_row
  FROM public.stays_quotes
  WHERE id = target_quote
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MODIFICATION_QUOTE_NOT_FOUND';
  END IF;

  IF quote_row.quote_kind IS DISTINCT FROM 'ACCEPTED_OFFER' THEN
    RAISE EXCEPTION 'MODIFICATION_QUOTE_KIND_INVALID';
  END IF;

  IF quote_row.holder_principal IS DISTINCT FROM authenticated_principal
     OR quote_row.holder_principal IS DISTINCT FROM res_row.holder_principal THEN
    RAISE EXCEPTION 'MODIFICATION_NOT_AUTHORIZED';
  END IF;

  IF quote_row.listing_id IS DISTINCT FROM res_row.listing_id THEN
    RAISE EXCEPTION 'MODIFICATION_LISTING_MISMATCH';
  END IF;

  -- 10. Mutable Gate 4: Lock Actual Offer Pointer & Validate Commercial Currentness
  -- Lock the mutable offer pointer row whose update constitutes offer succession (Section 23)
  SELECT * INTO offer_row
  FROM public.sellable_offers
  WHERE id = quote_row.offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MODIFICATION_OFFER_NOT_FOUND';
  END IF;

  IF offer_row.listing_id IS DISTINCT FROM quote_row.listing_id
     OR offer_row.room_type_id IS DISTINCT FROM quote_row.room_type_id THEN
    RAISE EXCEPTION 'MODIFICATION_QUOTE_INCOHERENT';
  END IF;

  IF offer_row.public_disposition IS DISTINCT FROM 'ACCEPTED'
     OR offer_row.current_accepted_revision IS DISTINCT FROM quote_row.offer_revision THEN
    RAISE EXCEPTION 'MODIFICATION_OFFER_SUPERSEDED';
  END IF;

  SELECT * INTO offer_rev_row
  FROM public.sellable_offer_revisions
  WHERE offer_id = quote_row.offer_id AND revision = quote_row.offer_revision
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MODIFICATION_OFFER_REVISION_NOT_FOUND';
  END IF;

  -- Verify static quote / offer coherence
  IF quote_row.currency IS DISTINCT FROM offer_rev_row.currency
     OR quote_row.accepted_nightly_paise IS DISTINCT FROM offer_rev_row.amount_minor
     OR quote_row.source_hash IS DISTINCT FROM offer_rev_row.source_hash
     OR quote_row.guest_count < 1
     OR quote_row.guest_count > offer_rev_row.max_guests
     OR quote_row.check_in_date < offer_rev_row.stay_start
     OR quote_row.check_out_date > offer_rev_row.stay_end
     OR quote_row.base_price_paise IS DISTINCT FROM (quote_row.accepted_nightly_paise * quote_row.nights)
     OR quote_row.nights IS DISTINCT FROM (quote_row.check_out_date - quote_row.check_in_date) THEN
    RAISE EXCEPTION 'MODIFICATION_QUOTE_INCOHERENT';
  END IF;

  SELECT * INTO room_row
  FROM public.room_types
  WHERE id = quote_row.room_type_id
  FOR SHARE;

  IF NOT FOUND OR room_row.listing_id IS DISTINCT FROM quote_row.listing_id THEN
    RAISE EXCEPTION 'MODIFICATION_QUOTE_INCOHERENT';
  END IF;

  SELECT * INTO listing_row
  FROM public.listings
  WHERE id = quote_row.listing_id
  FOR SHARE;

  IF NOT FOUND OR listing_row.publication_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'MODIFICATION_LISTING_NOT_PUBLISHED';
  END IF;

  -- 11. Mutable Gate 5: Wall-clock Quote Expiry check AFTER all locks
  IF quote_row.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'MODIFICATION_QUOTE_EXPIRED';
  END IF;

  -- 12. Insert Immutable Request
  BEGIN
    INSERT INTO public.canonical_reservation_modification_requests (
      reservation_id,
      command_id,
      command_fingerprint,
      request_type,
      holder_principal,
      source_effective_version,
      source_revision_id,
      target_quote_id
    ) VALUES (
      target_reservation_id,
      target_command_id,
      cmd_fingerprint,
      'REQUEST_MODIFICATION',
      res_row.holder_principal,
      v_source_effective_version,
      v_source_revision_id,
      target_quote
    )
    RETURNING id, canonical_reservation_modification_requests.created_at
    INTO new_req_id, new_created_at;

    RETURN QUERY SELECT
      new_req_id,
      target_reservation_id,
      target_command_id,
      res_row.holder_principal,
      v_source_effective_version,
      v_source_revision_id,
      target_quote,
      new_created_at,
      FALSE;
    RETURN;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO existing_req
      FROM public.canonical_reservation_modification_requests
      WHERE canonical_reservation_modification_requests.command_id = target_command_id;

      IF FOUND THEN
        IF existing_req.reservation_id IS DISTINCT FROM target_reservation_id
           OR existing_req.holder_principal IS DISTINCT FROM authenticated_principal
           OR existing_req.command_fingerprint IS DISTINCT FROM cmd_fingerprint
           OR existing_req.source_effective_version IS DISTINCT FROM target_expected_source_effective_version
           OR existing_req.target_quote_id IS DISTINCT FROM target_quote THEN
          RAISE EXCEPTION 'MODIFICATION_COMMAND_CONFLICT';
        END IF;

        RETURN QUERY SELECT
          existing_req.id,
          existing_req.reservation_id,
          existing_req.command_id,
          existing_req.holder_principal,
          existing_req.source_effective_version,
          existing_req.source_revision_id,
          existing_req.target_quote_id,
          existing_req.created_at,
          TRUE;
        RETURN;
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

-- 5. Row-Level Security
ALTER TABLE canonical_reservation_modification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_modification_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canonical_reservation_modification_requests_owner
  ON canonical_reservation_modification_requests;

CREATE POLICY canonical_reservation_modification_requests_owner
  ON canonical_reservation_modification_requests FOR ALL TO current_user
  USING (true) WITH CHECK (true);

-- 6. Privilege Revocation from PUBLIC
REVOKE ALL ON canonical_reservation_modification_requests FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_reservation_modification_requests_prevent_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_request_reservation_modification(UUID, UUID, INT, UUID, TEXT) FROM PUBLIC;

-- 7. Role Isolation: Explicitly Revoke from All Accepted Runtime Roles
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
      EXECUTE format('REVOKE ALL ON canonical_reservation_modification_requests FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_request_reservation_modification(UUID, UUID, INT, UUID, TEXT) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_reservation_modification_requests_prevent_mutation() FROM %I', r);
    END IF;
  END LOOP;
END $runtime_revokes$;

-- 8. Restricted Role Grant for encho_modification_issuer
DO $grant_modification_issuer$
DECLARE
  issuer TEXT := 'encho_modification_issuer';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = issuer) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_roles
      WHERE rolname = issuer
        AND rolcanlogin
        AND NOT rolsuper
        AND NOT rolbypassrls
        AND NOT rolcreatedb
        AND NOT rolcreaterole
        AND NOT rolreplication
    )
    OR has_schema_privilege(issuer, 'public', 'CREATE')
    OR has_database_privilege(issuer, current_database(), 'CREATE')
    OR has_table_privilege(issuer, 'public.canonical_reservations', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.canonical_reservation_nights', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.canonical_reservation_modification_requests', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.canonical_reservation_revisions', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.canonical_reservation_revision_nights', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.canonical_reservation_revision_seals', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.booking_holds', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.inventory_days', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.stays_quotes', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.sellable_offers', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.sellable_offer_revisions', 'INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'MODIFICATION_ISSUER_ROLE_NOT_READY';
    END IF;

    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', issuer);
    EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_request_reservation_modification(UUID,UUID,INT,UUID,TEXT) TO %I', issuer);
  END IF;
END $grant_modification_issuer$;
