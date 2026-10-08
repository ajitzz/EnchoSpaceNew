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
--   - Narrow authenticated, resource-scoped preparation, preview and replay routines.
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

-- 5. Protected Preview Interface: get_cancellation_refund_decision_preview
CREATE OR REPLACE FUNCTION get_cancellation_refund_decision_preview(
  target_reservation_id UUID
)
RETURNS TABLE (
  reservation_id UUID,
  cancellation_event_id UUID,
  cancellation_release_id UUID,
  paid_bridge_id UUID,
  payment_attempt_id UUID,
  quote_id UUID,
  payable_authority_id UUID,
  provider_origin_kind TEXT,
  provider_payment_ref TEXT,
  supporting_provider_event_id UUID,
  supporting_evidence_hash TEXT,
  captured_ceiling_paise BIGINT,
  currency TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $$
#variable_conflict use_column
DECLARE
  current_user_str TEXT;
  current_org UUID;
  current_membership UUID;
  current_env TEXT;
  res_row RECORD;
  cancel_event RECORD;
  rel_row RECORD;
  rel_nights_count INT;
  res_nights_count INT;
  bridge_row RECORD;
  payable_row RECORD;
  attempt_row RECORD;
  prov_event RECORD;
  capture_amounts BIGINT[];
  capture_refs TEXT[];
  captured_ceiling BIGINT;
BEGIN
  -- Read session RLS context
  current_user_str := nullif(current_setting('app.current_user_id', true), '');
  current_org := nullif(current_setting('app.organization_id', true), '')::uuid;
  current_membership := nullif(current_setting('app.membership_id', true), '')::uuid;
  current_env := coalesce(nullif(current_setting('app.workforce_environment', true), ''), 'LOCAL');

  IF current_user_str IS NULL OR current_org IS NULL OR current_membership IS NULL THEN
    RAISE EXCEPTION 'SESSION_CONTEXT_REQUIRED';
  END IF;

  -- Verify caller has active membership and capability in target_org
  IF NOT EXISTS (
    SELECT 1
    FROM internal_organization_memberships m
    JOIN internal_membership_grants g ON g.membership_id = m.id AND g.organization_id = m.organization_id
    JOIN internal_role_permissions rp ON rp.role_version_id = g.role_version_id
    LEFT JOIN internal_membership_grant_revocations rev ON rev.grant_id = g.id
    WHERE m.id = current_membership
      AND m.organization_id = current_org
      AND m.status = 'ACTIVE'
      AND rp.permission_code = 'accommodation.refund_decision.admit'
      AND g.environment = current_env
      AND g.valid_from <= clock_timestamp()
      AND (g.valid_until IS NULL OR g.valid_until > clock_timestamp())
      AND rev.grant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Load reservation
  SELECT * INTO res_row
  FROM canonical_reservations cr
  WHERE cr.id = target_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  -- Cancellation event
  SELECT * INTO cancel_event
  FROM canonical_reservation_events cre
  WHERE cre.reservation_id = target_reservation_id
  ORDER BY cre.sequence_number DESC
  LIMIT 1;
  IF NOT FOUND OR cancel_event.event_type IS DISTINCT FROM 'CANCELLED'
     OR cancel_event.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT'
     OR cancel_event.actor_kind IS DISTINCT FROM 'INTERNAL_DECISION'
     OR cancel_event.decision_source_kind IS DISTINCT FROM 'INTERNAL_AUTHORITY_PRIMITIVE' THEN
    RAISE EXCEPTION 'RESERVATION_NOT_CANCELLED';
  END IF;

  -- Release V1
  SELECT * INTO rel_row
  FROM canonical_reservation_cancellation_inventory_releases cir
  WHERE cir.reservation_id = target_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELLATION_RELEASE_NOT_FOUND';
  END IF;
  IF rel_row.released_effective_version IS DISTINCT FROM 1 OR rel_row.released_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'V2_CANCELLATION_RELEASE_EXCLUDED';
  END IF;

  -- Release nights
  SELECT count(*) INTO rel_nights_count
  FROM canonical_reservation_cancellation_release_nights crn
  WHERE crn.release_id = rel_row.release_id;
  SELECT count(*) INTO res_nights_count
  FROM canonical_reservation_nights crn
  WHERE crn.reservation_id = target_reservation_id;
  IF rel_nights_count = 0 OR rel_nights_count IS DISTINCT FROM res_nights_count THEN
    RAISE EXCEPTION 'CANCELLATION_RELEASE_NIGHTS_INCOHERENT';
  END IF;

  -- Sealed V2
  IF EXISTS (
    SELECT 1 FROM canonical_reservation_revision_seals s
    JOIN canonical_reservation_revisions r ON r.id = s.revision_id
    WHERE r.reservation_id = target_reservation_id
  ) THEN
    RAISE EXCEPTION 'SEALED_V2_REVISION_EXCLUDED';
  END IF;

  -- Paid bridge
  SELECT * INTO bridge_row
  FROM canonical_payment_reservations cpr
  WHERE cpr.reservation_id = target_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAID_BRIDGE_NOT_FOUND';
  END IF;
  IF bridge_row.status IS DISTINCT FROM 'COMMITTED' THEN
    RAISE EXCEPTION 'PAID_BRIDGE_NOT_COMMITTED';
  END IF;

  -- Payable authority
  SELECT * INTO payable_row
  FROM canonical_payable_authorities cpa
  WHERE cpa.quote_id = bridge_row.quote_id AND cpa.status = 'APPROVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYABLE_AUTHORITY_NOT_FOUND';
  END IF;
  IF payable_row.currency IS DISTINCT FROM 'INR' THEN
    RAISE EXCEPTION 'CURRENCY_NOT_SUPPORTED';
  END IF;

  -- Payment attempt
  SELECT * INTO attempt_row
  FROM canonical_payment_attempts cpa
  WHERE cpa.id = bridge_row.payment_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_ATTEMPT_NOT_FOUND';
  END IF;
  IF attempt_row.payment_state IS DISTINCT FROM 'MATCHED_CAPTURE' THEN
    RAISE EXCEPTION 'PAYMENT_STATE_NOT_MATCHED_CAPTURE';
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

  -- Capture group
  SELECT
    array_agg(DISTINCT cpe.reported_amount_paise),
    array_agg(DISTINCT cpe.provider_payment_ref)
  INTO capture_amounts, capture_refs
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

  captured_ceiling := capture_amounts[1];

  -- Supporting provider event
  SELECT * INTO prov_event
  FROM canonical_provider_events cpe
  WHERE cpe.payment_attempt_id = attempt_row.id
    AND cpe.normalized_event_type = 'PAYMENT_CAPTURED'
    AND cpe.status = 'PROCESSED'
  ORDER BY cpe.received_at ASC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORTING_PROVIDER_EVENT_NOT_FOUND';
  END IF;

  RETURN QUERY SELECT
    res_row.id,
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
    captured_ceiling,
    'INR'::text;
  RETURN;
END;
$$;

-- 6. Protected Preparation Interface: prepare_cancellation_refund_decision
CREATE OR REPLACE FUNCTION prepare_cancellation_refund_decision(
  target_command_id UUID,
  target_action_authorization_id UUID,
  target_reservation_id UUID,
  target_decision_ref TEXT,
  target_version INT,
  target_approved_amount_paise BIGINT,
  target_currency TEXT,
  target_reason_code TEXT,
  target_reason TEXT,
  target_command_fingerprint TEXT,
  target_packet_payload JSONB
)
RETURNS TABLE (
  preparation_id UUID,
  command_id UUID,
  action_authorization_id UUID,
  reservation_id UUID,
  command_fingerprint TEXT,
  maker_membership_id UUID,
  packet_payload JSONB,
  created_at TIMESTAMPTZ,
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
  existing_prep RECORD;
  auth_row RECORD;
  new_prep RECORD;
BEGIN
  -- Read session RLS context
  current_user_str := nullif(current_setting('app.current_user_id', true), '');
  current_org := nullif(current_setting('app.organization_id', true), '')::uuid;
  current_membership := nullif(current_setting('app.membership_id', true), '')::uuid;
  current_env := coalesce(nullif(current_setting('app.workforce_environment', true), ''), 'LOCAL');

  IF current_user_str IS NULL OR current_org IS NULL OR current_membership IS NULL THEN
    RAISE EXCEPTION 'SESSION_CONTEXT_REQUIRED';
  END IF;

  -- Input checks
  IF target_command_id IS NULL OR target_action_authorization_id IS NULL OR target_reservation_id IS NULL
     OR target_decision_ref IS NULL OR length(trim(target_decision_ref)) = 0
     OR target_version IS NULL OR target_version <= 0
     OR target_approved_amount_paise IS NULL OR target_approved_amount_paise <= 0
     OR target_currency IS DISTINCT FROM 'INR'
     OR target_reason_code IS NULL OR target_reason IS NULL OR length(trim(target_reason)) < 10 THEN
    RAISE EXCEPTION 'PREPARATION_INPUT_INVALID';
  END IF;

  -- Verify Maker has active membership with accommodation.refund_decision.admit capability
  IF NOT EXISTS (
    SELECT 1
    FROM internal_organization_memberships m
    JOIN internal_membership_grants g ON g.membership_id = m.id AND g.organization_id = m.organization_id
    JOIN internal_role_permissions rp ON rp.role_version_id = g.role_version_id
    LEFT JOIN internal_membership_grant_revocations rev ON rev.grant_id = g.id
    WHERE m.id = current_membership
      AND m.organization_id = current_org
      AND m.status = 'ACTIVE'
      AND rp.permission_code = 'accommodation.refund_decision.admit'
      AND g.environment = current_env
      AND g.valid_from <= clock_timestamp()
      AND (g.valid_until IS NULL OR g.valid_until > clock_timestamp())
      AND rev.grant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- 1. Idempotent Retention Check
  SELECT * INTO existing_prep
  FROM canonical_cancellation_refund_decision_preparations p
  WHERE p.command_id = target_command_id
  FOR UPDATE;

  IF FOUND THEN
    -- Check if identical packet by same maker
    IF existing_prep.maker_membership_id IS NOT DISTINCT FROM current_membership
       AND existing_prep.reservation_id IS NOT DISTINCT FROM target_reservation_id
       AND existing_prep.command_fingerprint IS NOT DISTINCT FROM target_command_fingerprint
       AND existing_prep.action_authorization_id IS NOT DISTINCT FROM target_action_authorization_id THEN
      RETURN QUERY SELECT
        existing_prep.id,
        existing_prep.command_id,
        existing_prep.action_authorization_id,
        existing_prep.reservation_id,
        existing_prep.command_fingerprint,
        existing_prep.maker_membership_id,
        existing_prep.packet_payload,
        existing_prep.created_at,
        TRUE;
      RETURN;
    ELSE
      -- Changed semantics conflicts!
      RAISE EXCEPTION 'COMMAND_CONFLICT';
    END IF;
  END IF;

  -- Check if action_authorization_id is already bound to another command
  IF EXISTS (
    SELECT 1 FROM canonical_cancellation_refund_decision_preparations p
    WHERE p.action_authorization_id = target_action_authorization_id
  ) THEN
    RAISE EXCEPTION 'COMMAND_CONFLICT';
  END IF;

  -- Verify action authorization exists in DB and belongs to current_membership
  SELECT * INTO auth_row
  FROM internal_action_authorizations a
  WHERE a.id = target_action_authorization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_AUTHORIZATION_NOT_FOUND';
  END IF;

  IF auth_row.maker_membership_id IS DISTINCT FROM current_membership THEN
    RAISE EXCEPTION 'MAKER_PRINCIPAL_MISMATCH';
  END IF;

  IF auth_row.command_hash IS DISTINCT FROM target_command_fingerprint THEN
    RAISE EXCEPTION 'COMMAND_FINGERPRINT_MISMATCH';
  END IF;

  -- Insert preparation row
  INSERT INTO canonical_cancellation_refund_decision_preparations (
    command_id,
    action_authorization_id,
    reservation_id,
    command_fingerprint,
    maker_membership_id,
    packet_payload
  ) VALUES (
    target_command_id,
    target_action_authorization_id,
    target_reservation_id,
    target_command_fingerprint,
    current_membership,
    target_packet_payload
  ) RETURNING * INTO new_prep;

  RETURN QUERY SELECT
    new_prep.id,
    new_prep.command_id,
    new_prep.action_authorization_id,
    new_prep.reservation_id,
    new_prep.command_fingerprint,
    new_prep.maker_membership_id,
    new_prep.packet_payload,
    new_prep.created_at,
    FALSE;
  RETURN;
END;
$$;

-- 6b. Protected Preparation Interface: get_cancellation_refund_decision_preparation
CREATE OR REPLACE FUNCTION get_cancellation_refund_decision_preparation(
  target_action_authorization_id UUID
)
RETURNS TABLE (
  preparation_id UUID,
  command_id UUID,
  action_authorization_id UUID,
  reservation_id UUID,
  command_fingerprint TEXT,
  maker_membership_id UUID,
  packet_payload JSONB,
  created_at TIMESTAMPTZ,
  reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET row_security = on
AS $$
#variable_conflict use_column
DECLARE
  current_user_str TEXT;
  current_org UUID;
  current_membership UUID;
  current_env TEXT;
  prep_row RECORD;
  approved_minor BIGINT;
  is_authorized BOOLEAN := FALSE;
BEGIN
  current_user_str := nullif(current_setting('app.current_user_id', true), '');
  current_org := nullif(current_setting('app.organization_id', true), '')::uuid;
  current_membership := nullif(current_setting('app.membership_id', true), '')::uuid;
  current_env := coalesce(nullif(current_setting('app.workforce_environment', true), ''), 'LOCAL');

  IF current_user_str IS NULL OR current_org IS NULL OR current_membership IS NULL THEN
    RAISE EXCEPTION 'SESSION_CONTEXT_REQUIRED';
  END IF;

  SELECT p.*, a.reason INTO prep_row
  FROM canonical_cancellation_refund_decision_preparations p
  JOIN internal_action_authorizations a ON a.id = p.action_authorization_id
  WHERE p.action_authorization_id = target_action_authorization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_NOT_FOUND';
  END IF;

  approved_minor := (prep_row.packet_payload->>'approvedAmountMinor')::bigint;

  -- Verify current exact resource authority before disclosure:
  -- Caller must be either:
  -- 1) Maker with active, unrevoked capability in current_org and current_env
  --    covering this exact reservation and amount.
  -- 2) Checker with active, unrevoked appointment accommodation_finance_approver
  --    in current_org and current_env covering this exact reservation and amount.
  IF current_membership = prep_row.maker_membership_id THEN
    -- Check maker capability
    SELECT EXISTS (
      SELECT 1
      FROM internal_organization_memberships m
      JOIN internal_membership_grants g ON g.membership_id = m.id AND g.organization_id = m.organization_id
      JOIN internal_role_permissions rp ON rp.role_version_id = g.role_version_id
      LEFT JOIN internal_membership_grant_revocations rev ON rev.grant_id = g.id
      WHERE m.id = current_membership
        AND m.organization_id = current_org
        AND m.status = 'ACTIVE'
        AND rp.permission_code = 'accommodation.refund_decision.admit'
        AND g.environment = current_env
        AND g.valid_from <= clock_timestamp()
        AND (g.valid_until IS NULL OR g.valid_until > clock_timestamp())
        AND (g.max_amount_minor IS NULL OR g.max_amount_minor >= approved_minor)
        AND (g.scope_type = 'ORGANIZATION' OR (g.scope_type = 'FINANCIAL_CONTRACT' AND g.scope_id = prep_row.reservation_id::text))
        AND rev.grant_id IS NULL
    ) INTO is_authorized;
  ELSE
    -- Check dedicated checker appointment
    SELECT EXISTS (
      SELECT 1
      FROM internal_organization_memberships m
      JOIN internal_membership_grants g ON g.membership_id = m.id AND g.organization_id = m.organization_id
      JOIN internal_role_versions v ON v.id = g.role_version_id AND v.organization_id = g.organization_id
      JOIN internal_role_definitions r ON r.id = v.role_id AND r.organization_id = g.organization_id
      JOIN internal_role_current_versions rcv ON rcv.role_id = r.id AND rcv.version_id = v.id
      LEFT JOIN internal_membership_grant_revocations rev ON rev.grant_id = g.id
      WHERE m.id = current_membership
        AND m.organization_id = current_org
        AND m.status = 'ACTIVE'
        AND r.role_key = 'accommodation_finance_approver'
        AND g.environment = current_env
        AND g.valid_from <= clock_timestamp()
        AND (g.valid_until IS NULL OR g.valid_until > clock_timestamp())
        AND (g.max_amount_minor IS NULL OR g.max_amount_minor >= approved_minor)
        AND (g.scope_type = 'ORGANIZATION' OR (g.scope_type = 'FINANCIAL_CONTRACT' AND g.scope_id = prep_row.reservation_id::text))
        AND rev.grant_id IS NULL
    ) INTO is_authorized;
  END IF;

  IF NOT is_authorized THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  RETURN QUERY SELECT
    prep_row.id,
    prep_row.command_id,
    prep_row.action_authorization_id,
    prep_row.reservation_id,
    prep_row.command_fingerprint,
    prep_row.maker_membership_id,
    prep_row.packet_payload,
    prep_row.created_at,
    prep_row.reason;
END;
$$;

-- 7. Protected Registrar Function: admit_cancellation_refund_decision
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
  rel_nights_count INT;
  res_nights_count INT;
  bridge_row RECORD;
  payable_row RECORD;
  attempt_row RECORD;
  prov_event RECORD;
  capture_amounts BIGINT[];
  capture_refs TEXT[];
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

  IF prep_row.action_authorization_id IS DISTINCT FROM auth_row.id THEN
    RAISE EXCEPTION 'COMMAND_CONFLICT';
  END IF;

  -- Check exact envelope bounds
  IF auth_row.resource_id IS DISTINCT FROM prep_row.reservation_id::text
     OR auth_row.amount_minor::text IS DISTINCT FROM (prep_row.packet_payload->>'approvedAmountMinor')
     OR (prep_row.packet_payload->>'admissionCommandId') IS DISTINCT FROM prep_row.command_id::text
     OR (prep_row.packet_payload->>'reservationId') IS DISTINCT FROM prep_row.reservation_id::text
     OR (prep_row.packet_payload->>'organizationId') IS DISTINCT FROM current_org::text
     OR (prep_row.packet_payload->>'currency') IS DISTINCT FROM 'INR' THEN
    RAISE EXCEPTION 'COMMAND_CONFLICT';
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

  -- 6. Verify Dedicated Checker Appointment in PostgreSQL
  SELECT * INTO checker_member
  FROM internal_organization_memberships m
  WHERE m.id = app_row.checker_membership_id
  AND m.organization_id = current_org
  AND m.status = 'ACTIVE'
  AND (m.expires_at IS NULL OR m.expires_at > clock_timestamp());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHECKER_MEMBERSHIP_INACTIVE';
  END IF;

  approved_minor := (prep_row.packet_payload->>'approvedAmountMinor')::bigint;

  -- Dedicated Appointment Verification:
  -- Checker must hold unrevoked dedicated grant for accommodation_finance_approver
  -- matching current role version, environment, amount ceiling, and valid date bounds.
  IF NOT EXISTS (
    SELECT 1
    FROM internal_membership_grants g
    JOIN internal_role_versions v ON v.id = g.role_version_id AND v.organization_id = g.organization_id
    JOIN internal_role_definitions r ON r.id = v.role_id AND r.organization_id = g.organization_id
    JOIN internal_role_current_versions rcv ON rcv.role_id = r.id AND rcv.version_id = v.id
    LEFT JOIN internal_membership_grant_revocations rev ON rev.grant_id = g.id
    WHERE g.organization_id = current_org
      AND g.membership_id = app_row.checker_membership_id
      AND r.role_key = 'accommodation_finance_approver'
      AND g.environment = current_env
      AND g.valid_from <= app_row.created_at
      AND (g.valid_until IS NULL OR g.valid_until > app_row.created_at)
      AND (g.max_amount_minor IS NULL OR g.max_amount_minor >= approved_minor)
      AND (g.scope_type = 'ORGANIZATION' OR (g.scope_type = 'FINANCIAL_CONTRACT' AND g.scope_id = prep_row.reservation_id::text))
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

  IF EXISTS (
    SELECT 1 FROM canonical_cancellation_refund_decision_evidence dev
    WHERE dev.reservation_id = prep_row.reservation_id
  ) THEN
    RAISE EXCEPTION 'REFUND_DECISION_ALREADY_ADMITTED';
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

  -- Verify release nights match reservation nights
  SELECT count(*) INTO rel_nights_count
  FROM canonical_reservation_cancellation_release_nights crn
  WHERE crn.release_id = rel_row.release_id;
  SELECT count(*) INTO res_nights_count
  FROM canonical_reservation_nights crn
  WHERE crn.reservation_id = prep_row.reservation_id;
  IF rel_nights_count = 0 OR rel_nights_count IS DISTINCT FROM res_nights_count THEN
    RAISE EXCEPTION 'CANCELLATION_RELEASE_NIGHTS_INCOHERENT';
  END IF;

  -- Verify no sealed V2+ revisions
  IF EXISTS (
    SELECT 1 FROM canonical_reservation_revision_seals s
    JOIN canonical_reservation_revisions r ON r.id = s.revision_id
    WHERE r.reservation_id = prep_row.reservation_id
  ) THEN
    RAISE EXCEPTION 'SEALED_V2_REVISION_EXCLUDED';
  END IF;

  -- Paid bridge
  SELECT * INTO bridge_row
  FROM canonical_payment_reservations cpr
  WHERE cpr.reservation_id = prep_row.reservation_id;

  IF NOT FOUND OR bridge_row.id::text IS DISTINCT FROM (prep_row.packet_payload->>'paidBridgeId') THEN
    RAISE EXCEPTION 'PAID_BRIDGE_MISMATCH';
  END IF;
  IF bridge_row.status IS DISTINCT FROM 'COMMITTED' THEN
    RAISE EXCEPTION 'PAID_BRIDGE_NOT_COMMITTED';
  END IF;

  -- Payment attempt
  SELECT * INTO attempt_row
  FROM canonical_payment_attempts cpa
  WHERE cpa.id = bridge_row.payment_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR attempt_row.id::text IS DISTINCT FROM (prep_row.packet_payload->>'paymentAttemptId') THEN
    RAISE EXCEPTION 'PAYMENT_ATTEMPT_MISMATCH';
  END IF;
  IF attempt_row.payment_state IS DISTINCT FROM 'MATCHED_CAPTURE' THEN
    RAISE EXCEPTION 'PAYMENT_STATE_NOT_MATCHED_CAPTURE';
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

  -- Stays quote & Payable authority
  SELECT * INTO payable_row
  FROM canonical_payable_authorities pa
  WHERE pa.quote_id = bridge_row.quote_id AND pa.status = 'APPROVED';

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
  SELECT
    array_agg(DISTINCT cpe.reported_amount_paise),
    array_agg(DISTINCT cpe.provider_payment_ref)
  INTO capture_amounts, capture_refs
  FROM canonical_provider_events cpe
  WHERE cpe.payment_attempt_id = attempt_row.id
    AND cpe.normalized_event_type = 'PAYMENT_CAPTURED'
    AND cpe.status = 'PROCESSED';

  IF capture_amounts IS NULL OR array_length(capture_amounts, 1) = 0 THEN
    RAISE EXCEPTION 'NO_VERIFIED_CAPTURES_FOUND';
  END IF;

  IF array_length(capture_amounts, 1) > 1 THEN
    RAISE EXCEPTION 'CAPTURE_AMOUNT_CONFLICT';
  END IF;
  IF array_length(capture_refs, 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CAPTURE_PAYMENT_REF_AMBIGUOUS';
  END IF;

  captured_ceiling := capture_amounts[1];

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

-- 8. Protected Guarded Replay Function: get_admitted_cancellation_refund_decision
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
  current_env TEXT;
  adm_row RECORD;
  dev_row RECORD;
BEGIN
  current_membership := nullif(current_setting('app.membership_id', true), '')::uuid;
  current_org := nullif(current_setting('app.organization_id', true), '')::uuid;
  current_env := coalesce(nullif(current_setting('app.workforce_environment', true), ''), 'LOCAL');

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

  -- Scoped capability check: verify current session has active, unrevoked capability in current_org and current_env
  -- covering this exact reservation and amount
  IF NOT EXISTS (
    SELECT 1
    FROM internal_organization_memberships m
    JOIN internal_membership_grants g ON g.membership_id = m.id AND g.organization_id = m.organization_id
    JOIN internal_role_permissions rp ON rp.role_version_id = g.role_version_id
    LEFT JOIN internal_membership_grant_revocations rev ON rev.grant_id = g.id
    WHERE m.id = current_membership
      AND m.organization_id = current_org
      AND m.status = 'ACTIVE'
      AND rp.permission_code = 'accommodation.refund_decision.admit'
      AND g.environment = current_env
      AND g.valid_from <= clock_timestamp()
      AND (g.valid_until IS NULL OR g.valid_until > clock_timestamp())
      AND (g.max_amount_minor IS NULL OR g.max_amount_minor >= dev_row.approved_amount_paise)
      AND (g.scope_type = 'ORGANIZATION' OR (g.scope_type = 'FINANCIAL_CONTRACT' AND g.scope_id = dev_row.reservation_id::text))
      AND rev.grant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
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

-- 9. Accepted Financial Authority Restoration: issue_cancellation_refund_authorization
-- Faithful restoration of accepted 061 implementation with provenance check for AUTHENTICATED_HUMAN_APPROVAL.
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
      RAISE EXCEPTION 'ADMISSION_PROVENANCE_NOT_FOUND';
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

  -- 9. Insert Authorization atomically
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

-- 10. Row Level Security & Grants (Least Privilege)
ALTER TABLE canonical_cancellation_refund_decision_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_cancellation_refund_decision_preparations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canonical_refund_decision_prep_owner
  ON canonical_cancellation_refund_decision_preparations;
CREATE POLICY canonical_refund_decision_prep_owner
  ON canonical_cancellation_refund_decision_preparations FOR ALL TO current_user
  USING (true) WITH CHECK (true);

ALTER TABLE canonical_cancellation_refund_decision_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_cancellation_refund_decision_admissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canonical_refund_decision_adm_owner
  ON canonical_cancellation_refund_decision_admissions;
CREATE POLICY canonical_refund_decision_adm_owner
  ON canonical_cancellation_refund_decision_admissions FOR ALL TO current_user
  USING (true) WITH CHECK (true);

REVOKE ALL ON canonical_cancellation_refund_decision_preparations FROM PUBLIC;
REVOKE ALL ON canonical_cancellation_refund_decision_admissions FROM PUBLIC;

REVOKE ALL ON FUNCTION get_cancellation_refund_decision_preview(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_cancellation_refund_decision_preparation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION prepare_cancellation_refund_decision(UUID, UUID, UUID, TEXT, INT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION admit_cancellation_refund_decision(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admitted_cancellation_refund_decision(UUID) FROM PUBLIC;

DO $runtime_grants$
DECLARE
  r TEXT;
  runtime_roles TEXT[] := ARRAY['w1_offer_staff', 'encho_staff_runtime', 'encho_app_prod'];
BEGIN
  FOREACH r IN ARRAY runtime_roles LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION get_cancellation_refund_decision_preview(UUID) TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION get_cancellation_refund_decision_preparation(UUID) TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION prepare_cancellation_refund_decision(UUID, UUID, UUID, TEXT, INT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB) TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION admit_cancellation_refund_decision(UUID, UUID) TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION get_admitted_cancellation_refund_decision(UUID) TO %I', r);
    END IF;
  END LOOP;
END $runtime_grants$;
