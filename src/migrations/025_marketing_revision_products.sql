-- Dedicated revision identity; pooled funding has a separate, not-yet-enabled contract.
CREATE TABLE IF NOT EXISTS marketing_revision_products (
 campaign_id INT NOT NULL,
 revision INT NOT NULL,
 host_id INT NOT NULL REFERENCES users(id),
 listing_id INT NOT NULL REFERENCES listings(id),
 kind TEXT NOT NULL CHECK(kind='DEDICATED_STAY'),
 fact_snapshot_id UUID NOT NULL REFERENCES marketing_fact_snapshots(id),
 contract JSONB NOT NULL CHECK((jsonb_typeof(contract)='object' AND contract ?& ARRAY['version','kind','listingId','factSnapshotId','factHash','canonicalPath']
  AND contract->>'version'='1' AND contract->>'kind'=kind AND contract->>'listingId'=listing_id::text
  AND contract->>'factSnapshotId'=fact_snapshot_id::text AND contract->>'factHash' ~ '^[a-f0-9]{64}$'
  AND contract->>'canonicalPath' ~ '^/stay/[a-z0-9]+(-[a-z0-9]+)*$' AND octet_length(contract::text)<=2048) IS TRUE),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign_id,revision),
 FOREIGN KEY(campaign_id,revision) REFERENCES marketing_campaign_revisions(campaign_id,revision)
);
ALTER TABLE marketing_revision_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_revision_products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_product_read ON marketing_revision_products;
CREATE POLICY harvo_product_read ON marketing_revision_products FOR SELECT
 USING(host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.marketing_admin',true)='true');
DROP POLICY IF EXISTS harvo_product_record ON marketing_revision_products;
CREATE POLICY harvo_product_record ON marketing_revision_products FOR INSERT
 WITH CHECK((host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.marketing_admin',true)='true')
 AND EXISTS(SELECT 1 FROM marketing_fact_snapshots f WHERE f.id=fact_snapshot_id AND f.host_id=marketing_revision_products.host_id AND f.listing_id=marketing_revision_products.listing_id AND f.fact_hash=contract->>'factHash' AND f.projection->>'canonicalPath'=contract->>'canonicalPath')
 AND EXISTS(SELECT 1 FROM marketing_campaign_revisions r WHERE r.campaign_id=marketing_revision_products.campaign_id AND r.revision=marketing_revision_products.revision AND r.host_id=marketing_revision_products.host_id AND r.listing_snapshot->'marketingProduct'=contract));
DROP TRIGGER IF EXISTS marketing_product_immutable ON marketing_revision_products;
CREATE TRIGGER marketing_product_immutable BEFORE UPDATE OR DELETE ON marketing_revision_products
 FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation();
REVOKE ALL ON marketing_revision_products FROM PUBLIC;
