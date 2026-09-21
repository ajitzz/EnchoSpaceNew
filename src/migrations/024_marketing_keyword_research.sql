-- Read-only keyword research. No foreign key to any financial authorization or publish job.
CREATE TABLE IF NOT EXISTS marketing_keyword_research (
 id UUID PRIMARY KEY,host_id INT NOT NULL REFERENCES users(id),listing_id INT NOT NULL REFERENCES listings(id),
 customer_id TEXT NOT NULL CHECK(customer_id ~ '^[0-9]{10}$'),request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 state TEXT NOT NULL CHECK(state IN ('RUNNING','AVAILABLE','EMPTY','UNAVAILABLE')),
 fence BIGINT NOT NULL CHECK(fence>0),lease_until TIMESTAMPTZ,expires_at TIMESTAMPTZ NOT NULL,
 evidence JSONB,error_code TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(host_id,customer_id,request_hash),
 CHECK(evidence IS NULL OR octet_length(evidence::text)<=262144),
 CHECK((state='RUNNING' AND lease_until IS NOT NULL AND evidence IS NULL AND error_code IS NULL)
  OR (state IN ('AVAILABLE','EMPTY') AND lease_until IS NULL AND evidence IS NOT NULL AND error_code IS NULL)
  OR (state='UNAVAILABLE' AND lease_until IS NULL AND evidence IS NULL AND error_code IS NOT NULL AND error_code ~ '^[A-Z_]{1,100}$'))
);
CREATE INDEX IF NOT EXISTS marketing_keyword_research_expiry ON marketing_keyword_research(expires_at);
CREATE TABLE IF NOT EXISTS marketing_keyword_customer_slots (
 customer_id TEXT PRIMARY KEY CHECK(customer_id ~ '^[0-9]{10}$'),claim_id UUID,
 lease_until TIMESTAMPTZ,next_allowed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((claim_id IS NULL)=(lease_until IS NULL))
);
ALTER TABLE marketing_keyword_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_keyword_research FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_research_read ON marketing_keyword_research;
CREATE POLICY harvo_research_read ON marketing_keyword_research FOR SELECT
 USING(host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.marketing_admin',true)='true');
DROP POLICY IF EXISTS harvo_research_write ON marketing_keyword_research;
CREATE POLICY harvo_research_write ON marketing_keyword_research FOR ALL
 USING(current_setting('app.marketing_admin',true)='true') WITH CHECK(current_setting('app.marketing_admin',true)='true');
ALTER TABLE marketing_keyword_customer_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_keyword_customer_slots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_research_slot_service ON marketing_keyword_customer_slots;
CREATE POLICY harvo_research_slot_service ON marketing_keyword_customer_slots FOR ALL
 USING(current_setting('app.marketing_admin',true)='true') WITH CHECK(current_setting('app.marketing_admin',true)='true');
REVOKE ALL ON marketing_keyword_research,marketing_keyword_customer_slots FROM PUBLIC;
ALTER TABLE marketing_request_limits DROP CONSTRAINT IF EXISTS marketing_request_limits_scope_check;
ALTER TABLE marketing_request_limits ADD CONSTRAINT marketing_request_limits_scope_check CHECK(scope IN ('TARGETING','CAMPAIGN_GUIDANCE','FACT_SNAPSHOT','KEYWORD_RESEARCH'));
