-- Migration: 043_worker_daemon_and_circuit_breaker.sql
-- Milestone: Sprint 3 / Phase 3 Milestone 8 & Blueprint Section 7 (Persistent Outbox & Background Worker Daemon)
-- Fulfilling: Blueprint Gap G-03 (Smart Auto-Pause Circuit Breaker), Gap G-11 (Time-Series Rollups), Gap G-18 (Dead Letter Queue & Jitter)
-- Invariants:
--   - Smart Auto-Pause: 100% calendar occupancy automatically transitions active campaigns to CIRCUIT_BREAKER_PAUSED.
--   - Time-series Rollups: Pre-aggregated daily metrics ensure host Dopamine UI loads in <200ms.
--   - Dead Letter Queue: Poisoned outbox events are preserved with error receipts, guaranteeing zero data loss.

CREATE TABLE IF NOT EXISTS marketing_daily_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
  rollup_date DATE NOT NULL,
  impressions INT NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks INT NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  conversions INT NOT NULL DEFAULT 0 CHECK (conversions >= 0),
  spend_paise BIGINT NOT NULL DEFAULT 0 CHECK (spend_paise >= 0),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (campaign_id, rollup_date)
);

CREATE INDEX IF NOT EXISTS idx_marketing_daily_rollups_campaign ON marketing_daily_rollups(campaign_id, rollup_date DESC);

CREATE TABLE IF NOT EXISTS circuit_breaker_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  trigger_reason VARCHAR(100) NOT NULL CHECK (trigger_reason IN ('FULL_OCCUPANCY_100', 'BUDGET_STOP_LOSS_95', 'ADMIN_EMERGENCY_KILL', 'SUSPICIOUS_BOUNCE_RATE')),
  occupancy_ratio DECIMAL(5, 4) DEFAULT 1.0000,
  target_date_start DATE,
  target_date_end DATE,
  previous_status VARCHAR(50) NOT NULL,
  new_status VARCHAR(50) NOT NULL DEFAULT 'CIRCUIT_BREAKER_PAUSED',
  provider_pause_receipt JSONB DEFAULT '{}'::jsonb,
  override_actor_id INT REFERENCES users(id),
  override_reason TEXT,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_campaign ON circuit_breaker_events(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_listing ON circuit_breaker_events(listing_id);

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_queue VARCHAR(100) NOT NULL,
  original_event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempts INT NOT NULL CHECK (attempts >= 0),
  last_error TEXT NOT NULL,
  failed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_dlq_source ON dead_letter_queue(source_queue, resolved);
CREATE INDEX IF NOT EXISTS idx_dlq_failed_at ON dead_letter_queue(failed_at DESC);
