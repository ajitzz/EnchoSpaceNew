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
    AND request_fingerprint ~ '^[a-f0-9]{64}$' AND source_hash ~ '^[a-f0-9]{64}$'
    AND accepted_nightly_paise > 0 AND price_basis='PER_ROOM_NIGHT'
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

CREATE FUNCTION booking_hold_verify_quote_binding() RETURNS trigger LANGUAGE plpgsql AS $$
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
