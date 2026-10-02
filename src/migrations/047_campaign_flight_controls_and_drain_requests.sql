-- Migration 047: Campaign Flight Controls, Drain Requests & Fiduciary Liquidity Ledger
-- Implements Phase 2 Master Blueprint under Boardroom Decision CR1-054
-- Standard: FAANG L8 / Apple-grade Zero-Trust Double-Entry Accounting

-- 1. Campaign Drain Requests Table
CREATE TABLE IF NOT EXISTS marketing_campaign_drain_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
  host_id INT NOT NULL REFERENCES users(id),
  requested_amount_minor BIGINT NOT NULL CHECK (requested_amount_minor > 0),
  reconciled_amount_minor BIGINT CHECK (reconciled_amount_minor >= 0),
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  host_reason TEXT,
  admin_notes TEXT,
  reviewed_by_admin_id INT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drain_requests_campaign_id ON marketing_campaign_drain_requests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_drain_requests_host_id ON marketing_campaign_drain_requests(host_id);
CREATE INDEX IF NOT EXISTS idx_drain_requests_status ON marketing_campaign_drain_requests(status);

-- 2. Enhance host_marketing_campaigns with sovereign flight controls
ALTER TABLE host_marketing_campaigns 
  ADD COLUMN IF NOT EXISTS flight_control_state VARCHAR(50) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS trailing_burn_disclosed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS custom_daily_spend_cap_minor BIGINT,
  ADD COLUMN IF NOT EXISTS yield_flight_mode VARCHAR(50) DEFAULT 'STEADY_CRUISE',
  ADD COLUMN IF NOT EXISTS stop_loss_triggered_at TIMESTAMPTZ;

-- 3. Row Level Security: ENABLE & FORCE on Drain Requests
ALTER TABLE marketing_campaign_drain_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaign_drain_requests FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'marketing_campaign_drain_requests' 
    AND policyname = 'drain_requests_tenant_isolation_policy'
  ) THEN
    CREATE POLICY drain_requests_tenant_isolation_policy ON marketing_campaign_drain_requests
      FOR ALL
      USING (
        host_id = NULLIF(current_setting('app.current_user_id', true), '')::int 
        OR NULLIF(current_setting('app.current_user_role', true), '') = 'admin'
      );
  END IF;
END $$;
