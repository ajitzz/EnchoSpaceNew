SELECT pg_advisory_xact_lock(82749102);
CREATE TABLE marketing_campaign_strategy_bindings (
 campaign_id integer NOT NULL,
 revision integer NOT NULL,
 host_id integer NOT NULL REFERENCES users(id),
 release_id integer NOT NULL REFERENCES marketing_adtech_releases(id),
 profile_version_id integer NOT NULL REFERENCES marketing_adtech_profile_versions(id),
 corridor_version_id integer NOT NULL REFERENCES marketing_destination_corridor_versions(id),
 snapshot jsonb NOT NULL,
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(campaign_id,revision),
 FOREIGN KEY(campaign_id,revision) REFERENCES marketing_campaign_revisions(campaign_id,revision),
 CHECK((snapshot->>'snapshotHash'=snapshot_hash AND (snapshot->>'releaseId')::integer=release_id
  AND (snapshot->>'profileVersionId')::integer=profile_version_id AND (snapshot->>'corridorVersionId')::integer=corridor_version_id) IS TRUE)
);
CREATE INDEX marketing_strategy_host_idx ON marketing_campaign_strategy_bindings(host_id,campaign_id,revision);
ALTER TABLE marketing_campaign_strategy_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaign_strategy_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY adtech_binding_read ON marketing_campaign_strategy_bindings FOR SELECT USING (
 host_id=NULLIF(current_setting('app.current_user_id',true),'')::integer OR marketing_adtech_is_admin());
CREATE POLICY adtech_binding_insert ON marketing_campaign_strategy_bindings FOR INSERT WITH CHECK (
 marketing_adtech_is_admin() AND EXISTS(SELECT 1 FROM marketing_campaign_revisions r WHERE r.campaign_id=marketing_campaign_strategy_bindings.campaign_id AND r.revision=marketing_campaign_strategy_bindings.revision AND r.host_id=marketing_campaign_strategy_bindings.host_id));
CREATE TRIGGER marketing_strategy_immutable BEFORE UPDATE OR DELETE ON marketing_campaign_strategy_bindings FOR EACH ROW EXECUTE FUNCTION marketing_adtech_immutable();
REVOKE ALL ON marketing_campaign_strategy_bindings FROM PUBLIC;
