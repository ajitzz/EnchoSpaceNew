-- Shared bounded metadata/AI request budgets. No campaign or money authority is created.
CREATE TABLE IF NOT EXISTS marketing_request_limits (
 host_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scope TEXT NOT NULL CHECK(scope IN ('TARGETING','CAMPAIGN_GUIDANCE')),
 bucket TIMESTAMPTZ NOT NULL,
 attempts INT NOT NULL CHECK(attempts BETWEEN 1 AND 1000),
 PRIMARY KEY(host_id,scope,bucket)
);
ALTER TABLE marketing_request_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_request_limits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_request_limit_owner ON marketing_request_limits;
CREATE POLICY harvo_request_limit_owner ON marketing_request_limits FOR ALL
 USING(host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.marketing_admin',true)='true')
 WITH CHECK(host_id::text=current_setting('app.current_user_id',true) OR current_setting('app.marketing_admin',true)='true');
REVOKE ALL ON marketing_request_limits FROM PUBLIC;
