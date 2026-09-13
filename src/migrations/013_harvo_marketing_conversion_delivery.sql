-- Provider delivery evidence only. Does not create or certify canonical checkout/consent authority.
CREATE TABLE IF NOT EXISTS marketing_conversion_deliveries (
 outbox_id UUID PRIMARY KEY REFERENCES marketing_conversion_outbox(id) ON DELETE RESTRICT,
 host_id INT NOT NULL,
 provider TEXT NOT NULL CHECK(provider IN ('GOOGLE','META')),
 transport TEXT NOT NULL CHECK(transport IN ('GOOGLE_DATA_MANAGER_V1','GOOGLE_ADJUSTMENT_V25','META_CAPI_V26')),
 request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 destination JSONB NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('CLAIMED','PROCESSING','ACCEPTED','REJECTED','UNKNOWN')),
 provider_receipt TEXT CHECK(provider_receipt IS NULL OR provider_receipt ~ '^[A-Za-z0-9_.:-]{1,180}$'),
 error_code TEXT CHECK(error_code IS NULL OR error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
 claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 next_observation_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '30 seconds'
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_conversion_unique_receipt ON marketing_conversion_deliveries(provider,transport,provider_receipt) WHERE provider_receipt IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_conversion_observation_due ON marketing_conversion_deliveries(next_observation_at,outbox_id) WHERE transport='GOOGLE_DATA_MANAGER_V1' AND status='PROCESSING';
CREATE TABLE IF NOT EXISTS marketing_conversion_delivery_events (
 id BIGSERIAL PRIMARY KEY, outbox_id UUID NOT NULL REFERENCES marketing_conversion_deliveries(outbox_id) ON DELETE RESTRICT,
 host_id INT NOT NULL, actor_id INT NOT NULL, event_type TEXT NOT NULL,
 evidence JSONB NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION harvo_conversion_delivery_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.outbox_id,NEW.host_id,NEW.provider,NEW.transport,NEW.request_fingerprint,NEW.destination,NEW.claimed_at)
  IS DISTINCT FROM (OLD.outbox_id,OLD.host_id,OLD.provider,OLD.transport,OLD.request_fingerprint,OLD.destination,OLD.claimed_at)
  OR (OLD.provider_receipt IS NOT NULL AND NEW.provider_receipt IS DISTINCT FROM OLD.provider_receipt)
 THEN RAISE EXCEPTION 'Conversion delivery identity is immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marketing_conversion_delivery_immutable ON marketing_conversion_deliveries;
CREATE TRIGGER marketing_conversion_delivery_immutable BEFORE UPDATE OR DELETE ON marketing_conversion_deliveries FOR EACH ROW EXECUTE FUNCTION harvo_conversion_delivery_immutable();
DROP TRIGGER IF EXISTS marketing_conversion_delivery_events_immutable ON marketing_conversion_delivery_events;
CREATE TRIGGER marketing_conversion_delivery_events_immutable BEFORE UPDATE OR DELETE ON marketing_conversion_delivery_events FOR EACH ROW EXECUTE FUNCTION harvo_measurement_events_immutable();
DO $$ DECLARE tbl TEXT; BEGIN
 FOREACH tbl IN ARRAY ARRAY['marketing_conversion_deliveries','marketing_conversion_delivery_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY harvo_conversion_delivery_read ON %I FOR SELECT USING(host_id::text=current_setting(''app.current_user_id'',true) OR current_setting(''app.marketing_admin'',true)=''true'')',tbl);
  EXECUTE format('CREATE POLICY harvo_conversion_delivery_write ON %I FOR ALL USING(current_setting(''app.marketing_admin'',true)=''true'') WITH CHECK(current_setting(''app.marketing_admin'',true)=''true'')',tbl);
 END LOOP;
END $$;
REVOKE ALL ON marketing_conversion_deliveries,marketing_conversion_delivery_events FROM PUBLIC;
