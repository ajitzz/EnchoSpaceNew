-- Durable read-only recovery claims. A lease never authorizes remote mutation.
-- Rollback: disable recovery, retain claims and append-only workflow evidence.
CREATE TABLE IF NOT EXISTS marketing_pause_recovery_attempts (
 id UUID PRIMARY KEY,
 campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id),
 revision INT NOT NULL CHECK(revision>0),
 job_id UUID NOT NULL REFERENCES marketing_jobs(id),
 actor_id INT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL,
 request_fingerprint TEXT NOT NULL CHECK(length(request_fingerprint)=64),
 candidate_fingerprint TEXT NOT NULL CHECK(length(candidate_fingerprint)=64),
 state TEXT NOT NULL DEFAULT 'RUNNING' CHECK(state IN ('RUNNING','SUCCEEDED','FAILED','EXPIRED')),
 lease_until TIMESTAMPTZ NOT NULL,
 error_code TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 finished_at TIMESTAMPTZ,
 UNIQUE(actor_id,request_key),
 CHECK(lease_until>created_at),
 CHECK((state='RUNNING' AND finished_at IS NULL AND error_code IS NULL)
    OR (state='SUCCEEDED' AND finished_at IS NOT NULL AND error_code IS NULL)
    OR (state IN ('FAILED','EXPIRED') AND finished_at IS NOT NULL AND error_code IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_pause_recovery_one_reader
 ON marketing_pause_recovery_attempts(job_id) WHERE state='RUNNING';
ALTER TABLE marketing_pause_recovery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_pause_recovery_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_pause_attempt_admin ON marketing_pause_recovery_attempts;
CREATE POLICY harvo_pause_attempt_admin ON marketing_pause_recovery_attempts
 USING(current_setting('app.marketing_admin',true)='true')
 WITH CHECK(current_setting('app.marketing_admin',true)='true');
CREATE OR REPLACE FUNCTION harvo_guard_pause_attempt() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Recovery attempt evidence cannot be deleted'; END IF;
 IF OLD.state<>'RUNNING' OR NEW.state NOT IN ('SUCCEEDED','FAILED','EXPIRED')
   OR (to_jsonb(OLD)-ARRAY['state','error_code','finished_at']) IS DISTINCT FROM
      (to_jsonb(NEW)-ARRAY['state','error_code','finished_at'])
 THEN RAISE EXCEPTION 'Recovery attempt identity and terminal evidence are immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marketing_pause_attempt_guard ON marketing_pause_recovery_attempts;
CREATE TRIGGER marketing_pause_attempt_guard BEFORE UPDATE OR DELETE ON marketing_pause_recovery_attempts
 FOR EACH ROW EXECUTE FUNCTION harvo_guard_pause_attempt();
REVOKE ALL ON marketing_pause_recovery_attempts FROM PUBLIC;
