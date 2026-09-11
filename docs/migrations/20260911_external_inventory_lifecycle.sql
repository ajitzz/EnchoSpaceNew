-- Staged; requires external_inventory_evidence migration. Not applied at startup.
BEGIN;
ALTER TABLE external_inventory_mappings ADD CONSTRAINT external_inventory_mapping_identity
  UNIQUE(id,listing_id,room_id,provider,connection_id,provider_property_id,provider_room_id);
CREATE TABLE external_inventory_current (
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  room_id TEXT NOT NULL,
  mapping_id UUID NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider_property_id TEXT NOT NULL,
  provider_room_id TEXT NOT NULL,
  PRIMARY KEY(listing_id,room_id),
  UNIQUE(provider,connection_id,provider_property_id,provider_room_id),
  FOREIGN KEY(mapping_id,listing_id,room_id,provider,connection_id,provider_property_id,provider_room_id)
    REFERENCES external_inventory_mappings(id,listing_id,room_id,provider,connection_id,provider_property_id,provider_room_id)
);
CREATE TABLE external_inventory_mapping_events (
  id UUID PRIMARY KEY,
  sequence BIGSERIAL UNIQUE NOT NULL,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  room_id TEXT NOT NULL,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK(action IN ('mapped','revoked')),
  previous_mapping_id UUID REFERENCES external_inventory_mappings(id),
  mapping_id UUID REFERENCES external_inventory_mappings(id),
  reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
  request_key UUID NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(actor_id,request_key),
  CHECK((action='mapped' AND mapping_id IS NOT NULL) OR (action='revoked' AND mapping_id IS NULL))
);
CREATE INDEX external_inventory_mapping_event_latest ON external_inventory_mapping_events(listing_id,room_id,sequence DESC);
CREATE TRIGGER external_inventory_mapping_events_immutable BEFORE UPDATE OR DELETE ON external_inventory_mapping_events FOR EACH ROW EXECUTE FUNCTION reject_external_inventory_mutation();
ALTER TABLE external_inventory_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_inventory_current FORCE ROW LEVEL SECURITY;
ALTER TABLE external_inventory_mapping_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_inventory_mapping_events FORCE ROW LEVEL SECURITY;
CREATE POLICY external_inventory_current_read ON external_inventory_current FOR SELECT USING (
  EXISTS(SELECT 1 FROM listings l WHERE l.id=listing_id AND l.user_id::text=current_setting('app.current_user_id',true)) OR current_setting('app.bypass_rls',true)='true');
CREATE POLICY external_inventory_current_write ON external_inventory_current FOR ALL USING(current_setting('app.bypass_rls',true)='true') WITH CHECK(current_setting('app.bypass_rls',true)='true');
CREATE POLICY external_inventory_event_read ON external_inventory_mapping_events FOR SELECT USING (
  EXISTS(SELECT 1 FROM listings l WHERE l.id=listing_id AND l.user_id::text=current_setting('app.current_user_id',true)) OR current_setting('app.bypass_rls',true)='true');
CREATE POLICY external_inventory_event_insert ON external_inventory_mapping_events FOR INSERT WITH CHECK(current_setting('app.bypass_rls',true)='true');
COMMIT;
