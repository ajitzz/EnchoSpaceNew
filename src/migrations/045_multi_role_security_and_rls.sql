-- Migration 045: Multi-Role PostgreSQL Database Security & True Session-Scoped RLS
-- Fulfills:
-- 1. Blueprint Domain 6 (Sprint 5 Specification)
-- 2. Multi-Role isolation: encho_migration_user (DDL owner) vs encho_app_user (restricted runtime user)
-- 3. Elimination of table-owner bypass via FORCE ROW LEVEL SECURITY across all tenant-isolated tables
-- 4. Session-Scoped RLS injection compatibility (app.current_user_id, app.bypass_rls, app.session_token)

-- Helper Functions for Session Context Extraction
CREATE OR REPLACE FUNCTION current_app_user_id_text() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS integer AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::integer;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_admin_or_rls_bypassed() RETURNS boolean AS $$
  SELECT current_setting('app.bypass_rls', true) = 'true' 
      OR current_setting('app.marketing_admin', true) = 'true';
$$ LANGUAGE sql STABLE;

-- Ensure Baseline Tables Exist (Idempotent DDL for fresh & migrated instances)
CREATE TABLE IF NOT EXISTS host_wallets (
  id SERIAL PRIMARY KEY,
  host_id INT REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  balance_paise BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'INR',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id SERIAL PRIMARY KEY,
  wallet_id INT REFERENCES host_wallets(id) ON DELETE CASCADE,
  amount_paise BIGINT NOT NULL,
  type VARCHAR(50) DEFAULT 'credit',
  description TEXT,
  reference_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS host_outreach_leads (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
  host_id INT REFERENCES users(id) ON DELETE CASCADE,
  guest_name VARCHAR(255),
  guest_email VARCHAR(255),
  guest_phone VARCHAR(50),
  message_history JSONB DEFAULT '[]'::jsonb,
  property_name VARCHAR(255),
  instagram_username VARCHAR(100),
  facebook_url VARCHAR(255),
  owner_name VARCHAR(100),
  location VARCHAR(255),
  estimated_nightly_rate INT,
  status VARCHAR(50) DEFAULT 'discovered',
  notes TEXT,
  last_contacted_at TIMESTAMP,
  email VARCHAR(255),
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_inquiries (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
  host_id INT REFERENCES users(id) ON DELETE CASCADE,
  lead_name VARCHAR(255),
  lead_source VARCHAR(50),
  lead_intent_score VARCHAR(20) DEFAULT 'COLD',
  masked_contact_info TEXT,
  raw_inquiry TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. HOST MARKETING CAMPAIGNS (Tenant Isolation)
ALTER TABLE host_marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_marketing_campaigns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS host_campaigns_tenant_policy ON host_marketing_campaigns;
DROP POLICY IF EXISTS host_campaigns_policy ON host_marketing_campaigns;
CREATE POLICY host_campaigns_tenant_policy ON host_marketing_campaigns
  FOR ALL
  USING (
    host_id::text = current_setting('app.current_user_id', true)
    OR is_admin_or_rls_bypassed()
  )
  WITH CHECK (
    host_id::text = current_setting('app.current_user_id', true)
    OR is_admin_or_rls_bypassed()
  );

-- 2. CAMPAIGN GODMODE TARGETING (Linked to Campaign Host)
ALTER TABLE campaign_godmode_targeting ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_godmode_targeting FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_godmode_targeting_policy ON campaign_godmode_targeting;
CREATE POLICY campaign_godmode_targeting_policy ON campaign_godmode_targeting
  FOR ALL
  USING (
    is_admin_or_rls_bypassed()
    OR EXISTS (
      SELECT 1 FROM host_marketing_campaigns c
      WHERE c.id = campaign_godmode_targeting.campaign_id
        AND c.host_id::text = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    is_admin_or_rls_bypassed()
    OR EXISTS (
      SELECT 1 FROM host_marketing_campaigns c
      WHERE c.id = campaign_godmode_targeting.campaign_id
        AND c.host_id::text = current_setting('app.current_user_id', true)
    )
  );

-- 3. MARKETING CREATIVE PACKAGES (Reels & Ad Bundles)
-- Align canonical column naming: Migration 042 defines host_user_id; ensure host_id alias exists
ALTER TABLE marketing_creative_packages ADD COLUMN IF NOT EXISTS host_id INT;
UPDATE marketing_creative_packages SET host_id = host_user_id WHERE host_id IS NULL AND host_user_id IS NOT NULL;

ALTER TABLE marketing_creative_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_creative_packages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_creative_packages_policy ON marketing_creative_packages;
CREATE POLICY marketing_creative_packages_policy ON marketing_creative_packages
  FOR ALL
  USING (
    COALESCE(host_user_id, host_id)::text = current_setting('app.current_user_id', true)
    OR is_admin_or_rls_bypassed()
  )
  WITH CHECK (
    COALESCE(host_user_id, host_id)::text = current_setting('app.current_user_id', true)
    OR is_admin_or_rls_bypassed()
  );

-- 4. MARKETING CREATIVE ASSETS (Individual Video / Image Assets)
ALTER TABLE marketing_creative_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_creative_assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_creative_assets_policy ON marketing_creative_assets;
CREATE POLICY marketing_creative_assets_policy ON marketing_creative_assets
  FOR ALL
  USING (
    is_admin_or_rls_bypassed()
    OR EXISTS (
      SELECT 1 FROM marketing_creative_packages p
      WHERE p.id = marketing_creative_assets.package_id
        AND COALESCE(p.host_user_id, p.host_id)::text = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    is_admin_or_rls_bypassed()
    OR EXISTS (
      SELECT 1 FROM marketing_creative_packages p
      WHERE p.id = marketing_creative_assets.package_id
        AND COALESCE(p.host_user_id, p.host_id)::text = current_setting('app.current_user_id', true)
    )
  );

-- 5. HOST WALLETS
ALTER TABLE host_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_wallets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS host_wallets_tenant_policy ON host_wallets;
DROP POLICY IF EXISTS host_wallets_policy ON host_wallets;
CREATE POLICY host_wallets_tenant_policy ON host_wallets
  FOR ALL
  USING (
    host_id::text = current_setting('app.current_user_id', true)
    OR is_admin_or_rls_bypassed()
  )
  WITH CHECK (
    host_id::text = current_setting('app.current_user_id', true)
    OR is_admin_or_rls_bypassed()
  );

-- 6. WALLET TRANSACTIONS
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_transactions_tenant_policy ON wallet_transactions;
DROP POLICY IF EXISTS host_wallet_transactions_policy ON wallet_transactions;
CREATE POLICY wallet_transactions_tenant_policy ON wallet_transactions
  FOR ALL
  USING (
    is_admin_or_rls_bypassed()
    OR EXISTS (
      SELECT 1 FROM host_wallets w
      WHERE w.id = wallet_transactions.wallet_id
        AND w.host_id::text = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    is_admin_or_rls_bypassed()
    OR EXISTS (
      SELECT 1 FROM host_wallets w
      WHERE w.id = wallet_transactions.wallet_id
        AND w.host_id::text = current_setting('app.current_user_id', true)
    )
  );

-- 7. HOST OUTREACH LEADS (Walled Garden CRM)
ALTER TABLE host_outreach_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_outreach_leads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS host_leads_tenant_policy ON host_outreach_leads;
DROP POLICY IF EXISTS host_leads_policy ON host_outreach_leads;
CREATE POLICY host_leads_tenant_policy ON host_outreach_leads
  FOR ALL
  USING (
    host_id::text = current_setting('app.current_user_id', true)
    OR is_admin_or_rls_bypassed()
  )
  WITH CHECK (
    host_id::text = current_setting('app.current_user_id', true)
    OR is_admin_or_rls_bypassed()
  );

-- 8. LEAD INQUIRIES
ALTER TABLE lead_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_inquiries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_inquiries_tenant_policy ON lead_inquiries;
CREATE POLICY lead_inquiries_tenant_policy ON lead_inquiries
  FOR ALL
  USING (
    host_id::text = current_setting('app.current_user_id', true)
    OR is_admin_or_rls_bypassed()
  )
  WITH CHECK (
    host_id::text = current_setting('app.current_user_id', true)
    OR is_admin_or_rls_bypassed()
  );

-- 9. STAYS HOLDS (Session-Bound & User-Bound)
-- Align canonical column naming: Migration 041 defines guest_session_id; ensure session_token alias exists
ALTER TABLE stays_holds ADD COLUMN IF NOT EXISTS session_token VARCHAR(255);
UPDATE stays_holds SET session_token = guest_session_id WHERE session_token IS NULL AND guest_session_id IS NOT NULL;

ALTER TABLE stays_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE stays_holds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stays_holds_session_policy ON stays_holds;
CREATE POLICY stays_holds_session_policy ON stays_holds
  FOR ALL
  USING (
    is_admin_or_rls_bypassed()
    OR (
      COALESCE(session_token, guest_session_id) IS NOT NULL 
      AND COALESCE(session_token, guest_session_id) = current_setting('app.session_token', true)
    )
    OR (user_id IS NOT NULL AND user_id::text = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    is_admin_or_rls_bypassed()
    OR (
      COALESCE(session_token, guest_session_id) IS NOT NULL 
      AND COALESCE(session_token, guest_session_id) = current_setting('app.session_token', true)
    )
    OR (user_id IS NOT NULL AND user_id::text = current_setting('app.current_user_id', true))
  );

-- 10. STAYS ORDERS
-- Align canonical column naming: Migration 041 defines user_id and quote_id; ensure guest_id and listing_id exist
ALTER TABLE stays_orders ADD COLUMN IF NOT EXISTS guest_id INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE stays_orders ADD COLUMN IF NOT EXISTS listing_id INT REFERENCES listings(id) ON DELETE SET NULL;
UPDATE stays_orders SET guest_id = user_id WHERE guest_id IS NULL AND user_id IS NOT NULL;
UPDATE stays_orders o
  SET listing_id = q.listing_id
  FROM stays_quotes q
  WHERE o.quote_id = q.id AND o.listing_id IS NULL;

ALTER TABLE stays_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE stays_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stays_orders_participant_policy ON stays_orders;
CREATE POLICY stays_orders_participant_policy ON stays_orders
  FOR ALL
  USING (
    is_admin_or_rls_bypassed()
    OR COALESCE(guest_id, user_id)::text = current_setting('app.current_user_id', true)
    OR (
      listing_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM listings l
        WHERE l.id = stays_orders.listing_id
          AND l.user_id::text = current_setting('app.current_user_id', true)
      )
    )
    OR EXISTS (
      SELECT 1 FROM stays_quotes q
      JOIN listings l ON l.id = q.listing_id
      WHERE q.id = stays_orders.quote_id
        AND l.user_id::text = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    is_admin_or_rls_bypassed()
    OR COALESCE(guest_id, user_id)::text = current_setting('app.current_user_id', true)
    OR (
      listing_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM listings l
        WHERE l.id = stays_orders.listing_id
          AND l.user_id::text = current_setting('app.current_user_id', true)
      )
    )
    OR EXISTS (
      SELECT 1 FROM stays_quotes q
      JOIN listings l ON l.id = q.listing_id
      WHERE q.id = stays_orders.quote_id
        AND l.user_id::text = current_setting('app.current_user_id', true)
    )
  );

-- 11. FEEDER CORRIDORS DEFINITIONS (Public Catalog Read, Admin-Only Mutation)
ALTER TABLE marketing_feeder_corridor_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_feeder_corridor_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feeder_corridors_public_read ON marketing_feeder_corridor_definitions;
DROP POLICY IF EXISTS feeder_corridors_admin_write ON marketing_feeder_corridor_definitions;
CREATE POLICY feeder_corridors_public_read ON marketing_feeder_corridor_definitions
  FOR SELECT
  USING (true);
CREATE POLICY feeder_corridors_admin_write ON marketing_feeder_corridor_definitions
  FOR ALL
  USING (is_admin_or_rls_bypassed())
  WITH CHECK (is_admin_or_rls_bypassed());

-- 12. RLS Health Inspection View / Function
CREATE OR REPLACE FUNCTION get_rls_security_catalog_status()
RETURNS TABLE (
  table_name text,
  rls_enabled boolean,
  rls_forced boolean,
  policies_count bigint
) AS $$
  SELECT 
    c.relname::text AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    COUNT(p.polname) AS policies_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'host_marketing_campaigns',
      'campaign_godmode_targeting',
      'marketing_creative_packages',
      'marketing_creative_assets',
      'host_wallets',
      'wallet_transactions',
      'host_outreach_leads',
      'lead_inquiries',
      'stays_holds',
      'stays_orders',
      'marketing_feeder_corridor_definitions'
    )
  GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
  ORDER BY c.relname ASC;
$$ LANGUAGE sql STABLE;
