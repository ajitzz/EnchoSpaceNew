CREATE TABLE IF NOT EXISTS marketing_measurement_consents (
 id UUID PRIMARY KEY, subject_hash TEXT NOT NULL CHECK(subject_hash ~ '^[a-f0-9]{64}$'),
 sequence BIGSERIAL UNIQUE NOT NULL, request_id UUID NOT NULL,
 measurement BOOLEAN NOT NULL, ad_user_data BOOLEAN NOT NULL, personalization BOOLEAN NOT NULL,
 disclosure_version TEXT NOT NULL CHECK(disclosure_version='encho-measurement-v1'),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), UNIQUE(subject_hash,request_id),
 CHECK(measurement OR (NOT ad_user_data AND NOT personalization))
);
CREATE INDEX IF NOT EXISTS marketing_consent_current ON marketing_measurement_consents(subject_hash,sequence DESC);
CREATE TABLE IF NOT EXISTS marketing_attribution_touchpoints (
 event_id UUID PRIMARY KEY, subject_hash TEXT NOT NULL CHECK(subject_hash ~ '^[a-f0-9]{64}$'),
 link_nonce TEXT NOT NULL REFERENCES marketing_attribution_links(nonce),
 consent_id UUID NOT NULL REFERENCES marketing_measurement_consents(id),
 request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS marketing_touchpoint_link ON marketing_attribution_touchpoints(link_nonce,occurred_at);
DO $$ DECLARE tbl TEXT; BEGIN
 FOREACH tbl IN ARRAY ARRAY['marketing_measurement_consents','marketing_attribution_touchpoints'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('DROP POLICY IF EXISTS harvo_attribution_service ON %I',tbl);
  EXECUTE format('CREATE POLICY harvo_attribution_service ON %I FOR ALL USING(current_setting(''app.marketing_admin'',true)=''true'') WITH CHECK(current_setting(''app.marketing_admin'',true)=''true'')',tbl);
  EXECUTE format('DROP TRIGGER IF EXISTS marketing_attribution_immutable ON %I',tbl);
  EXECUTE format('CREATE TRIGGER marketing_attribution_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation()',tbl);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',tbl);
 END LOOP;
END $$;

-- Expiring browser identifiers are separate from append-only consent/attribution evidence.
CREATE TABLE IF NOT EXISTS marketing_measurement_payloads (
 event_id UUID PRIMARY KEY REFERENCES marketing_attribution_touchpoints(event_id),
 subject_hash TEXT NOT NULL CHECK(subject_hash ~ '^[a-f0-9]{64}$'),
 observed_parameters JSONB NOT NULL CHECK(jsonb_typeof(observed_parameters)='object' AND octet_length(observed_parameters::text)<=4096),
 expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at<=now()+interval '30 days')
);
CREATE INDEX IF NOT EXISTS marketing_measurement_payload_expiry ON marketing_measurement_payloads(expires_at,event_id);
CREATE INDEX IF NOT EXISTS marketing_measurement_payload_subject ON marketing_measurement_payloads(subject_hash);
ALTER TABLE marketing_measurement_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_measurement_payloads FORCE ROW LEVEL SECURITY;
CREATE POLICY harvo_measurement_payload_service ON marketing_measurement_payloads FOR ALL
 USING(current_setting('app.marketing_admin',true)='true') WITH CHECK(current_setting('app.marketing_admin',true)='true');
REVOKE ALL ON marketing_measurement_payloads FROM PUBLIC;
