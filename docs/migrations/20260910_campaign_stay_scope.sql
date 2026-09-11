-- Reviewed deployment only; not applied by server startup.
BEGIN;
ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS stay_scope JSONB;
ALTER TABLE host_marketing_campaigns ADD CONSTRAINT campaign_stay_scope_object
  CHECK (stay_scope IS NULL OR jsonb_typeof(stay_scope) = 'object');
COMMIT;
