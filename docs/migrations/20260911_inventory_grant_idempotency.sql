-- Staged; apply after inventory_connection_registry. No startup migration.
BEGIN;
ALTER TABLE inventory_connection_grants ADD COLUMN request_key UUID;
ALTER TABLE inventory_connection_grants ADD COLUMN request_hash TEXT;
ALTER TABLE inventory_connection_grants ADD CONSTRAINT inventory_grant_request_pair CHECK (
  (request_key IS NULL AND request_hash IS NULL) OR (request_key IS NOT NULL AND request_hash IS NOT NULL AND request_hash ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX inventory_grant_retry ON inventory_connection_grants(approved_by,request_key) WHERE request_key IS NOT NULL;
COMMIT;
