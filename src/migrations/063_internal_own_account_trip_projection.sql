-- Q1 ONLY: internal, bounded, authenticated account-owned read projection.
-- No domain writer, public ingress, consumer authentication implementation or
-- production configuration. 052-062 and their runtime grants remain intact.
-- Provision encho_trip_reader separately (LOGIN NOINHERIT and no memberships).
-- A trusted authentication port supplies a <=5 minute HMAC read proof. The
-- reader cannot mint proofs or read the private keyring. No GUC authenticates it.
-- An empty keyring is deliberate: no production identity is invented by DDL.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encho_trip_projection') THEN
    RAISE EXCEPTION 'TRIP_DEFINER_ALREADY_EXISTS';
  END IF;
  CREATE ROLE encho_trip_projection NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
    NOCREATEDB NOCREATEROLE NOREPLICATION;
END $$;
CREATE SCHEMA canonical_trip_private;
REVOKE ALL ON SCHEMA canonical_trip_private FROM PUBLIC;
GRANT USAGE ON SCHEMA public, canonical_trip_private TO encho_trip_projection;

CREATE TABLE canonical_trip_private.authentication_keys (
  key_id TEXT PRIMARY KEY CHECK (key_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  secret BYTEA NOT NULL CHECK (octet_length(secret) = 32),
  enabled BOOLEAN NOT NULL DEFAULT false,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL CHECK (valid_until > valid_from)
);
ALTER TABLE canonical_trip_private.authentication_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_trip_private.authentication_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY trip_key_owner ON canonical_trip_private.authentication_keys TO current_user
  USING (true) WITH CHECK (true);
CREATE POLICY trip_key_read ON canonical_trip_private.authentication_keys FOR SELECT
  TO encho_trip_projection USING (true);
REVOKE ALL ON canonical_trip_private.authentication_keys FROM PUBLIC;
GRANT SELECT ON canonical_trip_private.authentication_keys TO encho_trip_projection;

-- RFC 2104/SHA-256, fixed 32-byte keys. Uses built-in sha256, no extension or
-- provider dependency. Test vectors and Node crypto interoperability are required.
CREATE FUNCTION canonical_trip_private.hmac_sha256(message BYTEA, secret BYTEA)
RETURNS BYTEA LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog, pg_temp AS $$
DECLARE inner_pad BYTEA := ''; outer_pad BYTEA := ''; b INT;
BEGIN
  IF octet_length(secret) <> 32 THEN RAISE EXCEPTION 'TRIP_AUTHENTICATION_REQUIRED'; END IF;
  FOR i IN 0..63 LOOP
    b := CASE WHEN i < 32 THEN get_byte(secret, i) ELSE 0 END;
    inner_pad := inner_pad || set_byte(decode('00', 'hex'), 0, b # 54);
    outer_pad := outer_pad || set_byte(decode('00', 'hex'), 0, b # 92);
  END LOOP;
  RETURN sha256(outer_pad || sha256(inner_pad || message));
END $$;

-- Invoker helper: reached only while executing a reviewed definer owned by the
-- NOLOGIN role. No membership can SET ROLE into it; no runtime can call helpers.
CREATE FUNCTION canonical_trip_private.assert_reader() RETURNS VOID
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE reader RECORD; definer RECORD; object RECORD;
BEGIN
  SELECT * INTO reader FROM pg_roles WHERE rolname = session_user;
  SELECT * INTO definer FROM pg_roles WHERE rolname = 'encho_trip_projection';
  IF reader.rolname IS DISTINCT FROM 'encho_trip_reader' OR current_user <> 'encho_trip_projection'
    OR current_setting('role') <> 'none' OR NOT reader.rolcanlogin OR reader.rolinherit
    OR reader.rolsuper OR reader.rolbypassrls OR reader.rolcreatedb OR reader.rolcreaterole OR reader.rolreplication
    OR definer.rolcanlogin OR definer.rolinherit OR definer.rolsuper OR definer.rolbypassrls
    OR definer.rolcreatedb OR definer.rolcreaterole OR definer.rolreplication
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN (reader.oid, definer.oid)
      OR roleid IN (reader.oid, definer.oid))
    OR has_schema_privilege(reader.oid, 'public', 'CREATE')
    OR has_schema_privilege(reader.oid, 'canonical_trip_private', 'USAGE,CREATE')
    OR has_schema_privilege(definer.oid, 'public', 'CREATE')
    OR has_schema_privilege(definer.oid, 'canonical_trip_private', 'CREATE')
    OR has_database_privilege(reader.oid, current_database(), 'CREATE')
    OR pg_has_role(reader.oid, 'pg_read_all_data'::regrole, 'MEMBER')
    OR pg_has_role(reader.oid, 'pg_write_all_data'::regrole, 'MEMBER') THEN
    RAISE EXCEPTION 'TRIP_ROLE_NOT_RESTRICTED';
  END IF;
  -- Check the whole read authority even for an account with no roots. Missing
  -- dependencies must not masquerade as an authoritative empty collection.
  IF EXISTS (SELECT 1 FROM (VALUES
    ('public','schema_migrations','r',false),
    ('public','canonical_reservations','r',true), ('public','canonical_reservation_nights','r',true),
    ('public','canonical_reservation_revisions','r',true), ('public','canonical_reservation_revision_nights','r',true),
    ('public','canonical_reservation_revision_seals','r',true), ('public','stays_quotes','r',true),
    ('public','booking_holds','r',true), ('public','sellable_offers','r',true), ('public','sellable_offer_revisions','r',true),
    ('public','canonical_payment_attempts','r',true), ('public','canonical_provider_events','r',true),
    ('public','canonical_payment_reconciliations','r',true), ('public','canonical_payable_authorities','r',true),
    ('public','canonical_payment_reservations','r',true), ('public','canonical_reservation_events','r',true),
    ('public','canonical_reservation_cancellation_authorizations','r',true),
    ('public','canonical_reservation_cancellation_inventory_releases','r',true),
    ('public','canonical_reservation_cancellation_release_nights','r',true),
    ('public','canonical_cancellation_refund_decision_evidence','r',true),
    ('public','canonical_cancellation_refund_authorizations','r',true),
    ('public','canonical_cancellation_refund_decision_admissions','r',true),
    ('public','room_types','r',false), ('public','inventory_days','r',false),
    ('public','canonical_reservation_effective_revisions','v',false),
    ('public','canonical_reservation_effective_allocations','v',false),
    ('public','canonical_reservation_lifecycle_current','v',false),
    ('canonical_trip_private','authentication_keys','r',true)
    ) required(schema_name,relation_name,kind,forced_rls)
    LEFT JOIN pg_namespace n ON n.nspname=required.schema_name
    LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=required.relation_name
    WHERE c.oid IS NULL OR c.relkind::text <> required.kind
      OR (required.forced_rls AND NOT (c.relrowsecurity AND c.relforcerowsecurity))) THEN
    RAISE EXCEPTION 'TRIP_AUTHORITY_UNAVAILABLE';
  END IF;
  -- Reuse accepted predecessor fingerprints, rather than reaccepting or
  -- guessing a partial schema. The runner owns the new migration's own digest.
  IF EXISTS (SELECT 1 FROM (VALUES
    ('052_canonical_reservation_hold_finalization.sql','7eaf74e71b15c6e1f6a0c6faf39edaeb7f2e0cebf76aa53ad9440ce684974102'),
    ('053_canonical_payment_evidence_and_reconciliation.sql','2f0c7dcd03509ae26fb558f80a3f75d1ab466e1d16f14530434d16086053836a'),
    ('054_canonical_payment_reservation_composition.sql','a44be4e15d45ceb7a641a68d7bbc13a922a3e9b718bbfef0ca177d71025a797d'),
    ('055_canonical_reservation_lifecycle_authority.sql','ca2a0a338e54182ad0a779247ffc9504413212f2e0fe28b670fa16b4d24a47b2'),
    ('056_canonical_cancellation_completion_authority.sql','5c6c2fee6af4c45461a46e931b771ea0fc8b7c5e4e249be19cb8111ae9a01168'),
    ('057_canonical_reservation_revision_model.sql','a68802bf354cbf0069d42b282d49a8cb796f537acfafb09d837335d7f448624a'),
    ('058_version_aware_cancellation_release.sql','f0d778624a369c5e58ecaebb2027932c7e53f54fbfa28902abfeeb9b5f73fe15'),
    ('059_canonical_reservation_modification_request.sql','b0f928e141e104da23ada5eca745ae508a537a9d44f6dacdde3eb037e4a9df46'),
    ('060_canonical_payment_composition_lock_order_hardening.sql','0823b6d434ebad6a6bce11196671a6ad8ff0a567049ca001fc7f4c3e9708548c'),
    ('061_canonical_cancellation_refund_authorization.sql','bd33f749f07f27bd4f5ff40d7cffe8bd559fac0ca8dccca3da12bb495598d1c9'),
    ('062_canonical_cancellation_refund_approval_admission.sql','dc122d6be813d0ee0fa210b8a96f149e04afa738efe04a24c3f93bbf34a5f30f')
    ) accepted(version,checksum) LEFT JOIN public.schema_migrations history ON history.version=accepted.version
    WHERE history.checksum IS DISTINCT FROM accepted.checksum) THEN
    RAISE EXCEPTION 'TRIP_AUTHORITY_UNAVAILABLE';
  END IF;
  FOR object IN SELECT c.oid, c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public','canonical_trip_private') AND c.relkind IN ('r','p','v','m','f')
  LOOP
    IF pg_has_role(reader.oid, object.relowner, 'MEMBER')
      OR has_any_column_privilege(reader.oid, object.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(reader.oid, object.oid, 'DELETE,TRUNCATE,TRIGGER') THEN
      RAISE EXCEPTION 'TRIP_ROLE_NOT_RESTRICTED';
    END IF;
    IF pg_has_role(definer.oid, object.relowner, 'MEMBER')
      OR has_any_column_privilege(definer.oid, object.oid, 'INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(definer.oid, object.oid, 'DELETE,TRUNCATE,TRIGGER') THEN
      RAISE EXCEPTION 'TRIP_ROLE_NOT_RESTRICTED';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname NOT IN ('canonical_trip_read_ready', 'canonical_own_account_trips')
      AND (has_function_privilege(reader.oid, p.oid, 'EXECUTE')
        OR has_function_privilege(definer.oid, p.oid, 'EXECUTE'))) THEN
    RAISE EXCEPTION 'TRIP_ROLE_NOT_RESTRICTED';
  END IF;
  IF (SELECT count(*) FROM pg_proc p WHERE p.oid IN (
      'public.canonical_trip_read_ready()'::regprocedure,
      'public.canonical_own_account_trips(text,integer,bigint,uuid,text,integer,uuid,timestamptz,uuid)'::regprocedure)
    AND p.proowner = definer.oid AND p.prosecdef AND p.provolatile = 's'
    AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp','row_security=on','TimeZone=UTC']) <> 2 THEN
    RAISE EXCEPTION 'TRIP_ROLE_NOT_RESTRICTED';
  END IF;
END $$;

-- Internal allowlisted projection, not a raw row/packet getter. The caller has
-- already authenticated and selected the immutable own-account root.
CREATE FUNCTION canonical_trip_private.project(target UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp SET row_security = on SET TimeZone = 'UTC' AS $$
DECLARE root RECORD; eff RECORD; quote_row RECORD; bridge RECORD; attempt RECORD; payable RECORD;
  latest RECORD; release_row RECORD; decision RECORD; refund_authorization_row RECORD;
  allocation JSONB; allocation_count INT; payment_condition TEXT; composed BOOLEAN := false;
  lifecycle TEXT := 'ACTIVE'; refund_decision TEXT := 'NONE_RECORDED'; refund_auth TEXT := 'NONE_RECORDED';
BEGIN
  SELECT * INTO root FROM public.canonical_reservations WHERE id = target;
  SELECT * INTO eff FROM public.canonical_reservation_effective_revisions WHERE reservation_id = target;
  SELECT * INTO quote_row FROM public.stays_quotes WHERE id = root.quote_id;
  IF root.id IS NULL OR eff.reservation_id IS DISTINCT FROM root.id OR root.origin_kind <> 'ENCHO_DIRECT'
    OR root.status <> 'INVENTORY_COMMITTED' OR eff.origin_kind IS DISTINCT FROM root.origin_kind
    OR eff.listing_id IS DISTINCT FROM root.listing_id OR eff.holder_principal IS DISTINCT FROM root.holder_principal
    OR eff.initial_quote_id IS DISTINCT FROM root.quote_id OR eff.initial_hold_id IS DISTINCT FROM root.hold_id
    OR eff.nights < 1 OR eff.nights > 366 OR eff.check_out_date - eff.check_in_date <> eff.nights
    OR eff.currency <> 'INR' OR eff.room_subtotal_paise <= 0
    OR quote_row.holder_principal IS DISTINCT FROM root.holder_principal
    OR quote_row.listing_id IS DISTINCT FROM root.listing_id OR quote_row.room_type_id IS DISTINCT FROM root.room_type_id
    OR quote_row.offer_id IS DISTINCT FROM root.offer_id OR quote_row.offer_revision IS DISTINCT FROM root.offer_revision
    OR quote_row.check_in_date IS DISTINCT FROM root.check_in_date OR quote_row.check_out_date IS DISTINCT FROM root.check_out_date
    OR quote_row.nights IS DISTINCT FROM root.nights OR quote_row.guest_count IS DISTINCT FROM root.guest_count
    OR quote_row.base_price_paise IS DISTINCT FROM root.room_subtotal_paise OR quote_row.currency IS DISTINCT FROM root.currency
    OR NOT EXISTS (SELECT 1 FROM public.booking_holds h WHERE h.id = root.hold_id AND h.quote_id = root.quote_id
      AND h.holder_principal = root.holder_principal AND h.room_type_id = root.room_type_id
      AND h.check_in_date = root.check_in_date AND h.check_out_date = root.check_out_date AND h.status = 'CONSUMED')
    OR NOT EXISTS (SELECT 1 FROM public.room_types room WHERE room.id = eff.room_type_id AND room.listing_id = root.listing_id)
    OR NOT EXISTS (SELECT 1 FROM public.sellable_offers o JOIN public.sellable_offer_revisions r ON r.offer_id = o.id
      WHERE r.offer_id = eff.offer_id AND r.revision = eff.offer_revision
        AND o.listing_id = root.listing_id AND o.room_type_id = eff.room_type_id) THEN
    RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY';
  END IF;
  SELECT count(*)::int, jsonb_agg(jsonb_build_object('date', a.stay_date::text, 'units', a.units)
    ORDER BY a.stay_date, a.inventory_day_id) INTO allocation_count, allocation
    FROM public.canonical_reservation_effective_allocations a WHERE a.reservation_id = target;
  IF allocation_count <> eff.nights OR EXISTS (
    SELECT 1 FROM public.canonical_reservation_effective_allocations a
    LEFT JOIN public.inventory_days d ON d.id = a.inventory_day_id WHERE a.reservation_id = target
      AND (a.effective_version IS DISTINCT FROM eff.effective_version OR a.room_type_id IS DISTINCT FROM eff.room_type_id
        OR a.units < 1 OR a.stay_date < eff.check_in_date OR a.stay_date >= eff.check_out_date
        OR d.calendar_date IS DISTINCT FROM a.stay_date OR d.room_type_id IS DISTINCT FROM eff.room_type_id
        OR d.listing_id IS DISTINCT FROM root.listing_id)) OR EXISTS (
    SELECT eff.check_in_date + i FROM generate_series(0, eff.nights - 1) i
    EXCEPT SELECT a.stay_date FROM public.canonical_reservation_effective_allocations a WHERE a.reservation_id = target) THEN
    RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY';
  END IF;

  SELECT * INTO bridge FROM public.canonical_payment_reservations WHERE reservation_id = target;
  IF FOUND THEN
    SELECT * INTO attempt FROM public.canonical_payment_attempts WHERE id = bridge.payment_attempt_id;
    SELECT * INTO payable FROM public.canonical_payable_authorities WHERE quote_id = root.quote_id;
    IF bridge.status <> 'COMMITTED' OR bridge.quote_id IS DISTINCT FROM root.quote_id
      OR bridge.hold_id IS DISTINCT FROM root.hold_id OR attempt.quote_id IS DISTINCT FROM root.quote_id
      OR attempt.hold_id IS DISTINCT FROM root.hold_id OR attempt.holder_principal IS DISTINCT FROM root.holder_principal
      OR attempt.matched_at IS NULL OR payable.status IS DISTINCT FROM 'APPROVED'
      OR payable.id::text IS DISTINCT FROM attempt.expected_authority_ref
      OR payable.authority_kind IS DISTINCT FROM attempt.expected_authority_kind
      OR payable.contract_hash IS DISTINCT FROM attempt.expected_authority_hash
      OR payable.payable_amount_paise IS DISTINCT FROM attempt.expected_amount_paise
      OR payable.currency IS DISTINCT FROM attempt.expected_currency
      OR bridge.command_fingerprint IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_object(
        'command_id', bridge.command_id, 'payment_attempt_id', bridge.payment_attempt_id,
        'quote_id', bridge.quote_id, 'hold_id', bridge.hold_id, 'holder_principal', root.holder_principal,
        'reservation_id', root.id)::text, 'UTF8')), 'hex')
      OR NOT EXISTS (SELECT 1 FROM public.canonical_provider_events e WHERE e.payment_attempt_id = attempt.id
        AND e.origin_kind = attempt.origin_kind AND e.provider_order_ref = attempt.provider_order_ref
        AND e.provider_payment_ref IS NOT NULL AND e.provider_payment_ref <> ''
        AND e.normalized_event_type = 'PAYMENT_CAPTURED' AND e.status = 'PROCESSED'
        AND e.reported_amount_paise = payable.payable_amount_paise AND e.reported_currency = payable.currency) THEN
      RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY';
    END IF;
    composed := true; -- Do not require the *current* attempt state to still be MATCHED_CAPTURE.
  END IF;
  IF EXISTS (SELECT 1 FROM public.canonical_payment_attempts a WHERE a.quote_id = root.quote_id AND a.hold_id = root.hold_id
      AND a.holder_principal IS DISTINCT FROM root.holder_principal) THEN RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY'; END IF;
  SELECT CASE
    WHEN count(*) = 0 THEN 'NO_ATTEMPT'
    WHEN bool_or(a.payment_state = 'RECONCILIATION_REQUIRED' OR a.reconciliation_reason IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.canonical_payment_reconciliations r WHERE r.payment_attempt_id = a.id AND NOT r.resolved))
      THEN 'RECONCILIATION_REQUIRED'
    WHEN bool_or(a.payment_state = 'UNKNOWN') OR count(DISTINCT a.payment_state) > 1 THEN 'UNKNOWN'
    ELSE min(a.payment_state) END INTO payment_condition
    FROM public.canonical_payment_attempts a WHERE a.quote_id = root.quote_id AND a.hold_id = root.hold_id;

  SELECT c.lifecycle_state INTO lifecycle FROM public.canonical_reservation_lifecycle_current c WHERE c.reservation_id = target;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY'; END IF;
  SELECT * INTO latest FROM public.canonical_reservation_events WHERE reservation_id = target
    ORDER BY sequence_number DESC LIMIT 1;
  IF FOUND THEN
    IF lifecycle IS DISTINCT FROM latest.event_type OR lifecycle NOT IN ('CANCELLATION_REQUESTED', 'CANCELLED') OR latest.origin_kind <> root.origin_kind
      OR EXISTS (SELECT 1 FROM public.canonical_reservation_events e WHERE e.reservation_id = target
        AND (e.origin_kind <> root.origin_kind OR e.event_type NOT IN ('CANCELLATION_REQUESTED','CANCELLED')
          OR (e.event_type = 'CANCELLATION_REQUESTED' AND (e.actor_kind <> 'GUEST'
            OR e.actor_principal <> root.holder_principal OR e.sequence_number <> 1)))) THEN
      RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY';
    END IF;
    IF lifecycle = 'CANCELLED' AND (latest.sequence_number <> 2 OR latest.actor_kind <> 'INTERNAL_DECISION'
      OR NOT EXISTS (SELECT 1 FROM public.canonical_reservation_events req WHERE req.event_id = latest.request_event_id
        AND req.reservation_id = target AND req.event_type = 'CANCELLATION_REQUESTED' AND req.sequence_number = 1)
      OR NOT EXISTS (SELECT 1 FROM public.canonical_reservation_cancellation_authorizations auth
        WHERE auth.authorization_id = latest.decision_authorization_id AND auth.reservation_id = target
          AND auth.request_event_id = latest.request_event_id AND auth.consumed_by_event_id = latest.event_id
          AND auth.consumed_at IS NOT NULL)) THEN RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY'; END IF;
  ELSIF lifecycle <> 'ACTIVE' THEN RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY';
  END IF;
  SELECT * INTO release_row FROM public.canonical_reservation_cancellation_inventory_releases WHERE reservation_id = target;
  IF (lifecycle = 'CANCELLED') <> FOUND THEN RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY'; END IF;
  IF lifecycle = 'CANCELLED' THEN
    IF release_row.event_id IS DISTINCT FROM latest.event_id
      OR release_row.authorization_id IS DISTINCT FROM latest.decision_authorization_id
      OR release_row.released_effective_version IS DISTINCT FROM eff.effective_version
      OR release_row.released_revision_id IS DISTINCT FROM eff.effective_revision_id
      OR (SELECT count(*) FROM public.canonical_reservation_cancellation_release_nights WHERE release_id = release_row.release_id) <> eff.nights
      OR EXISTS (SELECT a.inventory_day_id, a.stay_date, a.room_type_id, a.units
        FROM public.canonical_reservation_effective_allocations a WHERE a.reservation_id = target
        EXCEPT SELECT rn.inventory_day_id, rn.stay_date, rn.room_type_id, rn.released_units
        FROM public.canonical_reservation_cancellation_release_nights rn
        WHERE rn.release_id = release_row.release_id AND rn.reservation_id = target) THEN
      RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY';
    END IF;
  END IF;

  SELECT * INTO decision FROM public.canonical_cancellation_refund_decision_evidence WHERE reservation_id = target;
  IF FOUND THEN
    IF NOT composed OR lifecycle <> 'CANCELLED' OR eff.effective_version <> 1
      OR decision.cancellation_release_id IS DISTINCT FROM release_row.release_id
      OR decision.cancellation_event_id IS DISTINCT FROM latest.event_id
      OR decision.paid_bridge_id IS DISTINCT FROM bridge.id OR decision.payment_attempt_id IS DISTINCT FROM attempt.id
      OR decision.quote_id IS DISTINCT FROM root.quote_id OR decision.payable_authority_id IS DISTINCT FROM payable.id THEN
      RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY';
    END IF;
    IF decision.evidence_classification = 'LOCAL_SYNTHETIC_TEST_FIXTURE' THEN refund_decision := 'LOCAL_TEST_EVIDENCE';
    ELSIF decision.evidence_classification = 'AUTHENTICATED_HUMAN_APPROVAL' AND EXISTS (
      SELECT 1 FROM public.canonical_cancellation_refund_decision_admissions a WHERE a.decision_evidence_id = decision.id)
      THEN refund_decision := 'AUTHENTICATED_ADMISSION';
    ELSE RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY'; END IF;
  END IF;
  SELECT * INTO refund_authorization_row FROM public.canonical_cancellation_refund_authorizations WHERE reservation_id = target;
  IF FOUND THEN
    IF decision.id IS NULL OR refund_authorization_row.decision_evidence_id IS DISTINCT FROM decision.id
      OR refund_authorization_row.paid_bridge_id IS DISTINCT FROM bridge.id
      OR refund_authorization_row.cancellation_release_id IS DISTINCT FROM release_row.release_id
      OR refund_authorization_row.payment_attempt_id IS DISTINCT FROM attempt.id THEN RAISE EXCEPTION 'TRIP_SOURCE_INTEGRITY'; END IF;
    refund_auth := 'RECORDED_ONLY';
  END IF;
  RETURN jsonb_build_object(
    'schemaVersion','ENCHO_TRIP_V1','reservationId',root.id,'origin','ENCHO_DIRECT',
    'reservedAt',to_char(root.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'inventoryCommitment','INVENTORY_COMMITTED',
    'stay',jsonb_build_object('version',eff.effective_version,'authority',CASE WHEN eff.effective_version = 1
      THEN 'ORIGINAL_COMMITTED' ELSE 'SEALED_SUCCESSOR_SNAPSHOT' END,
      'listingId',eff.listing_id,'roomTypeId',eff.room_type_id,'offerId',eff.offer_id,'offerRevision',eff.offer_revision,
      'checkIn',eff.check_in_date::text,'checkOut',eff.check_out_date::text,'nights',eff.nights,
      'guestCount',eff.guest_count,'roomSubtotalMinor',eff.room_subtotal_paise::text,'currency',eff.currency,'allocation',allocation),
    'payment',jsonb_build_object('composition',CASE WHEN composed THEN 'VERIFIED_ORIGINAL_BOOKING' ELSE 'NOT_ESTABLISHED' END,
      'compositionVersion',CASE WHEN composed THEN 1 ELSE NULL END,'currentCondition',payment_condition,
      'effectiveRevisionClearance',CASE WHEN composed AND eff.effective_version = 1 THEN 'ORIGINAL_COMPOSITION' ELSE 'NOT_ESTABLISHED' END),
    'lifecycle',jsonb_build_object('state',lifecycle,'inventoryRelease',CASE WHEN lifecycle = 'CANCELLED'
      THEN 'VERIFIED_EFFECTIVE_ALLOCATION' ELSE 'NOT_RECORDED' END),
    'refund',jsonb_build_object('decision',refund_decision,'authorization',refund_auth,'execution','NOT_ESTABLISHED',
      'settlement','NOT_ESTABLISHED','remainingBalance','UNSUPPORTED','externalHistory','UNKNOWN'),
    'checkIn','UNSUPPORTED','fulfillment','UNSUPPORTED','dispute','UNSUPPORTED');
END $$;

CREATE FUNCTION public.canonical_trip_read_ready() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET row_security = on SET TimeZone = 'UTC' AS $$
BEGIN PERFORM canonical_trip_private.assert_reader(); RETURN true; END $$;

CREATE FUNCTION public.canonical_own_account_trips(
  key_id TEXT, account_id INT, expires_seconds BIGINT, nonce UUID, mac TEXT,
  page_size INT, target_reservation UUID DEFAULT NULL, after_time TIMESTAMPTZ DEFAULT NULL, after_id UUID DEFAULT NULL)
RETURNS TABLE(projection JSONB) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET row_security = on SET TimeZone = 'UTC' AS $$
DECLARE key_row RECORD; expected BYTEA; supplied BYTEA; difference INT := 0; now_seconds BIGINT;
BEGIN
  PERFORM canonical_trip_private.assert_reader();
  now_seconds := floor(extract(epoch FROM clock_timestamp()))::bigint;
  IF key_id IS NULL OR key_id !~ '^[a-zA-Z0-9_-]{1,64}$' OR account_id IS NULL OR account_id <= 0
    OR nonce IS NULL OR mac IS NULL OR mac !~ '^[a-f0-9]{64}$' OR expires_seconds IS NULL
    OR expires_seconds <= now_seconds OR expires_seconds > now_seconds + 300 THEN
    RAISE EXCEPTION 'TRIP_AUTHENTICATION_REQUIRED';
  END IF;
  SELECT * INTO key_row FROM canonical_trip_private.authentication_keys k WHERE k.key_id = canonical_own_account_trips.key_id
    AND k.enabled AND k.valid_from <= clock_timestamp() AND k.valid_until >= to_timestamp(expires_seconds);
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIP_AUTHENTICATION_REQUIRED'; END IF;
  expected := canonical_trip_private.hmac_sha256(convert_to('q1-trip-read-v1' || chr(10) || key_id || chr(10)
    || 'user:' || account_id::text || chr(10) || expires_seconds::text || chr(10) || nonce::text, 'UTF8'), key_row.secret);
  supplied := decode(mac,'hex');
  FOR i IN 0..31 LOOP difference := difference | (get_byte(expected,i) # get_byte(supplied,i)); END LOOP;
  IF difference <> 0 THEN RAISE EXCEPTION 'TRIP_AUTHENTICATION_REQUIRED'; END IF;
  IF page_size IS NULL OR page_size < 1 OR page_size > 50 OR (after_time IS NULL) <> (after_id IS NULL)
    OR (target_reservation IS NOT NULL AND (after_time IS NOT NULL OR page_size <> 1)) THEN
    RAISE EXCEPTION 'TRIP_INPUT_INVALID';
  END IF;
  RETURN QUERY WITH own_page AS MATERIALIZED (SELECT r.id,r.created_at
    FROM public.canonical_reservations r
    WHERE r.origin_kind = 'ENCHO_DIRECT' AND r.holder_principal = 'user:' || account_id::text
      AND (target_reservation IS NULL OR r.id = target_reservation)
      AND (after_time IS NULL OR (r.created_at,r.id) < (after_time,after_id))
    ORDER BY r.created_at DESC,r.id DESC LIMIT CASE WHEN target_reservation IS NULL THEN page_size + 1 ELSE 1 END)
    SELECT canonical_trip_private.project(page.id) FROM own_page page ORDER BY page.created_at DESC,page.id DESC;
END $$;

-- Dedicated NOLOGIN definer, SELECT-only policies. This is not an ordinary web
-- role grant or a change to any accepted writer/helper. Raw RLS bypass is absent.
DO $reads$
DECLARE relation TEXT;
BEGIN
  FOREACH relation IN ARRAY ARRAY['canonical_reservations','stays_quotes','canonical_payment_attempts',
    'canonical_payment_reservations','canonical_payable_authorities','canonical_payment_reconciliations',
    'canonical_reservation_events','canonical_reservation_cancellation_authorizations',
    'canonical_reservation_cancellation_inventory_releases','canonical_reservation_cancellation_release_nights',
    'canonical_cancellation_refund_decision_evidence','canonical_cancellation_refund_authorizations',
    'canonical_cancellation_refund_decision_admissions','sellable_offers','sellable_offer_revisions']
  LOOP
    EXECUTE format('CREATE POLICY q1_private_projection ON public.%I FOR SELECT TO encho_trip_projection USING (true)',relation);
    EXECUTE format('GRANT SELECT ON public.%I TO encho_trip_projection',relation);
  END LOOP;
END $reads$;
GRANT SELECT ON public.canonical_reservation_effective_revisions, public.canonical_reservation_effective_allocations,
  public.canonical_reservation_lifecycle_current
  TO encho_trip_projection;
GRANT SELECT (version,checksum) ON public.schema_migrations TO encho_trip_projection;
GRANT SELECT (id,listing_id) ON public.room_types TO encho_trip_projection;
GRANT SELECT (id,listing_id,room_type_id,calendar_date) ON public.inventory_days TO encho_trip_projection;
GRANT SELECT (id,quote_id,holder_principal,room_type_id,check_in_date,check_out_date,status)
  ON public.booking_holds TO encho_trip_projection;
CREATE POLICY q1_private_projection ON public.booking_holds FOR SELECT TO encho_trip_projection USING (true);
GRANT SELECT (payment_attempt_id,origin_kind,provider_order_ref,provider_payment_ref,normalized_event_type,
  status,reported_amount_paise,reported_currency) ON public.canonical_provider_events TO encho_trip_projection;
CREATE POLICY q1_private_projection ON public.canonical_provider_events FOR SELECT TO encho_trip_projection USING (true);

-- ALTER OWNER needs temporary schema CREATE, revoked before readiness/adoption.
GRANT CREATE ON SCHEMA public,canonical_trip_private TO encho_trip_projection;
DO $owners$
DECLARE routine RECORD; grantee RECORD;
BEGIN
  FOR routine IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'canonical_trip_private' OR (n.nspname = 'public'
      AND p.proname IN ('canonical_trip_read_ready','canonical_own_account_trips'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',routine.signature);
    -- Do not inherit the migrator's possible default runtime EXECUTE grants.
    FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) AS role_name
      FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
      WHERE p.oid = routine.signature::regprocedure AND a.grantee <> 0 AND a.grantee <> p.proowner
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',routine.signature,grantee.role_name);
    END LOOP;
    EXECUTE format('ALTER FUNCTION %s OWNER TO encho_trip_projection',routine.signature);
  END LOOP;
END $owners$;
REVOKE CREATE ON SCHEMA public,canonical_trip_private FROM encho_trip_projection;
DO $grant$
DECLARE reader RECORD; object RECORD;
BEGIN
  SELECT * INTO reader FROM pg_roles WHERE rolname = 'encho_trip_reader';
  IF NOT FOUND OR NOT reader.rolcanlogin OR reader.rolinherit OR reader.rolsuper OR reader.rolbypassrls
    OR reader.rolcreatedb OR reader.rolcreaterole OR reader.rolreplication
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member = reader.oid OR roleid = reader.oid)
    OR has_schema_privilege(reader.oid,'public','CREATE')
    OR has_schema_privilege(reader.oid,'canonical_trip_private','USAGE,CREATE')
    OR has_database_privilege(reader.oid,current_database(),'CREATE') THEN
    RAISE EXCEPTION 'TRIP_ROLE_NOT_RESTRICTED';
  END IF;
  FOR object IN SELECT c.oid,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','canonical_trip_private') AND c.relkind IN ('r','p','v','m','f')
  LOOP
    IF pg_has_role(reader.oid,object.relowner,'MEMBER')
      OR has_any_column_privilege(reader.oid,object.oid,'SELECT,INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(reader.oid,object.oid,'DELETE,TRUNCATE,TRIGGER') THEN
      RAISE EXCEPTION 'TRIP_ROLE_NOT_RESTRICTED';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND p.proname NOT IN ('canonical_trip_read_ready','canonical_own_account_trips')
      AND has_function_privilege(reader.oid,p.oid,'EXECUTE')) THEN
    RAISE EXCEPTION 'TRIP_ROLE_NOT_RESTRICTED';
  END IF;
  GRANT USAGE ON SCHEMA public TO encho_trip_reader;
  GRANT EXECUTE ON FUNCTION public.canonical_trip_read_ready(),
    public.canonical_own_account_trips(TEXT,INT,BIGINT,UUID,TEXT,INT,UUID,TIMESTAMPTZ,UUID) TO encho_trip_reader;
END $grant$;
CREATE INDEX idx_canonical_reservations_own_trip_page ON public.canonical_reservations
  (holder_principal,created_at DESC,id DESC) WHERE origin_kind = 'ENCHO_DIRECT';
