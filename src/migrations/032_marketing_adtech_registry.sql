-- ADT-1: immutable strategy versions and atomic releases. Executed by the locked runner.
SELECT pg_advisory_xact_lock(82749102);

CREATE FUNCTION marketing_adtech_is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT COALESCE(current_setting('app.marketing_admin',true)='true',false)
 AND EXISTS(SELECT 1 FROM users WHERE id::text=current_setting('app.current_user_id',true) AND role='admin')
$$;

CREATE TABLE marketing_adtech_tier_profiles (
 id SERIAL PRIMARY KEY,
 tier_code TEXT NOT NULL UNIQUE CHECK(tier_code IN ('BUDGET','COMFORT','PREMIUM')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE marketing_adtech_profile_versions (
 id SERIAL PRIMARY KEY,
 profile_id INT NOT NULL REFERENCES marketing_adtech_tier_profiles(id),
 version INT NOT NULL CHECK(version>0),
 config JSONB NOT NULL CHECK(jsonb_typeof(config)='object'),
 min_price_minor BIGINT GENERATED ALWAYS AS ((config->>'minPriceMinor')::bigint) STORED NOT NULL CHECK(min_price_minor>0),
 max_price_minor BIGINT GENERATED ALWAYS AS ((config->>'maxPriceMinor')::bigint) STORED,
 profile_hash TEXT NOT NULL CHECK(profile_hash ~ '^[a-f0-9]{64}$'),
 created_by INT REFERENCES users(id), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(profile_id,version), UNIQUE(id,profile_id),
 CHECK(max_price_minor IS NULL OR max_price_minor>min_price_minor),
 CHECK((config->>'contractVersion'='1' AND config->>'currency'='INR' AND config->>'tier' IN ('BUDGET','COMFORT','PREMIUM')) IS TRUE)
);

CREATE FUNCTION marketing_adtech_validate_profile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE section TEXT; lo NUMERIC; hi NUMERIC;
BEGIN
 NEW.profile_hash:=encode(sha256(convert_to(NEW.config::text,'UTF8')),'hex');
 IF NOT EXISTS(SELECT 1 FROM marketing_adtech_tier_profiles p WHERE p.id=NEW.profile_id AND p.tier_code=NEW.config->>'tier') THEN
   RAISE EXCEPTION 'ADTECH_PROFILE_TIER_MISMATCH';
 END IF;
 FOREACH section IN ARRAY ARRAY['total','daily','cacHypothesis'] LOOP
   IF COALESCE(NEW.config#>>ARRAY['budget',section,'min'],'') !~ '^[1-9][0-9]{0,18}$'
      OR COALESCE(NEW.config#>>ARRAY['budget',section,'max'],'') !~ '^[1-9][0-9]{0,18}$' THEN RAISE EXCEPTION 'ADTECH_BUDGET_INVALID'; END IF;
   lo:=(NEW.config#>>ARRAY['budget',section,'min'])::numeric;hi:=(NEW.config#>>ARRAY['budget',section,'max'])::numeric;
   IF lo>hi OR hi>9223372036854775807 THEN RAISE EXCEPTION 'ADTECH_BUDGET_INVALID'; END IF;
 END LOOP;
 IF jsonb_typeof(NEW.config#>'{ai,minimumScore}') IS DISTINCT FROM 'number'
    OR (NEW.config#>>'{ai,minimumScore}')::numeric NOT BETWEEN 0 AND 10 THEN RAISE EXCEPTION 'ADTECH_SCORE_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_adtech_profile_validation BEFORE INSERT ON marketing_adtech_profile_versions FOR EACH ROW EXECUTE FUNCTION marketing_adtech_validate_profile();

CREATE TABLE marketing_adtech_releases (
 id SERIAL PRIMARY KEY,
 previous_release_id INT REFERENCES marketing_adtech_releases(id),
 created_by INT REFERENCES users(id),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE marketing_adtech_release_members (
 release_id INT NOT NULL REFERENCES marketing_adtech_releases(id),
 profile_id INT NOT NULL REFERENCES marketing_adtech_tier_profiles(id),
 version_id INT NOT NULL,
 PRIMARY KEY(release_id,profile_id),
 FOREIGN KEY(version_id,profile_id) REFERENCES marketing_adtech_profile_versions(id,profile_id)
);
CREATE TABLE marketing_adtech_current_release (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
 release_id INT REFERENCES marketing_adtech_releases(id)
);
INSERT INTO marketing_adtech_current_release(singleton,release_id) VALUES(true,NULL);

CREATE FUNCTION marketing_adtech_validate_release() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n INT; open_count INT; invalid_count INT; tier_order TEXT;
BEGIN
 IF NEW.release_id IS NULL THEN RAISE EXCEPTION 'ADTECH_RELEASE_REQUIRED'; END IF;
 SELECT count(*),count(*) FILTER(WHERE v.max_price_minor IS NULL) INTO n,open_count
 FROM marketing_adtech_release_members m JOIN marketing_adtech_profile_versions v ON v.id=m.version_id WHERE m.release_id=NEW.release_id;
 SELECT count(*) INTO invalid_count FROM (
   SELECT v.max_price_minor,lead(v.min_price_minor) OVER(ORDER BY v.min_price_minor) next_min
   FROM marketing_adtech_release_members m JOIN marketing_adtech_profile_versions v ON v.id=m.version_id WHERE m.release_id=NEW.release_id
 ) ranges WHERE (next_min IS NOT NULL AND max_price_minor IS DISTINCT FROM next_min) OR (next_min IS NULL AND max_price_minor IS NOT NULL);
 IF n<>3 OR open_count<>1 OR invalid_count<>0 THEN RAISE EXCEPTION 'ADTECH_RELEASE_INTERVALS_INVALID'; END IF;
 SELECT string_agg(v.config->>'tier',',' ORDER BY v.min_price_minor) INTO tier_order
 FROM marketing_adtech_release_members m JOIN marketing_adtech_profile_versions v ON v.id=m.version_id WHERE m.release_id=NEW.release_id;
 IF tier_order IS DISTINCT FROM 'BUDGET,COMFORT,PREMIUM' THEN RAISE EXCEPTION 'ADTECH_RELEASE_TIER_ORDER_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM marketing_adtech_releases WHERE id=NEW.release_id AND previous_release_id IS NOT DISTINCT FROM OLD.release_id) THEN RAISE EXCEPTION 'ADTECH_RELEASE_CAS_CONFLICT'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_adtech_release_validation BEFORE UPDATE ON marketing_adtech_current_release FOR EACH ROW EXECUTE FUNCTION marketing_adtech_validate_release();

CREATE TABLE marketing_adtech_strategy_audits (
 id UUID PRIMARY KEY,
 actor_id INT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 160),
 request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 entity_type TEXT NOT NULL CHECK(entity_type IN ('PROFILE','RELEASE','CORRIDOR','INFERENCE')),
 entity_id INT NOT NULL,
 action TEXT NOT NULL,
 previous_state JSONB,
 new_state JSONB NOT NULL,
 result JSONB NOT NULL,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor_id,request_key)
);
CREATE INDEX marketing_adtech_audit_entity ON marketing_adtech_strategy_audits(entity_type,entity_id,created_at DESC);

CREATE FUNCTION marketing_adtech_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ADTECH_IMMUTABLE_EVIDENCE'; END $$;
CREATE TRIGGER marketing_adtech_legacy_audit_immutable BEFORE UPDATE OR DELETE ON admin_audit_logs
 FOR EACH ROW WHEN(OLD.entity_type LIKE 'ADTECH_%') EXECUTE FUNCTION marketing_adtech_immutable();


-- Bootstrap-owned reference data, not executable frontend/backend business defaults.
INSERT INTO marketing_adtech_tier_profiles(tier_code) VALUES('BUDGET'),('COMFORT'),('PREMIUM');
WITH seed AS (SELECT value AS config FROM jsonb_array_elements($profiles$[
 {"contractVersion":1,"tier":"BUDGET","currency":"INR","minPriceMinor":"100000","maxPriceMinor":"400000","budget":{"total":{"min":"150000","max":"250000"},"daily":{"min":"35000","max":"50000"},"cacHypothesis":{"min":"60000","max":"120000"}},"meta":{"apiVersion":"v26.0","objective":"OUTCOME_SALES","conversionEvent":"PURCHASE","optimizationGoal":"OFFSITE_CONVERSIONS","attribution":"1d_click_1d_view","placementMode":"MANUAL","placements":["IG_FEED","FB_FEED"],"ageMin":20,"ageMax":35,"genders":[],"bidStrategy":"LOWEST_COST_WITHOUT_CAP","bidCapMinor":null,"specialAdCategories":[]},"google":{"apiVersion":"v25","bidding":"MAXIMIZE_CONVERSIONS","targetCpaMinor":null,"geoMode":"PRESENCE","matchTypes":["EXACT","PHRASE"],"negativeKeywords":[]},"ai":{"minimumScore":8},"hostOverrides":{"enabled":true,"maxFeeders":10,"minRadiusKm":17,"maxRadiusKm":80}},
 {"contractVersion":1,"tier":"COMFORT","currency":"INR","minPriceMinor":"400000","maxPriceMinor":"700000","budget":{"total":{"min":"400000","max":"600000"},"daily":{"min":"100000","max":"150000"},"cacHypothesis":{"min":"180000","max":"280000"}},"meta":{"apiVersion":"v26.0","objective":"OUTCOME_SALES","conversionEvent":"PURCHASE","optimizationGoal":"OFFSITE_CONVERSIONS","attribution":"7d_click_1d_view","placementMode":"MANUAL","placements":["IG_FEED","FB_FEED"],"ageMin":25,"ageMax":48,"genders":[],"bidStrategy":"LOWEST_COST_WITHOUT_CAP","bidCapMinor":null,"specialAdCategories":[]},"google":{"apiVersion":"v25","bidding":"MAXIMIZE_CONVERSIONS","targetCpaMinor":null,"geoMode":"PRESENCE","matchTypes":["EXACT","PHRASE"],"negativeKeywords":[]},"ai":{"minimumScore":8},"hostOverrides":{"enabled":true,"maxFeeders":10,"minRadiusKm":17,"maxRadiusKm":80}},
 {"contractVersion":1,"tier":"PREMIUM","currency":"INR","minPriceMinor":"700000","maxPriceMinor":null,"budget":{"total":{"min":"1000000","max":"1500000"},"daily":{"min":"200000","max":"300000"},"cacHypothesis":{"min":"400000","max":"800000"}},"meta":{"apiVersion":"v26.0","objective":"OUTCOME_SALES","conversionEvent":"PURCHASE","optimizationGoal":"OFFSITE_CONVERSIONS","attribution":"7d_click_1d_view","placementMode":"MANUAL","placements":["IG_FEED","FB_FEED"],"ageMin":28,"ageMax":58,"genders":[],"bidStrategy":"LOWEST_COST_WITHOUT_CAP","bidCapMinor":null,"specialAdCategories":[]},"google":{"apiVersion":"v25","bidding":"MAXIMIZE_CONVERSIONS","targetCpaMinor":null,"geoMode":"PRESENCE","matchTypes":["EXACT","PHRASE"],"negativeKeywords":[]},"ai":{"minimumScore":8},"hostOverrides":{"enabled":true,"maxFeeders":10,"minRadiusKm":17,"maxRadiusKm":80}}
]$profiles$::jsonb))
INSERT INTO marketing_adtech_profile_versions(profile_id,version,config,reason)
 SELECT p.id,1,s.config,'Founder approved initial tier hypotheses; provider clearance is separate' FROM seed s JOIN marketing_adtech_tier_profiles p ON p.tier_code=s.config->>'tier';
WITH release AS (INSERT INTO marketing_adtech_releases(reason) VALUES('Initial founder tier release; no campaign activation authority') RETURNING id)
INSERT INTO marketing_adtech_release_members SELECT r.id,v.profile_id,v.id FROM release r CROSS JOIN marketing_adtech_profile_versions v;
UPDATE marketing_adtech_current_release SET release_id=(SELECT max(id) FROM marketing_adtech_releases);

-- Install FORCE RLS after owner-only bootstrap rows; runtime never receives bypass privileges.
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['marketing_adtech_tier_profiles','marketing_adtech_profile_versions','marketing_adtech_releases','marketing_adtech_release_members','marketing_adtech_strategy_audits'] LOOP
   EXECUTE format('CREATE TRIGGER adtech_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION marketing_adtech_immutable()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['marketing_adtech_tier_profiles','marketing_adtech_profile_versions','marketing_adtech_releases','marketing_adtech_release_members','marketing_adtech_current_release','marketing_adtech_strategy_audits'] LOOP
   EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
   EXECUTE format('CREATE POLICY adtech_admin_access ON %I USING(marketing_adtech_is_admin()) WITH CHECK(marketing_adtech_is_admin())',t);
   EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
