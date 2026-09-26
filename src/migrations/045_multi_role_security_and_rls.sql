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
ALTER TABLE marketing_creative_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_creative_packages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_creative_packages_policy ON marketing_creative_packages;
CREATE POLICY marketing_creative_packages_policy ON marketing_creative_packages
  FOR ALL
  USING (
    host_id::text = current_setting('app.current_user_id', true)
    OR is_admin_or_rls_bypassed()
  )
  WITH CHECK (
    host_id::text = current_setting('app.current_user_id', true)
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
        AND p.host_id::text = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    is_admin_or_rls_bypassed()
    OR EXISTS (
      SELECT 1 FROM marketing_creative_packages p
      WHERE p.id = marketing_creative_assets.package_id
        AND p.host_id::text = current_setting('app.current_user_id', true)
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
ALTER TABLE stays_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE stays_holds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stays_holds_session_policy ON stays_holds;
CREATE POLICY stays_holds_session_policy ON stays_holds
  FOR ALL
  USING (
    is_admin_or_rls_bypassed()
    OR (session_token IS NOT NULL AND session_token = current_setting('app.session_token', true))
    OR (user_id IS NOT NULL AND user_id::text = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    is_admin_or_rls_bypassed()
    OR (session_token IS NOT NULL AND session_token = current_setting('app.session_token', true))
    OR (user_id IS NOT NULL AND user_id::text = current_setting('app.current_user_id', true))
  );

-- 10. STAYS ORDERS
ALTER TABLE stays_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE stays_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stays_orders_participant_policy ON stays_orders;
CREATE POLICY stays_orders_participant_policy ON stays_orders
  FOR ALL
  USING (
    is_admin_or_rls_bypassed()
    OR guest_id::text = current_setting('app.current_user_id', true)
    OR EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = stays_orders.listing_id
        AND l.user_id::text = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    is_admin_or_rls_bypassed()
    OR guest_id::text = current_setting('app.current_user_id', true)
    OR EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = stays_orders.listing_id
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
