-- Prepared advertising images have independent immutable evidence, not gallery approval.
CREATE TABLE IF NOT EXISTS marketing_creative_derivatives (
 id UUID PRIMARY KEY, ordinal BIGSERIAL UNIQUE NOT NULL,
 host_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 listing_id INT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
 source_asset_id TEXT NOT NULL CHECK(source_asset_id ~ '^[1-9][0-9]*$'),
 request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 180), request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 listing_snapshot JSONB NOT NULL, listing_hash TEXT NOT NULL CHECK(listing_hash ~ '^[a-f0-9]{64}$'),
 format TEXT NOT NULL CHECK(format IN ('SQUARE','PORTRAIT','STORY','LANDSCAPE')),
 state TEXT NOT NULL CHECK(state IN ('QUEUED','PROCESSING','HOST_REVIEW','ADMIN_REVIEW','APPROVED','REJECTED','BLOCKED')),
 attempts INT NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), fence BIGINT NOT NULL DEFAULT 0,
 lease_until TIMESTAMPTZ, next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 source_bytes BYTEA CHECK(source_bytes IS NULL OR octet_length(source_bytes) BETWEEN 1 AND 8388608),
 output_bytes BYTEA CHECK(output_bytes IS NULL OR octet_length(output_bytes) BETWEEN 1 AND 8388608),
 manifest JSONB, manifest_hash TEXT CHECK(manifest_hash IS NULL OR manifest_hash ~ '^[a-f0-9]{64}$'),
 storage_evidence JSONB, cdn_verified_at TIMESTAMPTZ,
 host_confirmation JSONB, admin_review JSONB,
 error_code TEXT CHECK(error_code IS NULL OR error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(host_id,request_key,format),
 CHECK((manifest IS NULL AND manifest_hash IS NULL AND source_bytes IS NULL AND output_bytes IS NULL) OR (manifest IS NOT NULL AND manifest_hash IS NOT NULL AND source_bytes IS NOT NULL AND output_bytes IS NOT NULL)),
 CHECK(state NOT IN ('HOST_REVIEW','ADMIN_REVIEW','APPROVED','REJECTED') OR (manifest IS NOT NULL AND storage_evidence IS NOT NULL AND cdn_verified_at IS NOT NULL)),
 CHECK(state NOT IN ('ADMIN_REVIEW','APPROVED','REJECTED') OR host_confirmation IS NOT NULL),
 CHECK(state NOT IN ('APPROVED','REJECTED') OR admin_review IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS marketing_creative_due ON marketing_creative_derivatives(next_run_at,ordinal) WHERE state IN ('QUEUED','PROCESSING');
CREATE INDEX IF NOT EXISTS marketing_creative_owner_page ON marketing_creative_derivatives(host_id,ordinal DESC);
CREATE TABLE IF NOT EXISTS marketing_creative_events (
 id BIGSERIAL PRIMARY KEY, derivative_id UUID NOT NULL REFERENCES marketing_creative_derivatives(id) ON DELETE RESTRICT,
 host_id INT NOT NULL, actor_id INT NOT NULL, actor_role TEXT NOT NULL, event_type TEXT NOT NULL,
 evidence JSONB NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION harvo_creative_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.id,NEW.ordinal,NEW.host_id,NEW.listing_id,NEW.source_asset_id,NEW.request_key,NEW.request_fingerprint,NEW.listing_snapshot,NEW.listing_hash,NEW.format,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.ordinal,OLD.host_id,OLD.listing_id,OLD.source_asset_id,OLD.request_key,OLD.request_fingerprint,OLD.listing_snapshot,OLD.listing_hash,OLD.format,OLD.created_at)
 OR (OLD.manifest IS NOT NULL AND (NEW.manifest,NEW.manifest_hash,NEW.source_bytes,NEW.output_bytes) IS DISTINCT FROM (OLD.manifest,OLD.manifest_hash,OLD.source_bytes,OLD.output_bytes))
 OR (OLD.storage_evidence IS NOT NULL AND NEW.storage_evidence IS DISTINCT FROM OLD.storage_evidence)
 OR (OLD.host_confirmation IS NOT NULL AND NEW.host_confirmation IS DISTINCT FROM OLD.host_confirmation)
 OR (OLD.admin_review IS NOT NULL AND (NEW.admin_review,NEW.state) IS DISTINCT FROM (OLD.admin_review,OLD.state))
 THEN RAISE EXCEPTION 'Creative evidence is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION harvo_creative_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Creative events are append-only'; END $$;
DROP TRIGGER IF EXISTS marketing_creative_immutable ON marketing_creative_derivatives;
CREATE TRIGGER marketing_creative_immutable BEFORE UPDATE OR DELETE ON marketing_creative_derivatives FOR EACH ROW EXECUTE FUNCTION harvo_creative_immutable();
DROP TRIGGER IF EXISTS marketing_creative_events_immutable ON marketing_creative_events;
CREATE TRIGGER marketing_creative_events_immutable BEFORE UPDATE OR DELETE ON marketing_creative_events FOR EACH ROW EXECUTE FUNCTION harvo_creative_event_immutable();
DO $$ DECLARE tbl TEXT; BEGIN
 FOREACH tbl IN ARRAY ARRAY['marketing_creative_derivatives','marketing_creative_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY harvo_creative_read ON %I FOR SELECT USING(host_id::text=current_setting(''app.current_user_id'',true) OR current_setting(''app.marketing_admin'',true)=''true'')',tbl);
  EXECUTE format('CREATE POLICY harvo_creative_write ON %I FOR ALL USING(current_setting(''app.marketing_admin'',true)=''true'') WITH CHECK(current_setting(''app.marketing_admin'',true)=''true'')',tbl);
 END LOOP;
END $$;
REVOKE ALL ON marketing_creative_derivatives,marketing_creative_events FROM PUBLIC;
