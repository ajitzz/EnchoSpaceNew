-- Migration: 061_canonical_cancellation_refund_authorization.sql
-- W4-D: Canonical Cancellation Refund Authorization
-- Invariants:
--   - Successful issuance records one immutable refund authorization for an admitted internal
--     financial decision against an original captured payment and completed ENCHO_DIRECT V1 cancellation.
--   - Does NOT calculate entitlement, reserve funds, establish remaining refundable balance,
--     approve production identity, dispatch provider instructions, or record settlement.
--   - Separates three identities:
--       1. Accountable human: Encho Accommodation Finance Approver (initially founder; synthetic in test fixtures);
--       2. Dedicated trusted internal submitting component: REFUND_DECISION_AUTHORITY_PRIMITIVE;
--       3. Dedicated restricted database issuer: encho_refund_issuer.
--   - Two immutable tables:
--       * canonical_cancellation_refund_decision_evidence
--       * canonical_cancellation_refund_authorizations
--   - Database-generated deterministic content digest for decision evidence.
--   - Strict cross-binding validation on new-table INSERTs rejecting mismatched references.
--   - Explicit uniqueness guarantees:
--       * command_id (global command uniqueness)
--       * decision_evidence_id (decision evidence uniqueness)
--       * reservation_id (original reservation/cancellation/paid subject uniqueness)
--       * provider_origin_kind + provider_payment_ref (original capture identity uniqueness)
--   - Atomic issuance and idempotent replay; zero existing domain row mutation.
--   - Strict role isolation: only encho_refund_issuer may execute the issuance function.

-- 1. Create Decision Evidence Ledger Table
CREATE TABLE IF NOT EXISTS canonical_cancellation_refund_decision_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_ref TEXT NOT NULL,
  version INT NOT NULL CHECK (version > 0),
  evidence_classification TEXT NOT NULL CHECK (evidence_classification = 'LOCAL_SYNTHETIC_TEST_FIXTURE'),
  approver_responsibility TEXT NOT NULL CHECK (approver_responsibility = 'ACCOMMODATION_FINANCE_APPROVER'),
  approver_identity_ref TEXT NOT NULL CHECK (length(trim(approver_identity_ref)) > 0),
  decision_at TIMESTAMPTZ NOT NULL,
  reason_code TEXT NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]{1,64}$'),
  reason_text TEXT CHECK (reason_text IS NULL OR length(reason_text) <= 500),
  approval_ref TEXT NOT NULL CHECK (length(trim(approval_ref)) > 0),
  verifying_component TEXT NOT NULL CHECK (length(trim(verifying_component)) > 0),
  verified_at TIMESTAMPTZ NOT NULL,
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  cancellation_event_id UUID NOT NULL REFERENCES canonical_reservation_events(event_id) ON DELETE RESTRICT,
  cancellation_release_id UUID NOT NULL REFERENCES canonical_reservation_cancellation_inventory_releases(release_id) ON DELETE RESTRICT,
  paid_bridge_id UUID NOT NULL REFERENCES canonical_payment_reservations(id) ON DELETE RESTRICT,
  payment_attempt_id UUID NOT NULL REFERENCES canonical_payment_attempts(id) ON DELETE RESTRICT,
  quote_id UUID NOT NULL REFERENCES stays_quotes(id) ON DELETE RESTRICT,
  payable_authority_id UUID NOT NULL REFERENCES canonical_payable_authorities(id) ON DELETE RESTRICT,
  provider_origin_kind TEXT NOT NULL CHECK (provider_origin_kind IN ('RAZORPAY', 'STRIPE')),
  provider_payment_ref TEXT NOT NULL CHECK (length(trim(provider_payment_ref)) > 0),
  supporting_provider_event_id UUID NOT NULL REFERENCES canonical_provider_events(id) ON DELETE RESTRICT,
  supporting_evidence_hash TEXT NOT NULL CHECK (supporting_evidence_hash ~ '^[a-f0-9]{64}$'),
  approved_amount_paise BIGINT NOT NULL CHECK (approved_amount_paise > 0),
  currency TEXT NOT NULL CHECK (currency = 'INR'),
  permitted_submitting_component TEXT NOT NULL CHECK (permitted_submitting_component = 'REFUND_DECISION_AUTHORITY_PRIMITIVE'),
  permitted_issuer_role TEXT NOT NULL CHECK (permitted_issuer_role = 'encho_refund_issuer'),
  decision_digest TEXT NOT NULL CHECK (decision_digest ~ '^[a-f0-9]{64}$'),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT uq_refund_decision_evidence_ref_ver UNIQUE (decision_ref, version),
  CONSTRAINT uq_refund_decision_evidence_reservation UNIQUE (reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_refund_decision_evidence_res
  ON canonical_cancellation_refund_decision_evidence(reservation_id);
CREATE INDEX IF NOT EXISTS idx_refund_decision_evidence_attempt
  ON canonical_cancellation_refund_decision_evidence(payment_attempt_id);

-- Decision evidence cross-binding validation & digest generation trigger
CREATE OR REPLACE FUNCTION canonical_cancellation_refund_decision_evidence_before_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  rel_row RECORD;
  bridge_row RECORD;
  payable_row RECORD;
  prov_event_row RECORD;
  digest_input JSONB;
BEGIN
  -- 1. Validate cancellation release belongs to reservation and event
  SELECT * INTO rel_row
  FROM canonical_reservation_cancellation_inventory_releases
  WHERE release_id = NEW.cancellation_release_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: CANCELLATION_RELEASE_NOT_FOUND';
  END IF;
  IF rel_row.reservation_id IS DISTINCT FROM NEW.reservation_id THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: RELEASE_RESERVATION_MISMATCH';
  END IF;
  IF rel_row.event_id IS DISTINCT FROM NEW.cancellation_event_id THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: RELEASE_EVENT_MISMATCH';
  END IF;

  -- 2. Validate paid bridge belongs to reservation, payment attempt, and quote
  SELECT * INTO bridge_row
  FROM canonical_payment_reservations
  WHERE id = NEW.paid_bridge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: PAID_BRIDGE_NOT_FOUND';
  END IF;
  IF bridge_row.reservation_id IS DISTINCT FROM NEW.reservation_id THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: BRIDGE_RESERVATION_MISMATCH';
  END IF;
  IF bridge_row.payment_attempt_id IS DISTINCT FROM NEW.payment_attempt_id THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: BRIDGE_ATTEMPT_MISMATCH';
  END IF;
  IF bridge_row.quote_id IS DISTINCT FROM NEW.quote_id THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: BRIDGE_QUOTE_MISMATCH';
  END IF;

  -- 3. Validate payable authority belongs to quote and currency
  SELECT * INTO payable_row
  FROM canonical_payable_authorities
  WHERE id = NEW.payable_authority_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: PAYABLE_AUTHORITY_NOT_FOUND';
  END IF;
  IF payable_row.quote_id IS DISTINCT FROM NEW.quote_id THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: PAYABLE_QUOTE_MISMATCH';
  END IF;
  IF payable_row.currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: PAYABLE_CURRENCY_MISMATCH';
  END IF;

  -- 4. Validate supporting provider event belongs to attempt and matches capture facts
  SELECT * INTO prov_event_row
  FROM canonical_provider_events
  WHERE id = NEW.supporting_provider_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: PROVIDER_EVENT_NOT_FOUND';
  END IF;
  IF prov_event_row.payment_attempt_id IS DISTINCT FROM NEW.payment_attempt_id THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: PROVIDER_EVENT_ATTEMPT_MISMATCH';
  END IF;
  IF prov_event_row.origin_kind IS DISTINCT FROM NEW.provider_origin_kind THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: PROVIDER_ORIGIN_MISMATCH';
  END IF;
  IF prov_event_row.provider_payment_ref IS DISTINCT FROM NEW.provider_payment_ref THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: PROVIDER_PAYMENT_REF_MISMATCH';
  END IF;
  IF prov_event_row.evidence_hash IS DISTINCT FROM NEW.supporting_evidence_hash THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_CROSS_BINDING_MISMATCH: PROVIDER_EVIDENCE_HASH_MISMATCH';
  END IF;

  -- 5. Deterministic DB-computed decision digest
  digest_input := jsonb_build_object(
    'digest_schema_version', 1,
    'decision_ref', NEW.decision_ref,
    'version', NEW.version,
    'evidence_classification', NEW.evidence_classification,
    'approver_responsibility', NEW.approver_responsibility,
    'approver_identity_ref', NEW.approver_identity_ref,
    'decision_at', to_char(NEW.decision_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'reason_code', NEW.reason_code,
    'reason_text', coalesce(NEW.reason_text, ''),
    'approval_ref', NEW.approval_ref,
    'verifying_component', NEW.verifying_component,
    'verified_at', to_char(NEW.verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'reservation_id', lower(NEW.reservation_id::text),
    'cancellation_event_id', lower(NEW.cancellation_event_id::text),
    'cancellation_release_id', lower(NEW.cancellation_release_id::text),
    'paid_bridge_id', lower(NEW.paid_bridge_id::text),
    'payment_attempt_id', lower(NEW.payment_attempt_id::text),
    'quote_id', lower(NEW.quote_id::text),
    'payable_authority_id', lower(NEW.payable_authority_id::text),
    'provider_origin_kind', NEW.provider_origin_kind,
    'provider_payment_ref', NEW.provider_payment_ref,
    'supporting_provider_event_id', lower(NEW.supporting_provider_event_id::text),
    'supporting_evidence_hash', NEW.supporting_evidence_hash,
    'approved_amount_paise', NEW.approved_amount_paise,
    'currency', NEW.currency,
    'permitted_submitting_component', NEW.permitted_submitting_component,
    'permitted_issuer_role', NEW.permitted_issuer_role
  );

  NEW.decision_digest := encode(sha256(convert_to(digest_input::text, 'UTF8')), 'hex');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_canonical_refund_decision_evidence_before_insert
  BEFORE INSERT ON canonical_cancellation_refund_decision_evidence
  FOR EACH ROW EXECUTE FUNCTION canonical_cancellation_refund_decision_evidence_before_insert();

-- Immutability trigger on decision evidence
CREATE OR REPLACE FUNCTION canonical_cancellation_refund_decision_evidence_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_REFUND_DECISION_EVIDENCE_IMMUTABLE';
END;
$$;

CREATE TRIGGER trg_canonical_refund_decision_evidence_immutable
  BEFORE UPDATE OR DELETE ON canonical_cancellation_refund_decision_evidence
  FOR EACH ROW EXECUTE FUNCTION canonical_cancellation_refund_decision_evidence_reject_mutation();


-- 2. Create Cancellation Refund Authorizations Table
CREATE TABLE IF NOT EXISTS canonical_cancellation_refund_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID NOT NULL UNIQUE,
  command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
  decision_evidence_id UUID NOT NULL UNIQUE REFERENCES canonical_cancellation_refund_decision_evidence(id) ON DELETE RESTRICT,
  reservation_id UUID NOT NULL UNIQUE REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  cancellation_release_id UUID NOT NULL UNIQUE REFERENCES canonical_reservation_cancellation_inventory_releases(release_id) ON DELETE RESTRICT,
  paid_bridge_id UUID NOT NULL UNIQUE REFERENCES canonical_payment_reservations(id) ON DELETE RESTRICT,
  payment_attempt_id UUID NOT NULL UNIQUE REFERENCES canonical_payment_attempts(id) ON DELETE RESTRICT,
  provider_origin_kind TEXT NOT NULL CHECK (provider_origin_kind IN ('RAZORPAY', 'STRIPE')),
  provider_payment_ref TEXT NOT NULL CHECK (length(trim(provider_payment_ref)) > 0),
  issuing_role TEXT NOT NULL CHECK (issuing_role = 'encho_refund_issuer'),
  issuing_principal TEXT NOT NULL CHECK (length(trim(issuing_principal)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT uq_refund_auth_capture UNIQUE (provider_origin_kind, provider_payment_ref)
);

CREATE INDEX IF NOT EXISTS idx_refund_authorizations_res
  ON canonical_cancellation_refund_authorizations(reservation_id);
CREATE INDEX IF NOT EXISTS idx_refund_authorizations_evidence
  ON canonical_cancellation_refund_authorizations(decision_evidence_id);
CREATE INDEX IF NOT EXISTS idx_refund_authorizations_capture
  ON canonical_cancellation_refund_authorizations(provider_origin_kind, provider_payment_ref);

-- Authorization cross-binding validation trigger
CREATE OR REPLACE FUNCTION canonical_cancellation_refund_authorizations_before_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  evidence_row RECORD;
BEGIN
  SELECT * INTO evidence_row
  FROM canonical_cancellation_refund_decision_evidence
  WHERE id = NEW.decision_evidence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFUND_AUTHORIZATION_CROSS_BINDING_MISMATCH: EVIDENCE_NOT_FOUND';
  END IF;

  IF evidence_row.reservation_id IS DISTINCT FROM NEW.reservation_id
    OR evidence_row.cancellation_release_id IS DISTINCT FROM NEW.cancellation_release_id
    OR evidence_row.paid_bridge_id IS DISTINCT FROM NEW.paid_bridge_id
    OR evidence_row.payment_attempt_id IS DISTINCT FROM NEW.payment_attempt_id
    OR evidence_row.provider_origin_kind IS DISTINCT FROM NEW.provider_origin_kind
    OR evidence_row.provider_payment_ref IS DISTINCT FROM NEW.provider_payment_ref THEN
    RAISE EXCEPTION 'REFUND_AUTHORIZATION_CROSS_BINDING_MISMATCH: EVIDENCE_SUBJECT_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_canonical_refund_authorizations_before_insert
  BEFORE INSERT ON canonical_cancellation_refund_authorizations
  FOR EACH ROW EXECUTE FUNCTION canonical_cancellation_refund_authorizations_before_insert();

-- Immutability trigger on authorizations
CREATE OR REPLACE FUNCTION canonical_cancellation_refund_authorizations_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_REFUND_AUTHORIZATION_IMMUTABLE';
END;
$$;

CREATE TRIGGER trg_canonical_refund_authorizations_immutable
  BEFORE UPDATE OR DELETE ON canonical_cancellation_refund_authorizations
  FOR EACH ROW EXECUTE FUNCTION canonical_cancellation_refund_authorizations_reject_mutation();


-- 3. Restricted Issuer Function
CREATE OR REPLACE FUNCTION issue_cancellation_refund_authorization(
  target_command UUID,
  target_reservation_id UUID,
  target_decision_evidence_id UUID
)
RETURNS TABLE (
  authorization_id UUID,
  command_id UUID,
  decision_evidence_id UUID,
  decision_version INT,
  decision_digest TEXT,
  reservation_id UUID,
  cancellation_release_id UUID,
  paid_bridge_id UUID,
  payment_attempt_id UUID,
  provider_origin_kind TEXT,
  provider_payment_ref TEXT,
  approved_amount_paise BIGINT,
  currency TEXT,
  issuing_role TEXT,
  issuing_principal TEXT,
  created_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $$
#variable_conflict use_column
DECLARE
  invoking_user TEXT;
  evidence RECORD;
  res_row RECORD;
  cancel_event RECORD;
  rel_row RECORD;
  rel_nights_count INT;
  res_nights_count INT;
  bridge_row RECORD;
  payable_row RECORD;
  attempt_row RECORD;
  capture_event RECORD;
  capture_amounts BIGINT[];
  capture_refs TEXT[];
  capture_orders TEXT[];
  captured_ceiling BIGINT;
  derived_capture_ref TEXT;
  existing_auth RECORD;
  existing_subj RECORD;
  fingerprint_input JSONB;
  fingerprint TEXT;
  saved_auth RECORD;
BEGIN
  -- 1. Validate caller identity: must be session_user having encho_refund_issuer role
  invoking_user := session_user;
  IF invoking_user IS DISTINCT FROM 'encho_refund_issuer'
    AND NOT pg_has_role(invoking_user, 'encho_refund_issuer', 'MEMBER') THEN
    RAISE EXCEPTION 'REFUND_ISSUER_UNAUTHORIZED';
  END IF;

  -- 2. Basic argument validation
  IF target_command IS NULL OR target_reservation_id IS NULL OR target_decision_evidence_id IS NULL THEN
    RAISE EXCEPTION 'REFUND_INPUT_INVALID';
  END IF;

  -- 3. Load admitted decision evidence
  SELECT * INTO evidence
  FROM canonical_cancellation_refund_decision_evidence dev
  WHERE dev.id = target_decision_evidence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DECISION_EVIDENCE_NOT_FOUND';
  END IF;

  -- Check issuer role and component permissions on evidence
  IF evidence.permitted_issuer_role IS DISTINCT FROM 'encho_refund_issuer' THEN
    RAISE EXCEPTION 'EVIDENCE_ISSUER_ROLE_MISMATCH';
  END IF;
  IF evidence.permitted_submitting_component IS DISTINCT FROM 'REFUND_DECISION_AUTHORITY_PRIMITIVE' THEN
    RAISE EXCEPTION 'EVIDENCE_SUBMITTING_COMPONENT_UNAUTHORIZED';
  END IF;
  IF evidence.evidence_classification IS DISTINCT FROM 'LOCAL_SYNTHETIC_TEST_FIXTURE' THEN
    RAISE EXCEPTION 'EVIDENCE_CLASSIFICATION_INVALID';
  END IF;
  IF evidence.reservation_id IS DISTINCT FROM target_reservation_id THEN
    RAISE EXCEPTION 'EVIDENCE_RESERVATION_MISMATCH';
  END IF;

  -- 4. Lock reservation root FOR UPDATE
  SELECT * INTO res_row
  FROM canonical_reservations cr
  WHERE cr.id = target_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  -- Derive semantic command fingerprint
  fingerprint_input := jsonb_build_object(
    'operation_kind', 'ISSUE_CANCELLATION_REFUND_AUTHORIZATION',
    'reservation_id', lower(target_reservation_id::text),
    'decision_evidence_id', lower(evidence.id::text),
    'decision_version', evidence.version,
    'decision_digest', evidence.decision_digest,
    'issuing_role', 'encho_refund_issuer',
    'issuing_principal', invoking_user
  );
  fingerprint := encode(sha256(convert_to(fingerprint_input::text, 'UTF8')), 'hex');

  -- 5. Return exact authorized committed replay if present
  SELECT * INTO existing_auth
  FROM canonical_cancellation_refund_authorizations auth
  WHERE auth.command_id = target_command
  FOR UPDATE;
  IF FOUND THEN
    IF existing_auth.reservation_id IS DISTINCT FROM target_reservation_id
      OR existing_auth.decision_evidence_id IS DISTINCT FROM target_decision_evidence_id
      OR existing_auth.command_fingerprint IS DISTINCT FROM fingerprint THEN
      RAISE EXCEPTION 'REFUND_COMMAND_CONFLICT';
    END IF;

    RETURN QUERY SELECT
      existing_auth.id,
      existing_auth.command_id,
      existing_auth.decision_evidence_id,
      evidence.version,
      evidence.decision_digest,
      existing_auth.reservation_id,
      existing_auth.cancellation_release_id,
      existing_auth.paid_bridge_id,
      existing_auth.payment_attempt_id,
      existing_auth.provider_origin_kind,
      existing_auth.provider_payment_ref,
      evidence.approved_amount_paise,
      evidence.currency,
      existing_auth.issuing_role,
      existing_auth.issuing_principal,
      existing_auth.created_at,
      TRUE;
    RETURN;
  END IF;

  -- Check if another authorization already exists for this reservation or decision evidence
  SELECT * INTO existing_subj
  FROM canonical_cancellation_refund_authorizations auth
  WHERE auth.reservation_id = target_reservation_id
     OR auth.decision_evidence_id = target_decision_evidence_id
  FOR UPDATE;
  IF FOUND THEN
    IF existing_subj.command_id IS DISTINCT FROM target_command THEN
      RAISE EXCEPTION 'REFUND_ALREADY_AUTHORIZED';
    END IF;
  END IF;

  -- 6. NEW Issuance: Derive and validate canonical subjects
  -- Verify cancellation event: latest event must be CANCELLED by INTERNAL_DECISION for ENCHO_DIRECT
  SELECT * INTO cancel_event
  FROM canonical_reservation_events cre
  WHERE cre.reservation_id = target_reservation_id
  ORDER BY cre.sequence_number DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_CANCELLED';
  END IF;
  IF cancel_event.event_type IS DISTINCT FROM 'CANCELLED' THEN
    RAISE EXCEPTION 'RESERVATION_NOT_CANCELLED';
  END IF;
  IF cancel_event.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT' THEN
    RAISE EXCEPTION 'RESERVATION_ORIGIN_NOT_ENCHO_DIRECT';
  END IF;
  IF cancel_event.actor_kind IS DISTINCT FROM 'INTERNAL_DECISION'
    OR cancel_event.decision_source_kind IS DISTINCT FROM 'INTERNAL_AUTHORITY_PRIMITIVE' THEN
    RAISE EXCEPTION 'RESERVATION_CANCELLATION_PROVENANCE_INVALID';
  END IF;
  IF cancel_event.event_id IS DISTINCT FROM evidence.cancellation_event_id THEN
    RAISE EXCEPTION 'EVIDENCE_CANCELLATION_EVENT_MISMATCH';
  END IF;

  -- Verify unique V1 cancellation release
  SELECT * INTO rel_row
  FROM canonical_reservation_cancellation_inventory_releases cir
  WHERE cir.reservation_id = target_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELLATION_RELEASE_NOT_FOUND';
  END IF;
  IF rel_row.release_id IS DISTINCT FROM evidence.cancellation_release_id THEN
    RAISE EXCEPTION 'EVIDENCE_CANCELLATION_RELEASE_MISMATCH';
  END IF;
  IF rel_row.released_effective_version IS DISTINCT FROM 1 OR rel_row.released_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'V2_CANCELLATION_RELEASE_EXCLUDED';
  END IF;

  -- Verify coherent release night evidence
  SELECT count(*) INTO rel_nights_count
  FROM canonical_reservation_cancellation_release_nights crn
  WHERE crn.release_id = rel_row.release_id;
  SELECT count(*) INTO res_nights_count
  FROM canonical_reservation_nights crn
  WHERE crn.reservation_id = target_reservation_id;
  IF rel_nights_count = 0 OR rel_nights_count IS DISTINCT FROM res_nights_count THEN
    RAISE EXCEPTION 'CANCELLATION_RELEASE_NIGHTS_INCOHERENT';
  END IF;

  -- Verify no sealed V2+ revisions exist
  IF EXISTS (
    SELECT 1 FROM canonical_reservation_revision_seals s
    JOIN canonical_reservation_revisions r ON r.id = s.revision_id
    WHERE r.reservation_id = target_reservation_id
  ) THEN
    RAISE EXCEPTION 'SEALED_V2_REVISION_EXCLUDED';
  END IF;

  -- Verify unique immutable COMMITTED paid bridge
  SELECT * INTO bridge_row
  FROM canonical_payment_reservations cpr
  WHERE cpr.reservation_id = target_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DIRECT_FINALIZER_ONLY_EXCLUDED';
  END IF;
  IF bridge_row.status IS DISTINCT FROM 'COMMITTED' THEN
    RAISE EXCEPTION 'PAID_BRIDGE_NOT_COMMITTED';
  END IF;
  IF bridge_row.id IS DISTINCT FROM evidence.paid_bridge_id THEN
    RAISE EXCEPTION 'EVIDENCE_PAID_BRIDGE_MISMATCH';
  END IF;
  IF bridge_row.payment_attempt_id IS DISTINCT FROM evidence.payment_attempt_id THEN
    RAISE EXCEPTION 'EVIDENCE_PAYMENT_ATTEMPT_MISMATCH';
  END IF;
  IF bridge_row.quote_id IS DISTINCT FROM evidence.quote_id THEN
    RAISE EXCEPTION 'EVIDENCE_QUOTE_MISMATCH';
  END IF;

  -- Verify payable authority
  SELECT * INTO payable_row
  FROM canonical_payable_authorities cpa
  WHERE cpa.quote_id = bridge_row.quote_id AND cpa.status = 'APPROVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYABLE_AUTHORITY_NOT_FOUND';
  END IF;
  IF payable_row.id IS DISTINCT FROM evidence.payable_authority_id THEN
    RAISE EXCEPTION 'EVIDENCE_PAYABLE_AUTHORITY_MISMATCH';
  END IF;
  IF payable_row.currency IS DISTINCT FROM evidence.currency THEN
    RAISE EXCEPTION 'EVIDENCE_CURRENCY_MISMATCH';
  END IF;

  -- 7. Lock payment attempt FOR UPDATE and check reconciliation gates
  SELECT * INTO attempt_row
  FROM canonical_payment_attempts cpa
  WHERE cpa.id = bridge_row.payment_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_ATTEMPT_NOT_FOUND';
  END IF;
  IF attempt_row.payment_state IS DISTINCT FROM 'MATCHED_CAPTURE' THEN
    RAISE EXCEPTION 'PAYMENT_STATE_NOT_MATCHED_CAPTURE';
  END IF;
  IF attempt_row.matched_at IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_MATCHED_AT_MISSING';
  END IF;
  IF attempt_row.reconciliation_reason IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_RECONCILIATION_UNRESOLVED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM canonical_payment_reconciliations cpr
    WHERE cpr.payment_attempt_id = attempt_row.id AND NOT cpr.resolved
  ) THEN
    RAISE EXCEPTION 'PAYMENT_RECONCILIATION_UNRESOLVED';
  END IF;

  -- Check payable authority hash matches attempt
  IF payable_row.contract_hash IS DISTINCT FROM attempt_row.expected_authority_hash THEN
    RAISE EXCEPTION 'EVIDENCE_AUTHORITY_HASH_MISMATCH';
  END IF;

  -- 8. Verify Processed Capture Group
  SELECT
    array_agg(DISTINCT cpe.reported_amount_paise),
    array_agg(DISTINCT cpe.provider_payment_ref),
    array_agg(DISTINCT cpe.provider_order_ref)
  INTO capture_amounts, capture_refs, capture_orders
  FROM canonical_provider_events cpe
  WHERE cpe.payment_attempt_id = attempt_row.id
    AND cpe.normalized_event_type = 'PAYMENT_CAPTURED'
    AND cpe.status = 'PROCESSED';

  IF capture_amounts IS NULL OR array_length(capture_amounts, 1) = 0 THEN
    RAISE EXCEPTION 'PAYMENT_CAPTURE_GROUP_EMPTY';
  END IF;
  IF array_length(capture_amounts, 1) > 1 THEN
    RAISE EXCEPTION 'CAPTURE_AMOUNT_CONFLICT';
  END IF;
  IF array_length(capture_refs, 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CAPTURE_PAYMENT_REF_AMBIGUOUS';
  END IF;
  IF capture_refs[1] IS NULL OR length(trim(capture_refs[1])) = 0 THEN
    RAISE EXCEPTION 'CAPTURE_PAYMENT_REF_EMPTY';
  END IF;
  IF array_length(capture_orders, 1) IS DISTINCT FROM 1 OR capture_orders[1] IS DISTINCT FROM attempt_row.provider_order_ref THEN
    RAISE EXCEPTION 'CAPTURE_ORDER_REF_MISMATCH';
  END IF;

  captured_ceiling := capture_amounts[1];
  derived_capture_ref := capture_refs[1];

  IF derived_capture_ref IS DISTINCT FROM evidence.provider_payment_ref THEN
    RAISE EXCEPTION 'EVIDENCE_PROVIDER_PAYMENT_REF_MISMATCH';
  END IF;
  IF attempt_row.origin_kind IS DISTINCT FROM evidence.provider_origin_kind THEN
    RAISE EXCEPTION 'EVIDENCE_PROVIDER_ORIGIN_MISMATCH';
  END IF;

  -- Verify supporting provider event belongs to capture group
  SELECT * INTO capture_event
  FROM canonical_provider_events cpe
  WHERE cpe.id = evidence.supporting_provider_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORTING_PROVIDER_EVENT_NOT_FOUND';
  END IF;
  IF capture_event.payment_attempt_id IS DISTINCT FROM attempt_row.id
    OR capture_event.normalized_event_type IS DISTINCT FROM 'PAYMENT_CAPTURED'
    OR capture_event.status IS DISTINCT FROM 'PROCESSED'
    OR capture_event.evidence_hash IS DISTINCT FROM evidence.supporting_evidence_hash THEN
    RAISE EXCEPTION 'SUPPORTING_PROVIDER_EVENT_MISMATCH';
  END IF;

  -- Validate approved amount within capture ceiling
  IF evidence.approved_amount_paise <= 0 OR evidence.approved_amount_paise > captured_ceiling THEN
    RAISE EXCEPTION 'REFUND_AMOUNT_EXCEEDS_CAPTURE';
  END IF;

  -- Reject visible cross-attempt aliases of the same capture
  IF EXISTS (
    SELECT 1 FROM canonical_provider_events cpe
    WHERE cpe.origin_kind = attempt_row.origin_kind
      AND cpe.provider_payment_ref = derived_capture_ref
      AND cpe.payment_attempt_id <> attempt_row.id
      AND cpe.status = 'PROCESSED'
  ) THEN
    RAISE EXCEPTION 'CAPTURE_CROSS_ATTEMPT_ALIAS_AMBIGUOUS';
  END IF;

  -- Prevent duplicate authorization through capture uniqueness check
  IF EXISTS (
    SELECT 1 FROM canonical_cancellation_refund_authorizations auth
    WHERE auth.provider_origin_kind = attempt_row.origin_kind
      AND auth.provider_payment_ref = derived_capture_ref
  ) THEN
    RAISE EXCEPTION 'CAPTURE_ALREADY_REFUND_AUTHORIZED';
  END IF;

  -- 9. Insert Authorization Record
  BEGIN
    INSERT INTO canonical_cancellation_refund_authorizations (
      command_id,
      command_fingerprint,
      decision_evidence_id,
      reservation_id,
      cancellation_release_id,
      paid_bridge_id,
      payment_attempt_id,
      provider_origin_kind,
      provider_payment_ref,
      issuing_role,
      issuing_principal
    ) VALUES (
      target_command,
      fingerprint,
      evidence.id,
      target_reservation_id,
      rel_row.release_id,
      bridge_row.id,
      attempt_row.id,
      attempt_row.origin_kind,
      derived_capture_ref,
      'encho_refund_issuer',
      invoking_user
    )
    RETURNING * INTO saved_auth;
  EXCEPTION
    WHEN unique_violation THEN
      -- Recover in case of race: repeat replay checks
      SELECT * INTO existing_auth
      FROM canonical_cancellation_refund_authorizations auth
      WHERE auth.command_id = target_command;
      IF FOUND THEN
        IF existing_auth.reservation_id IS DISTINCT FROM target_reservation_id
          OR existing_auth.decision_evidence_id IS DISTINCT FROM target_decision_evidence_id
          OR existing_auth.command_fingerprint IS DISTINCT FROM fingerprint THEN
          RAISE EXCEPTION 'REFUND_COMMAND_CONFLICT';
        END IF;

        RETURN QUERY SELECT
          existing_auth.id,
          existing_auth.command_id,
          existing_auth.decision_evidence_id,
          evidence.version,
          evidence.decision_digest,
          existing_auth.reservation_id,
          existing_auth.cancellation_release_id,
          existing_auth.paid_bridge_id,
          existing_auth.payment_attempt_id,
          existing_auth.provider_origin_kind,
          existing_auth.provider_payment_ref,
          evidence.approved_amount_paise,
          evidence.currency,
          existing_auth.issuing_role,
          existing_auth.issuing_principal,
          existing_auth.created_at,
          TRUE;
        RETURN;
      ELSE
        RAISE EXCEPTION 'REFUND_ALREADY_AUTHORIZED';
      END IF;
  END;

  RETURN QUERY SELECT
    saved_auth.id,
    saved_auth.command_id,
    saved_auth.decision_evidence_id,
    evidence.version,
    evidence.decision_digest,
    saved_auth.reservation_id,
    saved_auth.cancellation_release_id,
    saved_auth.paid_bridge_id,
    saved_auth.payment_attempt_id,
    saved_auth.provider_origin_kind,
    saved_auth.provider_payment_ref,
    evidence.approved_amount_paise,
    evidence.currency,
    saved_auth.issuing_role,
    saved_auth.issuing_principal,
    saved_auth.created_at,
    FALSE;
  RETURN;
END;
$$;

-- 4. Enable Row-Level Security
ALTER TABLE canonical_cancellation_refund_decision_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_cancellation_refund_decision_evidence FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canonical_cancellation_refund_decision_evidence_owner
  ON canonical_cancellation_refund_decision_evidence;
CREATE POLICY canonical_cancellation_refund_decision_evidence_owner
  ON canonical_cancellation_refund_decision_evidence FOR ALL TO current_user
  USING (true) WITH CHECK (true);

ALTER TABLE canonical_cancellation_refund_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_cancellation_refund_authorizations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canonical_cancellation_refund_authorizations_owner
  ON canonical_cancellation_refund_authorizations;
CREATE POLICY canonical_cancellation_refund_authorizations_owner
  ON canonical_cancellation_refund_authorizations FOR ALL TO current_user
  USING (true) WITH CHECK (true);

-- 5. Revocation of Privileges from PUBLIC
REVOKE ALL ON canonical_cancellation_refund_decision_evidence FROM PUBLIC;
REVOKE ALL ON canonical_cancellation_refund_authorizations FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_cancellation_refund_decision_evidence_before_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_cancellation_refund_decision_evidence_reject_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_cancellation_refund_authorizations_before_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_cancellation_refund_authorizations_reject_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_cancellation_refund_authorization(UUID, UUID, UUID) FROM PUBLIC;

-- 6. Role Isolation: Revoke from All Existing Runtime Roles
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
    'encho_cancellation_executor',
    'encho_modification_issuer'
  ];
BEGIN
  FOREACH r IN ARRAY runtime_roles LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON canonical_cancellation_refund_decision_evidence FROM %I', r);
      EXECUTE format('REVOKE ALL ON canonical_cancellation_refund_authorizations FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION issue_cancellation_refund_authorization(UUID, UUID, UUID) FROM %I', r);
    END IF;
  END LOOP;
END $runtime_revokes$;

-- 7. Restricted Role Provisioning & Grant for encho_refund_issuer
DO $grant_refund_issuer$
DECLARE
  issuer TEXT := 'encho_refund_issuer';
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
    OR has_table_privilege(issuer, 'public.canonical_cancellation_refund_decision_evidence', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.canonical_cancellation_refund_authorizations', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.canonical_payment_attempts', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.canonical_payment_reservations', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.canonical_provider_events', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.booking_holds', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.inventory_days', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer, 'public.stays_quotes', 'INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'REFUND_ISSUER_ROLE_NOT_READY';
    END IF;

    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', issuer);
    EXECUTE format('GRANT EXECUTE ON FUNCTION issue_cancellation_refund_authorization(UUID, UUID, UUID) TO %I', issuer);
  END IF;
END $grant_refund_issuer$;
