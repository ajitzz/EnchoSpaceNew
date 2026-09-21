-- Recover only a previously COMMITTED pause. Never delete/re-key remote operations.
-- Rollback: disable the recovery endpoint and retain these immutable receipts.
CREATE TABLE IF NOT EXISTS marketing_pause_recoveries (
 id UUID PRIMARY KEY,
 campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id),
 revision INT NOT NULL CHECK (revision > 0),
 actor_id INT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL,
 request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint)=64),
 job_id UUID UNIQUE NOT NULL REFERENCES marketing_jobs(id),
 operation_id INT NOT NULL REFERENCES provider_publishing_transactions(id),
 reason TEXT NOT NULL CHECK (length(reason) BETWEEN 20 AND 1000),
 evidence JSONB NOT NULL,
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (actor_id, request_key)
);
ALTER TABLE marketing_pause_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_pause_recoveries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_pause_recovery_admin ON marketing_pause_recoveries;
CREATE POLICY harvo_pause_recovery_admin ON marketing_pause_recoveries FOR SELECT
 USING (current_setting('app.marketing_admin',true)='true');
DROP POLICY IF EXISTS harvo_pause_recovery_record ON marketing_pause_recoveries;
CREATE POLICY harvo_pause_recovery_record ON marketing_pause_recoveries FOR INSERT
 WITH CHECK (current_setting('app.marketing_admin',true)='true');
DROP TRIGGER IF EXISTS marketing_pause_recovery_immutable ON marketing_pause_recoveries;
CREATE TRIGGER marketing_pause_recovery_immutable BEFORE UPDATE OR DELETE ON marketing_pause_recoveries
 FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation();
REVOKE ALL ON marketing_pause_recoveries FROM PUBLIC;
