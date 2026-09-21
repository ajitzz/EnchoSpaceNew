-- SP1 immutable non-spending product/fact evidence. Rollback disables new routes; retain records.
CREATE TABLE IF NOT EXISTS marketing_fact_snapshots (
 id UUID PRIMARY KEY,
 host_id INT NOT NULL REFERENCES users(id),
 listing_id INT NOT NULL REFERENCES listings(id),
 request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 160),
 request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 fact_hash TEXT NOT NULL CHECK(fact_hash ~ '^[a-f0-9]{64}$'),
 manifest_hash TEXT NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
 projection JSONB NOT NULL CHECK((jsonb_typeof(projection)='object' AND projection ? 'version' AND projection->>'version'='1' AND octet_length(projection::text)<=262144) IS TRUE),
 assets JSONB NOT NULL CHECK(jsonb_typeof(assets)='array' AND jsonb_array_length(assets)<=6),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(host_id,request_key)
);
CREATE INDEX IF NOT EXISTS marketing_fact_listing ON marketing_fact_snapshots(host_id,listing_id,created_at DESC);
ALTER TABLE marketing_fact_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_fact_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_facts_read ON marketing_fact_snapshots;
CREATE POLICY harvo_facts_read ON marketing_fact_snapshots FOR SELECT
 USING(host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.marketing_admin',true)='true');
DROP POLICY IF EXISTS harvo_facts_record ON marketing_fact_snapshots;
CREATE POLICY harvo_facts_record ON marketing_fact_snapshots FOR INSERT
 WITH CHECK((host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.marketing_admin',true)='true')
 AND EXISTS(SELECT 1 FROM listings WHERE id=marketing_fact_snapshots.listing_id AND user_id=marketing_fact_snapshots.host_id AND publication_status='published'));
DROP TRIGGER IF EXISTS marketing_facts_immutable ON marketing_fact_snapshots;
CREATE TRIGGER marketing_facts_immutable BEFORE UPDATE OR DELETE ON marketing_fact_snapshots
 FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation();
REVOKE ALL ON marketing_fact_snapshots FROM PUBLIC;

-- Existing request-limit scope is constrained, extend it explicitly for non-spending captures.
ALTER TABLE marketing_request_limits DROP CONSTRAINT IF EXISTS marketing_request_limits_scope_check;
ALTER TABLE marketing_request_limits ADD CONSTRAINT marketing_request_limits_scope_check CHECK(scope IN ('TARGETING','CAMPAIGN_GUIDANCE','FACT_SNAPSHOT'));
