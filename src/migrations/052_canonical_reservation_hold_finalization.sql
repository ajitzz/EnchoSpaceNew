-- W3-A: internal reservation authority. No payment, public booking or external ingress.
-- The old stays_orders/stays_holds are deliberately not reservation authority.
CREATE TABLE canonical_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_kind TEXT NOT NULL CHECK(origin_kind IN ('ENCHO_DIRECT','EXTERNAL_CHANNEL')),
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  room_type_id INT NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  offer_id UUID,
  offer_revision INT,
  quote_id UUID REFERENCES stays_quotes(id) ON DELETE RESTRICT,
  hold_id UUID REFERENCES booking_holds(id) ON DELETE RESTRICT,
  holder_principal TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights INT NOT NULL CHECK(nights>0),
  guest_count INT NOT NULL CHECK(guest_count>0),
  room_subtotal_paise BIGINT NOT NULL CHECK(room_subtotal_paise>=0),
  currency TEXT NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL CHECK(status='INVENTORY_COMMITTED'),
  command_id UUID NOT NULL UNIQUE,
  command_fingerprint TEXT NOT NULL CHECK(command_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  FOREIGN KEY (offer_id,offer_revision) REFERENCES sellable_offer_revisions(offer_id,revision) ON DELETE RESTRICT,
  CHECK(check_out_date>check_in_date AND check_out_date-check_in_date=nights),
  CHECK(origin_kind<>'ENCHO_DIRECT' OR (offer_id IS NOT NULL AND offer_revision IS NOT NULL
    AND quote_id IS NOT NULL AND hold_id IS NOT NULL AND holder_principal IS NOT NULL
    AND room_subtotal_paise>0 AND currency='INR')),
  CHECK(origin_kind<>'EXTERNAL_CHANNEL' OR (quote_id IS NULL AND hold_id IS NULL)),
  UNIQUE(hold_id),
  UNIQUE(quote_id)
);

CREATE TABLE canonical_reservation_nights (
  reservation_id UUID NOT NULL REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  inventory_day_id INT NOT NULL REFERENCES inventory_days(id) ON DELETE RESTRICT,
  stay_date DATE NOT NULL,
  units INT NOT NULL CHECK(units>0),
  PRIMARY KEY(reservation_id,inventory_day_id),
  UNIQUE(reservation_id,stay_date)
);

CREATE TABLE canonical_reservation_commands (
  command_id UUID PRIMARY KEY,
  holder_principal TEXT NOT NULL,
  hold_id UUID NOT NULL,
  quote_id UUID NOT NULL,
  request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
  reservation_id UUID UNIQUE REFERENCES canonical_reservations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE FUNCTION canonical_reservation_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_RESERVATION_IMMUTABLE';
END $$;
CREATE TRIGGER canonical_reservations_immutable BEFORE UPDATE OR DELETE ON canonical_reservations
  FOR EACH ROW EXECUTE FUNCTION canonical_reservation_reject_mutation();
CREATE TRIGGER canonical_reservation_nights_immutable BEFORE UPDATE OR DELETE ON canonical_reservation_nights
  FOR EACH ROW EXECUTE FUNCTION canonical_reservation_reject_mutation();

-- Called only by the separately provisioned internal reservation worker. The
-- function owns the entire DB transaction's effects; the application sets the
-- verified holder principal transaction-locally and never receives raw DML.
CREATE FUNCTION canonical_finalize_direct_hold(target_hold UUID,target_quote UUID,target_command UUID)
RETURNS TABLE(reservation_id UUID,replayed BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE
  principal TEXT := current_setting('app.stays_principal',true);
  fingerprint TEXT;
  fence RECORD;
  held RECORD;
  authority RECORD;
  night RECORD;
  expected_nights INT;
  actual_nights INT := 0;
  saved_id UUID;
  current_facts JSONB;
BEGIN
  IF principal IS NULL OR principal !~ '^(user:[0-9]+|session:[0-9a-f-]{36})$'
    OR target_hold IS NULL OR target_quote IS NULL OR target_command IS NULL THEN
    RAISE EXCEPTION 'RESERVATION_INPUT_INVALID';
  END IF;
  fingerprint:=encode(sha256(convert_to(principal||':'||target_hold::text||':'||target_quote::text,'UTF8')),'hex');
  INSERT INTO public.canonical_reservation_commands(command_id,holder_principal,hold_id,quote_id,request_fingerprint)
    VALUES(target_command,principal,target_hold,target_quote,fingerprint)
    ON CONFLICT(command_id) DO NOTHING;
  SELECT * INTO fence FROM public.canonical_reservation_commands WHERE command_id=target_command FOR UPDATE;
  IF fence.request_fingerprint IS DISTINCT FROM fingerprint OR fence.holder_principal IS DISTINCT FROM principal
    OR fence.hold_id IS DISTINCT FROM target_hold OR fence.quote_id IS DISTINCT FROM target_quote THEN
    RAISE EXCEPTION 'RESERVATION_COMMAND_CONFLICT';
  END IF;
  IF fence.reservation_id IS NOT NULL THEN
    RETURN QUERY SELECT fence.reservation_id,TRUE;
    RETURN;
  END IF;

  SELECT * INTO held FROM public.booking_holds WHERE id=target_hold FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_HOLD_NOT_FOUND'; END IF;
  IF held.holder_principal IS DISTINCT FROM principal THEN RAISE EXCEPTION 'RESERVATION_FORBIDDEN'; END IF;
  IF held.status<>'ACTIVE' THEN RAISE EXCEPTION 'RESERVATION_HOLD_NOT_ACTIVE'; END IF;
  -- Recheck wall-clock expiry after the row lock is acquired. The statement
  -- may have waited behind another transaction until this hold expired.
  IF held.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'RESERVATION_HOLD_EXPIRED'; END IF;
  IF held.quote_id IS DISTINCT FROM target_quote THEN RAISE EXCEPTION 'RESERVATION_QUOTE_MISMATCH'; END IF;

  SELECT q.*,o.listing_id AS offer_listing_id,o.room_type_id AS offer_room_type_id,
    o.current_accepted_revision AS offer_current_revision,o.public_disposition AS offer_disposition,
    r.amount_minor AS offer_amount_minor,r.currency AS offer_currency,r.source_hash AS offer_source_hash,
    r.max_guests AS offer_max_guests,r.stay_start AS offer_stay_start,r.stay_end AS offer_stay_end,
    l.publication_status AS listing_publication_status,room.listing_id AS room_listing_id,
    EXISTS(SELECT 1 FROM public.sellable_offer_events e WHERE e.offer_id=q.offer_id
      AND e.revision=q.offer_revision AND e.event_type='ACCEPTED') AS historically_accepted
    INTO authority
    FROM public.stays_quotes q
    JOIN public.sellable_offers o ON o.id=q.offer_id
    JOIN public.sellable_offer_revisions r ON r.offer_id=q.offer_id AND r.revision=q.offer_revision
    JOIN public.listings l ON l.id=q.listing_id
    JOIN public.room_types room ON room.id=q.room_type_id
    WHERE q.id=target_quote FOR SHARE OF q,o,r,l,room;
  IF NOT FOUND OR authority.quote_kind<>'ACCEPTED_OFFER' OR NOT authority.historically_accepted
    OR authority.offer_current_revision IS DISTINCT FROM authority.offer_revision
    OR authority.offer_disposition<>'ACCEPTED'
    OR authority.holder_principal IS DISTINCT FROM principal
    OR authority.room_type_id IS DISTINCT FROM held.room_type_id
    OR authority.check_in_date IS DISTINCT FROM held.check_in_date
    OR authority.check_out_date IS DISTINCT FROM held.check_out_date
    OR authority.listing_id IS DISTINCT FROM authority.offer_listing_id
    OR authority.room_type_id IS DISTINCT FROM authority.offer_room_type_id
    OR authority.listing_id IS DISTINCT FROM authority.room_listing_id
    OR authority.listing_publication_status<>'published'
    OR authority.currency IS DISTINCT FROM authority.offer_currency
    OR authority.currency<>'INR' OR authority.price_basis<>'PER_ROOM_NIGHT'
    OR authority.accepted_nightly_paise IS DISTINCT FROM authority.offer_amount_minor
    OR authority.source_hash IS DISTINCT FROM authority.offer_source_hash
    OR authority.tax_paise IS NOT NULL OR authority.total_paise IS NOT NULL
    OR authority.nights IS DISTINCT FROM authority.check_out_date-authority.check_in_date
    OR authority.base_price_paise IS DISTINCT FROM authority.accepted_nightly_paise*authority.nights
    OR authority.guest_count<1 OR authority.guest_count>authority.offer_max_guests
    OR authority.check_in_date<authority.offer_stay_start
    OR authority.check_out_date>authority.offer_stay_end OR held.units_held<1 THEN
    RAISE EXCEPTION 'RESERVATION_AUTHORITY_MISMATCH';
  END IF;
  current_facts:=public.sellable_offer_source_snapshot(authority.listing_id,authority.room_type_id);
  IF current_facts IS NULL OR
    encode(sha256(convert_to(current_facts::text,'UTF8')),'hex')<>authority.offer_source_hash OR
    EXISTS(SELECT 1 FROM public.media_assets m WHERE m.entity_type='listing'
      AND m.entity_id=authority.listing_id AND m.room_type_id=authority.room_type_id
      AND m.moderation_status='approved' AND NOT public.sellable_offer_media_url_safe(m.url)) THEN
    RAISE EXCEPTION 'RESERVATION_AUTHORITY_MISMATCH';
  END IF;
  expected_nights:=authority.nights;
  IF (SELECT count(*) FROM public.booking_hold_nights WHERE hold_id=target_hold)<>expected_nights THEN
    RAISE EXCEPTION 'RESERVATION_NIGHTS_INCOMPLETE';
  END IF;

  INSERT INTO public.canonical_reservations(origin_kind,listing_id,room_type_id,offer_id,offer_revision,
    quote_id,hold_id,holder_principal,check_in_date,check_out_date,nights,guest_count,
    room_subtotal_paise,currency,status,command_id,command_fingerprint)
  VALUES('ENCHO_DIRECT',authority.listing_id,authority.room_type_id,authority.offer_id,
    authority.offer_revision,target_quote,target_hold,principal,authority.check_in_date,
    authority.check_out_date,expected_nights,authority.guest_count,authority.base_price_paise,
    authority.currency,'INVENTORY_COMMITTED',target_command,fingerprint)
  RETURNING id INTO saved_id;

  FOR night IN SELECT day.id,day.calendar_date,day.listing_id,day.held_units,
      allocation.units,allocation.stay_date,allocation.inventory_day_id
    FROM public.inventory_days day
    LEFT JOIN public.booking_hold_nights allocation ON allocation.inventory_day_id=day.id
      AND allocation.hold_id=target_hold
    WHERE day.room_type_id=held.room_type_id AND day.calendar_date>=held.check_in_date
      AND day.calendar_date<held.check_out_date
    ORDER BY day.calendar_date,day.id FOR UPDATE OF day
  LOOP
    actual_nights:=actual_nights+1;
    IF night.inventory_day_id IS NULL OR night.stay_date IS DISTINCT FROM night.calendar_date
      OR night.listing_id IS DISTINCT FROM authority.listing_id
      OR night.units IS DISTINCT FROM held.units_held OR night.held_units<night.units THEN
      RAISE EXCEPTION 'RESERVATION_NIGHT_AUTHORITY_INVALID';
    END IF;
    INSERT INTO public.canonical_reservation_nights(reservation_id,inventory_day_id,stay_date,units)
      VALUES(saved_id,night.id,night.calendar_date,night.units);
    UPDATE public.inventory_days SET held_units=held_units-night.units,
      booked_units=booked_units+night.units,updated_at=statement_timestamp() WHERE id=night.id;
  END LOOP;
  IF actual_nights<>expected_nights THEN RAISE EXCEPTION 'RESERVATION_NIGHTS_INCOMPLETE'; END IF;
  UPDATE public.booking_holds SET status='CONSUMED' WHERE id=target_hold AND status='ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_HOLD_STATE_CHANGED'; END IF;
  UPDATE public.canonical_reservation_commands SET reservation_id=saved_id WHERE command_id=target_command;
  RETURN QUERY SELECT saved_id,FALSE;
END $$;

ALTER TABLE canonical_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_nights ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_nights FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reservation_commands FORCE ROW LEVEL SECURITY;
CREATE POLICY canonical_reservation_owner ON canonical_reservations FOR ALL TO current_user USING(true) WITH CHECK(true);
CREATE POLICY canonical_reservation_night_owner ON canonical_reservation_nights FOR ALL TO current_user USING(true) WITH CHECK(true);
CREATE POLICY canonical_reservation_command_owner ON canonical_reservation_commands FOR ALL TO current_user USING(true) WITH CHECK(true);
REVOKE ALL ON canonical_reservations,canonical_reservation_nights,canonical_reservation_commands FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_finalize_direct_hold(UUID,UUID,UUID),canonical_reservation_reject_mutation() FROM PUBLIC;
DO $grant$
DECLARE worker TEXT := 'encho_reservation_worker';
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
    OR has_table_privilege(worker,'public.sellable_offers','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege(worker,'public.sellable_offer_revisions','SELECT,INSERT,UPDATE,DELETE')
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('canonical_reservations',
        'canonical_reservation_nights','canonical_reservation_commands','booking_holds',
        'booking_hold_nights','inventory_days','stays_quotes','sellable_offers','sellable_offer_revisions')
      AND pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),c.relowner,'MEMBER'))
    OR pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),'pg_read_all_data'::regrole,'MEMBER')
    OR pg_has_role((SELECT oid FROM pg_roles WHERE rolname=worker),'pg_write_all_data'::regrole,'MEMBER') THEN
    RAISE EXCEPTION 'RESERVATION_RESTRICTED_ROLE_NOT_READY';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',worker);
  EXECUTE format('GRANT EXECUTE ON FUNCTION canonical_finalize_direct_hold(UUID,UUID,UUID) TO %I',worker);
END $grant$;
