-- STAGED ONLY: validate isolated PostgreSQL, grants and canonical mapping lifecycle first.
-- No automatic startup application. IDs must come from the server, not Host room JSON.
BEGIN;
CREATE TABLE external_inventory_mappings (
  id UUID PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  room_id TEXT NOT NULL CHECK (length(btrim(room_id)) BETWEEN 1 AND 200 AND position(',' IN room_id) = 0),
  provider TEXT NOT NULL CHECK (length(btrim(provider)) BETWEEN 1 AND 200),
  connection_id TEXT NOT NULL CHECK (length(btrim(connection_id)) BETWEEN 1 AND 200),
  provider_property_id TEXT NOT NULL CHECK (length(btrim(provider_property_id)) BETWEEN 1 AND 200),
  provider_room_id TEXT NOT NULL CHECK (length(btrim(provider_room_id)) BETWEEN 1 AND 200),
  verified_by INTEGER NOT NULL REFERENCES users(id),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX external_inventory_mapping_room ON external_inventory_mappings(listing_id, room_id);
CREATE TABLE external_inventory_observations (
  id UUID PRIMARY KEY,
  mapping_id UUID NOT NULL REFERENCES external_inventory_mappings(id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL CHECK (length(btrim(event_id)) BETWEEN 1 AND 200),
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now() CHECK (received_at >= observed_at),
  days JSONB NOT NULL CHECK (jsonb_typeof(days) = 'array' AND jsonb_array_length(days) BETWEEN 1 AND 365),
  UNIQUE (mapping_id, event_id)
);
CREATE INDEX external_inventory_observation_latest ON external_inventory_observations(mapping_id, observed_at DESC, received_at DESC);
CREATE FUNCTION reject_external_inventory_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'External inventory evidence is append-only'; END $$;
CREATE TRIGGER external_inventory_mapping_immutable BEFORE UPDATE OR DELETE ON external_inventory_mappings FOR EACH ROW EXECUTE FUNCTION reject_external_inventory_mutation();
CREATE TRIGGER external_inventory_observation_immutable BEFORE UPDATE OR DELETE ON external_inventory_observations FOR EACH ROW EXECUTE FUNCTION reject_external_inventory_mutation();
ALTER TABLE external_inventory_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_inventory_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE external_inventory_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_inventory_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY external_inventory_mapping_read ON external_inventory_mappings FOR SELECT USING (
  EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.user_id::text = current_setting('app.current_user_id', true))
  OR current_setting('app.bypass_rls', true) = 'true'
);
CREATE POLICY external_inventory_mapping_insert ON external_inventory_mappings FOR INSERT WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY external_inventory_observation_read ON external_inventory_observations FOR SELECT USING (
  EXISTS (SELECT 1 FROM external_inventory_mappings m WHERE m.id = mapping_id)
);
CREATE POLICY external_inventory_observation_insert ON external_inventory_observations FOR INSERT WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
COMMIT;
