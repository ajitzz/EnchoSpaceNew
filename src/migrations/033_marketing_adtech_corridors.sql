SELECT pg_advisory_xact_lock(82749102);
CREATE TABLE marketing_destination_corridors (
 id SERIAL PRIMARY KEY,
 destination_key TEXT NOT NULL UNIQUE CHECK(destination_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 160),
 district_name TEXT NOT NULL CHECK(length(district_name) BETWEEN 2 AND 160),
 country TEXT NOT NULL CHECK(country='IN'),
 aliases JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(aliases)='array' AND jsonb_array_length(aliases)<=20),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE marketing_corridor_geography_evidence (
 id TEXT PRIMARY KEY CHECK(id ~ '^[a-f0-9]{64}$'),
 provider TEXT NOT NULL CHECK(provider IN ('META','GOOGLE')),
 evidence JSONB NOT NULL,
 verified_at TIMESTAMPTZ NOT NULL,
 created_by INT NOT NULL REFERENCES users(id),
 CHECK((evidence->>'evidenceHash'=id AND evidence->>'provider'=provider AND evidence->>'country'='IN') IS TRUE)
);
CREATE TABLE marketing_destination_corridor_versions (
 id SERIAL PRIMARY KEY,
 corridor_id INT NOT NULL REFERENCES marketing_destination_corridors(id),
 tier_code TEXT NOT NULL CHECK(tier_code IN ('BUDGET','COMFORT','PREMIUM')),
 provider TEXT NOT NULL CHECK(provider IN ('META','GOOGLE')),
 version INT NOT NULL CHECK(version>0),
 geography JSONB NOT NULL CHECK(jsonb_typeof(geography)='array' AND jsonb_array_length(geography) BETWEEN 2 AND 40),
 snapshot_hash TEXT NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 created_by INT NOT NULL REFERENCES users(id), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(corridor_id,tier_code,provider,version), UNIQUE(id,corridor_id,tier_code,provider)
);
CREATE TABLE marketing_corridor_current_versions (
 corridor_id INT NOT NULL REFERENCES marketing_destination_corridors(id),
 tier_code TEXT NOT NULL,
 provider TEXT NOT NULL,
 version_id INT NOT NULL,
 PRIMARY KEY(corridor_id,tier_code,provider),
 FOREIGN KEY(version_id,corridor_id,tier_code,provider) REFERENCES marketing_destination_corridor_versions(id,corridor_id,tier_code,provider)
);
CREATE INDEX marketing_corridor_country_name ON marketing_destination_corridors(country,lower(name));
CREATE INDEX marketing_corridor_aliases ON marketing_destination_corridors USING gin(aliases);
CREATE INDEX marketing_geo_coordinate_lookup ON marketing_corridor_geography_evidence(provider,(evidence->>'latitude'),(evidence->>'longitude')) WHERE evidence->>'kind' IN ('COORDINATE_RADIUS','PROVIDER_CITY_RADIUS');

CREATE FUNCTION marketing_adtech_validate_corridor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE geo JSONB; exclusions INT:=0; feeders INT:=0;
BEGIN
 FOR geo IN SELECT value FROM jsonb_array_elements(NEW.geography) LOOP
  IF NOT EXISTS(SELECT 1 FROM marketing_corridor_geography_evidence e WHERE e.id=geo->>'evidenceHash' AND e.provider=NEW.provider AND e.evidence=geo) THEN RAISE EXCEPTION 'ADTECH_GEO_EVIDENCE_REQUIRED'; END IF;
  IF geo->>'kind'='PROVIDER_REGION_EXCLUSION' AND geo->>'administrativeLevel'='DISTRICT' THEN exclusions:=exclusions+1; ELSE feeders:=feeders+1; END IF;
 END LOOP;
 IF exclusions=0 OR feeders=0 THEN RAISE EXCEPTION 'EXCLUSION_UNRESOLVED'; END IF;
 IF (SELECT count(DISTINCT value->>'evidenceHash') FROM jsonb_array_elements(NEW.geography))<>jsonb_array_length(NEW.geography) THEN RAISE EXCEPTION 'ADTECH_DUPLICATE_GEOGRAPHY'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_adtech_corridor_validation BEFORE INSERT ON marketing_destination_corridor_versions FOR EACH ROW EXECUTE FUNCTION marketing_adtech_validate_corridor();


-- Only canonical destination identities are seeded. Provider IDs and accepted targeting
-- must come from provider lookup; these seeds do not create a publishable corridor.
INSERT INTO marketing_destination_corridors(destination_key,name,district_name,country,aliases) VALUES
 ('wayanad','Wayanad','Wayanad','IN','["Wayanad"]'),
 ('north-goa','North Goa','North Goa','IN','["North Goa"]'),
 ('south-goa','South Goa','South Goa','IN','["South Goa"]');

-- Install FORCE RLS after owner-only bootstrap rows; runtime never receives bypass privileges.
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['marketing_destination_corridors','marketing_corridor_geography_evidence','marketing_destination_corridor_versions','marketing_corridor_current_versions'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY adtech_admin_access ON %I USING(marketing_adtech_is_admin()) WITH CHECK(marketing_adtech_is_admin())',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
  IF t<>'marketing_corridor_current_versions' THEN
   EXECUTE format('CREATE TRIGGER adtech_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION marketing_adtech_immutable()',t);
  END IF;
 END LOOP;
END $$;
