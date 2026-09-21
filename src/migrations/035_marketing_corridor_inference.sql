SELECT pg_advisory_xact_lock(82749102);
-- Operational limits are database policy; inference never has publication authority.
CREATE TABLE marketing_corridor_inference_policy (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
 requests_per_host_hour INT NOT NULL CHECK(requests_per_host_hour BETWEEN 1 AND 20),
 calls_per_minute INT NOT NULL CHECK(calls_per_minute BETWEEN 1 AND 60),
 max_attempts INT NOT NULL CHECK(max_attempts BETWEEN 1 AND 10),
 lease_seconds INT NOT NULL CHECK(lease_seconds BETWEEN 120 AND 1200)
);
INSERT INTO marketing_corridor_inference_policy VALUES(true,5,6,5,600);
CREATE TABLE marketing_corridor_inference_jobs (
 id SERIAL PRIMARY KEY,
 location_hash TEXT NOT NULL UNIQUE CHECK(location_hash ~ '^[a-f0-9]{64}$'),
 destination_name TEXT NOT NULL CHECK(length(destination_name) BETWEEN 2 AND 160),
 provider TEXT NOT NULL CHECK(provider IN ('META','GOOGLE')),
 tier_code TEXT NOT NULL CHECK(tier_code IN ('BUDGET','COMFORT','PREMIUM')),
 profile_version_id INT NOT NULL REFERENCES marketing_adtech_profile_versions(id),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','RUNNING','RETRY','DONE','DEAD')),
 attempts INT NOT NULL DEFAULT 0 CHECK(attempts>=0),
 fence INT NOT NULL DEFAULT 0 CHECK(fence>=0),
 lease_until TIMESTAMPTZ,
 available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 last_error TEXT CHECK(last_error ~ '^[A-Z][A-Z0-9_]{0,99}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK((state='RUNNING')=(lease_until IS NOT NULL))
);
CREATE INDEX marketing_inference_ready ON marketing_corridor_inference_jobs(available_at,id) WHERE state IN ('PENDING','RETRY');
CREATE INDEX marketing_inference_lease ON marketing_corridor_inference_jobs(lease_until) WHERE state='RUNNING';
CREATE TABLE marketing_corridor_inference_requests (
 job_id INT NOT NULL REFERENCES marketing_corridor_inference_jobs(id),
 host_id INT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(job_id,host_id)
);
CREATE INDEX marketing_inference_host_rate ON marketing_corridor_inference_requests(host_id,created_at DESC);
CREATE TABLE marketing_corridor_inference_rate (
 minute TIMESTAMPTZ PRIMARY KEY,
 calls INT NOT NULL CHECK(calls>0)
);
CREATE TABLE marketing_corridor_inference_proposals (
 id SERIAL PRIMARY KEY,
 job_id INT NOT NULL UNIQUE REFERENCES marketing_corridor_inference_jobs(id),
 content JSONB NOT NULL CHECK(jsonb_typeof(content)='object'),
 content_hash TEXT NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 state TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(state IN ('PROPOSED','APPROVED','REJECTED')),
 corridor_version_id INT REFERENCES marketing_destination_corridor_versions(id),
 reviewed_by INT REFERENCES users(id),
 reviewed_at TIMESTAMPTZ,
 reason TEXT CHECK(length(reason) BETWEEN 10 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK((state='PROPOSED')=(reviewed_by IS NULL AND reviewed_at IS NULL)),
 CHECK((state='APPROVED')=(corridor_version_id IS NOT NULL))
);
CREATE FUNCTION marketing_inference_preserve_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ADTECH_IMMUTABLE_EVIDENCE'; END IF;
 IF OLD.state<>'PROPOSED' OR NEW.state NOT IN ('APPROVED','REJECTED') OR
   (NEW.id,NEW.job_id,NEW.content,NEW.content_hash,NEW.created_at) IS DISTINCT FROM
   (OLD.id,OLD.job_id,OLD.content,OLD.content_hash,OLD.created_at)
 THEN RAISE EXCEPTION 'ADTECH_IMMUTABLE_EVIDENCE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_inference_proposal_immutable BEFORE UPDATE OR DELETE ON marketing_corridor_inference_proposals FOR EACH ROW EXECUTE FUNCTION marketing_inference_preserve_proposal();
CREATE TRIGGER adtech_immutable BEFORE UPDATE OR DELETE ON marketing_corridor_inference_requests FOR EACH ROW EXECUTE FUNCTION marketing_adtech_immutable();
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['marketing_corridor_inference_policy','marketing_corridor_inference_jobs','marketing_corridor_inference_requests','marketing_corridor_inference_rate','marketing_corridor_inference_proposals'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY adtech_admin_access ON %I USING(marketing_adtech_is_admin()) WITH CHECK(marketing_adtech_is_admin())',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
CREATE POLICY inference_own_request ON marketing_corridor_inference_requests FOR SELECT USING(host_id::text=current_setting('app.current_user_id',true));
-- Hosts receive only a purpose-built status projection, never global jobs or model output.
