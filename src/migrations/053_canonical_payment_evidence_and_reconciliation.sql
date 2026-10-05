-- Migration: 053_canonical_payment_evidence_and_reconciliation.sql
-- W3-B Task 2: Provider-independent canonical payment evidence and reconciliation authority.
-- Invariants:
--   - Does NOT create reservations or invoke W3-A finalization.
--   - Does NOT move real money or call external payment providers.
--   - W2 room subtotal is NOT payable total.
--   - If approved payable total authority is absent, state must remain RECONCILIATION_REQUIRED / PAYABLE_AUTHORITY_MISSING.
--   - Provider events are monotonically normalized and strictly idempotent.
--   - Mutated payloads for an existing event ID are quarantined and flagged for reconciliation.
--   - Captures arriving after hold expiry are recorded into RECONCILIATION_REQUIRED / HOLD_EXPIRED (no hold extension, no reservation).
--   - Amount mismatches are recorded into RECONCILIATION_REQUIRED / AMOUNT_MISMATCH (both amounts preserved for audit).
--   - Recoverable UNKNOWN states are recorded and distinct from FAILED.

CREATE TABLE IF NOT EXISTS canonical_payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID UNIQUE NOT NULL,
  holder_principal TEXT NOT NULL,
  quote_id UUID REFERENCES stays_quotes(id) ON DELETE RESTRICT,
  hold_id UUID REFERENCES booking_holds(id) ON DELETE RESTRICT,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('RAZORPAY', 'STRIPE', 'SYNTHETIC_TEST')),
  provider_order_ref TEXT,
  expected_currency TEXT NOT NULL DEFAULT 'INR',
  expected_amount_paise BIGINT CHECK (expected_amount_paise > 0),
  expected_authority_kind TEXT NOT NULL CHECK (expected_authority_kind IN ('NONE', 'ACCEPTED_OFFER_ITINERARY_QUOTE', 'SYNTHETIC_INTERNAL_TEST')),
  expected_authority_ref TEXT,
  expected_authority_hash TEXT,
  payment_state TEXT NOT NULL CHECK (payment_state IN ('INITIATED', 'AUTHORIZED', 'EVIDENCE_CAPTURED', 'MATCHED_CAPTURE', 'FAILED', 'UNKNOWN', 'RECONCILIATION_REQUIRED')),
  reconciliation_reason TEXT CHECK (reconciliation_reason IS NULL OR reconciliation_reason IN ('PAYABLE_AUTHORITY_MISSING', 'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'HOLD_EXPIRED', 'OUT_OF_ORDER_EVENT', 'UNKNOWN_OUTCOME', 'EVENT_CONFLICT_QUARANTINED', 'FINALIZER_FAILURE')),
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  CHECK (origin_kind <> 'SYNTHETIC_TEST' OR expected_authority_kind = 'SYNTHETIC_INTERNAL_TEST' OR expected_authority_kind = 'NONE'),
  CHECK (payment_state <> 'MATCHED_CAPTURE' OR (expected_amount_paise IS NOT NULL AND expected_authority_kind <> 'NONE' AND reconciliation_reason IS NULL AND matched_at IS NOT NULL)),
  CHECK (expected_authority_kind <> 'NONE' OR expected_amount_paise IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_canonical_payment_attempts_hold ON canonical_payment_attempts(hold_id);
CREATE INDEX IF NOT EXISTS idx_canonical_payment_attempts_quote ON canonical_payment_attempts(quote_id);
CREATE INDEX IF NOT EXISTS idx_canonical_payment_attempts_order_ref ON canonical_payment_attempts(origin_kind, provider_order_ref);
CREATE INDEX IF NOT EXISTS idx_canonical_payment_attempts_state ON canonical_payment_attempts(payment_state);

CREATE TABLE IF NOT EXISTS canonical_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('RAZORPAY', 'STRIPE', 'SYNTHETIC_TEST')),
  provider_event_id TEXT NOT NULL,
  payment_attempt_id UUID REFERENCES canonical_payment_attempts(id) ON DELETE RESTRICT,
  provider_payment_ref TEXT,
  provider_order_ref TEXT,
  normalized_event_type TEXT NOT NULL CHECK (normalized_event_type IN ('PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED', 'PAYMENT_UNKNOWN')),
  reported_amount_paise BIGINT NOT NULL CHECK (reported_amount_paise >= 0),
  reported_currency TEXT NOT NULL,
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  evidence_payload JSONB NOT NULL,
  provider_event_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('PROCESSED', 'DUPLICATE_IGNORED', 'QUARANTINED')),
  quarantine_reason TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT uq_canonical_provider_event UNIQUE (origin_kind, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_provider_events_attempt ON canonical_provider_events(payment_attempt_id);
CREATE INDEX IF NOT EXISTS idx_canonical_provider_events_payment_ref ON canonical_provider_events(origin_kind, provider_payment_ref);

CREATE TABLE IF NOT EXISTS canonical_quarantined_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_kind TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  conflicting_evidence_hash TEXT NOT NULL CHECK (conflicting_evidence_hash ~ '^[a-f0-9]{64}$'),
  conflicting_payload JSONB NOT NULL,
  original_evidence_hash TEXT NOT NULL,
  payment_attempt_id UUID REFERENCES canonical_payment_attempts(id) ON DELETE SET NULL,
  quarantine_reason TEXT NOT NULL DEFAULT 'MUTATED_PAYLOAD_FOR_EXISTING_EVENT_ID',
  received_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS canonical_payment_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_attempt_id UUID REFERENCES canonical_payment_attempts(id) ON DELETE RESTRICT,
  provider_event_id TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('PAYABLE_AUTHORITY_MISSING', 'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'HOLD_EXPIRED', 'OUT_OF_ORDER_EVENT', 'UNKNOWN_OUTCOME', 'EVENT_CONFLICT_QUARANTINED', 'FINALIZER_FAILURE')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_canonical_payment_reconciliations_attempt ON canonical_payment_reconciliations(payment_attempt_id);
CREATE INDEX IF NOT EXISTS idx_canonical_payment_reconciliations_reason ON canonical_payment_reconciliations(reason);

-- Immutability triggers
CREATE OR REPLACE FUNCTION canonical_payment_event_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_PAYMENT_EVENT_IMMUTABLE';
END $$;

CREATE TRIGGER canonical_provider_events_immutable BEFORE UPDATE OR DELETE ON canonical_provider_events
  FOR EACH ROW EXECUTE FUNCTION canonical_payment_event_reject_mutation();

CREATE TRIGGER canonical_quarantined_events_immutable BEFORE UPDATE OR DELETE ON canonical_quarantined_events
  FOR EACH ROW EXECUTE FUNCTION canonical_payment_event_reject_mutation();

CREATE OR REPLACE FUNCTION canonical_payment_attempt_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_PAYMENT_ATTEMPT_DELETE_FORBIDDEN';
END $$;

CREATE TRIGGER canonical_payment_attempts_no_delete BEFORE DELETE ON canonical_payment_attempts
  FOR EACH ROW EXECUTE FUNCTION canonical_payment_attempt_reject_delete();

CREATE OR REPLACE FUNCTION canonical_payment_reconciliation_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_PAYMENT_RECONCILIATION_DELETE_FORBIDDEN';
END $$;

CREATE TRIGGER canonical_payment_reconciliations_no_delete BEFORE DELETE ON canonical_payment_reconciliations
  FOR EACH ROW EXECUTE FUNCTION canonical_payment_reconciliation_reject_delete();

-- SECURITY DEFINER Procedures
CREATE OR REPLACE FUNCTION canonical_create_payment_attempt(
  target_command UUID,
  target_holder_principal TEXT,
  target_origin_kind TEXT,
  target_quote UUID,
  target_hold UUID,
  target_provider_order_ref TEXT,
  target_expected_authority_kind TEXT,
  target_expected_amount_paise BIGINT,
  target_expected_currency TEXT,
  target_expected_authority_hash TEXT
)
RETURNS TABLE(attempt_id UUID, payment_state TEXT, replayed BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE
  existing RECORD;
  quote_row RECORD;
  hold_row RECORD;
  computed_state TEXT := 'INITIATED';
  rec_reason TEXT := NULL;
  saved_id UUID;
BEGIN
  IF target_command IS NULL OR target_holder_principal IS NULL
    OR target_holder_principal !~ '^(user:[0-9]+|session:[0-9a-f-]{36})$'
    OR target_origin_kind NOT IN ('RAZORPAY', 'STRIPE', 'SYNTHETIC_TEST')
    OR target_expected_authority_kind NOT IN ('NONE', 'ACCEPTED_OFFER_ITINERARY_QUOTE', 'SYNTHETIC_INTERNAL_TEST') THEN
    RAISE EXCEPTION 'PAYMENT_INPUT_INVALID';
  END IF;

  -- Idempotency check on command_id
  SELECT * INTO existing FROM public.canonical_payment_attempts WHERE command_id = target_command FOR UPDATE;
  IF FOUND THEN
    IF existing.holder_principal IS DISTINCT FROM target_holder_principal
      OR existing.origin_kind IS DISTINCT FROM target_origin_kind
      OR existing.quote_id IS DISTINCT FROM target_quote
      OR existing.hold_id IS DISTINCT FROM target_hold THEN
      RAISE EXCEPTION 'PAYMENT_COMMAND_CONFLICT';
    END IF;
    RETURN QUERY SELECT existing.id, existing.payment_state, TRUE;
    RETURN;
  END IF;

  -- Validate quote if provided
  IF target_quote IS NOT NULL THEN
    SELECT * INTO quote_row FROM public.stays_quotes WHERE id = target_quote;
    IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_QUOTE_NOT_FOUND'; END IF;
    IF quote_row.quote_kind = 'ACCEPTED_OFFER' THEN
      -- In accepted offers, total_paise is NULL (authority legally gated).
      -- If target_expected_authority_kind claims ACCEPTED_OFFER_ITINERARY_QUOTE, but quote total_paise is NULL:
      IF target_expected_authority_kind = 'ACCEPTED_OFFER_ITINERARY_QUOTE' AND quote_row.total_paise IS NULL THEN
        RAISE EXCEPTION 'PAYABLE_TOTAL_AUTHORITY_MISSING_IN_QUOTE';
      END IF;
    END IF;
  END IF;

  -- Validate hold if provided
  IF target_hold IS NOT NULL THEN
    SELECT * INTO hold_row FROM public.booking_holds WHERE id = target_hold;
    IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_HOLD_NOT_FOUND'; END IF;
  END IF;

  -- If expected authority is NONE, amount must be NULL
  IF target_expected_authority_kind = 'NONE' AND target_expected_amount_paise IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_AMOUNT_WITHOUT_AUTHORITY_FORBIDDEN';
  END IF;

  INSERT INTO public.canonical_payment_attempts(
    command_id, holder_principal, quote_id, hold_id, origin_kind,
    provider_order_ref, expected_currency, expected_amount_paise,
    expected_authority_kind, expected_authority_ref, expected_authority_hash,
    payment_state, reconciliation_reason
  ) VALUES (
    target_command, target_holder_principal, target_quote, target_hold, target_origin_kind,
    target_provider_order_ref, coalesce(target_expected_currency, 'INR'), target_expected_amount_paise,
    target_expected_authority_kind, CASE WHEN target_quote IS NOT NULL THEN target_quote::text ELSE NULL END,
    target_expected_authority_hash, computed_state, rec_reason
  )
  RETURNING id INTO saved_id;

  RETURN QUERY SELECT saved_id, computed_state, FALSE;
END $$;

CREATE OR REPLACE FUNCTION canonical_ingest_provider_event(
  target_attempt_id UUID,
  target_origin_kind TEXT,
  target_event_id TEXT,
  target_event_type TEXT,
  target_reported_amount BIGINT,
  target_reported_currency TEXT,
  target_provider_payment_ref TEXT,
  target_provider_order_ref TEXT,
  target_evidence_payload JSONB,
  target_provider_event_at TIMESTAMPTZ
)
RETURNS TABLE(
  event_record_id UUID,
  attempt_id UUID,
  ingest_status TEXT,
  payment_state TEXT,
  reconciliation_reason TEXT,
  replayed BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE
  computed_hash TEXT;
  existing_event RECORD;
  attempt RECORD;
  held RECORD;
  next_state TEXT;
  next_reason TEXT;
  saved_event_id UUID;
BEGIN
  IF target_attempt_id IS NULL OR target_origin_kind IS NULL OR target_event_id IS NULL
    OR target_event_type NOT IN ('PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED', 'PAYMENT_UNKNOWN')
    OR target_reported_amount IS NULL OR target_reported_amount < 0
    OR target_reported_currency IS NULL OR target_evidence_payload IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_EVENT_INPUT_INVALID';
  END IF;

  computed_hash := encode(sha256(convert_to(target_evidence_payload::text, 'UTF8')), 'hex');

  -- Lock attempt first to prevent concurrent state corruption
  SELECT * INTO attempt FROM public.canonical_payment_attempts WHERE id = target_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_NOT_FOUND'; END IF;

  -- Check existing provider event
  SELECT * INTO existing_event FROM public.canonical_provider_events
    WHERE origin_kind = target_origin_kind AND provider_event_id = target_event_id FOR UPDATE;

  IF FOUND THEN
    -- If evidence hash matches exactly: identical duplicate!
    IF existing_event.evidence_hash = computed_hash THEN
      RETURN QUERY SELECT existing_event.id, attempt.id, 'DUPLICATE_IGNORED'::TEXT,
        attempt.payment_state, attempt.reconciliation_reason, TRUE;
      RETURN;
    ELSE
      -- Conflict / Mutation for same event ID: quarantine!
      INSERT INTO public.canonical_quarantined_events(
        origin_kind, provider_event_id, conflicting_evidence_hash,
        conflicting_payload, original_evidence_hash, payment_attempt_id,
        quarantine_reason
      ) VALUES (
        target_origin_kind, target_event_id, computed_hash,
        target_evidence_payload, existing_event.evidence_hash, attempt.id,
        'MUTATED_PAYLOAD_FOR_EXISTING_EVENT_ID'
      );

      UPDATE public.canonical_payment_attempts
        SET payment_state = 'RECONCILIATION_REQUIRED',
            reconciliation_reason = 'EVENT_CONFLICT_QUARANTINED',
            updated_at = statement_timestamp()
        WHERE id = attempt.id;

      INSERT INTO public.canonical_payment_reconciliations(
        payment_attempt_id, provider_event_id, reason, details
      ) VALUES (
        attempt.id, target_event_id, 'EVENT_CONFLICT_QUARANTINED',
        jsonb_build_object(
          'existing_hash', existing_event.evidence_hash,
          'conflicting_hash', computed_hash,
          'reported_amount', target_reported_amount
        )
      );

      RETURN QUERY SELECT NULL::UUID, attempt.id, 'QUARANTINED'::TEXT,
        'RECONCILIATION_REQUIRED'::TEXT, 'EVENT_CONFLICT_QUARANTINED'::TEXT, FALSE;
      RETURN;
    END IF;
  END IF;

  -- Record the new provider event
  INSERT INTO public.canonical_provider_events(
    origin_kind, provider_event_id, payment_attempt_id,
    provider_payment_ref, provider_order_ref, normalized_event_type,
    reported_amount_paise, reported_currency, evidence_hash,
    evidence_payload, provider_event_at, status
  ) VALUES (
    target_origin_kind, target_event_id, attempt.id,
    target_provider_payment_ref, target_provider_order_ref, target_event_type,
    target_reported_amount, target_reported_currency, computed_hash,
    target_evidence_payload, target_provider_event_at, 'PROCESSED'
  ) RETURNING id INTO saved_event_id;

  next_state := attempt.payment_state;
  next_reason := attempt.reconciliation_reason;

  -- Monotonic State Normalization & Reconciliation Evaluation
  IF target_event_type = 'PAYMENT_FAILED' THEN
    -- If already captured, do NOT erase capture without an explicit reconciliation contract!
    IF attempt.payment_state IN ('MATCHED_CAPTURE', 'EVIDENCE_CAPTURED') THEN
      next_state := 'RECONCILIATION_REQUIRED';
      next_reason := 'OUT_OF_ORDER_EVENT';
      INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
        VALUES (attempt.id, target_event_id, 'OUT_OF_ORDER_EVENT', jsonb_build_object('event_type', 'PAYMENT_FAILED', 'prior_state', attempt.payment_state));
    ELSE
      next_state := 'FAILED';
      next_reason := NULL;
    END IF;

  ELSIF target_event_type = 'PAYMENT_AUTHORIZED' THEN
    -- Older AUTHORIZED arriving after CAPTURED must NOT regress state
    IF attempt.payment_state IN ('MATCHED_CAPTURE', 'EVIDENCE_CAPTURED') THEN
      -- No-op: keep capture
    ELSIF attempt.payment_state = 'INITIATED' THEN
      next_state := 'AUTHORIZED';
      next_reason := NULL;
    END IF;

  ELSIF target_event_type = 'PAYMENT_UNKNOWN' THEN
    next_state := 'UNKNOWN';
    next_reason := 'UNKNOWN_OUTCOME';
    INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
      VALUES (attempt.id, target_event_id, 'UNKNOWN_OUTCOME', jsonb_build_object('reported_amount', target_reported_amount));

  ELSIF target_event_type = 'PAYMENT_CAPTURED' THEN
    -- Evaluate against hold expiry
    IF attempt.hold_id IS NOT NULL THEN
      SELECT * INTO held FROM public.booking_holds WHERE id = attempt.hold_id;
      IF NOT FOUND OR held.status <> 'ACTIVE' OR held.expires_at <= clock_timestamp() THEN
        next_state := 'RECONCILIATION_REQUIRED';
        next_reason := 'HOLD_EXPIRED';
        INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
          VALUES (attempt.id, target_event_id, 'HOLD_EXPIRED', jsonb_build_object('hold_id', attempt.hold_id, 'hold_status', coalesce(held.status, 'NOT_FOUND'), 'reported_amount', target_reported_amount));
      END IF;
    END IF;

    -- If not already flagged for hold expiry:
    IF next_reason IS NULL THEN
      -- Evaluate expected payable authority
      IF attempt.expected_authority_kind = 'NONE' OR attempt.expected_amount_paise IS NULL THEN
        next_state := 'RECONCILIATION_REQUIRED';
        next_reason := 'PAYABLE_AUTHORITY_MISSING';
        INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
          VALUES (attempt.id, target_event_id, 'PAYABLE_AUTHORITY_MISSING', jsonb_build_object('reported_amount', target_reported_amount, 'reported_currency', target_reported_currency));

      ELSIF attempt.expected_currency IS DISTINCT FROM target_reported_currency THEN
        next_state := 'RECONCILIATION_REQUIRED';
        next_reason := 'CURRENCY_MISMATCH';
        INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
          VALUES (attempt.id, target_event_id, 'CURRENCY_MISMATCH', jsonb_build_object('expected_currency', attempt.expected_currency, 'reported_currency', target_reported_currency));

      ELSIF attempt.expected_amount_paise IS DISTINCT FROM target_reported_amount THEN
        next_state := 'RECONCILIATION_REQUIRED';
        next_reason := 'AMOUNT_MISMATCH';
        INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
          VALUES (attempt.id, target_event_id, 'AMOUNT_MISMATCH', jsonb_build_object('expected_amount_paise', attempt.expected_amount_paise, 'reported_amount_paise', target_reported_amount));

      ELSE
        -- All authoritative checks pass!
        next_state := 'MATCHED_CAPTURE';
        next_reason := NULL;
      END IF;
    END IF;
  END IF;

  UPDATE public.canonical_payment_attempts
    SET payment_state = next_state,
        reconciliation_reason = next_reason,
        matched_at = CASE WHEN next_state = 'MATCHED_CAPTURE' AND attempt.matched_at IS NULL THEN statement_timestamp() ELSE attempt.matched_at END,
        updated_at = statement_timestamp()
    WHERE id = attempt.id;

  RETURN QUERY SELECT saved_event_id, attempt.id, 'PROCESSED'::TEXT, next_state, next_reason, FALSE;
END $$;

CREATE OR REPLACE FUNCTION canonical_record_payment_unknown(
  target_attempt_id UUID,
  target_reason_details JSONB
)
RETURNS TABLE(attempt_id UUID, payment_state TEXT, reconciliation_reason TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE
  attempt RECORD;
BEGIN
  SELECT * INTO attempt FROM public.canonical_payment_attempts WHERE id = target_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_NOT_FOUND'; END IF;

  UPDATE public.canonical_payment_attempts
    SET payment_state = 'UNKNOWN',
        reconciliation_reason = 'UNKNOWN_OUTCOME',
        updated_at = statement_timestamp()
    WHERE id = target_attempt_id;

  INSERT INTO public.canonical_payment_reconciliations(
    payment_attempt_id, provider_event_id, reason, details
  ) VALUES (
    target_attempt_id, NULL, 'UNKNOWN_OUTCOME', coalesce(target_reason_details, '{}'::jsonb)
  );

  RETURN QUERY SELECT target_attempt_id, 'UNKNOWN'::TEXT, 'UNKNOWN_OUTCOME'::TEXT;
END $$;

CREATE OR REPLACE FUNCTION canonical_get_payment_attempt(target_attempt_id UUID)
RETURNS TABLE(
  id UUID,
  command_id UUID,
  holder_principal TEXT,
  quote_id UUID,
  hold_id UUID,
  origin_kind TEXT,
  provider_order_ref TEXT,
  expected_currency TEXT,
  expected_amount_paise BIGINT,
  expected_authority_kind TEXT,
  payment_state TEXT,
  reconciliation_reason TEXT,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
BEGIN
  RETURN QUERY SELECT a.id, a.command_id, a.holder_principal, a.quote_id, a.hold_id,
    a.origin_kind, a.provider_order_ref, a.expected_currency, a.expected_amount_paise,
    a.expected_authority_kind, a.payment_state, a.reconciliation_reason, a.matched_at,
    a.created_at, a.updated_at
  FROM public.canonical_payment_attempts a
  WHERE a.id = target_attempt_id;
END $$;

CREATE OR REPLACE FUNCTION canonical_get_payment_reconciliations(target_attempt_id UUID)
RETURNS TABLE(
  id UUID,
  payment_attempt_id UUID,
  provider_event_id TEXT,
  reason TEXT,
  details JSONB,
  resolved BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
BEGIN
  RETURN QUERY SELECT r.id, r.payment_attempt_id, r.provider_event_id, r.reason,
    r.details, r.resolved, r.created_at
  FROM public.canonical_payment_reconciliations r
  WHERE r.payment_attempt_id = target_attempt_id
  ORDER BY r.created_at ASC;
END $$;

-- Security & RLS
ALTER TABLE canonical_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_payment_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_provider_events FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_quarantined_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_quarantined_events FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_payment_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_payment_reconciliations FORCE ROW LEVEL SECURITY;

CREATE POLICY canonical_payment_attempts_owner ON canonical_payment_attempts FOR ALL TO current_user USING(true) WITH CHECK(true);
CREATE POLICY canonical_provider_events_owner ON canonical_provider_events FOR ALL TO current_user USING(true) WITH CHECK(true);
CREATE POLICY canonical_quarantined_events_owner ON canonical_quarantined_events FOR ALL TO current_user USING(true) WITH CHECK(true);
CREATE POLICY canonical_payment_reconciliations_owner ON canonical_payment_reconciliations FOR ALL TO current_user USING(true) WITH CHECK(true);

REVOKE ALL ON canonical_payment_attempts, canonical_provider_events, canonical_quarantined_events, canonical_payment_reconciliations FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_create_payment_attempt(UUID,TEXT,TEXT,UUID,UUID,TEXT,TEXT,BIGINT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_ingest_provider_event(UUID,TEXT,TEXT,TEXT,BIGINT,TEXT,TEXT,TEXT,JSONB,TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_record_payment_unknown(UUID,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_get_payment_attempt(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_get_payment_reconciliations(UUID) FROM PUBLIC;

DO $grant$
DECLARE worker TEXT := 'encho_payment_worker';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=worker AND rolcanlogin AND NOT rolsuper
    AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
    OR has_schema_privilege(worker,'public','CREATE')
    OR has_database_privilege(worker,current_database(),'CREATE')
    OR has_table_privilege(worker,'public.canonical_payment_attempts','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_provider_events','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_quarantined_events','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_payment_reconciliations','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_reservations','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.booking_holds','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.stays_quotes','INSERT,UPDATE,DELETE')
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('canonical_payment_attempts',
        'canonical_provider_events','canonical_quarantined_events','canonical_payment_reconciliations',
        'canonical_reservations','booking_holds','stays_quotes')
      AND pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),c.relowner,'MEMBER'))
    OR pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),'pg_read_all_data'::regrole,'MEMBER')
    OR pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),'pg_write_all_data'::regrole,'MEMBER') THEN
    RAISE EXCEPTION 'PAYMENT_RESTRICTED_ROLE_NOT_READY';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_create_payment_attempt(UUID,TEXT,TEXT,UUID,UUID,TEXT,TEXT,BIGINT,TEXT,TEXT) TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_ingest_provider_event(UUID,TEXT,TEXT,TEXT,BIGINT,TEXT,TEXT,TEXT,JSONB,TIMESTAMPTZ) TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_record_payment_unknown(UUID,JSONB) TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_get_payment_attempt(UUID) TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_get_payment_reconciliations(UUID) TO %I',worker);
END $grant$;
