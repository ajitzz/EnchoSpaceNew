-- Migration 060: Canonical Payment Composition Lock Order Hardening
--
-- PURPOSE:
-- Eliminates the lock order inversion defect (C4-01) between:
--   canonical_finalize_direct_hold (Command -> Hold)
-- and
--   canonical_compose_payment_reservation (Hold -> Command).
--
-- In migration 054, canonical_compose_payment_reservation acquired:
--   SELECT * FROM booking_holds WHERE id = attempt.hold_id FOR UPDATE;
-- before invoking canonical_finalize_direct_hold, which internally acquires:
--   SELECT * FROM canonical_reservation_commands WHERE command_id = target_command FOR UPDATE;
-- followed by:
--   SELECT * FROM booking_holds WHERE id = target_hold FOR UPDATE;
--
-- Concurrent execution on the same hold and same target command caused an ABBA
-- deadlock cycle (Command -> Hold vs Hold -> Command), yielding PostgreSQL 40P01.
--
-- REPAIR:
-- 1. Composition STOPS taking `booking_holds ... FOR UPDATE` before calling finalizer.
-- 2. Non-locking validation verifies static hold existence and bindings (quote, holder).
-- 3. canonical_finalize_direct_hold remains the sole authoritative serializer for
--    canonical_reservation_commands -> booking_holds -> inventory_days.
-- 4. Finalizer post-lock status and clock_timestamp() validation exceptions
--    (RESERVATION_HOLD_EXPIRED, RESERVATION_HOLD_NOT_ACTIVE) cleanly map to HOLD_EXPIRED
--    reconciliation, preserving pre-060 contract.
-- 5. Outside-composition finalizer replays encountered without an existing payment-composition
--    receipt are strictly rejected into RECONCILIATION_REQUIRED / FINALIZER_FAILURE
--    with reason FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT.

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
  payable_auth RECORD;
  supporting_event RECORD;
  quote_row RECORD;
  hold_row RECORD;
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

  -- 5. Verify against separate immutable approved payable authority
  SELECT * INTO payable_auth
  FROM public.canonical_payable_authorities
  WHERE quote_id = attempt.quote_id AND status = 'APPROVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_PAYABLE_AUTHORITY_MISSING';
  END IF;

  IF payable_auth.id::text IS DISTINCT FROM attempt.expected_authority_ref
    OR payable_auth.authority_kind IS DISTINCT FROM attempt.expected_authority_kind
    OR payable_auth.contract_hash IS DISTINCT FROM attempt.expected_authority_hash
    OR payable_auth.payable_amount_paise IS DISTINCT FROM attempt.expected_amount_paise
    OR payable_auth.currency IS DISTINCT FROM attempt.expected_currency
    OR payable_auth.quote_id IS DISTINCT FROM attempt.quote_id THEN
    RAISE EXCEPTION 'PAYMENT_PAYABLE_AUTHORITY_MISMATCH';
  END IF;

  -- 6. Verify real supporting normalized captured provider event
  SELECT * INTO supporting_event
  FROM public.canonical_provider_events
  WHERE payment_attempt_id = attempt.id
    AND origin_kind = attempt.origin_kind
    AND provider_order_ref = attempt.provider_order_ref
    AND provider_payment_ref IS NOT NULL
    AND provider_payment_ref <> ''
    AND normalized_event_type = 'PAYMENT_CAPTURED'
    AND reported_amount_paise = payable_auth.payable_amount_paise
    AND reported_currency = payable_auth.currency
    AND status = 'PROCESSED'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CAPTURE_EVIDENCE_INVALID';
  END IF;

  -- 7. Exact quote and hold binding (WITHOUT booking_holds FOR UPDATE lock)
  SELECT * INTO quote_row FROM public.stays_quotes WHERE id = attempt.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_QUOTE_NOT_FOUND';
  END IF;

  SELECT * INTO hold_row FROM public.booking_holds WHERE id = attempt.hold_id;
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

  -- 8. Invoke W3-A canonical reservation finalizer in a subtransaction.
  -- The finalizer authoritatively acquires:
  --   canonical_reservation_commands (target_command) FOR UPDATE
  -- then:
  --   booking_holds (attempt.hold_id) FOR UPDATE
  -- validating hold status and clock_timestamp() post-lock, and mutating inventory_days.
  PERFORM set_config('app.stays_principal', attempt.holder_principal, true);

  BEGIN
    SELECT f.reservation_id, f.replayed INTO finalizer_res
    FROM public.canonical_finalize_direct_hold(attempt.hold_id, attempt.quote_id, target_command) f;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'RESERVATION_HOLD_EXPIRED' OR SQLERRM = 'RESERVATION_HOLD_NOT_ACTIVE' THEN
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

  -- 9. Guard against outside-composition finalizer replay:
  -- If finalizer replayed an existing reservation but NO composition receipt exists
  -- for this command (checked in Step 2), composition refuses to adopt it.
  IF finalizer_res.replayed THEN
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
        'existing_reservation_id', finalizer_res.reservation_id,
        'reason', 'FINALIZER_REPLAY_WITHOUT_COMPOSITION_RECEIPT'
      )
    );

    RETURN QUERY SELECT NULL::UUID, 'RECONCILIATION_REQUIRED'::TEXT, 'FINALIZER_FAILURE'::TEXT, FALSE;
    RETURN;
  END IF;

  -- 10. Record durable bridge in canonical_payment_reservations
  -- (If this insert fails, unhandled exception rolls back the outer transaction and W3-A cleanly)
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

  RETURN QUERY SELECT saved_reservation_id, 'COMMITTED'::TEXT, NULL::TEXT, FALSE;
END $$;

REVOKE ALL ON FUNCTION canonical_compose_payment_reservation(UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION canonical_compose_payment_reservation(UUID,UUID) TO encho_composition_worker;
