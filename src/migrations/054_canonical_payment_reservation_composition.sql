-- Migration: 054_canonical_payment_reservation_composition.sql
-- W3-B Task 3: Internal composition authority between verified payment capture and canonical W3-A reservation.
-- Invariants:
--   - ENCHO_DIRECT only; does not constrain external channel reservations.
--   - Does NOT enable public checkout or public booking confirmation.
--   - Does NOT move real money or call payment providers.
--   - Payment attempt must be in MATCHED_CAPTURE with zero unresolved reconciliations.
--   - Payment attempt must have a real normalized captured provider event verifying monetary truth.
--   - Derives all stay facts (quote, hold, principal, amounts) from trusted database authority.
--   - Reuses W3-A canonical_finalize_direct_hold; does not duplicate inventory conversion.
--   - Atomic transaction boundary; failures do not erase capture evidence and record durable reconciliation.
--   - Lost-response command replay recovers committed reservation without second inventory effect.

CREATE TABLE IF NOT EXISTS canonical_payment_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID UNIQUE NOT NULL,
  payment_attempt_id UUID UNIQUE NOT NULL REFERENCES canonical_payment_attempts(id) ON DELETE RESTRICT,
  quote_id UUID NOT NULL REFERENCES stays_quotes(id) ON DELETE RESTRICT,
  hold_id UUID NOT NULL REFERENCES booking_holds(id) ON DELETE RESTRICT,
  reservation_id UUID UNIQUE NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL CHECK (status = 'COMMITTED'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_canonical_payment_reservations_attempt ON canonical_payment_reservations(payment_attempt_id);
CREATE INDEX IF NOT EXISTS idx_canonical_payment_reservations_reservation ON canonical_payment_reservations(reservation_id);
CREATE INDEX IF NOT EXISTS idx_canonical_payment_reservations_hold ON canonical_payment_reservations(hold_id);
CREATE INDEX IF NOT EXISTS idx_canonical_payment_reservations_quote ON canonical_payment_reservations(quote_id);

-- Immutability triggers
CREATE OR REPLACE FUNCTION canonical_payment_reservation_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_PAYMENT_RESERVATION_IMMUTABLE';
END $$;

CREATE TRIGGER canonical_payment_reservations_immutable BEFORE UPDATE OR DELETE ON canonical_payment_reservations
  FOR EACH ROW EXECUTE FUNCTION canonical_payment_reservation_reject_mutation();

-- Composition procedure
CREATE OR REPLACE FUNCTION canonical_compose_payment_reservation(
  target_command UUID,
  target_payment_attempt_id UUID
)
RETURNS TABLE(
  reservation_id UUID,
  composition_state TEXT,
  reconciliation_reason TEXT,
  replayed BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE
  existing_cmd RECORD;
  attempt RECORD;
  existing_attempt RECORD;
  supporting_event RECORD;
  quote_row RECORD;
  hold_row RECORD;
  existing_res_id UUID;
  finalizer_res RECORD;
  saved_reservation_id UUID;
  err_reason TEXT;
  fingerprint_input JSONB;
  fingerprint TEXT;
BEGIN
  -- 1. Validate basic input UUIDs
  IF target_command IS NULL OR target_payment_attempt_id IS NULL THEN
    RAISE EXCEPTION 'COMPOSITION_INPUT_INVALID';
  END IF;

  -- 2. Lost-response command replay recovery: check stored command before mutable checks
  SELECT * INTO existing_cmd FROM public.canonical_payment_reservations
  WHERE command_id = target_command FOR UPDATE;
  IF FOUND THEN
    IF existing_cmd.payment_attempt_id IS DISTINCT FROM target_payment_attempt_id THEN
      RAISE EXCEPTION 'COMPOSITION_COMMAND_CONFLICT';
    END IF;
    RETURN QUERY SELECT existing_cmd.reservation_id, existing_cmd.status, NULL::TEXT, TRUE;
    RETURN;
  END IF;

  -- 3. Lock payment attempt FOR UPDATE
  SELECT * INTO attempt FROM public.canonical_payment_attempts
  WHERE id = target_payment_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_ATTEMPT_NOT_FOUND';
  END IF;

  -- Check if this payment attempt was already composed under another command
  SELECT * INTO existing_attempt FROM public.canonical_payment_reservations
  WHERE payment_attempt_id = target_payment_attempt_id FOR UPDATE;
  IF FOUND THEN
    IF existing_attempt.command_id IS DISTINCT FROM target_command THEN
      RAISE EXCEPTION 'PAYMENT_ALREADY_COMPOSED';
    END IF;
    RETURN QUERY SELECT existing_attempt.reservation_id, existing_attempt.status, NULL::TEXT, TRUE;
    RETURN;
  END IF;

  -- 4. Verify payment attempt eligibility
  IF attempt.payment_state <> 'MATCHED_CAPTURE' THEN
    RAISE EXCEPTION 'PAYMENT_STATE_NOT_CAPTURED';
  END IF;

  IF attempt.reconciliation_reason IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_RECONCILIATION_UNRESOLVED';
  END IF;

  IF attempt.matched_at IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_MATCHED_TIMESTAMP_MISSING';
  END IF;

  IF attempt.expected_amount_paise IS NULL OR attempt.expected_amount_paise <= 0 THEN
    RAISE EXCEPTION 'PAYMENT_MONETARY_AUTHORITY_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.canonical_payment_reconciliations
    WHERE payment_attempt_id = attempt.id AND NOT resolved
  ) THEN
    RAISE EXCEPTION 'PAYMENT_RECONCILIATION_UNRESOLVED';
  END IF;

  -- Verify real supporting normalized captured provider event
  SELECT * INTO supporting_event
  FROM public.canonical_provider_events
  WHERE payment_attempt_id = attempt.id
    AND origin_kind = attempt.origin_kind
    AND provider_order_ref = attempt.provider_order_ref
    AND provider_payment_ref IS NOT NULL
    AND provider_payment_ref <> ''
    AND normalized_event_type = 'PAYMENT_CAPTURED'
    AND reported_amount_paise = attempt.expected_amount_paise
    AND reported_currency = attempt.expected_currency
    AND status = 'PROCESSED'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CAPTURE_EVIDENCE_INVALID';
  END IF;

  -- 5. Exact quote and hold binding
  SELECT * INTO quote_row FROM public.stays_quotes WHERE id = attempt.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_QUOTE_NOT_FOUND';
  END IF;

  SELECT * INTO hold_row FROM public.booking_holds WHERE id = attempt.hold_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_HOLD_NOT_FOUND';
  END IF;

  IF hold_row.quote_id IS DISTINCT FROM attempt.quote_id THEN
    RAISE EXCEPTION 'PAYMENT_QUOTE_HOLD_MISMATCH';
  END IF;

  IF hold_row.holder_principal IS DISTINCT FROM attempt.holder_principal
    OR quote_row.holder_principal IS DISTINCT FROM attempt.holder_principal THEN
    RAISE EXCEPTION 'PAYMENT_PRINCIPAL_MISMATCH';
  END IF;

  -- 6. Check hold status & wall-clock expiry after acquiring lock
  IF hold_row.status <> 'ACTIVE' OR hold_row.expires_at <= clock_timestamp() THEN
    UPDATE public.canonical_payment_attempts
    SET payment_state = 'RECONCILIATION_REQUIRED',
        reconciliation_reason = 'HOLD_EXPIRED',
        updated_at = statement_timestamp()
    WHERE id = attempt.id;

    INSERT INTO public.canonical_payment_reconciliations(
      payment_attempt_id, reason, details
    ) VALUES (
      attempt.id,
      'HOLD_EXPIRED',
      jsonb_build_object(
        'command_id', target_command,
        'hold_id', attempt.hold_id,
        'expires_at', hold_row.expires_at,
        'hold_status', hold_row.status
      )
    );

    RETURN QUERY SELECT NULL::UUID, 'RECONCILIATION_REQUIRED'::TEXT, 'HOLD_EXPIRED'::TEXT, FALSE;
    RETURN;
  END IF;

  -- 7. Verify hold has not already been finalized into a reservation
  SELECT id INTO existing_res_id FROM public.canonical_reservations WHERE hold_id = attempt.hold_id;
  IF FOUND THEN
    UPDATE public.canonical_payment_attempts
    SET payment_state = 'RECONCILIATION_REQUIRED',
        reconciliation_reason = 'FINALIZER_FAILURE',
        updated_at = statement_timestamp()
    WHERE id = attempt.id;

    INSERT INTO public.canonical_payment_reconciliations(
      payment_attempt_id, reason, details
    ) VALUES (
      attempt.id,
      'FINALIZER_FAILURE',
      jsonb_build_object(
        'command_id', target_command,
        'existing_reservation_id', existing_res_id,
        'reason', 'HOLD_ALREADY_RESERVED_OUTSIDE_COMPOSITION'
      )
    );

    RETURN QUERY SELECT NULL::UUID, 'RECONCILIATION_REQUIRED'::TEXT, 'FINALIZER_FAILURE'::TEXT, FALSE;
    RETURN;
  END IF;

  -- 8. Invoke W3-A canonical reservation finalizer in a subtransaction
  PERFORM set_config('app.stays_principal', attempt.holder_principal, true);

  BEGIN
    SELECT f.reservation_id, f.replayed INTO finalizer_res
    FROM public.canonical_finalize_direct_hold(attempt.hold_id, attempt.quote_id, target_command) f;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'RESERVATION_HOLD_EXPIRED' THEN
      err_reason := 'HOLD_EXPIRED';
    ELSE
      err_reason := 'FINALIZER_FAILURE';
    END IF;

    UPDATE public.canonical_payment_attempts
    SET payment_state = 'RECONCILIATION_REQUIRED',
        reconciliation_reason = err_reason,
        updated_at = statement_timestamp()
    WHERE id = attempt.id;

    INSERT INTO public.canonical_payment_reconciliations(
      payment_attempt_id, reason, details
    ) VALUES (
      attempt.id,
      err_reason,
      jsonb_build_object(
        'command_id', target_command,
        'error_code', SQLSTATE,
        'error_message', SQLERRM
      )
    );

    RETURN QUERY SELECT NULL::UUID, 'RECONCILIATION_REQUIRED'::TEXT, err_reason::TEXT, FALSE;
    RETURN;
  END;

  -- 9. Record durable bridge in canonical_payment_reservations
  saved_reservation_id := finalizer_res.reservation_id;

  fingerprint_input := jsonb_build_object(
    'command_id', target_command,
    'payment_attempt_id', target_payment_attempt_id,
    'quote_id', attempt.quote_id,
    'hold_id', attempt.hold_id,
    'holder_principal', attempt.holder_principal,
    'reservation_id', saved_reservation_id
  );
  fingerprint := encode(sha256(convert_to(fingerprint_input::text, 'UTF8')), 'hex');

  INSERT INTO public.canonical_payment_reservations(
    command_id, payment_attempt_id, quote_id, hold_id, reservation_id,
    command_fingerprint, status
  ) VALUES (
    target_command, target_payment_attempt_id, attempt.quote_id, attempt.hold_id,
    saved_reservation_id, fingerprint, 'COMMITTED'
  );

  RETURN QUERY SELECT saved_reservation_id, 'COMMITTED'::TEXT, NULL::TEXT, finalizer_res.replayed;
END $$;

-- 10. Getter procedure
CREATE OR REPLACE FUNCTION canonical_get_payment_reservation(target_payment_attempt_id UUID)
RETURNS TABLE(
  id UUID,
  command_id UUID,
  payment_attempt_id UUID,
  quote_id UUID,
  hold_id UUID,
  reservation_id UUID,
  command_fingerprint TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
BEGIN
  RETURN QUERY SELECT r.id, r.command_id, r.payment_attempt_id, r.quote_id, r.hold_id,
    r.reservation_id, r.command_fingerprint, r.status, r.created_at, r.finalized_at
  FROM public.canonical_payment_reservations r
  WHERE r.payment_attempt_id = target_payment_attempt_id;
END $$;

-- 11. Security & RLS
ALTER TABLE canonical_payment_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_payment_reservations FORCE ROW LEVEL SECURITY;

CREATE POLICY canonical_payment_reservations_owner ON canonical_payment_reservations
  FOR ALL TO current_user USING(true) WITH CHECK(true);

REVOKE ALL ON canonical_payment_reservations FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_compose_payment_reservation(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_get_payment_reservation(UUID) FROM PUBLIC;

DO $grant$
DECLARE worker TEXT := 'encho_composition_worker';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=worker AND rolcanlogin AND NOT rolsuper
    AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
    OR has_schema_privilege(worker,'public','CREATE')
    OR has_database_privilege(worker,current_database(),'CREATE')
    OR has_table_privilege(worker,'public.canonical_reservations','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_reservation_nights','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_reservation_commands','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.booking_holds','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.inventory_days','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.stays_quotes','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_payment_attempts','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_provider_events','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_quarantined_events','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_payment_reconciliations','INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.canonical_payment_reservations','SELECT,INSERT,UPDATE,DELETE')
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('canonical_reservations',
        'canonical_reservation_nights','canonical_reservation_commands','booking_holds',
        'booking_hold_nights','inventory_days','stays_quotes','canonical_payment_attempts',
        'canonical_provider_events','canonical_quarantined_events','canonical_payment_reconciliations',
        'canonical_payment_reservations')
        AND pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),c.relowner,'MEMBER'))
    OR pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),'pg_read_all_data'::regrole,'MEMBER')
    OR pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),'pg_write_all_data'::regrole,'MEMBER') THEN
    RAISE EXCEPTION 'COMPOSITION_RESTRICTED_ROLE_NOT_READY';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_compose_payment_reservation(UUID,UUID) TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_get_payment_reservation(UUID) TO %I',worker);
END $grant$;
