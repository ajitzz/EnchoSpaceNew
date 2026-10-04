-- W2: evolve the existing stays_quotes identity; retain historical legacy rows.
-- The canonical physical hold remains booking_holds/booking_hold_nights.
ALTER TABLE stays_quotes ADD COLUMN quote_kind TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE stays_quotes ADD COLUMN offer_id UUID;
ALTER TABLE stays_quotes ADD COLUMN offer_revision INT;
ALTER TABLE stays_quotes ADD COLUMN holder_principal VARCHAR(255);
ALTER TABLE stays_quotes ADD COLUMN request_id UUID;
ALTER TABLE stays_quotes ADD COLUMN request_fingerprint TEXT;
ALTER TABLE stays_quotes ADD COLUMN accepted_nightly_paise BIGINT;
ALTER TABLE stays_quotes ADD COLUMN price_basis TEXT;
ALTER TABLE stays_quotes ADD COLUMN source_hash TEXT;
ALTER TABLE stays_quotes ALTER COLUMN tax_paise DROP NOT NULL;
ALTER TABLE stays_quotes ALTER COLUMN total_paise DROP NOT NULL;
ALTER TABLE stays_quotes ADD CONSTRAINT stays_quotes_offer_revision_fk
  FOREIGN KEY (offer_id,offer_revision)
  REFERENCES sellable_offer_revisions(offer_id,revision) ON DELETE RESTRICT;
ALTER TABLE stays_quotes ADD CONSTRAINT stays_quotes_authority_shape CHECK (
  (quote_kind='LEGACY' AND offer_id IS NULL AND offer_revision IS NULL
    AND tax_paise IS NOT NULL AND total_paise IS NOT NULL)
  OR (quote_kind='ACCEPTED_OFFER' AND offer_id IS NOT NULL AND offer_revision IS NOT NULL
    AND room_type_id IS NOT NULL AND holder_principal IS NOT NULL AND request_id IS NOT NULL
    AND request_fingerprint IS NOT NULL AND request_fingerprint ~ '^[a-f0-9]{64}$'
    AND source_hash IS NOT NULL AND source_hash ~ '^[a-f0-9]{64}$'
    AND accepted_nightly_paise IS NOT NULL AND accepted_nightly_paise > 0
    AND price_basis IS NOT NULL AND price_basis='PER_ROOM_NIGHT'
    AND base_price_paise=accepted_nightly_paise*nights
    AND currency='INR' AND tax_paise IS NULL AND total_paise IS NULL)
);
CREATE UNIQUE INDEX stays_quotes_offer_request_unique ON stays_quotes(holder_principal,request_id)
  WHERE quote_kind='ACCEPTED_OFFER';
CREATE INDEX stays_quotes_offer_revision_idx ON stays_quotes(offer_id,offer_revision)
  WHERE quote_kind='ACCEPTED_OFFER';

-- Accepted-offer quotes are immutable. Historical 041 commerce rows retain
-- their original lifecycle until that dormant path is retired separately.
CREATE FUNCTION stays_quote_reject_accepted_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.quote_kind='ACCEPTED_OFFER' OR (TG_OP='UPDATE' AND NEW.quote_kind='ACCEPTED_OFFER') THEN
    RAISE EXCEPTION 'ACCEPTED_OFFER_QUOTE_IMMUTABLE';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stays_quote_accepted_immutable BEFORE UPDATE OR DELETE ON stays_quotes
  FOR EACH ROW EXECUTE FUNCTION stays_quote_reject_accepted_mutation();

ALTER TABLE booking_holds ADD COLUMN quote_id UUID REFERENCES stays_quotes(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX booking_holds_one_per_quote ON booking_holds(quote_id) WHERE quote_id IS NOT NULL;
-- Historical M4 holds can expire/release normally. New holds after this
-- migration must identify a persisted canonical quote. A NOT VALID CHECK
-- still rejects UPDATE of pre-existing unquoted rows, so enforce on INSERT.

CREATE FUNCTION booking_hold_verify_quote_binding() RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE authority RECORD;
BEGIN
  IF NEW.quote_id IS NULL THEN
    RAISE EXCEPTION 'BOOKING_HOLD_QUOTE_REQUIRED';
  END IF;
  SELECT q.quote_kind,q.holder_principal,q.room_type_id,q.check_in_date,q.check_out_date,
    q.expires_at,o.current_accepted_revision,o.public_disposition,q.offer_revision
    INTO authority FROM stays_quotes q JOIN sellable_offers o ON o.id=q.offer_id
    WHERE q.id=NEW.quote_id FOR SHARE OF q,o;
  IF NOT FOUND OR authority.quote_kind<>'ACCEPTED_OFFER' OR
    authority.holder_principal IS DISTINCT FROM NEW.holder_principal OR
    authority.room_type_id IS DISTINCT FROM NEW.room_type_id OR
    authority.check_in_date IS DISTINCT FROM NEW.check_in_date OR
    authority.check_out_date IS DISTINCT FROM NEW.check_out_date OR
    authority.expires_at<=statement_timestamp() OR
    authority.public_disposition<>'ACCEPTED' OR
    authority.current_accepted_revision IS DISTINCT FROM authority.offer_revision THEN
      RAISE EXCEPTION 'BOOKING_HOLD_QUOTE_BINDING_INVALID';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER booking_hold_quote_binding BEFORE INSERT ON booking_holds
  FOR EACH ROW EXECUTE FUNCTION booking_hold_verify_quote_binding();

-- Release/sweeper may change lifecycle timestamps and status, but a quoted
-- hold's principal, itinerary, quantity and commercial binding cannot change.
CREATE FUNCTION booking_hold_guard_quoted_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.quote_id IS NOT NULL OR NEW.quote_id IS NOT NULL) AND
    (OLD.id IS DISTINCT FROM NEW.id OR OLD.quote_id IS DISTINCT FROM NEW.quote_id OR
     OLD.room_type_id IS DISTINCT FROM NEW.room_type_id OR
     OLD.holder_principal IS DISTINCT FROM NEW.holder_principal OR
     OLD.check_in_date IS DISTINCT FROM NEW.check_in_date OR
     OLD.check_out_date IS DISTINCT FROM NEW.check_out_date OR
     OLD.units_held IS DISTINCT FROM NEW.units_held) THEN
    RAISE EXCEPTION 'BOOKING_HOLD_QUOTED_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER booking_hold_quoted_identity BEFORE UPDATE OF id,quote_id,room_type_id,
  holder_principal,check_in_date,check_out_date,units_held ON booking_holds
  FOR EACH ROW EXECUTE FUNCTION booking_hold_guard_quoted_identity();

-- A narrow public-selling capability: no Guest/login receives direct W1
-- offer-table SELECT. The result is usable only while the exact accepted
-- revision and its source facts remain current. Lock the offer pointer so a
-- concurrent staff successor cannot change it before quote/hold commit.
CREATE FUNCTION stays_current_accepted_offer(target_offer UUID,target_revision INT)
RETURNS TABLE(offer_id UUID,listing_id INT,room_type_id INT,offer_revision INT,
  amount_minor BIGINT,currency TEXT,price_basis TEXT,stay_start DATE,stay_end DATE,
  effective_until TIMESTAMPTZ,min_nights INT,max_guests INT,source_hash TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
BEGIN
  RETURN QUERY SELECT o.id,o.listing_id,o.room_type_id,r.revision,r.amount_minor,
    r.currency,r.price_basis,r.stay_start,r.stay_end,r.effective_until,
    r.min_nights,r.max_guests,r.source_hash
  FROM public.sellable_offers o
  JOIN public.sellable_offer_revisions r ON r.offer_id=o.id AND r.revision=target_revision
  JOIN public.listings l ON l.id=o.listing_id AND l.publication_status='published'
  JOIN public.room_types room ON room.id=o.room_type_id AND room.listing_id=o.listing_id
  WHERE o.id=target_offer AND o.public_disposition='ACCEPTED'
    AND o.current_accepted_revision=target_revision
    AND public.sellable_offer_revision_state(o.id,target_revision)='VERIFIED_OFFER_AVAILABLE'
  FOR SHARE OF o;
END $$;
REVOKE ALL ON FUNCTION stays_current_accepted_offer(UUID,INT) FROM PUBLIC;

-- Locate a current accepted room without exposing price. A quote first uses
-- this identity to reconcile expired capacity, then rechecks the complete W1
-- state. An unavailable room must not be stranded by a delayed sweeper.
CREATE FUNCTION stays_current_offer_room(target_offer UUID,target_revision INT)
RETURNS INT LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
  SELECT o.room_type_id FROM public.sellable_offers o
  JOIN public.listings l ON l.id=o.listing_id AND l.publication_status='published'
  JOIN public.room_types r ON r.id=o.room_type_id AND r.listing_id=o.listing_id
  WHERE o.id=target_offer AND o.current_accepted_revision=target_revision
    AND o.public_disposition='ACCEPTED'
  FOR SHARE OF o
$$;
REVOKE ALL ON FUNCTION stays_current_offer_room(UUID,INT) FROM PUBLIC;

-- Capacity rows retain held_units until release/expiry. This function uses the
-- same hold -> ordered inventory lock order as the existing sweeper, but runs
-- inside the quote/hold transaction before a new capacity decision. It can
-- expire any principal's already-expired hold; it cannot release a live hold.
CREATE FUNCTION stays_expire_holds_for_itinerary(target_room INT,target_start DATE,target_end DATE)
RETURNS INT LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET row_security=on AS $$
DECLARE hold_row RECORD;
DECLARE night_row RECORD;
DECLARE expired_count INT := 0;
BEGIN
  IF target_room IS NULL OR target_start IS NULL OR target_end IS NULL OR
    target_end<=target_start OR target_end-target_start>90 THEN
    RAISE EXCEPTION 'INVALID_STAYS_EXPIRY_SCOPE';
  END IF;
  FOR hold_row IN SELECT h.id FROM public.booking_holds h
    WHERE h.room_type_id=target_room AND h.status='ACTIVE'
      AND h.expires_at<=statement_timestamp()
      AND h.check_in_date<target_end AND h.check_out_date>target_start
    ORDER BY h.expires_at,h.id FOR UPDATE
  LOOP
    FOR night_row IN SELECT day.id,day.held_units,n.units
      FROM public.booking_hold_nights n
      JOIN public.inventory_days day ON day.id=n.inventory_day_id
      WHERE n.hold_id=hold_row.id ORDER BY n.stay_date FOR UPDATE OF day
    LOOP
      IF night_row.held_units<night_row.units THEN
        RAISE EXCEPTION 'STAYS_EXPIRED_HOLD_CAPACITY_INVARIANT';
      END IF;
      UPDATE public.inventory_days SET held_units=held_units-night_row.units,
        updated_at=statement_timestamp() WHERE id=night_row.id;
    END LOOP;
    UPDATE public.booking_holds SET status='EXPIRED',released_at=statement_timestamp(),
      release_reason='TTL_EXPIRED' WHERE id=hold_row.id;
    expired_count:=expired_count+1;
  END LOOP;
  RETURN expired_count;
END $$;
REVOKE ALL ON FUNCTION stays_expire_holds_for_itinerary(INT,DATE,DATE) FROM PUBLIC;

-- Principal claims are set transaction-locally by the mounted W2 runtime
-- after it resolves a current account or signed Guest session. Historical
-- unbound rows stay available only to the existing privileged maintenance
-- path; the restricted Guest role sees its own accepted-offer rows alone.
ALTER TABLE stays_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stays_quotes FORCE ROW LEVEL SECURITY;
CREATE POLICY stays_quote_guest_read ON stays_quotes FOR SELECT USING
  (quote_kind='ACCEPTED_OFFER' AND holder_principal=current_setting('app.stays_principal',true));
CREATE POLICY stays_quote_guest_insert ON stays_quotes FOR INSERT WITH CHECK
  (quote_kind='ACCEPTED_OFFER' AND holder_principal=current_setting('app.stays_principal',true));
CREATE POLICY stays_quote_maintenance ON stays_quotes FOR ALL TO current_user
  USING(true) WITH CHECK(true);
ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_holds FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_hold_guest_read ON booking_holds FOR SELECT USING
  (quote_id IS NOT NULL AND holder_principal=current_setting('app.stays_principal',true));
CREATE POLICY booking_hold_guest_insert ON booking_holds FOR INSERT WITH CHECK
  (quote_id IS NOT NULL AND holder_principal=current_setting('app.stays_principal',true));
CREATE POLICY booking_hold_guest_update ON booking_holds FOR UPDATE
  USING(quote_id IS NOT NULL AND holder_principal=current_setting('app.stays_principal',true))
  WITH CHECK(quote_id IS NOT NULL AND holder_principal=current_setting('app.stays_principal',true));
CREATE POLICY booking_hold_maintenance ON booking_holds FOR ALL TO current_user
  USING(true) WITH CHECK(true);
ALTER TABLE booking_hold_nights ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_hold_nights FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_hold_night_guest_read ON booking_hold_nights FOR SELECT USING
  (EXISTS(SELECT 1 FROM booking_holds h WHERE h.id=hold_id
    AND h.holder_principal=current_setting('app.stays_principal',true)));
CREATE POLICY booking_hold_night_guest_insert ON booking_hold_nights FOR INSERT WITH CHECK
  (EXISTS(SELECT 1 FROM booking_holds h WHERE h.id=hold_id
    AND h.holder_principal=current_setting('app.stays_principal',true)));
CREATE POLICY booking_hold_night_maintenance ON booking_hold_nights FOR ALL TO current_user
  USING(true) WITH CHECK(true);

REVOKE ALL ON stays_quotes,booking_holds,booking_hold_nights FROM PUBLIC;
REVOKE ALL ON FUNCTION booking_hold_verify_quote_binding(),
  booking_hold_guard_quoted_identity(),stays_quote_reject_accepted_mutation() FROM PUBLIC;
-- Grants are conditional on a separately provisioned, non-owner restricted
-- LOGIN. Migration never creates a credential or silently falls back to one.
DO $grants$
DECLARE role_name TEXT := 'encho_stays_web';
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND rolcanlogin AND NOT rolsuper
    AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
    AND NOT has_schema_privilege(role_name,'public','CREATE')
    AND NOT has_database_privilege(role_name,current_database(),'CREATE')
    AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='stays_quotes'
      AND pg_has_role((SELECT oid FROM pg_roles WHERE rolname=role_name),c.relowner,'MEMBER')) THEN
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',role_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION stays_current_accepted_offer(UUID,INT) TO %I',role_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION stays_current_offer_room(UUID,INT) TO %I',role_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION stays_expire_holds_for_itinerary(INT,DATE,DATE) TO %I',role_name);
    EXECUTE format('GRANT SELECT,INSERT ON stays_quotes TO %I',role_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON booking_holds TO %I',role_name);
    EXECUTE format('GRANT SELECT,INSERT ON booking_hold_nights TO %I',role_name);
    EXECUTE format('GRANT SELECT,UPDATE(held_units,updated_at) ON inventory_days TO %I',role_name);
    EXECUTE format('GRANT SELECT ON room_types,room_calendar_blocks TO %I',role_name);
    EXECUTE format('GRANT INSERT ON legacy_block_conflict_ledger TO %I',role_name);
    EXECUTE format('GRANT USAGE ON SEQUENCE booking_hold_nights_id_seq,legacy_block_conflict_ledger_id_seq TO %I',role_name);
  END IF;
END $grants$;
