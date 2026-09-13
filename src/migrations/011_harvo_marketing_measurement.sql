-- Canonical measurement only. No migration copies legacy bookings or enables uploads.
CREATE TABLE IF NOT EXISTS marketing_booking_measurements (
 order_id TEXT PRIMARY KEY CHECK(length(order_id) BETWEEN 1 AND 128),
 booking_id TEXT UNIQUE NOT NULL CHECK(length(booking_id) BETWEEN 1 AND 128),
 campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE RESTRICT,
 host_id INT NOT NULL, listing_id INT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
 provider TEXT NOT NULL CHECK(provider IN ('META','GOOGLE')), external_campaign_id TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(currency IN ('INR','USD')),
 captured_minor BIGINT NOT NULL CHECK(captured_minor>0 AND captured_minor<=9007199254740991),
 refunded_minor BIGINT NOT NULL CHECK(refunded_minor>=0 AND refunded_minor<=captured_minor),
 state TEXT NOT NULL CHECK(state IN ('CAPTURED','FULFILLED','CANCELLED','REFUNDED')),
 sequence BIGINT NOT NULL CHECK(sequence>0), canonical_evidence JSONB NOT NULL,
 consent_status TEXT NOT NULL CHECK(consent_status IN ('GRANTED','DENIED','REVOKED')),
 occurred_at TIMESTAMPTZ NOT NULL, verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_booking_measurements_campaign ON marketing_booking_measurements(campaign_id,occurred_at);
CREATE TABLE IF NOT EXISTS marketing_measurement_events (
 event_id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES marketing_booking_measurements(order_id) ON DELETE RESTRICT,
 host_id INT NOT NULL, sequence BIGINT NOT NULL CHECK(sequence>0), fingerprint TEXT NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 evidence JSONB NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(order_id,sequence)
);
CREATE TABLE IF NOT EXISTS marketing_conversion_outbox (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id TEXT NOT NULL REFERENCES marketing_booking_measurements(order_id) ON DELETE RESTRICT,
 host_id INT NOT NULL, provider TEXT NOT NULL CHECK(provider IN ('META','GOOGLE')),
 event_id TEXT NOT NULL REFERENCES marketing_measurement_events(event_id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('PURCHASE','RESTATEMENT','RETRACTION')),
 depends_on UUID REFERENCES marketing_conversion_outbox(id), payload JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DISPATCHING','ACCEPTED','REJECTED','UNKNOWN','SUPPRESSED')),
 attempts INT NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 1),
 provider_receipt TEXT, error_code TEXT, dispatched_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(provider,event_id,kind)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_conversion_one_purchase ON marketing_conversion_outbox(provider,order_id) WHERE kind='PURCHASE';
CREATE INDEX IF NOT EXISTS marketing_conversion_pending ON marketing_conversion_outbox(created_at,id) WHERE status='PENDING';
CREATE OR REPLACE FUNCTION harvo_measurement_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Canonical measurement evidence is append-only'; END $$;
DROP TRIGGER IF EXISTS marketing_measurement_events_immutable ON marketing_measurement_events;
CREATE TRIGGER marketing_measurement_events_immutable BEFORE UPDATE OR DELETE ON marketing_measurement_events FOR EACH ROW EXECUTE FUNCTION harvo_measurement_events_immutable();
CREATE OR REPLACE FUNCTION harvo_conversion_payload_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.id,NEW.order_id,NEW.host_id,NEW.provider,NEW.event_id,NEW.kind,NEW.depends_on,NEW.payload,NEW.created_at)
  IS DISTINCT FROM (OLD.id,OLD.order_id,OLD.host_id,OLD.provider,OLD.event_id,OLD.kind,OLD.depends_on,OLD.payload,OLD.created_at)
 THEN RAISE EXCEPTION 'Conversion dispatch payload is immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marketing_conversion_payload_immutable ON marketing_conversion_outbox;
CREATE TRIGGER marketing_conversion_payload_immutable BEFORE UPDATE OR DELETE ON marketing_conversion_outbox FOR EACH ROW EXECUTE FUNCTION harvo_conversion_payload_immutable();
DO $$ DECLARE tbl TEXT; BEGIN
 FOREACH tbl IN ARRAY ARRAY['marketing_booking_measurements','marketing_measurement_events','marketing_conversion_outbox'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('DROP POLICY IF EXISTS harvo_measurement_read ON %I',tbl);
  EXECUTE format('CREATE POLICY harvo_measurement_read ON %I FOR SELECT USING (host_id::text=current_setting(''app.current_user_id'',true) OR current_setting(''app.marketing_admin'',true)=''true'')',tbl);
  EXECUTE format('DROP POLICY IF EXISTS harvo_measurement_write ON %I',tbl);
  EXECUTE format('CREATE POLICY harvo_measurement_write ON %I FOR ALL USING (current_setting(''app.marketing_admin'',true)=''true'') WITH CHECK (current_setting(''app.marketing_admin'',true)=''true'')',tbl);
 END LOOP;
END $$;
REVOKE ALL ON marketing_booking_measurements,marketing_measurement_events,marketing_conversion_outbox FROM PUBLIC;
