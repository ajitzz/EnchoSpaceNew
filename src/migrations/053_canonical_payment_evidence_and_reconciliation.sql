-- Migration: 053_canonical_payment_evidence_and_reconciliation.sql
-- W3-B Task 2: Provider-independent canonical payment evidence and reconciliation authority.
-- Invariants:
--   - Monetary authority is derived exclusively from trusted database authority (stays_quotes).
--   - Callers cannot declare synthetic authority or arbitrary expected amounts.
--   - Direct payments require exact quote + hold binding (matching quote_id, holder_principal, itinerary).
--   - Replay is verified against a complete semantic command fingerprint.
--   - Provider events are monotonically normalized and verified against a complete semantic identity hash.
--   - Mutated events for an existing event ID are quarantined with full conflict context.
--   - UNKNOWN outcomes and FAILED events never erase or downgrade existing capture truth.
--   - Captures arriving after hold expiry are recorded into RECONCILIATION_REQUIRED / HOLD_EXPIRED without resurrecting holds.
--   - Does NOT create reservations or invoke W3-A finalization.
--   - Does NOT move real money or call external payment providers.

CREATE TABLE IF NOT EXISTS canonical_payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID UNIQUE NOT NULL,
  command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
  holder_principal TEXT NOT NULL,
  quote_id UUID NOT NULL REFERENCES stays_quotes(id) ON DELETE RESTRICT,
  hold_id UUID NOT NULL REFERENCES booking_holds(id) ON DELETE RESTRICT,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('RAZORPAY', 'STRIPE')),
  provider_order_ref TEXT NOT NULL CHECK (provider_order_ref <> ''),
  expected_currency TEXT NOT NULL DEFAULT 'INR',
  expected_amount_paise BIGINT CHECK (expected_amount_paise > 0),
  expected_authority_kind TEXT NOT NULL,
  expected_authority_ref TEXT NOT NULL,
  expected_authority_hash TEXT,
  payment_state TEXT NOT NULL CHECK (payment_state IN ('INITIATED', 'AUTHORIZED', 'EVIDENCE_CAPTURED', 'MATCHED_CAPTURE', 'FAILED', 'UNKNOWN', 'RECONCILIATION_REQUIRED')),
  reconciliation_reason TEXT CHECK (reconciliation_reason IS NULL OR reconciliation_reason IN ('PAYABLE_AUTHORITY_MISSING', 'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'HOLD_EXPIRED', 'OUT_OF_ORDER_EVENT', 'UNKNOWN_OUTCOME', 'EVENT_CONFLICT_QUARANTINED', 'FINALIZER_FAILURE', 'CAPTURE_CONFLICT', 'MULTIPLE_CAPTURE_EVIDENCE', 'CAPTURE_IDENTITY_MISSING')),
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  CHECK (payment_state <> 'MATCHED_CAPTURE' OR (expected_amount_paise IS NOT NULL AND reconciliation_reason IS NULL AND matched_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_canonical_payment_attempts_hold ON canonical_payment_attempts(hold_id);
CREATE INDEX IF NOT EXISTS idx_canonical_payment_attempts_quote ON canonical_payment_attempts(quote_id);
CREATE INDEX IF NOT EXISTS idx_canonical_payment_attempts_order_ref ON canonical_payment_attempts(origin_kind, provider_order_ref);
CREATE INDEX IF NOT EXISTS idx_canonical_payment_attempts_state ON canonical_payment_attempts(payment_state);

CREATE TABLE IF NOT EXISTS canonical_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('RAZORPAY', 'STRIPE')),
  provider_event_id TEXT NOT NULL,
  payment_attempt_id UUID NOT NULL REFERENCES canonical_payment_attempts(id) ON DELETE RESTRICT,
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
  target_payment_attempt_id UUID REFERENCES canonical_payment_attempts(id) ON DELETE SET NULL,
  conflicting_evidence_hash TEXT NOT NULL CHECK (conflicting_evidence_hash ~ '^[a-f0-9]{64}$'),
  conflicting_details JSONB NOT NULL,
  original_event_id UUID REFERENCES canonical_provider_events(id) ON DELETE SET NULL,
  original_evidence_hash TEXT,
  quarantine_reason TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS canonical_payment_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_attempt_id UUID NOT NULL REFERENCES canonical_payment_attempts(id) ON DELETE RESTRICT,
  provider_event_id TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('PAYABLE_AUTHORITY_MISSING', 'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'HOLD_EXPIRED', 'OUT_OF_ORDER_EVENT', 'UNKNOWN_OUTCOME', 'EVENT_CONFLICT_QUARANTINED', 'FINALIZER_FAILURE', 'CAPTURE_CONFLICT', 'MULTIPLE_CAPTURE_EVIDENCE', 'CAPTURE_IDENTITY_MISSING')),
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

-- 1. Create payment attempt (monetary authority derived from trusted database authority)
CREATE OR REPLACE FUNCTION canonical_create_payment_attempt(
  target_command UUID,
  target_holder_principal TEXT,
  target_origin_kind TEXT,
  target_quote UUID,
  target_hold UUID,
  target_provider_order_ref TEXT
)
RETURNS TABLE(attempt_id UUID, payment_state TEXT, replayed BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE
  existing RECORD;
  quote_row RECORD;
  hold_row RECORD;
  derived_authority_kind TEXT;
  derived_authority_ref TEXT;
  derived_authority_hash TEXT;
  derived_expected_amount BIGINT;
  derived_expected_currency TEXT;
  fingerprint_input JSONB;
  fingerprint TEXT;
  saved_id UUID;
BEGIN
  IF target_command IS NULL OR target_holder_principal IS NULL
    OR target_holder_principal !~ '^(user:[0-9]+|session:[0-9a-f-]{36})$'
    OR target_origin_kind NOT IN ('RAZORPAY', 'STRIPE')
    OR target_quote IS NULL OR target_hold IS NULL
    OR target_provider_order_ref IS NULL OR length(trim(target_provider_order_ref)) = 0 THEN
    RAISE EXCEPTION 'PAYMENT_INPUT_INVALID';
  END IF;

  -- 1. Replay check on command_id: recover committed attempt before mutable checks
  SELECT * INTO existing FROM public.canonical_payment_attempts WHERE command_id = target_command FOR UPDATE;
  IF FOUND THEN
    IF existing.holder_principal IS DISTINCT FROM target_holder_principal
      OR existing.origin_kind IS DISTINCT FROM target_origin_kind
      OR existing.quote_id IS DISTINCT FROM target_quote
      OR existing.hold_id IS DISTINCT FROM target_hold
      OR existing.provider_order_ref IS DISTINCT FROM target_provider_order_ref THEN
      RAISE EXCEPTION 'PAYMENT_COMMAND_CONFLICT';
    END IF;
    RETURN QUERY SELECT existing.id, existing.payment_state, TRUE;
    RETURN;
  END IF;

  -- 2. Validate quote exists
  SELECT * INTO quote_row FROM public.stays_quotes WHERE id = target_quote;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_QUOTE_NOT_FOUND'; END IF;

  -- 3. Validate hold exists
  SELECT * INTO hold_row FROM public.booking_holds WHERE id = target_hold;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_HOLD_NOT_FOUND'; END IF;

  -- 4. Strict Quote + Hold + Principal + Itinerary Binding
  IF hold_row.quote_id IS DISTINCT FROM quote_row.id THEN
    RAISE EXCEPTION 'PAYMENT_QUOTE_HOLD_MISMATCH';
  END IF;

  IF hold_row.holder_principal IS DISTINCT FROM target_holder_principal
    OR quote_row.holder_principal IS DISTINCT FROM target_holder_principal THEN
    RAISE EXCEPTION 'PAYMENT_PRINCIPAL_MISMATCH';
  END IF;

  IF hold_row.room_type_id IS DISTINCT FROM quote_row.room_type_id
    OR hold_row.check_in_date IS DISTINCT FROM quote_row.check_in_date
    OR hold_row.check_out_date IS DISTINCT FROM quote_row.check_out_date THEN
    RAISE EXCEPTION 'PAYMENT_ITINERARY_MISMATCH';
  END IF;

  IF hold_row.status <> 'ACTIVE' OR hold_row.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'PAYMENT_HOLD_NOT_ACTIVE';
  END IF;

  IF quote_row.quote_kind <> 'ACCEPTED_OFFER' THEN
    RAISE EXCEPTION 'PAYMENT_QUOTE_KIND_INVALID';
  END IF;

  -- 5. Derive monetary authority exclusively from trusted database quote
  derived_authority_kind := quote_row.quote_kind;
  derived_authority_ref := quote_row.id::text;
  derived_authority_hash := quote_row.source_hash;
  derived_expected_currency := quote_row.currency;
  derived_expected_amount := quote_row.total_paise; -- NULL for current accepted-offer quotes!

  -- 6. Full durable command identity fingerprint
  fingerprint_input := jsonb_build_object(
    'holder_principal', target_holder_principal,
    'origin_kind', target_origin_kind,
    'quote_id', target_quote,
    'hold_id', target_hold,
    'provider_order_ref', target_provider_order_ref,
    'authority_kind', derived_authority_kind,
    'authority_ref', derived_authority_ref,
    'authority_hash', coalesce(derived_authority_hash, ''),
    'expected_amount', coalesce(derived_expected_amount::text, 'NULL'),
    'expected_currency', derived_expected_currency
  );
  fingerprint := encode(sha256(convert_to(fingerprint_input::text, 'UTF8')), 'hex');

  -- Insert new attempt
  INSERT INTO public.canonical_payment_attempts(
    command_id, command_fingerprint, holder_principal, quote_id, hold_id,
    origin_kind, provider_order_ref, expected_currency, expected_amount_paise,
    expected_authority_kind, expected_authority_ref, expected_authority_hash,
    payment_state, reconciliation_reason
  ) VALUES (
    target_command, fingerprint, target_holder_principal, target_quote, target_hold,
    target_origin_kind, target_provider_order_ref, derived_expected_currency,
    derived_expected_amount, derived_authority_kind, derived_authority_ref,
    derived_authority_hash, 'INITIATED', NULL
  )
  RETURNING id INTO saved_id;

  RETURN QUERY SELECT saved_id, 'INITIATED'::TEXT, FALSE;
END $$;

-- 2. Ingest provider event (complete semantic identity hash, quarantine & monotonic state transitions)
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
  semantic_identity JSONB;
  computed_hash TEXT;
  existing_event RECORD;
  attempt RECORD;
  held RECORD;
  next_state TEXT;
  next_reason TEXT;
  saved_event_id UUID;
  mutation_detail TEXT;
  matched_event RECORD;
BEGIN
  IF target_attempt_id IS NULL OR target_origin_kind NOT IN ('RAZORPAY', 'STRIPE')
    OR target_event_id IS NULL
    OR target_event_type NOT IN ('PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED', 'PAYMENT_UNKNOWN')
    OR target_reported_amount IS NULL OR target_reported_amount < 0
    OR target_reported_currency IS NULL OR target_evidence_payload IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_EVENT_INPUT_INVALID';
  END IF;

  -- Complete Semantic Event Identity Hash (covers attempt, origin, event ID, event type, amount, currency, refs, payload)
  semantic_identity := jsonb_build_object(
    'attempt_id', target_attempt_id,
    'origin_kind', target_origin_kind,
    'event_id', target_event_id,
    'event_type', target_event_type,
    'amount_paise', target_reported_amount,
    'currency', target_reported_currency,
    'payment_ref', coalesce(target_provider_payment_ref, ''),
    'order_ref', coalesce(target_provider_order_ref, ''),
    'payload', target_evidence_payload
  );
  computed_hash := encode(sha256(convert_to(semantic_identity::text, 'UTF8')), 'hex');

  -- Lock attempt first to prevent concurrent state corruption
  SELECT * INTO attempt FROM public.canonical_payment_attempts WHERE id = target_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_NOT_FOUND'; END IF;

  -- Verify provider evidence is compatible with the payment attempt
  IF target_origin_kind <> attempt.origin_kind THEN
    INSERT INTO public.canonical_quarantined_events(
      origin_kind, provider_event_id, target_payment_attempt_id,
      conflicting_evidence_hash, conflicting_details,
      original_event_id, original_evidence_hash, quarantine_reason
    ) VALUES (
      target_origin_kind, target_event_id, attempt.id,
      computed_hash, semantic_identity,
      NULL, NULL, 'PROVIDER_ORIGIN_MISMATCH'
    );
    RETURN QUERY SELECT NULL::UUID, attempt.id, 'QUARANTINED'::TEXT,
      attempt.payment_state, attempt.reconciliation_reason, FALSE;
    RETURN;
  END IF;

  IF target_provider_order_ref IS NOT NULL AND target_provider_order_ref <> ''
     AND target_provider_order_ref <> attempt.provider_order_ref THEN
    INSERT INTO public.canonical_quarantined_events(
      origin_kind, provider_event_id, target_payment_attempt_id,
      conflicting_evidence_hash, conflicting_details,
      original_event_id, original_evidence_hash, quarantine_reason
    ) VALUES (
      target_origin_kind, target_event_id, attempt.id,
      computed_hash, semantic_identity,
      NULL, NULL, 'PROVIDER_ORDER_REF_MISMATCH'
    );
    RETURN QUERY SELECT NULL::UUID, attempt.id, 'QUARANTINED'::TEXT,
      attempt.payment_state, attempt.reconciliation_reason, FALSE;
    RETURN;
  END IF;

  -- Check existing provider event by (origin_kind, provider_event_id)
  SELECT * INTO existing_event FROM public.canonical_provider_events
    WHERE origin_kind = target_origin_kind AND provider_event_id = target_event_id FOR UPDATE;

  IF FOUND THEN
    -- If evidence hash matches exactly AND belongs to the same attempt: innocent duplicate!
    IF existing_event.evidence_hash = computed_hash AND existing_event.payment_attempt_id = target_attempt_id THEN
      RETURN QUERY SELECT existing_event.id, attempt.id, 'DUPLICATE_IGNORED'::TEXT,
        attempt.payment_state, attempt.reconciliation_reason, TRUE;
      RETURN;
    ELSE
      -- Any semantic change or attempt mismatch: QUARANTINE!
      mutation_detail := CASE
        WHEN existing_event.payment_attempt_id <> target_attempt_id THEN 'EVENT_REPLAYED_AGAINST_DIFFERENT_ATTEMPT'
        WHEN existing_event.normalized_event_type <> target_event_type THEN 'MUTATED_EVENT_TYPE'
        WHEN existing_event.reported_amount_paise <> target_reported_amount THEN 'MUTATED_EVENT_AMOUNT'
        WHEN existing_event.reported_currency <> target_reported_currency THEN 'MUTATED_EVENT_CURRENCY'
        WHEN coalesce(existing_event.provider_payment_ref, '') <> coalesce(target_provider_payment_ref, '') THEN 'MUTATED_PAYMENT_REF'
        WHEN coalesce(existing_event.provider_order_ref, '') <> coalesce(target_provider_order_ref, '') THEN 'MUTATED_ORDER_REF'
        ELSE 'MUTATED_PAYLOAD'
      END;

      INSERT INTO public.canonical_quarantined_events(
        origin_kind, provider_event_id, target_payment_attempt_id,
        conflicting_evidence_hash, conflicting_details,
        original_event_id, original_evidence_hash, quarantine_reason
      ) VALUES (
        target_origin_kind, target_event_id, attempt.id,
        computed_hash, semantic_identity,
        existing_event.id, existing_event.evidence_hash,
        mutation_detail
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
          'mutation', mutation_detail,
          'original_hash', existing_event.evidence_hash,
          'conflicting_hash', computed_hash,
          'original_attempt_id', existing_event.payment_attempt_id,
          'target_attempt_id', target_attempt_id
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
  IF target_event_type = 'PAYMENT_CAPTURED' THEN
    IF attempt.payment_state = 'MATCHED_CAPTURE' THEN
      -- An attempt was already matched to capture. Distinguish redundant capture vs conflicting second capture.
      SELECT * INTO matched_event FROM public.canonical_provider_events
        WHERE payment_attempt_id = attempt.id
          AND normalized_event_type = 'PAYMENT_CAPTURED'
          AND status = 'PROCESSED'
          AND id <> saved_event_id
        ORDER BY received_at ASC LIMIT 1;

      IF FOUND
        AND matched_event.provider_payment_ref IS NOT NULL AND matched_event.provider_payment_ref <> ''
        AND target_provider_payment_ref IS NOT NULL AND target_provider_payment_ref <> ''
        AND matched_event.provider_payment_ref = target_provider_payment_ref
        AND matched_event.provider_order_ref IS NOT DISTINCT FROM target_provider_order_ref
        AND matched_event.reported_amount_paise = target_reported_amount
        AND matched_event.reported_currency = target_reported_currency
      THEN
        -- Case A: Redundant capture evidence for the SAME underlying provider payment identity
        -- Preserve MATCHED_CAPTURE, no duplicate effect, no state regression
        next_state := attempt.payment_state;
        next_reason := attempt.reconciliation_reason;
      ELSE
        -- Case B: Conflicting / identity-less / possible second capture identity
        -- Preserve matched_at, enter explicit reconciliation / CAPTURE_CONFLICT
        next_state := 'RECONCILIATION_REQUIRED';
        next_reason := 'CAPTURE_CONFLICT';
        INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
          VALUES (
            attempt.id,
            target_event_id,
            'CAPTURE_CONFLICT',
            jsonb_build_object(
              'matched_payment_ref', matched_event.provider_payment_ref,
              'conflicting_payment_ref', target_provider_payment_ref,
              'matched_amount', matched_event.reported_amount_paise,
              'conflicting_amount', target_reported_amount,
              'matched_currency', matched_event.reported_currency,
              'conflicting_currency', target_reported_currency
            )
          );
      END IF;
    ELSIF attempt.payment_state = 'RECONCILIATION_REQUIRED' THEN
      -- Monotonic: already in reconciliation, do not silently clear conflict or regress
      next_state := attempt.payment_state;
      next_reason := attempt.reconciliation_reason;
      IF attempt.reconciliation_reason IN ('CAPTURE_CONFLICT', 'CAPTURE_IDENTITY_MISSING') THEN
        INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
          VALUES (
            attempt.id,
            target_event_id,
            'MULTIPLE_CAPTURE_EVIDENCE',
            jsonb_build_object(
              'conflicting_payment_ref', target_provider_payment_ref,
              'conflicting_amount', target_reported_amount
            )
          );
      END IF;
    ELSE
      -- Check hold status
      SELECT * INTO held FROM public.booking_holds WHERE id = attempt.hold_id;
      IF NOT FOUND OR held.status <> 'ACTIVE' OR held.expires_at <= clock_timestamp() THEN
        next_state := 'RECONCILIATION_REQUIRED';
        next_reason := 'HOLD_EXPIRED';
        INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
          VALUES (attempt.id, target_event_id, 'HOLD_EXPIRED', jsonb_build_object('hold_id', attempt.hold_id, 'hold_status', coalesce(held.status, 'NOT_FOUND'), 'reported_amount', target_reported_amount));
      ELSE
        -- Rule 1A: First capture MUST have a non-empty provider payment reference
        IF target_provider_payment_ref IS NULL OR target_provider_payment_ref = '' THEN
          next_state := 'RECONCILIATION_REQUIRED';
          next_reason := 'CAPTURE_IDENTITY_MISSING';
          INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
            VALUES (attempt.id, target_event_id, 'CAPTURE_IDENTITY_MISSING', jsonb_build_object('reported_amount', target_reported_amount, 'reported_currency', target_reported_currency));
        -- Evaluate expected authority
        ELSIF attempt.expected_amount_paise IS NULL THEN
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
          -- All authoritative checks pass and provider payment reference is present!
          next_state := 'MATCHED_CAPTURE';
          next_reason := NULL;
        END IF;
      END IF;
    END IF;

  ELSIF target_event_type = 'PAYMENT_AUTHORIZED' THEN
    -- Older/delayed AUTHORIZED must NOT regress existing captured state or reconciliation state
    IF attempt.payment_state IN ('MATCHED_CAPTURE', 'EVIDENCE_CAPTURED', 'RECONCILIATION_REQUIRED') THEN
      NULL; -- Preserve capture truth and reconciliation state
    ELSIF attempt.payment_state = 'INITIATED' THEN
      next_state := 'AUTHORIZED';
      next_reason := NULL;
    END IF;

  ELSIF target_event_type = 'PAYMENT_FAILED' THEN
    IF attempt.payment_state IN ('MATCHED_CAPTURE', 'EVIDENCE_CAPTURED') THEN
      -- Preserves capture truth and enters reconciliation: FAILED cannot erase capture
      next_state := 'RECONCILIATION_REQUIRED';
      next_reason := 'OUT_OF_ORDER_EVENT';
      INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
        VALUES (attempt.id, target_event_id, 'OUT_OF_ORDER_EVENT', jsonb_build_object('event_type', 'PAYMENT_FAILED', 'prior_state', attempt.payment_state));
    ELSIF attempt.payment_state = 'RECONCILIATION_REQUIRED' THEN
      -- Sticky reconciliation: preserve RECONCILIATION_REQUIRED and primary reason, append failure evidence
      INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
        VALUES (attempt.id, target_event_id, 'OUT_OF_ORDER_EVENT', jsonb_build_object('event_type', 'PAYMENT_FAILED', 'prior_reason', attempt.reconciliation_reason));
    ELSE
      next_state := 'FAILED';
      next_reason := NULL;
    END IF;

  ELSIF target_event_type = 'PAYMENT_UNKNOWN' THEN
    -- UNKNOWN event must NEVER downgrade existing capture truth or reconciliation state
    IF attempt.payment_state IN ('MATCHED_CAPTURE', 'EVIDENCE_CAPTURED') THEN
      NULL; -- Preserve capture truth
    ELSIF attempt.payment_state = 'RECONCILIATION_REQUIRED' THEN
      -- Sticky reconciliation: preserve RECONCILIATION_REQUIRED and primary reason, append unknown evidence
      INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
        VALUES (attempt.id, target_event_id, 'UNKNOWN_OUTCOME', jsonb_build_object('reported_amount', target_reported_amount));
    ELSIF attempt.payment_state IN ('INITIATED', 'AUTHORIZED') THEN
      next_state := 'UNKNOWN';
      next_reason := 'UNKNOWN_OUTCOME';
      INSERT INTO public.canonical_payment_reconciliations(payment_attempt_id, provider_event_id, reason, details)
        VALUES (attempt.id, target_event_id, 'UNKNOWN_OUTCOME', jsonb_build_object('reported_amount', target_reported_amount));
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

-- 3. Record payment unknown (never downgrades captured truth or sticky reconciliation)
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

  -- Monotonic rule: UNKNOWN outcome must never erase stronger known capture evidence or existing reconciliation requirement
  IF attempt.payment_state IN ('MATCHED_CAPTURE', 'EVIDENCE_CAPTURED', 'RECONCILIATION_REQUIRED') THEN
    IF attempt.payment_state = 'RECONCILIATION_REQUIRED' THEN
      INSERT INTO public.canonical_payment_reconciliations(
        payment_attempt_id, provider_event_id, reason, details
      ) VALUES (
        target_attempt_id, NULL, 'UNKNOWN_OUTCOME', coalesce(target_reason_details, '{}'::jsonb)
      );
    END IF;
    RETURN QUERY SELECT attempt.id, attempt.payment_state, attempt.reconciliation_reason;
    RETURN;
  END IF;

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

-- 4. Secure read functions
CREATE OR REPLACE FUNCTION canonical_get_payment_attempt(target_attempt_id UUID)
RETURNS TABLE(
  id UUID,
  command_id UUID,
  command_fingerprint TEXT,
  holder_principal TEXT,
  quote_id UUID,
  hold_id UUID,
  origin_kind TEXT,
  provider_order_ref TEXT,
  expected_currency TEXT,
  expected_amount_paise BIGINT,
  expected_authority_kind TEXT,
  expected_authority_ref TEXT,
  expected_authority_hash TEXT,
  payment_state TEXT,
  reconciliation_reason TEXT,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
BEGIN
  RETURN QUERY SELECT a.id, a.command_id, a.command_fingerprint, a.holder_principal, a.quote_id, a.hold_id,
    a.origin_kind, a.provider_order_ref, a.expected_currency, a.expected_amount_paise,
    a.expected_authority_kind, a.expected_authority_ref, a.expected_authority_hash,
    a.payment_state, a.reconciliation_reason, a.matched_at, a.created_at, a.updated_at
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
REVOKE ALL ON FUNCTION canonical_create_payment_attempt(UUID,TEXT,TEXT,UUID,UUID,TEXT) FROM PUBLIC;
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
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_create_payment_attempt(UUID,TEXT,TEXT,UUID,UUID,TEXT) TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_ingest_provider_event(UUID,TEXT,TEXT,TEXT,BIGINT,TEXT,TEXT,TEXT,JSONB,TIMESTAMPTZ) TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_record_payment_unknown(UUID,JSONB) TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_get_payment_attempt(UUID) TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_get_payment_reconciliations(UUID) TO %I',worker);
END $grant$;
