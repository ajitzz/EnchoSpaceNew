-- Migration: 062_canonical_cancellation_refund_approval_admission.sql
-- W4-D: Canonical Cancellation Refund Approval Admission
-- Invariants:
--   - Reuses existing migration 036 transaction witness (consumed_transaction_id XID8)
--     stamped by internal_iam_stamp_consumption_transaction().
--   - Records one immutable admission provenance row linking:
--       exact approved packet / command_fingerprint
--       -> internal_action_authorizations (status CONSUMED)
--       -> internal_action_approvals (decision APPROVE)
--       -> distinct appointed Accommodation Finance Approver checker
--       -> canonical_cancellation_refund_decision_admissions
--       -> canonical_cancellation_refund_decision_evidence
--   - Broadens evidence_classification to permit 'AUTHENTICATED_HUMAN_APPROVAL'.
--   - Retains exact server-prepared packet in canonical_cancellation_refund_decision_preparations.
--   - Updates issue_cancellation_refund_authorization to validate durable admission provenance
--     for AUTHENTICATED_HUMAN_APPROVAL while preserving LOCAL_SYNTHETIC_TEST_FIXTURE.
--   - Admission creates zero refund authorizations.

-- 1. Extend evidence_classification Check Constraint on canonical_cancellation_refund_decision_evidence
ALTER TABLE canonical_cancellation_refund_decision_evidence
  DROP CONSTRAINT IF EXISTS canonical_cancellation_refund_dec_evidence_classification_check;

ALTER TABLE canonical_cancellation_refund_decision_evidence
  DROP CONSTRAINT IF EXISTS canonical_cancellation_refund_decision_evidence_evidence_classification_check;

ALTER TABLE canonical_cancellation_refund_decision_evidence
  ADD CONSTRAINT canonical_cancellation_refund_decision_evidence_evidence_classification_check
  CHECK (evidence_classification IN ('LOCAL_SYNTHETIC_TEST_FIXTURE', 'AUTHENTICATED_HUMAN_APPROVAL'));

-- 2. Create Preparation Ledger Table for Staged Command Packets
CREATE TABLE IF NOT EXISTS canonical_cancellation_refund_decision_preparations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID NOT NULL UNIQUE,
  action_authorization_id UUID NOT NULL UNIQUE REFERENCES internal_action_authorizations(id) ON DELETE RESTRICT,
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
  maker_membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
  packet_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_refund_decision_prep_cmd
  ON canonical_cancellation_refund_decision_preparations(command_id);
CREATE INDEX IF NOT EXISTS idx_refund_decision_prep_auth
  ON canonical_cancellation_refund_decision_preparations(action_authorization_id);
CREATE INDEX IF NOT EXISTS idx_refund_decision_prep_res
  ON canonical_cancellation_refund_decision_preparations(reservation_id);

-- Immutability trigger on preparations
CREATE OR REPLACE FUNCTION canonical_cancellation_refund_decision_preparations_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_REFUND_DECISION_PREPARATION_IMMUTABLE';
END;
$$;

CREATE TRIGGER trg_canonical_refund_decision_preparations_immutable
  BEFORE UPDATE OR DELETE ON canonical_cancellation_refund_decision_preparations
  FOR EACH ROW EXECUTE FUNCTION canonical_cancellation_refund_decision_preparations_reject_mutation();

-- 3. Create Admission Provenance Ledger Table
CREATE TABLE IF NOT EXISTS canonical_cancellation_refund_decision_admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID NOT NULL UNIQUE,
  command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
  decision_evidence_id UUID NOT NULL UNIQUE REFERENCES canonical_cancellation_refund_decision_evidence(id) ON DELETE RESTRICT,
  action_authorization_id UUID NOT NULL UNIQUE REFERENCES internal_action_authorizations(id) ON DELETE RESTRICT,
  action_approval_id UUID NOT NULL UNIQUE REFERENCES internal_action_approvals(id) ON DELETE RESTRICT,
  maker_membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
  checker_membership_id UUID NOT NULL REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT,
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  admitting_principal TEXT NOT NULL CHECK (length(trim(admitting_principal)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_refund_decision_admissions_cmd
  ON canonical_cancellation_refund_decision_admissions(command_id);
CREATE INDEX IF NOT EXISTS idx_refund_decision_admissions_dev
  ON canonical_cancellation_refund_decision_admissions(decision_evidence_id);
CREATE INDEX IF NOT EXISTS idx_refund_decision_admissions_auth
  ON canonical_cancellation_refund_decision_admissions(action_authorization_id);

-- Immutability trigger on admissions
CREATE OR REPLACE FUNCTION canonical_cancellation_refund_decision_admissions_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_REFUND_DECISION_ADMISSION_IMMUTABLE';
END;
$$;

CREATE TRIGGER trg_canonical_refund_decision_admissions_immutable
  BEFORE UPDATE OR DELETE ON canonical_cancellation_refund_decision_admissions
  FOR EACH ROW EXECUTE FUNCTION canonical_cancellation_refund_decision_admissions_reject_mutation();

-- 4. Seed Scoped IAM Permissions and Role Definitions
DO $seed$
DECLARE
  relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'internal_permission_catalog',
    'internal_role_definitions',
    'internal_role_versions',
    'internal_role_permissions',
    'internal_role_current_versions'
  ] LOOP
    EXECUTE format('CREATE POLICY w4d_admission_migration_seed ON %I FOR INSERT TO %I WITH CHECK (true)', relation_name, current_user);
  END LOOP;
END $seed$;

INSERT INTO internal_permission_catalog(
  permission_code,
  resource_type,
  risk_class,
  step_up_required,
  checker_policy,
  description
) VALUES (
  'accommodation.refund_decision.admit',
  'FINANCIAL_CONTRACT',
  'CRITICAL',
  true,
  'DISTINCT_ACTOR',
  'Admit an authenticated accommodation cancellation refund decision with dual-control Maker-Checker and action-bound step-up factor.'
) ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO internal_role_definitions(organization_id, role_key, display_name, description)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'accommodation_finance_approver', 'Accommodation Finance Approver', 'Appointed authority to review and approve accommodation cancellation refund decisions.'),
  ('00000000-0000-4000-8000-000000000001', 'accommodation_refund_preparer', 'Accommodation Refund Preparer', 'Operations staff authorized to prepare and submit accommodation cancellation refund decisions.')
ON CONFLICT (organization_id, role_key) DO NOTHING;

INSERT INTO internal_role_versions(role_id, organization_id, version, config_hash, reason)
SELECT id, organization_id, 1, encode(sha256(convert_to(role_key || ':v1', 'UTF8')), 'hex'), 'Initial scoped W4-D accommodation roles.'
FROM internal_role_definitions
WHERE role_key IN ('accommodation_finance_approver', 'accommodation_refund_preparer')
ON CONFLICT (role_id, version) DO NOTHING;

INSERT INTO internal_role_permissions(role_version_id, permission_code)
SELECT v.id, 'accommodation.refund_decision.admit'
FROM internal_role_versions v
JOIN internal_role_definitions r ON r.id = v.role_id
WHERE r.role_key IN ('accommodation_finance_approver', 'accommodation_refund_preparer')
  AND v.version = 1
ON CONFLICT DO NOTHING;

INSERT INTO internal_role_current_versions(role_id, organization_id, version_id)
SELECT r.id, r.organization_id, v.id
FROM internal_role_definitions r
JOIN internal_role_versions v ON v.role_id = r.id AND v.version = 1
WHERE r.role_key IN ('accommodation_finance_approver', 'accommodation_refund_preparer')
ON CONFLICT (role_id) DO UPDATE SET version_id = EXCLUDED.version_id;

DO $seed$
DECLARE
  relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'internal_permission_catalog',
    'internal_role_definitions',
    'internal_role_versions',
    'internal_role_permissions',
    'internal_role_current_versions'
  ] LOOP
    EXECUTE format('DROP POLICY w4d_admission_migration_seed ON %I', relation_name);
  END LOOP;
END $seed$;

-- 5. Protected Registrar Function: admit_cancellation_refund_decision
CREATE OR REPLACE FUNCTION admit_cancellation_refund_decision(
  target_command UUID,
  target_action_authorization_id UUID
)
RETURNS TABLE (
  evidence_id UUID,
  admission_id UUID,
  command_id UUID,
  decision_ref TEXT,
  decision_version INT,
  decision_digest TEXT,
  reservation_id UUID,
  approved_amount_paise BIGINT,
  currency TEXT,
  admitted_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $$
#variable_conflict use_column
DECLARE
  current_user_str TEXT;
  current_org UUID;
  current_membership UUID;
  current_env TEXT;
  auth_row RECORD;
  prep_row RECORD;
  app_row RECORD;
  checker_member RECORD;
  res_row RECORD;
  cancel_event RECORD;
  rel_row RECORD;
  bridge_row RECORD;
  payable_row RECORD;
  attempt_row RECORD;
  prov_event RECORD;
  capture_amounts BIGINT[];
  captured_ceiling BIGINT;
  new_evidence RECORD;
  new_admission RECORD;
  approved_minor BIGINT;
BEGIN
  -- 1. Read session RLS context
  current_user_str := nullif(current_setting('app.current_user_id', true), '');
  current_org := nullif(current_setting('app.organization_id', true), '')::uuid;
  current_membership := nullif(current_setting('app.membership_id', true), '')::uuid;
  current_env := coalesce(nullif(current_setting('app.workforce_environment', true), ''), 'LOCAL');

  IF current_user_str IS NULL OR current_org IS NULL OR current_membership IS NULL THEN
    RAISE EXCEPTION 'SESSION_CONTEXT_REQUIRED';
  END IF;

  -- 2. Validate input parameters
  IF target_command IS NULL OR target_action_authorization_id IS NULL THEN
    RAISE EXCEPTION 'ADMISSION_INPUT_INVALID';
  END IF;

  -- 3. Load Action Authorization (must be locked FOR UPDATE, status CONSUMED, stamped with pg_current_xact_id())
  SELECT * INTO auth_row
  FROM internal_action_authorizations a
  WHERE a.id = target_action_authorization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_AUTHORIZATION_NOT_FOUND';
  END IF;

  IF auth_row.status IS DISTINCT FROM 'CONSUMED' THEN
    RAISE EXCEPTION 'ACTION_AUTHORIZATION_NOT_CONSUMED';
  END IF;

  -- Same-transaction witness: must match pg_current_xact_id()
  IF auth_row.consumed_transaction_id IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'SAME_TRANSACTION_WITNESS_FAILED';
  END IF;

  IF auth_row.organization_id IS DISTINCT FROM current_org THEN
    RAISE EXCEPTION 'ORGANIZATION_MISMATCH';
  END IF;

  IF auth_row.environment IS DISTINCT FROM current_env THEN
    RAISE EXCEPTION 'ENVIRONMENT_MISMATCH';
  END IF;

  -- Maker must match execution principal
  IF auth_row.maker_membership_id IS DISTINCT FROM current_membership THEN
    RAISE EXCEPTION 'MAKER_PRINCIPAL_MISMATCH';
  END IF;

  IF auth_row.permission_code IS DISTINCT FROM 'accommodation.refund_decision.admit' THEN
    RAISE EXCEPTION 'PERMISSION_MISMATCH';
  END IF;

  -- 4. Load Staged Preparation Packet FOR UPDATE
  SELECT * INTO prep_row
  FROM canonical_cancellation_refund_decision_preparations p
  WHERE p.action_authorization_id = auth_row.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PREPARATION_NOT_FOUND';
  END IF;

  IF prep_row.command_id IS DISTINCT FROM target_command THEN
    RAISE EXCEPTION 'PREPARATION_COMMAND_MISMATCH';
  END IF;

  IF prep_row.command_fingerprint IS DISTINCT FROM auth_row.command_hash THEN
    RAISE EXCEPTION 'COMMAND_FINGERPRINT_MISMATCH';
  END IF;

  IF prep_row.maker_membership_id IS DISTINCT FROM auth_row.maker_membership_id THEN
    RAISE EXCEPTION 'PREPARATION_MAKER_MISMATCH';
  END IF;

  -- 5. Load Action Approval Row
  SELECT * INTO app_row
  FROM internal_action_approvals app
  WHERE app.authorization_id = auth_row.id
  ORDER BY app.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPROVAL_NOT_FOUND';
  END IF;

  IF app_row.decision IS DISTINCT FROM 'APPROVE' THEN
    RAISE EXCEPTION 'APPROVAL_DECISION_INVALID';
  END IF;

  IF app_row.command_hash IS DISTINCT FROM auth_row.command_hash THEN
    RAISE EXCEPTION 'APPROVAL_COMMAND_HASH_MISMATCH';
  END IF;

  IF app_row.checker_membership_id IS NOT DISTINCT FROM auth_row.maker_membership_id THEN
    RAISE EXCEPTION 'MAKER_CHECKER_CONFLICT';
  END IF;

  -- 6. Verify Checker Appointment in PostgreSQL
  SELECT * INTO checker_member
  FROM internal_organization_memberships m
  WHERE m.id = app_row.checker_membership_id
    AND m.organization_id = current_org
    AND m.status = 'ACTIVE'
    AND (m.expires_at IS NULL OR m.expires_at > clock_timestamp());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHECKER_MEMBERSHIP_INACTIVE';
  END IF;

  -- Checker must hold unrevoked grant for accommodation_finance_approver
  IF NOT EXISTS (
    SELECT 1
    FROM internal_membership_grants g
    JOIN internal_role_versions v ON v.id = g.role_version_id AND v.organization_id = g.organization_id
    JOIN internal_role_definitions r ON r.id = v.role_id
    LEFT JOIN internal_membership_grant_revocations rev ON rev.grant_id = g.id
    WHERE g.organization_id = current_org
      AND g.membership_id = app_row.checker_membership_id
      AND r.role_key = 'accommodation_finance_approver'
      AND g.environment = current_env
      AND g.valid_from <= app_row.created_at
      AND (g.valid_until IS NULL OR g.valid_until > app_row.created_at)
      AND rev.grant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CHECKER_APPOINTMENT_INVALID';
  END IF;

  -- 7. Lock Reservation Root FOR UPDATE
  SELECT * INTO res_row
  FROM canonical_reservations cr
  WHERE cr.id = prep_row.reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  -- 8. Canonical Bindings and Financial Validations
  -- Latest event must be CANCELLED by INTERNAL_DECISION for ENCHO_DIRECT
  SELECT * INTO cancel_event
  FROM canonical_reservation_events cre
  WHERE cre.reservation_id = prep_row.reservation_id
  ORDER BY cre.sequence_number DESC
  LIMIT 1;

  IF NOT FOUND OR cancel_event.event_type IS DISTINCT FROM 'CANCELLED'
     OR cancel_event.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT'
     OR cancel_event.actor_kind IS DISTINCT FROM 'INTERNAL_DECISION'
     OR cancel_event.decision_source_kind IS DISTINCT FROM 'INTERNAL_AUTHORITY_PRIMITIVE' THEN
    RAISE EXCEPTION 'RESERVATION_NOT_CANCELLED';
  END IF;

  IF cancel_event.event_id::text IS DISTINCT FROM (prep_row.packet_payload->>'cancellationEventId') THEN
    RAISE EXCEPTION 'CANCELLATION_EVENT_MISMATCH';
  END IF;

  -- Cancellation release must be unique V1 release
  SELECT * INTO rel_row
  FROM canonical_reservation_cancellation_inventory_releases cir
  WHERE cir.reservation_id = prep_row.reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELLATION_RELEASE_NOT_FOUND';
  END IF;

  IF rel_row.release_id::text IS DISTINCT FROM (prep_row.packet_payload->>'cancellationReleaseId') THEN
    RAISE EXCEPTION 'CANCELLATION_RELEASE_MISMATCH';
  END IF;

  IF rel_row.released_effective_version IS DISTINCT FROM 1 OR rel_row.released_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'V2_CANCELLATION_RELEASE_EXCLUDED';
  END IF;

  -- Paid bridge
  SELECT * INTO bridge_row
  FROM canonical_payment_reservations cpr
  WHERE cpr.reservation_id = prep_row.reservation_id;

  IF NOT FOUND OR bridge_row.id::text IS DISTINCT FROM (prep_row.packet_payload->>'paidBridgeId') THEN
    RAISE EXCEPTION 'PAID_BRIDGE_MISMATCH';
  END IF;

  -- Payment attempt
  SELECT * INTO attempt_row
  FROM canonical_payment_attempts cpa
  WHERE cpa.id = bridge_row.payment_attempt_id;

  IF NOT FOUND OR attempt_row.id::text IS DISTINCT FROM (prep_row.packet_payload->>'paymentAttemptId') THEN
    RAISE EXCEPTION 'PAYMENT_ATTEMPT_MISMATCH';
  END IF;

  -- Stays quote & Payable authority
  SELECT * INTO payable_row
  FROM canonical_payable_authorities pa
  WHERE pa.quote_id = bridge_row.quote_id;

  IF NOT FOUND OR payable_row.id::text IS DISTINCT FROM (prep_row.packet_payload->>'payableAuthorityId') THEN
    RAISE EXCEPTION 'PAYABLE_AUTHORITY_MISMATCH';
  END IF;

  IF payable_row.currency IS DISTINCT FROM 'INR' THEN
    RAISE EXCEPTION 'PAYABLE_CURRENCY_INVALID';
  END IF;

  -- Provider event
  SELECT * INTO prov_event
  FROM canonical_provider_events pe
  WHERE pe.id = (prep_row.packet_payload->>'supportingProviderEventId')::uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROVIDER_EVENT_NOT_FOUND';
  END IF;

  IF prov_event.payment_attempt_id IS DISTINCT FROM attempt_row.id THEN
    RAISE EXCEPTION 'PROVIDER_EVENT_ATTEMPT_MISMATCH';
  END IF;

  IF prov_event.origin_kind IS DISTINCT FROM (prep_row.packet_payload->>'providerOriginKind')
     OR prov_event.provider_payment_ref IS DISTINCT FROM (prep_row.packet_payload->>'providerPaymentRef')
     OR prov_event.evidence_hash IS DISTINCT FROM (prep_row.packet_payload->>'supportingEvidenceHash') THEN
    RAISE EXCEPTION 'PROVIDER_EVENT_FACTS_MISMATCH';
  END IF;

  -- Capture ceiling validation
  SELECT array_agg(DISTINCT cpe.reported_amount_paise)
  INTO capture_amounts
  FROM canonical_provider_events cpe
  WHERE cpe.payment_attempt_id = attempt_row.id
    AND cpe.normalized_event_type = 'PAYMENT_CAPTURED'
    AND cpe.origin_kind = prov_event.origin_kind
    AND cpe.provider_payment_ref = prov_event.provider_payment_ref;

  IF capture_amounts IS NULL OR array_length(capture_amounts, 1) = 0 THEN
    RAISE EXCEPTION 'NO_VERIFIED_CAPTURES_FOUND';
  END IF;

  IF array_length(capture_amounts, 1) > 1 THEN
    RAISE EXCEPTION 'CAPTURE_AMOUNT_CONFLICT';
  END IF;

  captured_ceiling := capture_amounts[1];
  approved_minor := (prep_row.packet_payload->>'approvedAmountMinor')::bigint;

  IF approved_minor <= 0 THEN
    RAISE EXCEPTION 'APPROVED_AMOUNT_INVALID';
  END IF;

  IF approved_minor > captured_ceiling THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_CAPTURED_CEILING';
  END IF;

  -- 9. Insert into canonical_cancellation_refund_decision_evidence
  INSERT INTO canonical_cancellation_refund_decision_evidence (
    decision_ref,
    version,
    evidence_classification,
    approver_responsibility,
    approver_identity_ref,
    decision_at,
    reason_code,
    reason_text,
    approval_ref,
    verifying_component,
    verified_at,
    reservation_id,
    cancellation_event_id,
    cancellation_release_id,
    paid_bridge_id,
    payment_attempt_id,
    quote_id,
    payable_authority_id,
    provider_origin_kind,
    provider_payment_ref,
    supporting_provider_event_id,
    supporting_evidence_hash,
    approved_amount_paise,
    currency,
    permitted_submitting_component,
    permitted_issuer_role
  ) VALUES (
    prep_row.packet_payload->>'decisionRef',
    (prep_row.packet_payload->>'decisionVersion')::int,
    'AUTHENTICATED_HUMAN_APPROVAL',
    'ACCOMMODATION_FINANCE_APPROVER',
    app_row.checker_membership_id::text,
    app_row.created_at,
    prep_row.packet_payload->>'reasonCode',
    prep_row.packet_payload->>'reasonText',
    auth_row.id::text,
    'CANONICAL_REFUND_DECISION_ADMISSION_SERVICE',
    statement_timestamp(),
    prep_row.reservation_id,
    cancel_event.event_id,
    rel_row.release_id,
    bridge_row.id,
    attempt_row.id,
    bridge_row.quote_id,
    payable_row.id,
    prov_event.origin_kind,
    prov_event.provider_payment_ref,
    prov_event.id,
    prov_event.evidence_hash,
    approved_minor,
    'INR',
    'REFUND_DECISION_AUTHORITY_PRIMITIVE',
    'encho_refund_issuer'
  ) RETURNING * INTO new_evidence;

  -- 10. Insert into canonical_cancellation_refund_decision_admissions
  INSERT INTO canonical_cancellation_refund_decision_admissions (
    command_id,
    command_fingerprint,
    decision_evidence_id,
    action_authorization_id,
    action_approval_id,
    maker_membership_id,
    checker_membership_id,
    admitted_at,
    admitting_principal
  ) VALUES (
    prep_row.command_id,
    prep_row.command_fingerprint,
    new_evidence.id,
    auth_row.id,
    app_row.id,
    auth_row.maker_membership_id,
    app_row.checker_membership_id,
    statement_timestamp(),
    session_user
  ) RETURNING * INTO new_admission;

  RETURN QUERY SELECT
    new_evidence.id,
    new_admission.id,
    new_admission.command_id,
    new_evidence.decision_ref,
    new_evidence.version,
    new_evidence.decision_digest,
    new_evidence.reservation_id,
    new_evidence.approved_amount_paise,
    new_evidence.currency,
    new_admission.admitted_at,
    FALSE;
  RETURN;
END;
$$;

-- 6. Protected Guarded Replay Function: get_admitted_cancellation_refund_decision
CREATE OR REPLACE FUNCTION get_admitted_cancellation_refund_decision(
  target_command_id UUID
)
RETURNS TABLE (
  evidence_id UUID,
  admission_id UUID,
  command_id UUID,
  decision_ref TEXT,
  decision_version INT,
  decision_digest TEXT,
  reservation_id UUID,
  approved_amount_paise BIGINT,
  currency TEXT,
  admitted_at TIMESTAMPTZ,
  maker_membership_id UUID,
  checker_membership_id UUID,
  command_fingerprint TEXT,
  replayed BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $$
#variable_conflict use_column
DECLARE
  current_membership UUID;
  current_org UUID;
  adm_row RECORD;
  dev_row RECORD;
BEGIN
  current_membership := nullif(current_setting('app.membership_id', true), '')::uuid;
  current_org := nullif(current_setting('app.organization_id', true), '')::uuid;

  IF current_membership IS NULL OR current_org IS NULL THEN
    RAISE EXCEPTION 'SESSION_CONTEXT_REQUIRED';
  END IF;

  SELECT * INTO adm_row
  FROM canonical_cancellation_refund_decision_admissions adm
  WHERE adm.command_id = target_command_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Scoped access guard: only the original Maker who created this command can replay its execution
  IF adm_row.maker_membership_id IS DISTINCT FROM current_membership THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT * INTO dev_row
  FROM canonical_cancellation_refund_decision_evidence dev
  WHERE dev.id = adm_row.decision_evidence_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT
    dev_row.id,
    adm_row.id,
    adm_row.command_id,
    dev_row.decision_ref,
    dev_row.version,
    dev_row.decision_digest,
    dev_row.reservation_id,
    dev_row.approved_amount_paise,
    dev_row.currency,
    adm_row.admitted_at,
    adm_row.maker_membership_id,
    adm_row.checker_membership_id,
    adm_row.command_fingerprint,
    TRUE;
  RETURN;
END;
$$;

-- 7. Update issue_cancellation_refund_authorization to validate durable admission provenance
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
  adm_row RECORD;
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

  -- Classification check: accepts synthetic fixture or authenticated human approval
  IF evidence.evidence_classification NOT IN ('LOCAL_SYNTHETIC_TEST_FIXTURE', 'AUTHENTICATED_HUMAN_APPROVAL') THEN
    RAISE EXCEPTION 'EVIDENCE_CLASSIFICATION_INVALID';
  END IF;

  -- For AUTHENTICATED_HUMAN_APPROVAL, validate durable provenance in admissions table
  IF evidence.evidence_classification = 'AUTHENTICATED_HUMAN_APPROVAL' THEN
    SELECT * INTO adm_row
    FROM canonical_cancellation_refund_decision_admissions adm
    WHERE adm.decision_evidence_id = evidence.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'EVIDENCE_PROVENANCE_NOT_FOUND';
    END IF;

    IF adm_row.action_authorization_id::text IS DISTINCT FROM evidence.approval_ref
      OR adm_row.checker_membership_id::text IS DISTINCT FROM evidence.approver_identity_ref THEN
      RAISE EXCEPTION 'EVIDENCE_PROVENANCE_MISMATCH';
    END IF;
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

  -- Verify exact release night count matches reservation night count
  SELECT count(*) INTO rel_nights_count
  FROM canonical_reservation_cancellation_release_nights crn
  WHERE crn.release_id = rel_row.release_id;

  SELECT count(*) INTO res_nights_count
  FROM canonical_reservation_nights rn
  WHERE rn.reservation_id = target_reservation_id;

  IF rel_nights_count IS DISTINCT FROM res_nights_count OR rel_nights_count = 0 THEN
    RAISE EXCEPTION 'CANCELLATION_RELEASE_NIGHTS_MISMATCH';
  END IF;

  -- Verify paid bridge and payment attempt
  SELECT * INTO bridge_row
  FROM canonical_payment_reservations cpr
  WHERE cpr.reservation_id = target_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAID_BRIDGE_NOT_FOUND';
  END IF;
  IF bridge_row.id IS DISTINCT FROM evidence.paid_bridge_id THEN
    RAISE EXCEPTION 'EVIDENCE_PAID_BRIDGE_MISMATCH';
  END IF;

  SELECT * INTO payable_row
  FROM canonical_payable_authorities pa
  WHERE pa.quote_id = bridge_row.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYABLE_AUTHORITY_NOT_FOUND';
  END IF;
  IF payable_row.id IS DISTINCT FROM evidence.payable_authority_id THEN
    RAISE EXCEPTION 'EVIDENCE_PAYABLE_AUTHORITY_MISMATCH';
  END IF;
  IF payable_row.currency IS DISTINCT FROM 'INR' THEN
    RAISE EXCEPTION 'PAYABLE_CURRENCY_INVALID';
  END IF;

  SELECT * INTO attempt_row
  FROM canonical_payment_attempts cpa
  WHERE cpa.id = bridge_row.payment_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_ATTEMPT_NOT_FOUND';
  END IF;
  IF attempt_row.id IS DISTINCT FROM evidence.payment_attempt_id THEN
    RAISE EXCEPTION 'EVIDENCE_PAYMENT_ATTEMPT_MISMATCH';
  END IF;

  -- Verify supporting provider event matches capture facts
  SELECT * INTO capture_event
  FROM canonical_provider_events cpe
  WHERE cpe.id = evidence.supporting_provider_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORTING_PROVIDER_EVENT_NOT_FOUND';
  END IF;
  IF capture_event.payment_attempt_id IS DISTINCT FROM attempt_row.id THEN
    RAISE EXCEPTION 'PROVIDER_EVENT_ATTEMPT_MISMATCH';
  END IF;
  IF capture_event.origin_kind IS DISTINCT FROM evidence.provider_origin_kind THEN
    RAISE EXCEPTION 'PROVIDER_ORIGIN_MISMATCH';
  END IF;
  IF capture_event.provider_payment_ref IS DISTINCT FROM evidence.provider_payment_ref THEN
    RAISE EXCEPTION 'PROVIDER_PAYMENT_REF_MISMATCH';
  END IF;
  IF capture_event.evidence_hash IS DISTINCT FROM evidence.supporting_evidence_hash THEN
    RAISE EXCEPTION 'PROVIDER_EVIDENCE_HASH_MISMATCH';
  END IF;

  -- Verify captured ceiling: array of DISTINCT reported_amount_paise for capture events
  SELECT
    array_agg(DISTINCT cpe.reported_amount_paise),
    array_agg(DISTINCT cpe.provider_payment_ref),
    array_agg(DISTINCT cpe.provider_order_ref)
  INTO
    capture_amounts,
    capture_refs,
    capture_orders
  FROM canonical_provider_events cpe
  WHERE cpe.payment_attempt_id = attempt_row.id
    AND cpe.normalized_event_type = 'PAYMENT_CAPTURED'
    AND cpe.origin_kind = evidence.provider_origin_kind
    AND cpe.provider_payment_ref = evidence.provider_payment_ref;

  IF capture_amounts IS NULL OR array_length(capture_amounts, 1) = 0 THEN
    RAISE EXCEPTION 'NO_VERIFIED_CAPTURES_FOUND';
  END IF;

  IF array_length(capture_amounts, 1) > 1 THEN
    RAISE EXCEPTION 'CAPTURE_AMOUNT_CONFLICT';
  END IF;

  captured_ceiling := capture_amounts[1];
  IF captured_ceiling <= 0 THEN
    RAISE EXCEPTION 'CAPTURED_CEILING_INVALID';
  END IF;

  IF evidence.approved_amount_paise > captured_ceiling THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_CAPTURED_CEILING';
  END IF;

  IF array_length(capture_refs, 1) > 1 THEN
    RAISE EXCEPTION 'CAPTURE_PAYMENT_REF_CONFLICT';
  END IF;
  derived_capture_ref := capture_refs[1];

  -- Check reconciliation state
  IF EXISTS (
    SELECT 1 FROM canonical_payment_reconciliations cpr
    WHERE cpr.payment_attempt_id = attempt_row.id
      AND NOT cpr.resolved
  ) THEN
    RAISE EXCEPTION 'PAYMENT_RECONCILIATION_UNRESOLVED';
  END IF;

  -- Check cross-attempt alias conflicts
  IF EXISTS (
    SELECT 1 FROM canonical_provider_events cpe
    WHERE cpe.origin_kind = evidence.provider_origin_kind
      AND cpe.provider_payment_ref = derived_capture_ref
      AND cpe.payment_attempt_id IS DISTINCT FROM attempt_row.id
  ) THEN
    RAISE EXCEPTION 'CAPTURE_CROSS_ATTEMPT_ALIAS_CONFLICT';
  END IF;

  -- 7. Insert into canonical_cancellation_refund_authorizations
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
      evidence.provider_origin_kind,
      derived_capture_ref,
      'encho_refund_issuer',
      invoking_user
    ) RETURNING * INTO saved_auth;
  EXCEPTION
    WHEN unique_violation THEN
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

-- 8. Row Level Security & Grants
ALTER TABLE canonical_cancellation_refund_decision_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_cancellation_refund_decision_preparations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canonical_refund_decision_prep_owner
  ON canonical_cancellation_refund_decision_preparations;
CREATE POLICY canonical_refund_decision_prep_owner
  ON canonical_cancellation_refund_decision_preparations FOR ALL
  USING (true) WITH CHECK (true);

ALTER TABLE canonical_cancellation_refund_decision_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_cancellation_refund_decision_admissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canonical_refund_decision_adm_owner
  ON canonical_cancellation_refund_decision_admissions;
CREATE POLICY canonical_refund_decision_adm_owner
  ON canonical_cancellation_refund_decision_admissions FOR ALL
  USING (true) WITH CHECK (true);

REVOKE ALL ON canonical_cancellation_refund_decision_preparations FROM PUBLIC;
REVOKE ALL ON canonical_cancellation_refund_decision_admissions FROM PUBLIC;
REVOKE ALL ON FUNCTION admit_cancellation_refund_decision(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admitted_cancellation_refund_decision(UUID) FROM PUBLIC;

-- Read policies for canonical facts inspection during refund preparation and preview
DROP POLICY IF EXISTS canonical_reservations_staff_read ON canonical_reservations;
CREATE POLICY canonical_reservations_staff_read ON canonical_reservations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS canonical_reservation_events_staff_read ON canonical_reservation_events;
CREATE POLICY canonical_reservation_events_staff_read ON canonical_reservation_events
  FOR SELECT USING (true);

DROP POLICY IF EXISTS canonical_cancellation_releases_staff_read ON canonical_reservation_cancellation_inventory_releases;
CREATE POLICY canonical_cancellation_releases_staff_read ON canonical_reservation_cancellation_inventory_releases
  FOR SELECT USING (true);

DROP POLICY IF EXISTS canonical_payment_reservations_staff_read ON canonical_payment_reservations;
CREATE POLICY canonical_payment_reservations_staff_read ON canonical_payment_reservations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS canonical_payable_authorities_staff_read ON canonical_payable_authorities;
CREATE POLICY canonical_payable_authorities_staff_read ON canonical_payable_authorities
  FOR SELECT USING (true);

DROP POLICY IF EXISTS canonical_provider_events_staff_read ON canonical_provider_events;
CREATE POLICY canonical_provider_events_staff_read ON canonical_provider_events
  FOR SELECT USING (true);

DO $runtime_grants$
DECLARE
  r TEXT;
  runtime_roles TEXT[] := ARRAY['w1_offer_staff', 'encho_staff_runtime', 'encho_app_prod'];
BEGIN
  FOREACH r IN ARRAY runtime_roles LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT ON canonical_cancellation_refund_decision_preparations TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION admit_cancellation_refund_decision(UUID, UUID) TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION get_admitted_cancellation_refund_decision(UUID) TO %I', r);
      EXECUTE format('GRANT SELECT ON canonical_reservations, canonical_reservation_events, canonical_reservation_cancellation_inventory_releases, canonical_payment_reservations, canonical_payable_authorities, canonical_provider_events TO %I', r);
    END IF;
  END LOOP;
END $runtime_grants$;
