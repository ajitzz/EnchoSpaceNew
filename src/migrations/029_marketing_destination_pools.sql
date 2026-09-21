-- HARVO-033: collection exposure is not an ad impression or a financial debit.
CREATE TABLE IF NOT EXISTS marketing_destination_pools (
 id UUID PRIMARY KEY, destination TEXT NOT NULL CHECK(destination IN ('wayanad','coorg','goa')),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 100),
 state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','OPEN','ACTIVE','PAUSED','CLOSED')),
 policy_version INTEGER NOT NULL CHECK(policy_version=1), policy JSONB NOT NULL,
 starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
 stay_start DATE NOT NULL, stay_end DATE NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id),
 eligibility_checked_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
 version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at AND ends_at-starts_at<=interval '90 days'), CHECK(stay_end>stay_start AND stay_end-stay_start<=90)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_pool_one_active ON marketing_destination_pools(destination) WHERE state='ACTIVE';
CREATE TABLE IF NOT EXISTS marketing_pool_memberships (
 id UUID PRIMARY KEY, pool_id UUID NOT NULL REFERENCES marketing_destination_pools(id),host_id INT NOT NULL REFERENCES users(id), listing_id INT NOT NULL REFERENCES listings(id),
 state TEXT NOT NULL DEFAULT 'INVITED' CHECK(state IN ('INVITED','CONSENTED','ELIGIBLE','ACTIVE','PAUSED','WITHDRAWN','EXPIRED','INELIGIBLE')),
 campaign_id INT REFERENCES host_marketing_campaigns(id), campaign_revision INT,
 contribution_minor BIGINT CHECK(contribution_minor>=100000),
 fact_hash TEXT CHECK(fact_hash ~ '^[a-f0-9]{64}$'), consent_hash TEXT CHECK(consent_hash ~ '^[a-f0-9]{64}$'),
 quote_id UUID UNIQUE REFERENCES marketing_finance_quotes(id), reservation_id UUID UNIQUE REFERENCES marketing_finance_reservations(id),
 eligibility_checked_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
 version INT NOT NULL DEFAULT 1, rotation_credit NUMERIC(30,0) NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(pool_id,listing_id),
 CHECK((campaign_id IS NULL)=(campaign_revision IS NULL)),CHECK((quote_id IS NULL)=(reservation_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_pool_bound_campaign ON marketing_pool_memberships(campaign_id) WHERE state<>'WITHDRAWN';
CREATE TABLE IF NOT EXISTS marketing_pool_events (
 id UUID PRIMARY KEY,pool_id UUID NOT NULL REFERENCES marketing_destination_pools(id),membership_id UUID REFERENCES marketing_pool_memberships(id),
 host_id INT REFERENCES users(id),actor_id INT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,request_hash TEXT NOT NULL,
 kind TEXT NOT NULL,evidence JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(actor_id,request_key)
);
CREATE TABLE IF NOT EXISTS marketing_pool_exposures (
 id UUID PRIMARY KEY,pool_id UUID NOT NULL REFERENCES marketing_destination_pools(id),membership_id UUID NOT NULL REFERENCES marketing_pool_memberships(id),
 host_id INT NOT NULL REFERENCES users(id),policy_version INT NOT NULL,selection_hash TEXT NOT NULL,
 served_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(policy_version=1)
);
CREATE INDEX IF NOT EXISTS marketing_pool_exposure_summary ON marketing_pool_exposures(membership_id,served_at);
CREATE TABLE IF NOT EXISTS marketing_pool_spend_claims (
 id UUID PRIMARY KEY,pool_id UUID NOT NULL REFERENCES marketing_destination_pools(id),membership_id UUID NOT NULL REFERENCES marketing_pool_memberships(id),
 host_id INT NOT NULL REFERENCES users(id),reservation_id UUID NOT NULL REFERENCES marketing_finance_reservations(id),
 provider TEXT NOT NULL CHECK(provider IN ('META','GOOGLE')),account_id TEXT NOT NULL,operation_key TEXT UNIQUE NOT NULL,
 spend_day DATE NOT NULL,amount_minor BIGINT NOT NULL CHECK(amount_minor>0 AND amount_minor<=1000000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_pool_spend_day ON marketing_pool_spend_claims(pool_id,spend_day);
DO $$ DECLARE tbl TEXT; BEGIN
 FOREACH tbl IN ARRAY ARRAY['marketing_destination_pools','marketing_pool_memberships','marketing_pool_events','marketing_pool_exposures','marketing_pool_spend_claims'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('DROP POLICY IF EXISTS harvo_pool_service ON %I',tbl);
  EXECUTE format('CREATE POLICY harvo_pool_service ON %I FOR ALL USING(current_setting(''app.marketing_admin'',true)=''true'') WITH CHECK(current_setting(''app.marketing_admin'',true)=''true'')',tbl);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',tbl);
 END LOOP;
 FOREACH tbl IN ARRAY ARRAY['marketing_pool_memberships','marketing_pool_events','marketing_pool_exposures','marketing_pool_spend_claims'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS harvo_pool_host_read ON %I',tbl);
  EXECUTE format('CREATE POLICY harvo_pool_host_read ON %I FOR SELECT USING(host_id::text=current_setting(''app.current_user_id'',true))',tbl);
 END LOOP;
 FOREACH tbl IN ARRAY ARRAY['marketing_pool_events','marketing_pool_exposures','marketing_pool_spend_claims'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS marketing_pool_immutable ON %I',tbl);
  EXECUTE format('CREATE TRIGGER marketing_pool_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation()',tbl);
 END LOOP;
END $$;

DROP POLICY IF EXISTS harvo_pool_member_read ON marketing_destination_pools;
CREATE POLICY harvo_pool_member_read ON marketing_destination_pools FOR SELECT USING(EXISTS(SELECT 1 FROM marketing_pool_memberships m WHERE m.pool_id=marketing_destination_pools.id AND m.host_id::text=current_setting('app.current_user_id',true)));
