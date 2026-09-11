-- Staged only. Requires external inventory evidence/lifecycle migrations.
-- Append-only grants attest business authorization separately from provider access.
BEGIN;
CREATE TABLE inventory_connection_grants (
  id UUID PRIMARY KEY,
  connection_id TEXT NOT NULL CHECK(length(btrim(connection_id)) BETWEEN 1 AND 200),
  provider TEXT NOT NULL CHECK(length(btrim(provider)) BETWEEN 1 AND 200),
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  provider_property_id TEXT NOT NULL CHECK(length(btrim(provider_property_id)) BETWEEN 1 AND 200),
  approved_by INTEGER NOT NULL REFERENCES users(id),
  authorization_reference TEXT NOT NULL CHECK(length(btrim(authorization_reference)) BETWEEN 1 AND 200),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at > approved_at),
  UNIQUE(id,provider_property_id)
);
CREATE TABLE inventory_connection_revocations (
  grant_id UUID PRIMARY KEY REFERENCES inventory_connection_grants(id),
  actor_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE inventory_binding_attestations (
  id UUID PRIMARY KEY,
  grant_id UUID NOT NULL REFERENCES inventory_connection_grants(id),
  provider_property_id TEXT NOT NULL,
  provider_room_id TEXT NOT NULL CHECK(length(btrim(provider_room_id)) BETWEEN 1 AND 200),
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now() CHECK(received_at >= observed_at),
  expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at > received_at AND expires_at <= observed_at + interval '5 minutes'),
  evidence_hash TEXT NOT NULL CHECK(evidence_hash ~ '^[a-f0-9]{64}$'),
  FOREIGN KEY(grant_id,provider_property_id) REFERENCES inventory_connection_grants(id,provider_property_id)
);
CREATE INDEX inventory_connection_grant_lookup ON inventory_connection_grants(connection_id,provider,listing_id,owner_id,provider_property_id);
CREATE INDEX inventory_binding_attestation_lookup ON inventory_binding_attestations(grant_id,provider_room_id,observed_at DESC);
CREATE TRIGGER inventory_connection_grants_immutable BEFORE UPDATE OR DELETE ON inventory_connection_grants FOR EACH ROW EXECUTE FUNCTION reject_external_inventory_mutation();
CREATE TRIGGER inventory_connection_revocations_immutable BEFORE UPDATE OR DELETE ON inventory_connection_revocations FOR EACH ROW EXECUTE FUNCTION reject_external_inventory_mutation();
CREATE TRIGGER inventory_binding_attestations_immutable BEFORE UPDATE OR DELETE ON inventory_binding_attestations FOR EACH ROW EXECUTE FUNCTION reject_external_inventory_mutation();
-- Registry is server-only, not a host-readable credential or verification store.
ALTER TABLE inventory_connection_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_connection_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_connection_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_connection_revocations FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_binding_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_binding_attestations FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_grant_read ON inventory_connection_grants FOR SELECT USING(current_setting('app.bypass_rls',true)='true');
CREATE POLICY inventory_grant_insert ON inventory_connection_grants FOR INSERT WITH CHECK(current_setting('app.bypass_rls',true)='true');
CREATE POLICY inventory_revocation_read ON inventory_connection_revocations FOR SELECT USING(current_setting('app.bypass_rls',true)='true');
CREATE POLICY inventory_revocation_insert ON inventory_connection_revocations FOR INSERT WITH CHECK(current_setting('app.bypass_rls',true)='true');
CREATE POLICY inventory_attestation_read ON inventory_binding_attestations FOR SELECT USING(current_setting('app.bypass_rls',true)='true');
CREATE POLICY inventory_attestation_insert ON inventory_binding_attestations FOR INSERT WITH CHECK(current_setting('app.bypass_rls',true)='true');
COMMIT;
