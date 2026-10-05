-- Migration: 056_canonical_cancellation_completion_authority.sql
-- W4-B Task 2: Canonical Cancellation Completion and Exact Booked-Inventory Release
-- Invariants:
--   - W3 canonical_reservations.status = 'INVENTORY_COMMITTED' is immutable allocation truth; never mutated.
--   - W3 canonical_reservation_nights are immutable allocation records; never mutated or deleted.
--   - Initial transition supported for Encho Direct: CANCELLATION_REQUESTED -> CANCELLED.
--   - ACTIVE -> CANCELLED is rejected for Encho Direct.
--   - Internal Decision Authority: command-bound cancellation decision authorization (capability)
--     issued by restricted encho_cancellation_issuer, bound to CANCELLATION_REQUESTED event.
--   - Cancellation Executor: restricted encho_cancellation_executor consumes verified decision authorization.
--   - Atomicity: one transaction atomically commits CANCELLED event, completion command receipt,
--     cancellation-specific full-release fence, per-night release evidence, booked_units decrements,
--     and decision authorization consumption. All or none.
--   - Underflow protection: every night must verify booked_units >= canonical allocation units before decrement.
--   - Inventory derivation: release allocation is derived exclusively from immutable canonical_reservation_nights.
--   - Concurrency & Lock Order: deterministic lock sequence:
--     1. canonical_reservations (FOR UPDATE)
--     2. canonical_reservation_cancellation_authorizations (FOR UPDATE)
--     3. durable command check / replay
--     4. cancellation release fence check
--     5. inventory_days locked in deterministic order (calendar_date ASC, id ASC FOR UPDATE)
--   - Zero refund / payment side effects: no payment rows or provider calls.

-- 1. Extend event and command constraints additively
ALTER TABLE canonical_reservation_events
  DROP CONSTRAINT IF EXISTS canonical_reservation_events_event_type_check;

ALTER TABLE canonical_reservation_events
  ADD CONSTRAINT canonical_reservation_events_event_type_check
  CHECK (event_type IN ('CANCELLATION_REQUESTED', 'CANCELLED'));

ALTER TABLE canonical_reservation_events
  DROP CONSTRAINT IF EXISTS canonical_reservation_events_actor_kind_check;

ALTER TABLE canonical_reservation_events
  ADD CONSTRAINT canonical_reservation_events_actor_kind_check
  CHECK (actor_kind IN ('GUEST', 'HOST', 'STAFF', 'EXTERNAL_CHANNEL', 'INTERNAL_DECISION'));

ALTER TABLE canonical_reservation_lifecycle_commands
  DROP CONSTRAINT IF EXISTS canonical_reservation_lifecycle_commands_command_type_check;

ALTER TABLE canonical_reservation_lifecycle_commands
  ADD CONSTRAINT canonical_reservation_lifecycle_commands_command_type_check
  CHECK (command_type IN ('REQUEST_CANCELLATION', 'COMPLETE_CANCELLATION'));

ALTER TABLE canonical_reservation_lifecycle_commands
  DROP CONSTRAINT IF EXISTS canonical_reservation_lifecycle_commands_actor_kind_check;

ALTER TABLE canonical_reservation_lifecycle_commands
  ADD CONSTRAINT canonical_reservation_lifecycle_commands_actor_kind_check
  CHECK (actor_kind IN ('GUEST', 'HOST', 'STAFF', 'EXTERNAL_CHANNEL', 'INTERNAL_DECISION'));

-- 2. Command-bound Cancellation Decision Authorizations Ledger (Unforgeable Capability Table)
CREATE TABLE IF NOT EXISTS canonical_reservation_cancellation_authorizations (
  authorization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  request_event_id UUID NOT NULL REFERENCES canonical_reservation_events(event_id) ON DELETE RESTRICT,
  command_id UUID NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('COMPLETE_CANCELLATION')),
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('ENCHO_DIRECT')),
  decision_source_kind TEXT NOT NULL DEFAULT 'INTERNAL_AUTHORITY_PRIMITIVE' CHECK (decision_source_kind = 'INTERNAL_AUTHORITY_PRIMITIVE'),
  reason_code TEXT NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]{1,64}$'),
  reason_text TEXT CHECK (reason_text IS NULL OR length(reason_text) <= 500),
  decision_fingerprint TEXT NOT NULL CHECK (decision_fingerprint ~ '^[a-f0-9]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_by_event_id UUID REFERENCES canonical_reservation_events(event_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (reservation_id, command_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_res_cancellation_auth_res
  ON canonical_reservation_cancellation_authorizations(reservation_id);

-- Add explicit decision provenance columns to canonical_reservation_events
ALTER TABLE canonical_reservation_events
  ADD COLUMN IF NOT EXISTS request_event_id UUID REFERENCES canonical_reservation_events(event_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS decision_authorization_id UUID REFERENCES canonical_reservation_cancellation_authorizations(authorization_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS decision_source_kind TEXT;

CREATE INDEX IF NOT EXISTS idx_canonical_res_events_req_ev
  ON canonical_reservation_events(request_event_id) WHERE request_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_res_events_dec_auth
  ON canonical_reservation_events(decision_authorization_id) WHERE decision_authorization_id IS NOT NULL;

ALTER TABLE canonical_reservation_events
  DROP CONSTRAINT IF EXISTS chk_canonical_reservation_events_cancellation_provenance;

ALTER TABLE canonical_reservation_events
  ADD CONSTRAINT chk_canonical_reservation_events_cancellation_provenance
  CHECK (
    (event_type = 'CANCELLATION_REQUESTED'
      AND request_event_id IS NULL
      AND decision_authorization_id IS NULL
      AND decision_source_kind IS NULL)
    OR
    (event_type = 'CANCELLED'
      AND request_event_id IS NOT NULL
      AND decision_authorization_id IS NOT NULL
      AND decision_source_kind = 'INTERNAL_AUTHORITY_PRIMITIVE'
      AND actor_kind = 'INTERNAL_DECISION'
      AND origin_kind = 'ENCHO_DIRECT')
  );

-- Authorization immutability trigger: rejects DELETE; only allows transition of consumed_at / consumed_by_event_id from NULL
CREATE OR REPLACE FUNCTION canonical_cancellation_authorization_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CANONICAL_CANCELLATION_AUTHORIZATION_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL THEN
      RAISE EXCEPTION 'CANONICAL_CANCELLATION_AUTHORIZATION_IMMUTABLE';
    END IF;
    IF NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
      OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
      OR NEW.request_event_id IS DISTINCT FROM OLD.request_event_id
      OR NEW.command_id IS DISTINCT FROM OLD.command_id
      OR NEW.command_type IS DISTINCT FROM OLD.command_type
      OR NEW.origin_kind IS DISTINCT FROM OLD.origin_kind
      OR NEW.decision_source_kind IS DISTINCT FROM OLD.decision_source_kind
      OR NEW.reason_code IS DISTINCT FROM OLD.reason_code
      OR NEW.reason_text IS DISTINCT FROM OLD.reason_text
      OR NEW.decision_fingerprint IS DISTINCT FROM OLD.decision_fingerprint
      OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
      RAISE EXCEPTION 'CANONICAL_CANCELLATION_AUTHORIZATION_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER canonical_reservation_cancellation_authorizations_immutable
  BEFORE UPDATE OR DELETE ON canonical_reservation_cancellation_authorizations
  FOR EACH ROW EXECUTE FUNCTION canonical_cancellation_authorization_reject_mutation();

-- 3. Cancellation-Specific Full-Release Fence Table
CREATE TABLE IF NOT EXISTS canonical_reservation_cancellation_inventory_releases (
  release_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL UNIQUE REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL UNIQUE REFERENCES canonical_reservation_events(event_id) ON DELETE RESTRICT,
  command_id UUID NOT NULL UNIQUE,
  authorization_id UUID NOT NULL UNIQUE REFERENCES canonical_reservation_cancellation_authorizations(authorization_id) ON DELETE RESTRICT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  release_fingerprint TEXT NOT NULL CHECK (release_fingerprint ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_canonical_res_cancellation_rel_res
  ON canonical_reservation_cancellation_inventory_releases(reservation_id);

CREATE OR REPLACE FUNCTION canonical_cancellation_release_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_CANCELLATION_RELEASE_IMMUTABLE';
END $$;

CREATE TRIGGER canonical_reservation_cancellation_inventory_releases_immutable
  BEFORE UPDATE OR DELETE ON canonical_reservation_cancellation_inventory_releases
  FOR EACH ROW EXECUTE FUNCTION canonical_cancellation_release_reject_mutation();

-- 4. Required Per-Night Release Evidence Table
CREATE TABLE IF NOT EXISTS canonical_reservation_cancellation_release_nights (
  release_id UUID NOT NULL REFERENCES canonical_reservation_cancellation_inventory_releases(release_id) ON DELETE RESTRICT,
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  inventory_day_id INT NOT NULL REFERENCES inventory_days(id) ON DELETE RESTRICT,
  stay_date DATE NOT NULL,
  released_units INT NOT NULL CHECK (released_units > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (release_id, inventory_day_id),
  UNIQUE (reservation_id, stay_date)
);

CREATE INDEX IF NOT EXISTS idx_canonical_res_cancellation_rel_nights_res
  ON canonical_reservation_cancellation_release_nights(reservation_id);

CREATE OR REPLACE FUNCTION canonical_cancellation_release_night_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_RELEASE_NIGHT_IMMUTABLE';
END $$;

CREATE TRIGGER canonical_reservation_cancellation_release_nights_immutable
  BEFORE UPDATE OR DELETE ON canonical_reservation_cancellation_release_nights
  FOR EACH ROW EXECUTE FUNCTION canonical_cancellation_release_night_reject_mutation();

-- 5. Decision Authorization Issuance Function (Internal Primitive called by encho_cancellation_issuer)
CREATE OR REPLACE FUNCTION canonical_issue_cancellation_decision_authorization(
  target_reservation_id UUID,
  target_request_event_id UUID,
  target_completion_command UUID,
  target_reason_code TEXT,
  target_reason_text TEXT DEFAULT NULL
)
RETURNS TABLE (
  authorization_id UUID,
  reservation_id UUID,
  request_event_id UUID,
  command_id UUID,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  decision_fingerprint TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE
  res_row RECORD;
  req_ev RECORD;
  latest_ev RECORD;
  existing_auth RECORD;
  new_auth_id UUID;
  new_issued_at TIMESTAMPTZ;
  new_expires_at TIMESTAMPTZ;
  fingerprint_input JSONB;
  auth_fingerprint TEXT;
BEGIN
  -- 1. Validate inputs
  IF target_reservation_id IS NULL OR target_request_event_id IS NULL
     OR target_completion_command IS NULL OR target_reason_code IS NULL THEN
    RAISE EXCEPTION 'CANCELLATION_INPUT_INVALID';
  END IF;

  IF target_reason_code !~ '^[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'CANCELLATION_INPUT_INVALID';
  END IF;

  IF target_reason_text IS NOT NULL AND length(target_reason_text) > 500 THEN
    RAISE EXCEPTION 'CANCELLATION_INPUT_INVALID';
  END IF;

  -- 2. Lock target reservation row FOR UPDATE to serialize concurrent decision attempts
  SELECT r.* INTO res_row FROM public.canonical_reservations r
  WHERE r.id = target_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELLATION_RESERVATION_NOT_FOUND';
  END IF;

  IF res_row.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT' THEN
    RAISE EXCEPTION 'CANCELLATION_ORIGIN_NOT_SUPPORTED';
  END IF;

  -- 3. Verify request event exists and matches reservation
  SELECT ev.* INTO req_ev FROM public.canonical_reservation_events ev
  WHERE ev.event_id = target_request_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELLATION_REQUEST_EVENT_NOT_FOUND';
  END IF;

  IF req_ev.reservation_id IS DISTINCT FROM target_reservation_id THEN
    RAISE EXCEPTION 'CANCELLATION_EVENT_RESERVATION_MISMATCH';
  END IF;

  IF req_ev.event_type IS DISTINCT FROM 'CANCELLATION_REQUESTED' THEN
    RAISE EXCEPTION 'CANCELLATION_EVENT_TYPE_INVALID';
  END IF;

  IF req_ev.actor_kind IS DISTINCT FROM 'GUEST' THEN
    RAISE EXCEPTION 'CANCELLATION_REQUEST_ACTOR_NOT_SUPPORTED';
  END IF;

  IF req_ev.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT' THEN
    RAISE EXCEPTION 'CANCELLATION_ORIGIN_NOT_SUPPORTED';
  END IF;

  -- Verify current lifecycle state on reservation is CANCELLATION_REQUESTED matching this exact request
  SELECT ev.* INTO latest_ev FROM public.canonical_reservation_events ev
  WHERE ev.reservation_id = target_reservation_id
  ORDER BY ev.sequence_number DESC, ev.occurred_at DESC
  LIMIT 1;

  IF latest_ev.event_id IS DISTINCT FROM target_request_event_id
     OR latest_ev.event_type IS DISTINCT FROM 'CANCELLATION_REQUESTED' THEN
    RAISE EXCEPTION 'CANCELLATION_LIFECYCLE_STATE_CONFLICT';
  END IF;

  -- 4. Check for existing authorization for this reservation + command ID (Idempotency)
  SELECT a.* INTO existing_auth FROM public.canonical_reservation_cancellation_authorizations a
  WHERE a.reservation_id = target_reservation_id AND a.command_id = target_completion_command;

  IF FOUND THEN
    IF existing_auth.request_event_id IS DISTINCT FROM target_request_event_id
       OR existing_auth.reason_code IS DISTINCT FROM target_reason_code
       OR existing_auth.reason_text IS DISTINCT FROM target_reason_text THEN
      RAISE EXCEPTION 'CANCELLATION_COMMAND_CONFLICT';
    END IF;

    RETURN QUERY SELECT existing_auth.authorization_id, existing_auth.reservation_id,
      existing_auth.request_event_id, existing_auth.command_id, existing_auth.issued_at,
      existing_auth.expires_at, existing_auth.decision_fingerprint;
    RETURN;
  END IF;

  -- 5. Issue new decision authorization capability
  new_auth_id := gen_random_uuid();
  new_issued_at := statement_timestamp();
  new_expires_at := new_issued_at + interval '1 hour';

  fingerprint_input := jsonb_build_object(
    'authorization_id', new_auth_id,
    'reservation_id', target_reservation_id,
    'request_event_id', target_request_event_id,
    'command_id', target_completion_command,
    'command_type', 'COMPLETE_CANCELLATION',
    'origin_kind', 'ENCHO_DIRECT',
    'decision_source_kind', 'INTERNAL_AUTHORITY_PRIMITIVE',
    'reason_code', target_reason_code,
    'reason_text', target_reason_text,
    'issued_at', new_issued_at,
    'expires_at', new_expires_at
  );
  auth_fingerprint := encode(sha256(convert_to(fingerprint_input::text, 'UTF8')), 'hex');

  INSERT INTO public.canonical_reservation_cancellation_authorizations (
    authorization_id,
    reservation_id,
    request_event_id,
    command_id,
    command_type,
    origin_kind,
    decision_source_kind,
    reason_code,
    reason_text,
    decision_fingerprint,
    issued_at,
    expires_at
  ) VALUES (
    new_auth_id,
    target_reservation_id,
    target_request_event_id,
    target_completion_command,
    'COMPLETE_CANCELLATION',
    'ENCHO_DIRECT',
    'INTERNAL_AUTHORITY_PRIMITIVE',
    target_reason_code,
    target_reason_text,
    auth_fingerprint,
    new_issued_at,
    new_expires_at
  );

  RETURN QUERY SELECT new_auth_id, target_reservation_id, target_request_event_id,
    target_completion_command, new_issued_at, new_expires_at, auth_fingerprint;
END;
$$;

-- 6. Atomic Cancellation Completion Function (Executed strictly by encho_cancellation_executor)
CREATE OR REPLACE FUNCTION canonical_complete_reservation_cancellation(
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
  release_id UUID,
  replayed BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE
  res_row RECORD;
  auth_row RECORD;
  req_ev RECORD;
  existing_cmd RECORD;
  replay_row RECORD;
  latest_ev RECORD;
  day_rec RECORD;
  actual_nights_count INT;
  locked_days_count INT;
  new_event_id UUID;
  new_seq INT;
  new_release_id UUID;
  cmd_fingerprint_input JSONB;
  cmd_fingerprint TEXT;
  rel_fingerprint_input JSONB;
  rel_fingerprint TEXT;
BEGIN
  -- 1. Validate inputs
  IF target_authorization_id IS NULL OR target_command IS NULL
     OR target_reservation_id IS NULL OR target_reason_code IS NULL THEN
    RAISE EXCEPTION 'CANCELLATION_INPUT_INVALID';
  END IF;

  IF target_reason_code !~ '^[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'CANCELLATION_INPUT_INVALID';
  END IF;

  IF target_reason_text IS NOT NULL AND length(target_reason_text) > 500 THEN
    RAISE EXCEPTION 'CANCELLATION_INPUT_INVALID';
  END IF;

  -- 2. Lock reservation row FOR UPDATE (Lock Order Step 1)
  SELECT r.* INTO res_row FROM public.canonical_reservations r
  WHERE r.id = target_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELLATION_RESERVATION_NOT_FOUND';
  END IF;

  IF res_row.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT' THEN
    RAISE EXCEPTION 'CANCELLATION_ORIGIN_NOT_SUPPORTED';
  END IF;

  -- 3. Lock decision authorization row FOR UPDATE (Lock Order Step 2)
  SELECT a.* INTO auth_row FROM public.canonical_reservation_cancellation_authorizations a
  WHERE a.authorization_id = target_authorization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELLATION_AUTHORIZATION_NOT_FOUND';
  END IF;

  IF auth_row.reservation_id IS DISTINCT FROM target_reservation_id THEN
    RAISE EXCEPTION 'CANCELLATION_AUTHORIZATION_RESERVATION_MISMATCH';
  END IF;

  IF auth_row.command_id IS DISTINCT FROM target_command THEN
    RAISE EXCEPTION 'CANCELLATION_COMMAND_CONFLICT';
  END IF;

  IF auth_row.command_type IS DISTINCT FROM 'COMPLETE_CANCELLATION' THEN
    RAISE EXCEPTION 'CANCELLATION_COMMAND_CONFLICT';
  END IF;

  IF auth_row.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT' THEN
    RAISE EXCEPTION 'CANCELLATION_ORIGIN_NOT_SUPPORTED';
  END IF;

  IF auth_row.reason_code IS DISTINCT FROM target_reason_code
     OR auth_row.reason_text IS DISTINCT FROM target_reason_text THEN
    RAISE EXCEPTION 'CANCELLATION_COMMAND_CONFLICT';
  END IF;

  -- Verify bound request event exists and matches reservation
  SELECT ev.* INTO req_ev FROM public.canonical_reservation_events ev
  WHERE ev.event_id = auth_row.request_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELLATION_REQUEST_EVENT_NOT_FOUND';
  END IF;

  IF req_ev.reservation_id IS DISTINCT FROM target_reservation_id THEN
    RAISE EXCEPTION 'CANCELLATION_EVENT_RESERVATION_MISMATCH';
  END IF;

  IF req_ev.event_type IS DISTINCT FROM 'CANCELLATION_REQUESTED' THEN
    RAISE EXCEPTION 'CANCELLATION_EVENT_TYPE_INVALID';
  END IF;

  IF req_ev.actor_kind IS DISTINCT FROM 'GUEST' THEN
    RAISE EXCEPTION 'CANCELLATION_REQUEST_ACTOR_NOT_SUPPORTED';
  END IF;

  IF req_ev.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT' THEN
    RAISE EXCEPTION 'CANCELLATION_ORIGIN_NOT_SUPPORTED';
  END IF;

  -- 4. Inspect durable command receipt (Lock Order Step 3: Idempotent Replay Check)
  SELECT c.* INTO existing_cmd FROM public.canonical_reservation_lifecycle_commands c
  WHERE c.command_id = target_command;
  IF FOUND THEN
    IF existing_cmd.reservation_id IS DISTINCT FROM target_reservation_id
       OR existing_cmd.command_type IS DISTINCT FROM 'COMPLETE_CANCELLATION'
       OR existing_cmd.actor_kind IS DISTINCT FROM 'INTERNAL_DECISION'
       OR existing_cmd.origin_kind IS DISTINCT FROM 'ENCHO_DIRECT'
       OR existing_cmd.reason_code IS DISTINCT FROM target_reason_code
       OR existing_cmd.reason_text IS DISTINCT FROM target_reason_text THEN
      RAISE EXCEPTION 'LIFECYCLE_COMMAND_CONFLICT';
    END IF;

    IF auth_row.consumed_at IS NULL OR auth_row.consumed_by_event_id IS DISTINCT FROM existing_cmd.event_id THEN
      RAISE EXCEPTION 'CANCELLATION_AUTHORIZATION_STATE_MISMATCH';
    END IF;

    SELECT ev.event_id, ev.reservation_id, ev.event_type, ev.sequence_number, rel.release_id
    INTO replay_row
    FROM public.canonical_reservation_events ev
    JOIN public.canonical_reservation_cancellation_inventory_releases rel ON rel.event_id = ev.event_id
    WHERE ev.event_id = existing_cmd.event_id;

    RETURN QUERY SELECT replay_row.event_id, replay_row.reservation_id,
      replay_row.event_type, replay_row.sequence_number, replay_row.release_id, TRUE;
    RETURN;
  END IF;

  -- 5. For a NEW command: verify unconsumed authorization, validity, and release fence
  IF auth_row.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'CANCELLATION_AUTHORIZATION_ALREADY_CONSUMED';
  END IF;

  IF auth_row.expires_at < statement_timestamp() THEN
    RAISE EXCEPTION 'CANCELLATION_AUTHORIZATION_EXPIRED';
  END IF;

  IF EXISTS (SELECT 1 FROM public.canonical_reservation_cancellation_inventory_releases rel WHERE rel.reservation_id = target_reservation_id) THEN
    RAISE EXCEPTION 'CANCELLATION_INVENTORY_ALREADY_RELEASED';
  END IF;

  -- Verify current lifecycle state is CANCELLATION_REQUESTED
  SELECT ev.* INTO latest_ev FROM public.canonical_reservation_events ev
  WHERE ev.reservation_id = target_reservation_id
  ORDER BY ev.sequence_number DESC, ev.occurred_at DESC
  LIMIT 1;

  IF NOT FOUND OR latest_ev.event_type IS DISTINCT FROM 'CANCELLATION_REQUESTED'
     OR latest_ev.event_id IS DISTINCT FROM auth_row.request_event_id THEN
    RAISE EXCEPTION 'LIFECYCLE_STATE_CONFLICT';
  END IF;

  -- 6. Derive release allocation exclusively from immutable canonical_reservation_nights
  SELECT count(*)::int INTO actual_nights_count
  FROM public.canonical_reservation_nights crn
  WHERE crn.reservation_id = target_reservation_id;

  IF actual_nights_count = 0 OR actual_nights_count IS DISTINCT FROM res_row.nights THEN
    RAISE EXCEPTION 'CANCELLATION_ALLOCATION_INCOMPLETE';
  END IF;

  -- Verify all inventory_day rows exist
  SELECT count(*)::int INTO locked_days_count
  FROM public.canonical_reservation_nights crn
  JOIN public.inventory_days day ON day.id = crn.inventory_day_id
  WHERE crn.reservation_id = target_reservation_id;

  IF locked_days_count IS DISTINCT FROM actual_nights_count THEN
    RAISE EXCEPTION 'INVENTORY_DAY_MISSING';
  END IF;

  -- 7. Deterministic lock ordering on inventory_days & underflow verification (Lock Order Step 5)
  FOR day_rec IN
    SELECT day.id, day.calendar_date, day.booked_units, day.held_units, day.total_units,
           crn.units AS units_to_release
    FROM public.canonical_reservation_nights crn
    JOIN public.inventory_days day ON day.id = crn.inventory_day_id
    WHERE crn.reservation_id = target_reservation_id
    ORDER BY day.calendar_date ASC, day.id ASC FOR UPDATE OF day
  LOOP
    IF day_rec.booked_units < day_rec.units_to_release THEN
      RAISE EXCEPTION 'INVENTORY_RELEASE_UNDERFLOW';
    END IF;

    -- Decrement booked_units exactly by canonical allocation units
    UPDATE public.inventory_days
    SET booked_units = booked_units - day_rec.units_to_release,
        updated_at = statement_timestamp()
    WHERE id = day_rec.id;
  END LOOP;

  -- 8. Append CANCELLED event
  new_seq := latest_ev.sequence_number + 1;
  new_event_id := gen_random_uuid();

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
    occurred_at,
    source_ref,
    request_event_id,
    decision_authorization_id,
    decision_source_kind,
    metadata
  ) VALUES (
    new_event_id,
    target_reservation_id,
    new_seq,
    'CANCELLED',
    'INTERNAL_DECISION',
    'internal:cancellation_authority_primitive',
    'ENCHO_DIRECT',
    target_reason_code,
    target_reason_text,
    target_command,
    statement_timestamp(),
    'event:' || req_ev.event_id::text,
    req_ev.event_id,
    target_authorization_id,
    'INTERNAL_AUTHORITY_PRIMITIVE',
    jsonb_build_object(
      'request_event_id', req_ev.event_id,
      'request_actor_kind', req_ev.actor_kind,
      'request_actor_principal', req_ev.actor_principal,
      'decision_authorization_id', target_authorization_id,
      'decision_source_kind', 'INTERNAL_AUTHORITY_PRIMITIVE'
    )
  );

  -- 9. Insert durable completion command receipt
  cmd_fingerprint_input := jsonb_build_object(
    'command_id', target_command,
    'reservation_id', target_reservation_id,
    'command_type', 'COMPLETE_CANCELLATION',
    'actor_kind', 'INTERNAL_DECISION',
    'actor_principal', 'internal:cancellation_authority_primitive',
    'origin_kind', 'ENCHO_DIRECT',
    'reason_code', target_reason_code,
    'reason_text', target_reason_text,
    'authorization_id', target_authorization_id,
    'request_event_id', req_ev.event_id
  );
  cmd_fingerprint := encode(sha256(convert_to(cmd_fingerprint_input::text, 'UTF8')), 'hex');

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
    'COMPLETE_CANCELLATION',
    'INTERNAL_DECISION',
    'internal:cancellation_authority_primitive',
    'ENCHO_DIRECT',
    target_reason_code,
    target_reason_text,
    cmd_fingerprint,
    new_event_id,
    statement_timestamp()
  );

  -- 10. Insert cancellation-specific full-release fence
  new_release_id := gen_random_uuid();
  rel_fingerprint_input := jsonb_build_object(
    'release_id', new_release_id,
    'reservation_id', target_reservation_id,
    'event_id', new_event_id,
    'command_id', target_command,
    'authorization_id', target_authorization_id,
    'nights_count', actual_nights_count
  );
  rel_fingerprint := encode(sha256(convert_to(rel_fingerprint_input::text, 'UTF8')), 'hex');

  INSERT INTO public.canonical_reservation_cancellation_inventory_releases (
    release_id,
    reservation_id,
    event_id,
    command_id,
    authorization_id,
    released_at,
    release_fingerprint
  ) VALUES (
    new_release_id,
    target_reservation_id,
    new_event_id,
    target_command,
    target_authorization_id,
    statement_timestamp(),
    rel_fingerprint
  );

  -- 11. Insert REQUIRED per-night release evidence derived strictly from canonical_reservation_nights
  INSERT INTO public.canonical_reservation_cancellation_release_nights (
    release_id,
    reservation_id,
    inventory_day_id,
    stay_date,
    released_units
  )
  SELECT new_release_id, crn.reservation_id, crn.inventory_day_id, crn.stay_date, crn.units
  FROM public.canonical_reservation_nights crn
  WHERE crn.reservation_id = target_reservation_id
  ORDER BY crn.stay_date ASC;

  -- 12. Consume decision authorization
  UPDATE public.canonical_reservation_cancellation_authorizations
  SET consumed_at = statement_timestamp(),
      consumed_by_event_id = new_event_id
  WHERE authorization_id = target_authorization_id;

  RETURN QUERY SELECT new_event_id, target_reservation_id, 'CANCELLED'::TEXT, new_seq, new_release_id, FALSE;
END;
$$;

-- 7. Query Helper for Cancellation Releases
CREATE OR REPLACE FUNCTION canonical_get_cancellation_release(target_reservation_id UUID)
RETURNS TABLE (
  release_id UUID,
  reservation_id UUID,
  event_id UUID,
  command_id UUID,
  authorization_id UUID,
  released_at TIMESTAMPTZ,
  release_fingerprint TEXT,
  total_nights_released INT,
  total_units_released INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
BEGIN
  IF target_reservation_id IS NULL THEN
    RAISE EXCEPTION 'CANCELLATION_INPUT_INVALID';
  END IF;

  RETURN QUERY
  SELECT
    r.release_id,
    r.reservation_id,
    r.event_id,
    r.command_id,
    r.authorization_id,
    r.released_at,
    r.release_fingerprint,
    count(rn.inventory_day_id)::int AS total_nights_released,
    coalesce(sum(rn.released_units), 0)::int AS total_units_released
  FROM public.canonical_reservation_cancellation_inventory_releases r
  LEFT JOIN public.canonical_reservation_cancellation_release_nights rn ON rn.release_id = r.release_id
  WHERE r.reservation_id = target_reservation_id
  GROUP BY r.release_id, r.reservation_id, r.event_id, r.command_id, r.authorization_id, r.released_at, r.release_fingerprint;
END;
$$;

-- 8. Row-Level Security
ALTER TABLE canonical_reservation_cancellation_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_cancellation_authorizations FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_cancellation_inventory_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_cancellation_inventory_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_cancellation_release_nights ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_cancellation_release_nights FORCE ROW LEVEL SECURITY;

CREATE POLICY canonical_res_cancellation_auth_owner
  ON canonical_reservation_cancellation_authorizations FOR ALL TO current_user USING(true) WITH CHECK(true);
CREATE POLICY canonical_res_cancellation_rel_owner
  ON canonical_reservation_cancellation_inventory_releases FOR ALL TO current_user USING(true) WITH CHECK(true);
CREATE POLICY canonical_res_cancellation_rel_nights_owner
  ON canonical_reservation_cancellation_release_nights FOR ALL TO current_user USING(true) WITH CHECK(true);

REVOKE ALL ON canonical_reservation_cancellation_authorizations FROM PUBLIC;
REVOKE ALL ON canonical_reservation_cancellation_inventory_releases FROM PUBLIC;
REVOKE ALL ON canonical_reservation_cancellation_release_nights FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_issue_cancellation_decision_authorization(UUID,UUID,UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_complete_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_get_cancellation_release(UUID) FROM PUBLIC;

-- Revoke explicitly from all known web and worker roles
DO $runtime_revokes$
DECLARE
  r TEXT;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'encho_stays_web',
    'encho_payment_worker',
    'encho_composition_worker',
    'encho_reservation_worker',
    'encho_lifecycle_worker',
    'encho_lifecycle_issuer'
  ])
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON canonical_reservation_cancellation_authorizations FROM %I', r);
      EXECUTE format('REVOKE ALL ON canonical_reservation_cancellation_inventory_releases FROM %I', r);
      EXECUTE format('REVOKE ALL ON canonical_reservation_cancellation_release_nights FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_issue_cancellation_decision_authorization(UUID,UUID,UUID,TEXT,TEXT) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_complete_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION canonical_get_cancellation_release(UUID) FROM %I', r);
    END IF;
  END LOOP;
END $runtime_revokes$;

-- 9. Role Grants & Privilege Boundary Enforcement
DO $grant_cancellation_roles$
DECLARE
  issuer TEXT := 'encho_cancellation_issuer';
  executor TEXT := 'encho_cancellation_executor';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=issuer AND rolcanlogin AND NOT rolsuper
    AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
    OR has_schema_privilege(issuer,'public','CREATE')
    OR has_database_privilege(issuer,current_database(),'CREATE')
    OR has_table_privilege(issuer,'public.canonical_reservations','INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer,'public.canonical_reservation_nights','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer,'public.canonical_reservation_events','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer,'public.canonical_reservation_lifecycle_commands','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer,'public.canonical_reservation_cancellation_authorizations','INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer,'public.canonical_reservation_cancellation_inventory_releases','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer,'public.canonical_reservation_cancellation_release_nights','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(issuer,'public.inventory_days','INSERT,UPDATE,DELETE')
    OR has_function_privilege(issuer,'public.canonical_complete_reservation_cancellation(uuid,uuid,uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'CANCELLATION_ISSUER_ROLE_NOT_READY';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=executor AND rolcanlogin AND NOT rolsuper
    AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
    OR has_schema_privilege(executor,'public','CREATE')
    OR has_database_privilege(executor,current_database(),'CREATE')
    OR has_table_privilege(executor,'public.canonical_reservations','INSERT,UPDATE,DELETE')
    OR has_table_privilege(executor,'public.canonical_reservation_nights','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(executor,'public.canonical_reservation_events','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(executor,'public.canonical_reservation_lifecycle_commands','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(executor,'public.canonical_reservation_cancellation_authorizations','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(executor,'public.canonical_reservation_cancellation_inventory_releases','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(executor,'public.canonical_reservation_cancellation_release_nights','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(executor,'public.inventory_days','INSERT,UPDATE,DELETE')
    OR has_function_privilege(executor,'public.canonical_issue_cancellation_decision_authorization(uuid,uuid,uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'CANCELLATION_EXECUTOR_ROLE_NOT_READY';
  END IF;

  -- Issuer grants
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', issuer);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_issue_cancellation_decision_authorization(UUID,UUID,UUID,TEXT,TEXT) TO %I', issuer);

  -- Executor grants
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', executor);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_complete_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT) TO %I', executor);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_get_reservation_lifecycle(UUID) TO %I', executor);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_get_cancellation_release(UUID) TO %I', executor);
END $grant_cancellation_roles$;
