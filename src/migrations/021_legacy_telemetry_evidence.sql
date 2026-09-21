-- Additive compatibility for existing MetaTelemetrySyncEngine readers/writers.
-- No observation is inferred or backfilled. Rollback keeps nullable evidence columns.
ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS telemetry_source_metadata JSONB;
ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS engagement_synced_at TIMESTAMPTZ;
ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS engagement_source_metadata JSONB;
