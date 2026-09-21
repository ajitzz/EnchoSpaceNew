-- Immutable editorial manifests; review decisions are append-only and revocable.
CREATE TABLE IF NOT EXISTS marketing_spatial_stories (
 id UUID PRIMARY KEY,
 listing_id INT NOT NULL REFERENCES listings(id),
 host_id INT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 160),
 request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 manifest_hash TEXT NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
 manifest JSONB NOT NULL CHECK((manifest->>'version'='1' AND jsonb_array_length(manifest->'cards')=4 AND octet_length(manifest::text)<=131072) IS TRUE),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(host_id,request_key)
);
CREATE TABLE IF NOT EXISTS marketing_spatial_story_reviews (
 id UUID PRIMARY KEY,
 story_id UUID NOT NULL REFERENCES marketing_spatial_stories(id),
 host_id INT NOT NULL REFERENCES users(id),
 actor_id INT NOT NULL REFERENCES users(id),
 sequence BIGSERIAL UNIQUE NOT NULL,
 request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 160),
 request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 manifest_hash TEXT NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
 decision TEXT NOT NULL CHECK(decision IN ('APPROVE','REVOKE')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 20 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(actor_id,request_key)
);
CREATE INDEX IF NOT EXISTS marketing_story_listing ON marketing_spatial_stories(listing_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS marketing_story_review_latest ON marketing_spatial_story_reviews(story_id,sequence DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['marketing_spatial_stories','marketing_spatial_story_reviews'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS harvo_story_read ON %I',t);
  EXECUTE format('CREATE POLICY harvo_story_read ON %I FOR SELECT USING(host_id::text=current_setting(''app.current_user_id'',true) OR current_setting(''app.marketing_admin'',true)=''true'')',t);
  EXECUTE format('DROP POLICY IF EXISTS harvo_story_admin ON %I',t);
  EXECUTE format('CREATE POLICY harvo_story_admin ON %I FOR INSERT WITH CHECK(current_setting(''app.marketing_admin'',true)=''true'')',t);
  EXECUTE format('DROP TRIGGER IF EXISTS marketing_story_immutable ON %I',t);
  EXECUTE format('CREATE TRIGGER marketing_story_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation()',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
DROP POLICY IF EXISTS harvo_story_capture ON marketing_spatial_stories;
CREATE POLICY harvo_story_capture ON marketing_spatial_stories FOR INSERT WITH CHECK(
 host_id::text=current_setting('app.current_user_id',true)
 AND EXISTS(SELECT 1 FROM listings WHERE listings.id=marketing_spatial_stories.listing_id AND listings.user_id=marketing_spatial_stories.host_id AND publication_status='published')
 AND (manifest->>'hostId')::text=host_id::text AND (manifest->>'listingId')::text=listing_id::text
);
