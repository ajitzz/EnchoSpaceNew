-- Migration: 058_version_aware_cancellation_release.sql
-- W4-C2: Version-Aware Canonical Cancellation Compatibility
-- Invariants:
--   - Builds additively on Migration 056 (W4-B Cancellation Authority) and Migration 057 (W4-C1 Revision Model).
--   - Does NOT create a modification writer or application routine for assembling/sealing V2 revisions.
--   - Preserves all accepted W4-B authorization, lifecycle, atomicity, locking, and replay semantics.
--   - Releases CURRENT EFFECTIVE allocation truth:
--       * V1 reservation -> releases immutable W3/V1 canonical_reservation_nights.
--       * Sealed V2+ reservation -> releases highest sealed current-effective snapshot from canonical_reservation_revision_nights.
--       * Unsealed later revisions -> completely ignored.
--   - Exactly one effective allocation version is released per cancellation.
--   - Release header durable evidence snapshots released_effective_version (INT NOT NULL) and released_revision_id (UUID nullable for V1, FK to revision header for V2+).
--   - Per-night release evidence persists room_type_id and exact released_units (supporting V2 units > 1).
--   - All-or-nothing: underflow on any effective night rolls back the entire cancellation transaction.

-- 1. Extend cancellation release header with effective version evidence
ALTER TABLE canonical_reservation_cancellation_inventory_releases
  ADD COLUMN IF NOT EXISTS released_effective_version INT,
  ADD COLUMN IF NOT EXISTS released_revision_id UUID;

-- Backfill any existing historical releases as V1 authority (safely disabling immutable trigger during backfill if rows exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM canonical_reservation_cancellation_inventory_releases WHERE released_effective_version IS NULL) THEN
    ALTER TABLE canonical_reservation_cancellation_inventory_releases
      DISABLE TRIGGER canonical_reservation_cancellation_inventory_releases_immutable;

    UPDATE canonical_reservation_cancellation_inventory_releases
    SET released_effective_version = 1,
        released_revision_id = NULL
    WHERE released_effective_version IS NULL;

    ALTER TABLE canonical_reservation_cancellation_inventory_releases
      ENABLE TRIGGER canonical_reservation_cancellation_inventory_releases_immutable;
  END IF;
END $$;

-- Enforce default and NOT NULL on released_effective_version
ALTER TABLE canonical_reservation_cancellation_inventory_releases
  ALTER COLUMN released_effective_version SET DEFAULT 1,
  ALTER COLUMN released_effective_version SET NOT NULL;

-- Enforce structural consistency between released version and revision ID
ALTER TABLE canonical_reservation_cancellation_inventory_releases
  DROP CONSTRAINT IF EXISTS chk_cancellation_release_version_revision,
  ADD CONSTRAINT chk_cancellation_release_version_revision
  CHECK (
    (released_effective_version = 1 AND released_revision_id IS NULL)
    OR
    (released_effective_version >= 2 AND released_revision_id IS NOT NULL)
  );

-- Foreign key cross-binding released_revision_id to canonical_reservation_revisions
ALTER TABLE canonical_reservation_cancellation_inventory_releases
  DROP CONSTRAINT IF EXISTS fk_cancellation_release_revision,
  ADD CONSTRAINT fk_cancellation_release_revision
  FOREIGN KEY (released_revision_id, reservation_id)
  REFERENCES canonical_reservation_revisions(id, reservation_id)
  ON DELETE RESTRICT;

-- 2. Extend per-night release evidence with room_type_id
ALTER TABLE canonical_reservation_cancellation_release_nights
  ADD COLUMN IF NOT EXISTS room_type_id INT REFERENCES room_types(id) ON DELETE RESTRICT;

-- Backfill room_type_id for any existing historical rows from canonical_reservations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM canonical_reservation_cancellation_release_nights WHERE room_type_id IS NULL) THEN
    ALTER TABLE canonical_reservation_cancellation_release_nights
      DISABLE TRIGGER canonical_reservation_cancellation_release_nights_immutable;

    UPDATE canonical_reservation_cancellation_release_nights rn
    SET room_type_id = r.room_type_id
    FROM canonical_reservations r
    WHERE r.id = rn.reservation_id AND rn.room_type_id IS NULL;

    ALTER TABLE canonical_reservation_cancellation_release_nights
      ENABLE TRIGGER canonical_reservation_cancellation_release_nights_immutable;
  END IF;
END $$;

ALTER TABLE canonical_reservation_cancellation_release_nights
  ALTER COLUMN room_type_id SET NOT NULL;

-- 3. Replace Atomic Cancellation Completion Function with Version-Aware Semantics
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
SET search_path = pg_catalog, public, pg_temp SET row_security = on AS $$
DECLARE
  res_row RECORD;
  auth_row RECORD;
  req_ev RECORD;
  existing_cmd RECORD;
  replay_row RECORD;
  latest_ev RECORD;
  eff_rec RECORD;
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

  -- 6. Resolve current effective reservation version (W4-C1 authority)
  SELECT eff.effective_version, eff.effective_revision_id, eff.nights, eff.room_type_id
  INTO eff_rec
  FROM public.canonical_reservation_effective_revisions eff
  WHERE eff.reservation_id = target_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELLATION_EFFECTIVE_RESERVATION_NOT_FOUND';
  END IF;

  -- Validate allocation existence and completeness against resolved effective authority
  IF eff_rec.effective_version = 1 THEN
    SELECT count(*)::int INTO actual_nights_count
    FROM public.canonical_reservation_nights crn
    WHERE crn.reservation_id = target_reservation_id;

    IF actual_nights_count = 0 OR actual_nights_count IS DISTINCT FROM eff_rec.nights THEN
      RAISE EXCEPTION 'CANCELLATION_ALLOCATION_INCOMPLETE';
    END IF;

    SELECT count(*)::int INTO locked_days_count
    FROM public.canonical_reservation_nights crn
    JOIN public.inventory_days day ON day.id = crn.inventory_day_id
    WHERE crn.reservation_id = target_reservation_id;

    IF locked_days_count IS DISTINCT FROM actual_nights_count THEN
      RAISE EXCEPTION 'INVENTORY_DAY_MISSING';
    END IF;
  ELSE
    SELECT count(*)::int INTO actual_nights_count
    FROM public.canonical_reservation_revision_nights rrn
    WHERE rrn.revision_id = eff_rec.effective_revision_id;

    IF actual_nights_count = 0 OR actual_nights_count IS DISTINCT FROM eff_rec.nights THEN
      RAISE EXCEPTION 'CANCELLATION_ALLOCATION_INCOMPLETE';
    END IF;

    SELECT count(*)::int INTO locked_days_count
    FROM public.canonical_reservation_revision_nights rrn
    JOIN public.inventory_days day ON day.id = rrn.inventory_day_id
    WHERE rrn.revision_id = eff_rec.effective_revision_id;

    IF locked_days_count IS DISTINCT FROM actual_nights_count THEN
      RAISE EXCEPTION 'INVENTORY_DAY_MISSING';
    END IF;
  END IF;

  -- 7. Deterministic lock ordering on inventory_days & underflow verification (Lock Order Step 5)
  IF eff_rec.effective_version = 1 THEN
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

      UPDATE public.inventory_days
      SET booked_units = booked_units - day_rec.units_to_release,
          updated_at = statement_timestamp()
      WHERE id = day_rec.id;
    END LOOP;
  ELSE
    FOR day_rec IN
      SELECT day.id, day.calendar_date, day.booked_units, day.held_units, day.total_units,
             rrn.units AS units_to_release
      FROM public.canonical_reservation_revision_nights rrn
      JOIN public.inventory_days day ON day.id = rrn.inventory_day_id
      WHERE rrn.revision_id = eff_rec.effective_revision_id
      ORDER BY day.calendar_date ASC, day.id ASC FOR UPDATE OF day
    LOOP
      IF day_rec.booked_units < day_rec.units_to_release THEN
        RAISE EXCEPTION 'INVENTORY_RELEASE_UNDERFLOW';
      END IF;

      UPDATE public.inventory_days
      SET booked_units = booked_units - day_rec.units_to_release,
          updated_at = statement_timestamp()
      WHERE id = day_rec.id;
    END LOOP;
  END IF;

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
      'decision_source_kind', 'INTERNAL_AUTHORITY_PRIMITIVE',
      'released_effective_version', eff_rec.effective_version,
      'released_revision_id', eff_rec.effective_revision_id
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

  -- 10. Insert cancellation-specific full-release fence with version evidence
  new_release_id := gen_random_uuid();
  rel_fingerprint_input := jsonb_build_object(
    'release_id', new_release_id,
    'reservation_id', target_reservation_id,
    'event_id', new_event_id,
    'command_id', target_command,
    'authorization_id', target_authorization_id,
    'nights_count', actual_nights_count,
    'released_effective_version', eff_rec.effective_version,
    'released_revision_id', eff_rec.effective_revision_id
  );
  rel_fingerprint := encode(sha256(convert_to(rel_fingerprint_input::text, 'UTF8')), 'hex');

  INSERT INTO public.canonical_reservation_cancellation_inventory_releases (
    release_id,
    reservation_id,
    event_id,
    command_id,
    authorization_id,
    released_at,
    release_fingerprint,
    released_effective_version,
    released_revision_id
  ) VALUES (
    new_release_id,
    target_reservation_id,
    new_event_id,
    target_command,
    target_authorization_id,
    statement_timestamp(),
    rel_fingerprint,
    eff_rec.effective_version,
    eff_rec.effective_revision_id
  );

  -- 11. Insert REQUIRED per-night release evidence derived from resolved effective allocation
  IF eff_rec.effective_version = 1 THEN
    INSERT INTO public.canonical_reservation_cancellation_release_nights (
      release_id,
      reservation_id,
      inventory_day_id,
      stay_date,
      room_type_id,
      released_units
    )
    SELECT new_release_id, crn.reservation_id, crn.inventory_day_id, crn.stay_date, eff_rec.room_type_id, crn.units
    FROM public.canonical_reservation_nights crn
    WHERE crn.reservation_id = target_reservation_id
    ORDER BY crn.stay_date ASC;
  ELSE
    INSERT INTO public.canonical_reservation_cancellation_release_nights (
      release_id,
      reservation_id,
      inventory_day_id,
      stay_date,
      room_type_id,
      released_units
    )
    SELECT new_release_id, rrn.reservation_id, rrn.inventory_day_id, rrn.stay_date, rrn.room_type_id, rrn.units
    FROM public.canonical_reservation_revision_nights rrn
    WHERE rrn.revision_id = eff_rec.effective_revision_id
    ORDER BY rrn.stay_date ASC;
  END IF;

  -- 12. Consume decision authorization
  UPDATE public.canonical_reservation_cancellation_authorizations
  SET consumed_at = statement_timestamp(),
      consumed_by_event_id = new_event_id
  WHERE authorization_id = target_authorization_id;

  RETURN QUERY SELECT new_event_id, target_reservation_id, 'CANCELLED'::TEXT, new_seq, new_release_id, FALSE;
END;
$$;

-- 4. Permissions & Role Grants
REVOKE ALL ON FUNCTION canonical_complete_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT) FROM PUBLIC;

DO $grant_cancellation_executor$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encho_cancellation_executor') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION canonical_complete_reservation_cancellation(UUID,UUID,UUID,TEXT,TEXT) TO encho_cancellation_executor';
  END IF;
END $grant_cancellation_executor$;
