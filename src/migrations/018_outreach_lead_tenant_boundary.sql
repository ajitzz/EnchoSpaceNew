-- The legacy `true OR ...` predicate allowed every database session to read all leads.
ALTER TABLE host_outreach_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_outreach_leads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS host_leads_policy ON host_outreach_leads;
CREATE POLICY host_leads_policy ON host_outreach_leads
  USING (host_id::text = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (host_id::text = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true');
