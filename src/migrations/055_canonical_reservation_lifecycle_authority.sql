-- Migration: 055_canonical_reservation_lifecycle_authority.sql
-- W4-A Task 2: Canonical Reservation Lifecycle Authority
-- Invariants:
--   - W3 canonical_reservations.status = 'INVENTORY_COMMITTED' is immutable allocation truth; never mutated.
--   - W4 reservation lifecycle is a separate append-only event authority and derived projection.
--   - Initial derived lifecycle state for a canonical reservation with zero events is ACTIVE.
--   - Only CANCELLATION_REQUESTED lifecycle transition is supported in W4-A.
--   - Actor authority: GUEST requires an independently issued, unforgeable, command-bound authorization
--     (canonical_reservation_lifecycle_authorizations) issued by the trusted authenticated issuer (encho_lifecycle_issuer).
--   - encho_lifecycle_worker CANNOT issue or forge authorizations; it only consumes verified authorizations.
--   - Direct SQL / GUC forgery (including app.stays_principal) has zero authority.
--   - Scope restriction: ENCHO_DIRECT only. EXTERNAL_CHANNEL reservations reject Guest cancellation requests.
--   - Authority checked before replay: caller must prove ownership and ENCHO_DIRECT authority before command inspection.
--   - Command authority: durable idempotency with semantic fingerprint; replay returns replayed=true for same principal.
--   - Command conflict: foreign principal or changed parameters raises LIFECYCLE_FORBIDDEN / LIFECYCLE_COMMAND_CONFLICT.
--   - Concurrency: row-level lock on canonical_reservations serializes concurrent transitions per reservation.
--   - Immutability: canonical_reservation_events, canonical_reservation_lifecycle_commands, and
--     canonical_reservation_lifecycle_authorizations reject unauthorized mutation and DELETE.
--   - Zero inventory side effect: inventory_days.booked_units is untouched.
--   - Zero refund side effect: no payment/refund rows or gateway calls.
--   - Security: encho_lifecycle_worker and encho_lifecycle_issuer have zero raw table DML privileges; PUBLIC has no access.

-- 1. Append-only lifecycle events table
CREATE TABLE IF NOT EXISTS canonical_reservation_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  sequence_number INT NOT NULL CHECK (sequence_number > 0),
  event_type TEXT NOT NULL CHECK (event_type IN ('CANCELLATION_REQUESTED')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('GUEST', 'HOST', 'STAFF', 'EXTERNAL_CHANNEL')),
  actor_principal TEXT NOT NULL,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('ENCHO_DIRECT', 'EXTERNAL_CHANNEL')),
  reason_code TEXT NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]{1,64}$'),
  reason_text TEXT CHECK (reason_text IS NULL OR length(reason_text) <= 500),
  command_id UUID NOT NULL UNIQUE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  source_ref TEXT CHECK (source_ref IS NULL OR length(source_ref) <= 256),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (reservation_id, sequence_number),
  UNIQUE (reservation_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_canonical_reservation_events_res
  ON canonical_reservation_events(reservation_id, sequence_number DESC);

-- Reject UPDATE / DELETE on events
CREATE OR REPLACE FUNCTION canonical_reservation_event_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_RESERVATION_EVENT_IMMUTABLE';
END $$;

CREATE TRIGGER canonical_reservation_events_immutable
  BEFORE UPDATE OR DELETE ON canonical_reservation_events
  FOR EACH ROW EXECUTE FUNCTION canonical_reservation_event_reject_mutation();

-- 2. Durable lifecycle command receipt ledger
CREATE TABLE IF NOT EXISTS canonical_reservation_lifecycle_commands (
  command_id UUID PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  command_type TEXT NOT NULL CHECK (command_type IN ('REQUEST_CANCELLATION')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('GUEST', 'HOST', 'STAFF', 'EXTERNAL_CHANNEL')),
  actor_principal TEXT NOT NULL,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('ENCHO_DIRECT', 'EXTERNAL_CHANNEL')),
  reason_code TEXT NOT NULL,
  reason_text TEXT,
  command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
  event_id UUID NOT NULL REFERENCES canonical_reservation_events(event_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_canonical_reservation_lifecycle_commands_res
  ON canonical_reservation_lifecycle_commands(reservation_id);

-- Reject UPDATE / DELETE on commands
CREATE OR REPLACE FUNCTION canonical_reservation_lifecycle_command_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_LIFECYCLE_COMMAND_IMMUTABLE';
END $$;

CREATE TRIGGER canonical_reservation_lifecycle_commands_immutable
  BEFORE UPDATE OR DELETE ON canonical_reservation_lifecycle_commands
  FOR EACH ROW EXECUTE FUNCTION canonical_reservation_lifecycle_command_reject_mutation();

-- 3. Command-bound lifecycle authorizations ledger (Unforgeable Capability Table)
CREATE TABLE IF NOT EXISTS canonical_reservation_lifecycle_authorizations (
  authorization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  command_id UUID NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('REQUEST_CANCELLATION')),
  guest_principal TEXT NOT NULL CHECK (guest_principal ~ '^(user:[0-9]+|session:[0-9a-f-]{36})$'),
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('ENCHO_DIRECT')),
  reason_code TEXT NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]{1,64}$'),
  reason_text TEXT CHECK (reason_text IS NULL OR length(reason_text) <= 500),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_by_event_id UUID REFERENCES canonical_reservation_events(event_id) ON DELETE RESTRICT,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (reservation_id, command_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_reservation_lifecycle_authorizations_res
  ON canonical_reservation_lifecycle_authorizations(reservation_id);

-- Authorization immutability trigger: rejects DELETE; only allows transition of consumed_at / consumed_by_event_id from NULL
CREATE OR REPLACE FUNCTION canonical_reservation_lifecycle_authorization_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CANONICAL_LIFECYCLE_AUTHORIZATION_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL THEN
      RAISE EXCEPTION 'CANONICAL_LIFECYCLE_AUTHORIZATION_IMMUTABLE';
    END IF;
    IF NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
      OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
      OR NEW.command_id IS DISTINCT FROM OLD.command_id
      OR NEW.command_type IS DISTINCT FROM OLD.command_type
      OR NEW.guest_principal IS DISTINCT FROM OLD.guest_principal
      OR NEW.origin_kind IS DISTINCT FROM OLD.origin_kind
      OR NEW.reason_code IS DISTINCT FROM OLD.reason_code
      OR NEW.reason_text IS DISTINCT FROM OLD.reason_text
      OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint THEN
      RAISE EXCEPTION 'CANONICAL_LIFECYCLE_AUTHORIZATION_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER canonical_reservation_lifecycle_authorizations_immutable
  BEFORE UPDATE OR DELETE ON canonical_reservation_lifecycle_authorizations
  FOR EACH ROW EXECUTE FUNCTION canonical_reservation_lifecycle_authorization_immutable();

-- 4. Deterministic Current Lifecycle Projection View
CREATE OR REPLACE VIEW canonical_reservation_lifecycle_current AS
SELECT
  r.id AS reservation_id,
  r.origin_kind,
  r.listing_id,
  r.room_type_id,
  r.holder_principal,
  r.check_in_date,
  r.check_out_date,
  COALESCE(e.event_type, 'ACTIVE') AS lifecycle_state,
  COALESCE(e.sequence_number, 0) AS current_sequence,
  e.event_id AS latest_event_id,
  COALESCE(e.occurred_at, r.created_at) AS state_entered_at,
  e.actor_kind AS latest_actor_kind,
  e.actor_principal AS latest_actor_principal,
  e.reason_code AS latest_reason_code,
  e.reason_text AS latest_reason_text
FROM canonical_reservations r
LEFT JOIN LATERAL (
  SELECT ev.event_id, ev.sequence_number, ev.event_type, ev.actor_kind,
         ev.actor_principal, ev.reason_code, ev.reason_text, ev.occurred_at
  FROM canonical_reservation_events ev
  WHERE ev.reservation_id = r.id
  ORDER BY ev.sequence_number DESC, ev.occurred_at DESC
  LIMIT 1
) e ON TRUE;

-- 5. Projection Query Helper Function
CREATE OR REPLACE FUNCTION canonical_get_reservation_lifecycle(target_reservation_id UUID)
RETURNS TABLE (
  reservation_id UUID,
  origin_kind TEXT,
  holder_principal TEXT,
  lifecycle_state TEXT,
  current_sequence INT,
  latest_event_id UUID,
  state_entered_at TIMESTAMPTZ,
  latest_actor_kind TEXT,
  latest_actor_principal TEXT,
  latest_reason_code TEXT,
  latest_reason_text TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
BEGIN
  IF target_reservation_id IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  RETURN QUERY
  SELECT
    c.reservation_id,
    c.origin_kind,
    c.holder_principal,
    c.lifecycle_state,
    c.current_sequence,
    c.latest_event_id,
    c.state_entered_at,
    c.latest_actor_kind,
    c.latest_actor_principal,
    c.latest_reason_code,
    c.latest_reason_text
  FROM public.canonical_reservation_lifecycle_current c
  WHERE c.reservation_id = target_reservation_id;
END $$;

-- 6. Authorization Issuance Function (Called strictly by trusted encho_lifecycle_issuer)
CREATE OR REPLACE FUNCTION canonical_issue_cancellation_authorization(
  target_reservation_id UUID,
  target_command UUID,
  target_reason_code TEXT,
  target_reason_text TEXT,
  authenticated_principal TEXT
)
RETURNS TABLE (
  authorization_id UUID,
  reservation_id UUID,
  command_id UUID,
  guest_principal TEXT,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  fingerprint TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE
  res_row RECORD;
  existing_auth RECORD;
  new_auth_id UUID;
  new_issued_at TIMESTAMPTZ;
  new_expires_at TIMESTAMPTZ;
  fingerprint_input JSONB;
  auth_fingerprint TEXT;
BEGIN
  -- 1. Validate inputs
  IF target_reservation_id IS NULL OR target_command IS NULL OR target_reason_code IS NULL OR authenticated_principal IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  IF target_reason_code !~ '^[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  IF target_reason_text IS NOT NULL AND length(target_reason_text) > 500 THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  IF authenticated_principal !~ '^(user:[0-9]+|session:[0-9a-f-]{36})$' THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  -- 2. Validate reservation exists and check authority boundary
  SELECT r.* INTO res_row FROM public.canonical_reservations r
  WHERE r.id = target_reservation_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIFECYCLE_RESERVATION_NOT_FOUND';
  END IF;

  IF res_row.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT' THEN
    RAISE EXCEPTION 'LIFECYCLE_ORIGIN_NOT_SUPPORTED';
  END IF;

  IF res_row.holder_principal IS DISTINCT FROM authenticated_principal THEN
    RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN';
  END IF;

  -- 3. Check for existing authorization for this reservation + command
  SELECT a.* INTO existing_auth FROM public.canonical_reservation_lifecycle_authorizations a
  WHERE a.reservation_id = target_reservation_id AND a.command_id = target_command;

  IF FOUND THEN
    IF existing_auth.guest_principal IS DISTINCT FROM authenticated_principal
      OR existing_auth.reason_code IS DISTINCT FROM target_reason_code
      OR existing_auth.reason_text IS DISTINCT FROM target_reason_text THEN
      RAISE EXCEPTION 'LIFECYCLE_COMMAND_CONFLICT';
    END IF;

    RETURN QUERY SELECT existing_auth.authorization_id, existing_auth.reservation_id,
      existing_auth.command_id, existing_auth.guest_principal, existing_auth.issued_at,
      existing_auth.expires_at, existing_auth.fingerprint;
    RETURN;
  END IF;

  -- 4. Issue new authorization capability
  new_auth_id := gen_random_uuid();
  new_issued_at := statement_timestamp();
  new_expires_at := new_issued_at + interval '1 hour';

  fingerprint_input := jsonb_build_object(
    'authorization_id', new_auth_id,
    'reservation_id', target_reservation_id,
    'command_id', target_command,
    'command_type', 'REQUEST_CANCELLATION',
    'guest_principal', authenticated_principal,
    'origin_kind', 'ENCHO_DIRECT',
    'reason_code', target_reason_code,
    'reason_text', target_reason_text,
    'issued_at', new_issued_at,
    'expires_at', new_expires_at
  );
  auth_fingerprint := encode(sha256(convert_to(fingerprint_input::text, 'UTF8')), 'hex');

  INSERT INTO public.canonical_reservation_lifecycle_authorizations (
    authorization_id,
    reservation_id,
    command_id,
    command_type,
    guest_principal,
    origin_kind,
    reason_code,
    reason_text,
    issued_at,
    expires_at,
    fingerprint
  ) VALUES (
    new_auth_id,
    target_reservation_id,
    target_command,
    'REQUEST_CANCELLATION',
    authenticated_principal,
    'ENCHO_DIRECT',
    target_reason_code,
    target_reason_text,
    new_issued_at,
    new_expires_at,
    auth_fingerprint
  );

  RETURN QUERY SELECT new_auth_id, target_reservation_id, target_command, authenticated_principal,
    new_issued_at, new_expires_at, auth_fingerprint;
END;
$$;

-- 7. Atomic Transition Function (Consumes Verified Authorization; Executed by encho_lifecycle_worker)
CREATE OR REPLACE FUNCTION canonical_request_reservation_cancellation(
  target_authorization_id UUID,
  target_command UUID,
  target_reservation_id UUID,
  target_reason_code TEXT,
  target_reason_text TEXT DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  reservation_id UUID,
  lifecycle_state TEXT,
  sequence_number INT,
  replayed BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE
  res_row RECORD;
  auth_row RECORD;
  existing_cmd RECORD;
  ev_row RECORD;
  latest_event RECORD;
  new_event_id UUID;
  new_seq INT;
  fingerprint_input JSONB;
  fingerprint TEXT;
BEGIN
  -- 1. Validate input parameters
  IF target_authorization_id IS NULL OR target_command IS NULL
    OR target_reservation_id IS NULL OR target_reason_code IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  IF target_reason_code !~ '^[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  IF target_reason_text IS NOT NULL AND length(target_reason_text) > 500 THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  -- 2. Lock target reservation row FOR UPDATE to serialize transitions on this reservation
  SELECT r.* INTO res_row FROM public.canonical_reservations r
  WHERE r.id = target_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIFECYCLE_RESERVATION_NOT_FOUND';
  END IF;

  -- Guest commands are strictly ENCHO_DIRECT only: EXTERNAL_CHANNEL cannot be cancelled by Guest
  IF res_row.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT' THEN
    RAISE EXCEPTION 'LIFECYCLE_ORIGIN_NOT_SUPPORTED';
  END IF;

  -- 3. Lock and verify unforgeable authorization authority
  SELECT a.* INTO auth_row FROM public.canonical_reservation_lifecycle_authorizations a
  WHERE a.authorization_id = target_authorization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIFECYCLE_AUTHORIZATION_NOT_FOUND';
  END IF;

  -- Verify authorization matches reservation
  IF auth_row.reservation_id IS DISTINCT FROM target_reservation_id THEN
    RAISE EXCEPTION 'LIFECYCLE_COMMAND_CONFLICT';
  END IF;

  -- Verify authorization matches command ID
  IF auth_row.command_id IS DISTINCT FROM target_command THEN
    RAISE EXCEPTION 'LIFECYCLE_COMMAND_CONFLICT';
  END IF;

  -- Verify command type
  IF auth_row.command_type IS DISTINCT FROM 'REQUEST_CANCELLATION' THEN
    RAISE EXCEPTION 'LIFECYCLE_COMMAND_CONFLICT';
  END IF;

  -- Verify origin
  IF auth_row.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT' THEN
    RAISE EXCEPTION 'LIFECYCLE_ORIGIN_NOT_SUPPORTED';
  END IF;

  -- Verify reason semantics
  IF auth_row.reason_code IS DISTINCT FROM target_reason_code
    OR auth_row.reason_text IS DISTINCT FROM target_reason_text THEN
    RAISE EXCEPTION 'LIFECYCLE_COMMAND_CONFLICT';
  END IF;

  -- Ownership boundary: verified authorization guest principal must equal reservation holder
  IF auth_row.guest_principal IS DISTINCT FROM res_row.holder_principal THEN
    RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN';
  END IF;

  -- 4. Inspect durable command receipt (Authority checked before replay)
  SELECT c.* INTO existing_cmd FROM public.canonical_reservation_lifecycle_commands c
  WHERE c.command_id = target_command;
  IF FOUND THEN
    -- Verify stored command belongs to this authenticated caller's principal
    IF existing_cmd.actor_principal IS DISTINCT FROM auth_row.guest_principal THEN
      RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN';
    END IF;

    -- Verify exact semantic identity
    IF existing_cmd.reservation_id IS DISTINCT FROM target_reservation_id
      OR existing_cmd.command_type IS DISTINCT FROM 'REQUEST_CANCELLATION'
      OR existing_cmd.actor_kind IS DISTINCT FROM 'GUEST'
      OR existing_cmd.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT'
      OR existing_cmd.reason_code IS DISTINCT FROM target_reason_code
      OR existing_cmd.reason_text IS DISTINCT FROM target_reason_text THEN
      RAISE EXCEPTION 'LIFECYCLE_COMMAND_CONFLICT';
    END IF;

    -- If authorization was already consumed, verify it was consumed by this exact event
    IF auth_row.consumed_at IS NOT NULL AND auth_row.consumed_by_event_id IS DISTINCT FROM existing_cmd.event_id THEN
      RAISE EXCEPTION 'LIFECYCLE_AUTHORIZATION_ALREADY_CONSUMED';
    END IF;

    SELECT ev.event_id, ev.reservation_id, ev.event_type, ev.sequence_number
    INTO ev_row
    FROM public.canonical_reservation_events ev
    WHERE ev.event_id = existing_cmd.event_id;

    RETURN QUERY SELECT ev_row.event_id, ev_row.reservation_id, ev_row.event_type, ev_row.sequence_number, TRUE;
    RETURN;
  END IF;

  -- 5. Only for a NEW command: verify authorization is fresh and unconsumed
  IF auth_row.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_AUTHORIZATION_ALREADY_CONSUMED';
  END IF;

  IF auth_row.expires_at < statement_timestamp() THEN
    RAISE EXCEPTION 'LIFECYCLE_AUTHORIZATION_EXPIRED';
  END IF;

  -- Evaluate current lifecycle state: must be ACTIVE (zero previous events)
  SELECT ev.event_type, ev.sequence_number INTO latest_event
  FROM public.canonical_reservation_events ev
  WHERE ev.reservation_id = target_reservation_id
  ORDER BY ev.sequence_number DESC, ev.occurred_at DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'LIFECYCLE_STATE_CONFLICT';
  END IF;

  -- 6. Transition to CANCELLATION_REQUESTED
  new_seq := 1;
  new_event_id := gen_random_uuid();

  fingerprint_input := jsonb_build_object(
    'command_id', target_command,
    'reservation_id', target_reservation_id,
    'command_type', 'REQUEST_CANCELLATION',
    'actor_kind', 'GUEST',
    'actor_principal', auth_row.guest_principal,
    'origin_kind', 'ENCHO_DIRECT',
    'reason_code', target_reason_code,
    'reason_text', target_reason_text,
    'authorization_id', target_authorization_id
  );
  fingerprint := encode(sha256(convert_to(fingerprint_input::text, 'UTF8')), 'hex');

  -- Insert immutable event
  INSERT INTO public.canonical_reservation_events (
    event_id,
    reservation_id,
    sequence_number,
    event_type,
    actor_kind,
    actor_principal,
    origin_kind,
    reason_code,
    reason_text,
    command_id,
    occurred_at
  ) VALUES (
    new_event_id,
    target_reservation_id,
    new_seq,
    'CANCELLATION_REQUESTED',
    'GUEST',
    auth_row.guest_principal,
    'ENCHO_DIRECT',
    target_reason_code,
    target_reason_text,
    target_command,
    statement_timestamp()
  );

  -- Insert durable lifecycle command receipt
  INSERT INTO public.canonical_reservation_lifecycle_commands (
    command_id,
    reservation_id,
    command_type,
    actor_kind,
    actor_principal,
    origin_kind,
    reason_code,
    reason_text,
    command_fingerprint,
    event_id,
    created_at
  ) VALUES (
    target_command,
    target_reservation_id,
    'REQUEST_CANCELLATION',
    'GUEST',
    auth_row.guest_principal,
    'ENCHO_DIRECT',
    target_reason_code,
    target_reason_text,
    fingerprint,
    new_event_id,
    statement_timestamp()
  );

  -- Atomically consume authorization
  UPDATE public.canonical_reservation_lifecycle_authorizations
  SET consumed_at = statement_timestamp(),
      consumed_by_event_id = new_event_id
  WHERE authorization_id = target_authorization_id;

  RETURN QUERY SELECT new_event_id, target_reservation_id, 'CANCELLATION_REQUESTED'::TEXT, new_seq, FALSE;
END;
$$;

-- 8. Row-Level Security
ALTER TABLE canonical_reservation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_events FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_lifecycle_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_lifecycle_commands FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_lifecycle_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_lifecycle_authorizations FORCE ROW LEVEL SECURITY;

CREATE POLICY canonical_reservation_events_owner ON canonical_reservation_events
  FOR ALL TO current_user USING(true) WITH CHECK(true);
CREATE POLICY canonical_reservation_lifecycle_commands_owner ON canonical_reservation_lifecycle_commands
  FOR ALL TO current_user USING(true) WITH CHECK(true);
CREATE POLICY canonical_reservation_lifecycle_authorizations_owner ON canonical_reservation_lifecycle_authorizations
  FOR ALL TO current_user USING(true) WITH CHECK(true);

REVOKE ALL ON canonical_reservation_events FROM PUBLIC;
REVOKE ALL ON canonical_reservation_lifecycle_commands FROM PUBLIC;
REVOKE ALL ON canonical_reservation_lifecycle_authorizations FROM PUBLIC;
REVOKE ALL ON canonical_reservation_lifecycle_current FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_issue_cancellation_authorization(UUID,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_request_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_get_reservation_lifecycle(UUID) FROM PUBLIC;

-- Revoke from known web & worker roles
DO $runtime_revokes$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encho_stays_web') THEN
    EXECUTE 'REVOKE ALL ON canonical_reservation_events FROM encho_stays_web';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_commands FROM encho_stays_web';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_authorizations FROM encho_stays_web';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_current FROM encho_stays_web';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_issue_cancellation_authorization(UUID,UUID,TEXT,TEXT,TEXT) FROM encho_stays_web';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_request_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT) FROM encho_stays_web';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_get_reservation_lifecycle(UUID) FROM encho_stays_web';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encho_payment_worker') THEN
    EXECUTE 'REVOKE ALL ON canonical_reservation_events FROM encho_payment_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_commands FROM encho_payment_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_authorizations FROM encho_payment_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_current FROM encho_payment_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_issue_cancellation_authorization(UUID,UUID,TEXT,TEXT,TEXT) FROM encho_payment_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_request_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT) FROM encho_payment_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_get_reservation_lifecycle(UUID) FROM encho_payment_worker';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encho_composition_worker') THEN
    EXECUTE 'REVOKE ALL ON canonical_reservation_events FROM encho_composition_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_commands FROM encho_composition_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_authorizations FROM encho_composition_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_current FROM encho_composition_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_issue_cancellation_authorization(UUID,UUID,TEXT,TEXT,TEXT) FROM encho_composition_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_request_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT) FROM encho_composition_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_get_reservation_lifecycle(UUID) FROM encho_composition_worker';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encho_reservation_worker') THEN
    EXECUTE 'REVOKE ALL ON canonical_reservation_events FROM encho_reservation_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_commands FROM encho_reservation_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_authorizations FROM encho_reservation_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_current FROM encho_reservation_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_issue_cancellation_authorization(UUID,UUID,TEXT,TEXT,TEXT) FROM encho_reservation_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_request_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT) FROM encho_reservation_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_get_reservation_lifecycle(UUID) FROM encho_reservation_worker';
  END IF;
END $runtime_revokes$;

-- 9. Grant to encho_lifecycle_issuer
DO $grant_issuer$
DECLARE issuer TEXT := 'encho_lifecycle_issuer';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=issuer AND rolcanlogin AND NOT rolsuper
    AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
    OR has_schema_privilege(issuer,'public','CREATE')
    OR has_database_privilege(issuer,current_database(),'CREATE')
    OR has_table_privilege(issuer,'public.canonical_reservations','INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer,'public.canonical_reservation_events','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer,'public.canonical_reservation_lifecycle_commands','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer,'public.canonical_reservation_lifecycle_authorizations','INSERT,UPDATE,DELETE')
    OR has_function_privilege(issuer,'public.canonical_request_reservation_cancellation(uuid,uuid,uuid,text,text)','EXECUTE')
    OR has_function_privilege(issuer,'public.canonical_get_reservation_lifecycle(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'LIFECYCLE_ISSUER_ROLE_NOT_READY';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', issuer);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_issue_cancellation_authorization(UUID,UUID,TEXT,TEXT,TEXT) TO %I', issuer);
END $grant_issuer$;

-- 10. Grant to encho_lifecycle_worker
DO $grant_worker$
DECLARE worker TEXT := 'encho_lifecycle_worker';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=worker AND rolcanlogin AND NOT rolsuper
    AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
    OR has_schema_privilege(worker,'public','CREATE')
    OR has_database_privilege(worker,current_database(),'CREATE')
    OR has_table_privilege(worker,'public.canonical_reservations','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_reservation_nights','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_reservation_commands','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.booking_holds','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.inventory_days','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.stays_quotes','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_payment_attempts','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_provider_events','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_quarantined_events','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_payment_reconciliations','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_payable_authorities','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_payment_reservations','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_reservation_events','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_reservation_lifecycle_commands','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_reservation_lifecycle_authorizations','SELECT,INSERT,UPDATE,DELETE')
    OR has_function_privilege(worker,'public.canonical_issue_cancellation_authorization(uuid,uuid,text,text,text)','EXECUTE')
    OR has_function_privilege(worker,'public.canonical_finalize_direct_hold(uuid,uuid,uuid)','EXECUTE')
    OR has_function_privilege(worker,'public.canonical_compose_payment_reservation(uuid,uuid)','EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('canonical_reservations',
        'canonical_reservation_nights','canonical_reservation_commands','booking_holds',
        'booking_hold_nights','inventory_days','stays_quotes','canonical_payment_attempts',
        'canonical_provider_events','canonical_quarantined_events','canonical_payment_reconciliations',
        'canonical_payable_authorities','canonical_payment_reservations',
        'canonical_reservation_events','canonical_reservation_lifecycle_commands',
        'canonical_reservation_lifecycle_authorizations')
        AND pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),c.relowner,'MEMBER'))
    OR pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),'pg_read_all_data'::regrole,'MEMBER')
    OR pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),'pg_write_all_data'::regrole,'MEMBER') THEN
    RAISE EXCEPTION 'LIFECYCLE_RESTRICTED_ROLE_NOT_READY';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_request_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT) TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_get_reservation_lifecycle(UUID) TO %I',worker);
END $grant_worker$;
