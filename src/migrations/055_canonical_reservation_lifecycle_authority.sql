-- Migration: 055_canonical_reservation_lifecycle_authority.sql
-- W4-A Task 2: Canonical Reservation Lifecycle Authority
-- Invariants:
--   - W3 canonical_reservations.status = 'INVENTORY_COMMITTED' is immutable allocation truth; never mutated.
--   - W4 reservation lifecycle is a separate append-only event authority and derived projection.
--   - Initial derived lifecycle state for a canonical reservation with zero events is ACTIVE.
--   - Only CANCELLATION_REQUESTED lifecycle transition is supported in W4-A.
--   - Actor authority: GUEST requires exact ownership (holder_principal == principal).
--   - Command authority: durable idempotency with semantic fingerprint; replay returns replayed=true.
--   - Command conflict: same command ID with changed parameters raises LIFECYCLE_COMMAND_CONFLICT.
--   - Concurrency: row-level lock on canonical_reservations serializes concurrent transitions per reservation.
--   - Immutability: canonical_reservation_events and canonical_reservation_lifecycle_commands reject UPDATE and DELETE.
--   - Zero inventory side effect: inventory_days.booked_units is untouched.
--   - Zero refund side effect: no payment/refund rows or gateway calls.
--   - Security: encho_lifecycle_worker has zero raw table DML privileges; PUBLIC has no access.

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

-- 3. Deterministic Current Lifecycle Projection View
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

-- 4. Projection Query Helper Function
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

-- 5. Atomic Transition Function
CREATE OR REPLACE FUNCTION canonical_request_reservation_cancellation(
  target_command UUID,
  target_reservation_id UUID,
  target_actor_kind TEXT,
  target_actor_principal TEXT,
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
  existing_cmd RECORD;
  res_row RECORD;
  latest_event RECORD;
  new_event_id UUID;
  new_seq INT;
  fingerprint_input JSONB;
  fingerprint TEXT;
BEGIN
  -- 1. Input validations
  IF target_command IS NULL OR target_reservation_id IS NULL
    OR target_actor_kind IS NULL OR target_actor_principal IS NULL
    OR target_reason_code IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  IF target_actor_kind NOT IN ('GUEST', 'HOST', 'STAFF', 'EXTERNAL_CHANNEL') THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  IF target_actor_principal !~ '^(user:[0-9]+|session:[0-9a-f-]{36})$' THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  IF target_reason_code !~ '^[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  IF target_reason_text IS NOT NULL AND length(target_reason_text) > 500 THEN
    RAISE EXCEPTION 'LIFECYCLE_INPUT_INVALID';
  END IF;

  -- 2. Fast replay check on command before row lock
  SELECT * INTO existing_cmd FROM public.canonical_reservation_lifecycle_commands
  WHERE command_id = target_command;
  IF FOUND THEN
    IF existing_cmd.reservation_id IS DISTINCT FROM target_reservation_id
      OR existing_cmd.command_type IS DISTINCT FROM 'REQUEST_CANCELLATION'
      OR existing_cmd.actor_kind IS DISTINCT FROM target_actor_kind
      OR existing_cmd.actor_principal IS DISTINCT FROM target_actor_principal
      OR existing_cmd.reason_code IS DISTINCT FROM target_reason_code
      OR existing_cmd.reason_text IS DISTINCT FROM target_reason_text THEN
      RAISE EXCEPTION 'LIFECYCLE_COMMAND_CONFLICT';
    END IF;

    SELECT ev.event_id, ev.reservation_id, ev.event_type, ev.sequence_number
    INTO latest_event
    FROM public.canonical_reservation_events ev
    WHERE ev.event_id = existing_cmd.event_id;

    RETURN QUERY SELECT latest_event.event_id, latest_event.reservation_id, latest_event.event_type, latest_event.sequence_number, TRUE;
    RETURN;
  END IF;

  -- 3. Lock target reservation row FOR UPDATE to serialize transitions on this reservation
  SELECT * INTO res_row FROM public.canonical_reservations
  WHERE id = target_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIFECYCLE_RESERVATION_NOT_FOUND';
  END IF;

  -- 4. Re-check command inside reservation lock (concurrent identical command committed while waiting)
  SELECT * INTO existing_cmd FROM public.canonical_reservation_lifecycle_commands
  WHERE command_id = target_command;
  IF FOUND THEN
    IF existing_cmd.reservation_id IS DISTINCT FROM target_reservation_id
      OR existing_cmd.command_type IS DISTINCT FROM 'REQUEST_CANCELLATION'
      OR existing_cmd.actor_kind IS DISTINCT FROM target_actor_kind
      OR existing_cmd.actor_principal IS DISTINCT FROM target_actor_principal
      OR existing_cmd.reason_code IS DISTINCT FROM target_reason_code
      OR existing_cmd.reason_text IS DISTINCT FROM target_reason_text THEN
      RAISE EXCEPTION 'LIFECYCLE_COMMAND_CONFLICT';
    END IF;

    SELECT ev.event_id, ev.reservation_id, ev.event_type, ev.sequence_number
    INTO latest_event
    FROM public.canonical_reservation_events ev
    WHERE ev.event_id = existing_cmd.event_id;

    RETURN QUERY SELECT latest_event.event_id, latest_event.reservation_id, latest_event.event_type, latest_event.sequence_number, TRUE;
    RETURN;
  END IF;

  -- 5. Actor authority validation
  IF target_actor_kind = 'GUEST' THEN
    IF res_row.holder_principal IS DISTINCT FROM target_actor_principal THEN
      RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN';
    END IF;
  ELSE
    RAISE EXCEPTION 'LIFECYCLE_ACTOR_NOT_SUPPORTED';
  END IF;

  -- 6. Current lifecycle state check
  SELECT ev.event_type, ev.sequence_number INTO latest_event
  FROM public.canonical_reservation_events ev
  WHERE ev.reservation_id = target_reservation_id
  ORDER BY ev.sequence_number DESC, ev.occurred_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Any existing event means not ACTIVE
    RAISE EXCEPTION 'LIFECYCLE_STATE_CONFLICT';
  END IF;

  new_seq := 1;
  new_event_id := gen_random_uuid();

  -- 7. Compute deterministic command fingerprint
  fingerprint_input := jsonb_build_object(
    'command_id', target_command,
    'reservation_id', target_reservation_id,
    'command_type', 'REQUEST_CANCELLATION',
    'actor_kind', target_actor_kind,
    'actor_principal', target_actor_principal,
    'origin_kind', res_row.origin_kind,
    'reason_code', target_reason_code,
    'reason_text', target_reason_text
  );
  fingerprint := encode(sha256(convert_to(fingerprint_input::text, 'UTF8')), 'hex');

  -- 8. Insert immutable event
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
    target_actor_kind,
    target_actor_principal,
    res_row.origin_kind,
    target_reason_code,
    target_reason_text,
    target_command,
    statement_timestamp()
  );

  -- 9. Insert durable lifecycle command receipt
  BEGIN
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
      target_actor_kind,
      target_actor_principal,
      res_row.origin_kind,
      target_reason_code,
      target_reason_text,
      fingerprint,
      new_event_id,
      statement_timestamp()
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO existing_cmd FROM public.canonical_reservation_lifecycle_commands
    WHERE command_id = target_command;
    IF FOUND THEN
      IF existing_cmd.reservation_id IS DISTINCT FROM target_reservation_id
        OR existing_cmd.command_type IS DISTINCT FROM 'REQUEST_CANCELLATION'
        OR existing_cmd.actor_kind IS DISTINCT FROM target_actor_kind
        OR existing_cmd.actor_principal IS DISTINCT FROM target_actor_principal
        OR existing_cmd.reason_code IS DISTINCT FROM target_reason_code
        OR existing_cmd.reason_text IS DISTINCT FROM target_reason_text THEN
        RAISE EXCEPTION 'LIFECYCLE_COMMAND_CONFLICT';
      END IF;
    END IF;
    RAISE;
  END;

  RETURN QUERY SELECT new_event_id, target_reservation_id, 'CANCELLATION_REQUESTED'::TEXT, new_seq, FALSE;
END $$;

-- 6. Security, RLS & Privileges
ALTER TABLE canonical_reservation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_events FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_lifecycle_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_lifecycle_commands FORCE ROW LEVEL SECURITY;

CREATE POLICY canonical_reservation_events_owner ON canonical_reservation_events
  FOR ALL TO current_user USING(true) WITH CHECK(true);
CREATE POLICY canonical_reservation_lifecycle_commands_owner ON canonical_reservation_lifecycle_commands
  FOR ALL TO current_user USING(true) WITH CHECK(true);

REVOKE ALL ON canonical_reservation_events FROM PUBLIC;
REVOKE ALL ON canonical_reservation_lifecycle_commands FROM PUBLIC;
REVOKE ALL ON canonical_reservation_lifecycle_current FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_request_reservation_cancellation(UUID,UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_get_reservation_lifecycle(UUID) FROM PUBLIC;

-- Revoke from known web & worker roles
DO $runtime_revokes$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encho_stays_web') THEN
    EXECUTE 'REVOKE ALL ON canonical_reservation_events FROM encho_stays_web';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_commands FROM encho_stays_web';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_current FROM encho_stays_web';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_request_reservation_cancellation(UUID,UUID,TEXT,TEXT,TEXT,TEXT) FROM encho_stays_web';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_get_reservation_lifecycle(UUID) FROM encho_stays_web';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encho_payment_worker') THEN
    EXECUTE 'REVOKE ALL ON canonical_reservation_events FROM encho_payment_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_commands FROM encho_payment_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_current FROM encho_payment_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_request_reservation_cancellation(UUID,UUID,TEXT,TEXT,TEXT,TEXT) FROM encho_payment_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_get_reservation_lifecycle(UUID) FROM encho_payment_worker';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encho_composition_worker') THEN
    EXECUTE 'REVOKE ALL ON canonical_reservation_events FROM encho_composition_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_commands FROM encho_composition_worker';
    EXECUTE 'REVOKE ALL ON canonical_reservation_lifecycle_current FROM encho_composition_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_request_reservation_cancellation(UUID,UUID,TEXT,TEXT,TEXT,TEXT) FROM encho_composition_worker';
    EXECUTE 'REVOKE ALL ON FUNCTION canonical_get_reservation_lifecycle(UUID) FROM encho_composition_worker';
  END IF;
END $runtime_revokes$;

-- 7. Grant to encho_lifecycle_worker
DO $grant$
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
    OR has_function_privilege(worker,'public.canonical_finalize_direct_hold(uuid,uuid,uuid)','EXECUTE')
    OR has_function_privilege(worker,'public.canonical_compose_payment_reservation(uuid,uuid)','EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('canonical_reservations',
        'canonical_reservation_nights','canonical_reservation_commands','booking_holds',
        'booking_hold_nights','inventory_days','stays_quotes','canonical_payment_attempts',
        'canonical_provider_events','canonical_quarantined_events','canonical_payment_reconciliations',
        'canonical_payable_authorities','canonical_payment_reservations',
        'canonical_reservation_events','canonical_reservation_lifecycle_commands')
        AND pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),c.relowner,'MEMBER'))
    OR pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),'pg_read_all_data'::regrole,'MEMBER')
    OR pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),'pg_write_all_data'::regrole,'MEMBER') THEN
    RAISE EXCEPTION 'LIFECYCLE_RESTRICTED_ROLE_NOT_READY';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_request_reservation_cancellation(UUID,UUID,TEXT,TEXT,TEXT,TEXT) TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_get_reservation_lifecycle(UUID) TO %I',worker);
END $grant$;
