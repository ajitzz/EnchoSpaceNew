-- HARVO v2 is additive. Rollback: stop the v2 worker/routes; retain evidence and balances.
CREATE TABLE IF NOT EXISTS marketing_campaign_workflows (
 campaign_id INT PRIMARY KEY REFERENCES host_marketing_campaigns(id) ON DELETE RESTRICT,
 host_id INT NOT NULL, listing_id INT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
 revision INT NOT NULL CHECK(revision > 0), provider TEXT NOT NULL CHECK(provider IN ('META','GOOGLE')),
 state TEXT NOT NULL CHECK(state IN ('DRAFT','EVALUATING','AI_REJECTED','PENDING_ADMIN','ADMIN_REJECTED','APPROVED','PUBLISH_QUEUED','PROVIDER_PAUSED','ACTIVATION_QUEUED','PROVIDER_REVIEW','LIVE','PAUSE_QUEUED','PAUSED','FAILED','RECONCILIATION_REQUIRED','CANCELLED')),
 draft JSONB NOT NULL, listing_snapshot JSONB NOT NULL, listing_hash TEXT NOT NULL,
 ai JSONB NOT NULL DEFAULT '{"status":"NOT_EVALUATED","score":null,"notes":[]}',
 content_approval JSONB NOT NULL DEFAULT '{"status":"PENDING","revision":null}',
 quote_id UUID, reservation_id UUID, provider_truth JSONB, telemetry JSONB,
 last_error TEXT, risk_release_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_workflows_host_updated ON marketing_campaign_workflows(host_id,updated_at DESC,campaign_id);
CREATE TABLE IF NOT EXISTS marketing_campaign_revisions (
 campaign_id INT NOT NULL REFERENCES marketing_campaign_workflows(campaign_id) ON DELETE RESTRICT,
 revision INT NOT NULL, host_id INT NOT NULL, draft JSONB NOT NULL, listing_snapshot JSONB NOT NULL, listing_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(campaign_id,revision)
);
CREATE TABLE IF NOT EXISTS marketing_workflow_events (
 id BIGSERIAL PRIMARY KEY, campaign_id INT NOT NULL REFERENCES marketing_campaign_workflows(campaign_id) ON DELETE RESTRICT,
 host_id INT NOT NULL, revision INT NOT NULL, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL,
 event_type TEXT NOT NULL, evidence JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_events_campaign_id ON marketing_workflow_events(campaign_id,id DESC);
CREATE OR REPLACE FUNCTION harvo_reject_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'HARVO evidence is append-only'; END $$;
DROP TRIGGER IF EXISTS marketing_revisions_immutable ON marketing_campaign_revisions;
CREATE TRIGGER marketing_revisions_immutable BEFORE UPDATE OR DELETE ON marketing_campaign_revisions FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation();
DROP TRIGGER IF EXISTS marketing_events_immutable ON marketing_workflow_events;
CREATE TRIGGER marketing_events_immutable BEFORE UPDATE OR DELETE ON marketing_workflow_events FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation();

CREATE TABLE IF NOT EXISTS marketing_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id INT REFERENCES marketing_campaign_workflows(campaign_id) ON DELETE RESTRICT,
 revision INT, kind TEXT NOT NULL CHECK(kind IN ('PUBLISH','ACTIVATE','PAUSE','TELEMETRY','PAYMENT','REFUND','META_EVENT','PROTECTION')),
 dedupe_key TEXT UNIQUE NOT NULL, payload JSONB NOT NULL DEFAULT '{}', state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','RUNNING','SUCCEEDED','RETRY','DEAD','RECONCILIATION_REQUIRED')),
 fence BIGINT NOT NULL DEFAULT 0, attempts INT NOT NULL DEFAULT 0, lease_until TIMESTAMPTZ, run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_jobs_ready ON marketing_jobs(run_after,id) WHERE state IN ('PENDING','RETRY');
CREATE TABLE IF NOT EXISTS marketing_ai_attempts (
 id BIGSERIAL PRIMARY KEY, host_id INT NOT NULL, campaign_id INT NOT NULL, revision INT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_ai_host_time ON marketing_ai_attempts(host_id,created_at);
CREATE TABLE IF NOT EXISTS marketing_checkout_attempts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id INT NOT NULL REFERENCES marketing_campaign_workflows(campaign_id), host_id INT NOT NULL,
 quote_id UUID UNIQUE NOT NULL, gateway TEXT NOT NULL CHECK(gateway IN ('STRIPE','RAZORPAY')), state TEXT NOT NULL CHECK(state IN ('REQUESTED','CREATED','RECONCILIATION_REQUIRED','FAILED')),
 external_id TEXT, payment_url TEXT, amount_minor BIGINT NOT NULL CHECK(amount_minor>0), currency TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Only tenant-owned workflow projections are exposed; workers use a separate restricted service role.
DO $$ DECLARE tbl TEXT; BEGIN
 FOREACH tbl IN ARRAY ARRAY['marketing_campaign_workflows','marketing_campaign_revisions','marketing_workflow_events','marketing_checkout_attempts'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('DROP POLICY IF EXISTS harvo_tenant ON %I',tbl);
  EXECUTE format('CREATE POLICY harvo_tenant ON %I USING (host_id::text = current_setting(''app.current_user_id'', true) OR current_setting(''app.marketing_admin'', true) = ''true'') WITH CHECK (host_id::text = current_setting(''app.current_user_id'', true) OR current_setting(''app.marketing_admin'', true) = ''true'')',tbl);
 END LOOP;
END $$;
REVOKE ALL ON marketing_jobs,marketing_ai_attempts FROM PUBLIC;
CREATE TABLE IF NOT EXISTS marketing_commercial_preferences (
 version BIGSERIAL PRIMARY KEY, markup_bps INT NOT NULL CHECK(markup_bps BETWEEN 300 AND 500),
 actor_id INT NOT NULL, reason TEXT NOT NULL CHECK(length(reason)>=10), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON marketing_commercial_preferences FROM PUBLIC;
CREATE TRIGGER marketing_preferences_immutable BEFORE UPDATE OR DELETE ON marketing_commercial_preferences FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation();
CREATE TABLE IF NOT EXISTS marketing_create_requests (
 host_id INT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,campaign_id INT NOT NULL REFERENCES marketing_campaign_workflows(campaign_id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(host_id,request_key)
);
ALTER TABLE marketing_create_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_create_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY harvo_create_tenant ON marketing_create_requests USING(host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.marketing_admin',true)='true') WITH CHECK(host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.marketing_admin',true)='true');
CREATE TRIGGER marketing_create_immutable BEFORE UPDATE OR DELETE ON marketing_create_requests FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation();
ALTER TABLE marketing_campaign_workflows ADD COLUMN IF NOT EXISTS pending_job_id UUID REFERENCES marketing_jobs(id);
