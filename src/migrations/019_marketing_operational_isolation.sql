-- Additive operational isolation; keep original job, quote and attempt identities.
-- Apply before deploying the matching worker/service composition. Never drop RLS
-- or erase job/attempt evidence as rollback; disable dispatch if rollback is needed.
ALTER TABLE marketing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_jobs_read ON marketing_jobs;
CREATE POLICY harvo_jobs_read ON marketing_jobs FOR SELECT USING (
 current_setting('app.marketing_admin',true)='true' OR EXISTS (
  SELECT 1 FROM marketing_campaign_workflows w WHERE w.campaign_id=marketing_jobs.campaign_id
  AND w.host_id::text=current_setting('app.current_user_id',true)
 )
);
DROP POLICY IF EXISTS harvo_jobs_enqueue ON marketing_jobs;
CREATE POLICY harvo_jobs_enqueue ON marketing_jobs FOR INSERT WITH CHECK (
 current_setting('app.marketing_admin',true)='true' OR (
  state='PENDING' AND attempts=0 AND fence=0 AND lease_until IS NULL AND last_error IS NULL
  AND kind IN ('PUBLISH','ACTIVATE','PAUSE','TELEMETRY','REFUND','PROTECTION') AND EXISTS (
   SELECT 1 FROM marketing_campaign_workflows w WHERE w.campaign_id=marketing_jobs.campaign_id
   AND w.revision=marketing_jobs.revision AND w.host_id::text=current_setting('app.current_user_id',true)
  )
 )
);
DROP POLICY IF EXISTS harvo_jobs_worker ON marketing_jobs;
CREATE POLICY harvo_jobs_worker ON marketing_jobs FOR UPDATE
 USING (current_setting('app.marketing_admin',true)='true')
 WITH CHECK (current_setting('app.marketing_admin',true)='true');
-- No DELETE policy: recovery and retries retain their original evidence.

ALTER TABLE marketing_ai_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_ai_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_ai_attempts_read ON marketing_ai_attempts;
CREATE POLICY harvo_ai_attempts_read ON marketing_ai_attempts FOR SELECT USING (
 host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.marketing_admin',true)='true'
);
DROP POLICY IF EXISTS harvo_ai_attempts_record ON marketing_ai_attempts;
CREATE POLICY harvo_ai_attempts_record ON marketing_ai_attempts FOR INSERT WITH CHECK (
 current_setting('app.marketing_admin',true)='true' OR (
  host_id::text=current_setting('app.current_user_id',true) AND EXISTS (
   SELECT 1 FROM marketing_campaign_workflows w WHERE w.campaign_id=marketing_ai_attempts.campaign_id
   AND w.host_id=marketing_ai_attempts.host_id AND w.revision=marketing_ai_attempts.revision
  )
 )
);
DROP TRIGGER IF EXISTS marketing_ai_attempts_immutable ON marketing_ai_attempts;
CREATE TRIGGER marketing_ai_attempts_immutable BEFORE UPDATE OR DELETE ON marketing_ai_attempts
 FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation();

ALTER TABLE marketing_commercial_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_commercial_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_preferences_read ON marketing_commercial_preferences;
CREATE POLICY harvo_preferences_read ON marketing_commercial_preferences FOR SELECT
 USING (current_setting('app.marketing_admin',true)='true');
DROP POLICY IF EXISTS harvo_preferences_record ON marketing_commercial_preferences;
CREATE POLICY harvo_preferences_record ON marketing_commercial_preferences FOR INSERT
 WITH CHECK (current_setting('app.marketing_admin',true)='true');
REVOKE ALL ON marketing_jobs,marketing_ai_attempts,marketing_commercial_preferences FROM PUBLIC;
