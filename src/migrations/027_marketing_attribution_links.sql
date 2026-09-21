-- Opaque ad references. No browser identity, consent or booking is inferred here.
CREATE TABLE IF NOT EXISTS marketing_attribution_links (
 nonce TEXT PRIMARY KEY CHECK(nonce ~ '^[A-Za-z0-9_-]{43}$'),
 key_id TEXT NOT NULL CHECK(key_id ~ '^[a-zA-Z0-9_-]{1,24}$'),
 campaign_id INT NOT NULL, revision INT NOT NULL, host_id INT NOT NULL REFERENCES users(id),
 listing_id INT NOT NULL REFERENCES listings(id), provider TEXT NOT NULL CHECK(provider IN ('GOOGLE','META')),
 asset_card TEXT NOT NULL CHECK(asset_card ~ '^(primary|card-[1-4]|sitelink-[1-4])$'),
 canonical_path TEXT NOT NULL CHECK(canonical_path ~ '^/stay/[a-z0-9]+(-[a-z0-9]+)*$'),
 binding_hash TEXT NOT NULL CHECK(binding_hash ~ '^[a-f0-9]{64}$'),
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(campaign_id,revision) REFERENCES marketing_campaign_revisions(campaign_id,revision),
 UNIQUE(campaign_id,revision,asset_card), CHECK(expires_at>created_at)
);
ALTER TABLE marketing_attribution_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_attribution_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_attribution_service ON marketing_attribution_links;
CREATE POLICY harvo_attribution_service ON marketing_attribution_links FOR ALL
 USING(current_setting('app.marketing_admin',true)='true') WITH CHECK(current_setting('app.marketing_admin',true)='true');
DROP TRIGGER IF EXISTS marketing_attribution_links_immutable ON marketing_attribution_links;
CREATE TRIGGER marketing_attribution_links_immutable BEFORE UPDATE OR DELETE ON marketing_attribution_links
 FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation();
REVOKE ALL ON marketing_attribution_links FROM PUBLIC;
