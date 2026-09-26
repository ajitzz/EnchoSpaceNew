-- Migration 046: Canary Execution Registry, Audit Log & Live Pilot Certification
-- Enforces FAANG L7/L8 Zero-Trust deployment invariants for Package P8.3 (CANARY-01 Gate & Sprint 6)

-- 1. Platform Audit Log (Transactional Outbox for Compliance & System Audits)
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id VARCHAR(100) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  actor_id VARCHAR(100) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'COMMITTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_log_aggregate ON platform_audit_log(aggregate_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_event_type ON platform_audit_log(event_type);

-- 2. Canary Execution Registry
CREATE TABLE IF NOT EXISTS canary_execution_registry (
  id VARCHAR(100) PRIMARY KEY,
  listing_id VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('META_ADS', 'GOOGLE_ADS')),
  remote_campaign_id VARCHAR(100) NOT NULL,
  campaign_status VARCHAR(50) NOT NULL DEFAULT 'PAUSED' CHECK (campaign_status = 'PAUSED'),
  daily_budget_paise BIGINT NOT NULL DEFAULT 0 CHECK (daily_budget_paise = 0),
  operator_id VARCHAR(100) NOT NULL,
  idempotency_key VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'READBACK_VERIFIED', 'AUDITED', 'FAILED')),
  verification_receipt JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canary_registry_listing ON canary_execution_registry(listing_id);
CREATE INDEX IF NOT EXISTS idx_canary_registry_provider ON canary_execution_registry(provider);

-- 3. Canary Readback Verifications (Exact Match Logging)
CREATE TABLE IF NOT EXISTS canary_readback_verifications (
  id VARCHAR(100) PRIMARY KEY,
  canary_id VARCHAR(100) NOT NULL REFERENCES canary_execution_registry(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  remote_campaign_id VARCHAR(100) NOT NULL,
  remote_status VARCHAR(50) NOT NULL,
  remote_daily_budget_paise BIGINT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  exact_match BOOLEAN NOT NULL DEFAULT FALSE,
  raw_provider_response JSONB DEFAULT '{}'::jsonb,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canary_readback_canary_id ON canary_readback_verifications(canary_id);

-- 4. Row-Level Security: ENABLE & FORCE on Canary Tables
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_log FORCE ROW LEVEL SECURITY;

ALTER TABLE canary_execution_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE canary_execution_registry FORCE ROW LEVEL SECURITY;

ALTER TABLE canary_readback_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE canary_readback_verifications FORCE ROW LEVEL SECURITY;

-- 5. Strict Policies: Only Admin or Bypass Context Can Access Canary Systems
DROP POLICY IF EXISTS platform_audit_log_admin_policy ON platform_audit_log;
CREATE POLICY platform_audit_log_admin_policy ON platform_audit_log
FOR ALL
USING (
  NULLIF(current_setting('app.bypass_rls', true), '') = 'true'
  OR NULLIF(current_setting('app.current_user_role', true), '') = 'admin'
)
WITH CHECK (
  NULLIF(current_setting('app.bypass_rls', true), '') = 'true'
  OR NULLIF(current_setting('app.current_user_role', true), '') = 'admin'
);

DROP POLICY IF EXISTS canary_execution_registry_admin_policy ON canary_execution_registry;
CREATE POLICY canary_execution_registry_admin_policy ON canary_execution_registry
FOR ALL
USING (
  NULLIF(current_setting('app.bypass_rls', true), '') = 'true'
  OR NULLIF(current_setting('app.current_user_role', true), '') = 'admin'
)
WITH CHECK (
  NULLIF(current_setting('app.bypass_rls', true), '') = 'true'
  OR NULLIF(current_setting('app.current_user_role', true), '') = 'admin'
);

DROP POLICY IF EXISTS canary_readback_verifications_admin_policy ON canary_readback_verifications;
CREATE POLICY canary_readback_verifications_admin_policy ON canary_readback_verifications
FOR ALL
USING (
  NULLIF(current_setting('app.bypass_rls', true), '') = 'true'
  OR NULLIF(current_setting('app.current_user_role', true), '') = 'admin'
)
WITH CHECK (
  NULLIF(current_setting('app.bypass_rls', true), '') = 'true'
  OR NULLIF(current_setting('app.current_user_role', true), '') = 'admin'
);
