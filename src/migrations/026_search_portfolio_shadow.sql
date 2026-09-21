-- SP3 is an observation store. No financial FK, publication gate or mutation of campaign state.
CREATE TABLE IF NOT EXISTS marketing_campaign_search_targets (
 campaign_id INT NOT NULL,revision INT NOT NULL,host_id INT NOT NULL,
 keyword TEXT NOT NULL CHECK(length(keyword) BETWEEN 1 AND 80),
 normalized_keyword TEXT NOT NULL CHECK(length(normalized_keyword) BETWEEN 1 AND 160),
 match_type TEXT NOT NULL CHECK(match_type IN ('EXACT','PHRASE')),
 PRIMARY KEY(campaign_id,revision,normalized_keyword,match_type),
 FOREIGN KEY(campaign_id,revision) REFERENCES marketing_campaign_revisions(campaign_id,revision)
);
CREATE INDEX IF NOT EXISTS marketing_search_keyword_match ON marketing_campaign_search_targets(normalized_keyword,campaign_id,revision);
CREATE TABLE IF NOT EXISTS marketing_campaign_search_scopes (
 campaign_id INT NOT NULL,revision INT NOT NULL,host_id INT NOT NULL,
 customer_id TEXT NOT NULL CHECK(customer_id ~ '^[0-9]{10}$'),
 account_source TEXT NOT NULL CHECK(account_source IN ('PROVIDER_RESOURCE','CONFIGURED_ACCOUNT')),
 geo_constants TEXT[] NOT NULL CHECK(cardinality(geo_constants) BETWEEN 1 AND 20),
 languages TEXT[] NOT NULL CHECK(cardinality(languages) BETWEEN 1 AND 10),
 geo_mode TEXT NOT NULL CHECK(geo_mode IN ('PRESENCE','PRESENCE_OR_INTEREST')),
 start_date DATE NOT NULL,end_date DATE NOT NULL CHECK(end_date>=start_date),
 input_hash TEXT NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign_id,revision,input_hash),
 FOREIGN KEY(campaign_id,revision) REFERENCES marketing_campaign_revisions(campaign_id,revision)
);
CREATE INDEX IF NOT EXISTS marketing_search_scope_geo ON marketing_campaign_search_scopes USING GIN(geo_constants);
CREATE INDEX IF NOT EXISTS marketing_search_scope_dates ON marketing_campaign_search_scopes(customer_id,start_date,end_date);
CREATE TABLE IF NOT EXISTS marketing_search_conflict_assessments (
 id UUID PRIMARY KEY,campaign_id INT NOT NULL,revision INT NOT NULL,
 analyzer_version TEXT NOT NULL CHECK(analyzer_version='shadow-v1'),
 mode TEXT NOT NULL CHECK(mode='SHADOW_ONLY'),
 input_hash TEXT NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 evidence JSONB NOT NULL CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=262144),
 actor_id INT NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(campaign_id,revision) REFERENCES marketing_campaign_revisions(campaign_id,revision),
 UNIQUE(campaign_id,revision,analyzer_version,input_hash)
);
CREATE INDEX IF NOT EXISTS marketing_shadow_campaign_time ON marketing_search_conflict_assessments(campaign_id,created_at DESC);
CREATE TABLE IF NOT EXISTS marketing_search_conflict_reviews (
 id UUID PRIMARY KEY,assessment_id UUID NOT NULL REFERENCES marketing_search_conflict_assessments(id),
 actor_id INT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 160),
 request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 verdict TEXT NOT NULL CHECK(verdict IN ('CONFIRMED_OVERLAP','FALSE_POSITIVE','INSUFFICIENT_EVIDENCE')),
 note TEXT NOT NULL CHECK(length(note) BETWEEN 20 AND 2000),
 evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 10 AND 255),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(actor_id,request_key)
);
DO $$ DECLARE tbl TEXT; BEGIN
 FOREACH tbl IN ARRAY ARRAY['marketing_campaign_search_targets','marketing_campaign_search_scopes','marketing_search_conflict_assessments','marketing_search_conflict_reviews'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('DROP POLICY IF EXISTS harvo_shadow_admin ON %I',tbl);
  EXECUTE format('CREATE POLICY harvo_shadow_admin ON %I FOR ALL USING(current_setting(''app.marketing_admin'',true)=''true'') WITH CHECK(current_setting(''app.marketing_admin'',true)=''true'')',tbl);
  EXECUTE format('DROP TRIGGER IF EXISTS harvo_shadow_immutable ON %I',tbl);
  EXECUTE format('CREATE TRIGGER harvo_shadow_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation()',tbl);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',tbl);
 END LOOP;
END $$;
