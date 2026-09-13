-- HARVO M2: additive accounting boundary. No legacy balances or rates are migrated.
-- Rollback: stop callers and retain these records. Never delete financial history.
CREATE TABLE marketing_finance_policies (
  policy_id TEXT NOT NULL, version INTEGER NOT NULL CHECK (version > 0), currency TEXT NOT NULL CHECK (currency IN ('INR','USD')),
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'), snapshot JSONB NOT NULL,
  admin_id INTEGER NOT NULL CHECK (admin_id > 0), created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (policy_id,version)
);
CREATE TABLE marketing_finance_quotes (
  id UUID PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES host_marketing_campaigns(id), host_id INTEGER NOT NULL,
  listing_id INTEGER NOT NULL, revision TEXT NOT NULL, currency TEXT NOT NULL CHECK (currency IN ('INR','USD')),
  policy_id TEXT NOT NULL, policy_version INTEGER NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'), snapshot JSONB NOT NULL,
  cost_minor BIGINT NOT NULL CHECK (cost_minor > 0), profit_minor BIGINT NOT NULL CHECK (profit_minor >= 0),
  tax_minor BIGINT NOT NULL CHECK (tax_minor >= 0), total_minor BIGINT NOT NULL CHECK (total_minor > 0),
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (policy_id,policy_version) REFERENCES marketing_finance_policies(policy_id,version),
  CHECK (total_minor::numeric = cost_minor::numeric + profit_minor::numeric + tax_minor::numeric)
);
CREATE INDEX marketing_finance_quotes_campaign ON marketing_finance_quotes(campaign_id,created_at);
CREATE TABLE marketing_finance_accounts (
  host_id INTEGER NOT NULL, currency TEXT NOT NULL CHECK (currency IN ('INR','USD')),
  available_minor BIGINT NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  reserved_minor BIGINT NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  refund_pending_minor BIGINT NOT NULL DEFAULT 0 CHECK (refund_pending_minor >= 0),
  risk_release_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, frozen BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (host_id,currency)
);
CREATE TABLE marketing_finance_captures (
  id UUID PRIMARY KEY, quote_id UUID NOT NULL REFERENCES marketing_finance_quotes(id), host_id INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('STRIPE','RAZORPAY')), account_id TEXT NOT NULL,
  payment_id TEXT NOT NULL, order_id TEXT NOT NULL, currency TEXT NOT NULL, amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  captured_at TIMESTAMPTZ NOT NULL, risk_release_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider,account_id,payment_id), FOREIGN KEY (host_id,currency) REFERENCES marketing_finance_accounts(host_id,currency),
  CHECK (risk_release_at >= captured_at + INTERVAL '24 hours')
);
CREATE TABLE marketing_finance_provider_events (
  provider TEXT NOT NULL, account_id TEXT NOT NULL, event_id TEXT NOT NULL, payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  event_kind TEXT NOT NULL CHECK (event_kind IN ('CAPTURE','REFUND')), object_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider,account_id,event_id)
);
CREATE TABLE marketing_finance_reservations (
  id UUID PRIMARY KEY, quote_id UUID NOT NULL UNIQUE REFERENCES marketing_finance_quotes(id),
  campaign_id INTEGER NOT NULL REFERENCES host_marketing_campaigns(id), host_id INTEGER NOT NULL, revision TEXT NOT NULL, currency TEXT NOT NULL,
  total_minor BIGINT NOT NULL CHECK (total_minor > 0), remaining_minor BIGINT NOT NULL CHECK (remaining_minor >= 0 AND remaining_minor <= total_minor),
  status TEXT NOT NULL CHECK (status IN ('RESERVED','SETTLED','RELEASED')),
  risk_release_at TIMESTAMPTZ NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
  settlement_snapshot JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_id,currency) REFERENCES marketing_finance_accounts(host_id,currency)
);
CREATE TABLE marketing_finance_authorizations (
  id UUID PRIMARY KEY, reservation_id UUID NOT NULL REFERENCES marketing_finance_reservations(id), provider TEXT NOT NULL CHECK (provider IN ('META','GOOGLE')),
  account_id TEXT NOT NULL, media_minor BIGINT NOT NULL CHECK (media_minor > 0), idempotency_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (reservation_id,provider)
);
CREATE TABLE marketing_finance_refunds (
  id UUID PRIMARY KEY, capture_id UUID NOT NULL REFERENCES marketing_finance_captures(id), host_id INTEGER NOT NULL, currency TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0), idempotency_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('REQUESTED','SUCCEEDED','FAILED')), external_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_id,currency) REFERENCES marketing_finance_accounts(host_id,currency)
);
CREATE UNIQUE INDEX marketing_finance_external_refund ON marketing_finance_refunds(external_refund_id) WHERE external_refund_id IS NOT NULL;
CREATE INDEX marketing_finance_captures_quote ON marketing_finance_captures(quote_id);
CREATE INDEX marketing_finance_refunds_capture ON marketing_finance_refunds(capture_id,status);
CREATE TABLE marketing_finance_refund_operations (
  refund_id UUID PRIMARY KEY REFERENCES marketing_finance_refunds(id), host_id INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('STRIPE','RAZORPAY')), account_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL CHECK(state IN ('SENDING','PENDING','SUCCEEDED','FAILED','RECONCILIATION_REQUIRED')),
  external_refund_id TEXT, last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider,account_id,external_refund_id)
);
ALTER TABLE marketing_finance_refund_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_finance_refund_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY marketing_refund_operations_system ON marketing_finance_refund_operations
  USING(current_setting('app.marketing_admin',true)='true') WITH CHECK(current_setting('app.marketing_admin',true)='true');
CREATE TABLE marketing_finance_journals (
  id UUID PRIMARY KEY, operation_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  kind TEXT NOT NULL, host_id INTEGER NOT NULL, campaign_id INTEGER REFERENCES host_marketing_campaigns(id), currency TEXT NOT NULL,
  reference_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_id,currency) REFERENCES marketing_finance_accounts(host_id,currency)
);
CREATE TABLE marketing_finance_lines (
  id BIGSERIAL PRIMARY KEY, journal_id UUID NOT NULL REFERENCES marketing_finance_journals(id),
  account TEXT NOT NULL CHECK (account IN ('GATEWAY_CLEARING','HOST_AVAILABLE','CAMPAIGN_RESERVED','REFUND_PAYABLE','CAMPAIGN_COST_PAYABLE','ENCHO_CAMPAIGN_REVENUE','TAX_PAYABLE','PLATFORM_OVERRUN')),
  side TEXT NOT NULL CHECK (side IN ('DEBIT','CREDIT')), amount_minor BIGINT NOT NULL CHECK (amount_minor > 0)
);
CREATE INDEX marketing_finance_lines_journal ON marketing_finance_lines(journal_id);
CREATE INDEX marketing_finance_journals_host ON marketing_finance_journals(host_id,currency);

CREATE FUNCTION marketing_finance_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'HARVO_FINANCE_IMMUTABLE: append a compensating entry instead'; END; $$;
CREATE TRIGGER marketing_policies_immutable BEFORE UPDATE OR DELETE ON marketing_finance_policies FOR EACH ROW EXECUTE FUNCTION marketing_finance_immutable();
CREATE TRIGGER marketing_quotes_immutable BEFORE UPDATE OR DELETE ON marketing_finance_quotes FOR EACH ROW EXECUTE FUNCTION marketing_finance_immutable();
CREATE TRIGGER marketing_captures_immutable BEFORE UPDATE OR DELETE ON marketing_finance_captures FOR EACH ROW EXECUTE FUNCTION marketing_finance_immutable();
CREATE TRIGGER marketing_provider_events_immutable BEFORE UPDATE OR DELETE ON marketing_finance_provider_events FOR EACH ROW EXECUTE FUNCTION marketing_finance_immutable();
CREATE TRIGGER marketing_authorizations_immutable BEFORE UPDATE OR DELETE ON marketing_finance_authorizations FOR EACH ROW EXECUTE FUNCTION marketing_finance_immutable();
CREATE TRIGGER marketing_journals_immutable BEFORE UPDATE OR DELETE ON marketing_finance_journals FOR EACH ROW EXECUTE FUNCTION marketing_finance_immutable();
CREATE TRIGGER marketing_lines_immutable BEFORE UPDATE OR DELETE ON marketing_finance_lines FOR EACH ROW EXECUTE FUNCTION marketing_finance_immutable();

CREATE FUNCTION marketing_finance_check_journal() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE journal UUID; difference NUMERIC; count_lines BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'marketing_finance_journals' THEN journal := NEW.id; ELSE journal := NEW.journal_id; END IF;
  SELECT count(*),COALESCE(sum(CASE WHEN side='DEBIT' THEN amount_minor::numeric ELSE -amount_minor::numeric END),0)
    INTO count_lines,difference FROM marketing_finance_lines WHERE journal_id=journal;
  IF count_lines < 2 OR difference <> 0 THEN RAISE EXCEPTION 'HARVO_FINANCE_UNBALANCED'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER marketing_journal_balanced AFTER INSERT ON marketing_finance_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION marketing_finance_check_journal();
CREATE CONSTRAINT TRIGGER marketing_lines_balanced AFTER INSERT ON marketing_finance_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION marketing_finance_check_journal();

CREATE FUNCTION marketing_finance_check_account() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE available NUMERIC; reserved NUMERIC; pending NUMERIC; account_row RECORD;
BEGIN
  SELECT * INTO account_row FROM marketing_finance_accounts WHERE host_id=NEW.host_id AND currency=NEW.currency;
  SELECT COALESCE(sum(CASE WHEN l.account='HOST_AVAILABLE' THEN CASE WHEN l.side='CREDIT' THEN l.amount_minor::numeric ELSE -l.amount_minor::numeric END ELSE 0 END),0),
    COALESCE(sum(CASE WHEN l.account='CAMPAIGN_RESERVED' THEN CASE WHEN l.side='CREDIT' THEN l.amount_minor::numeric ELSE -l.amount_minor::numeric END ELSE 0 END),0),
    COALESCE(sum(CASE WHEN l.account='REFUND_PAYABLE' THEN CASE WHEN l.side='CREDIT' THEN l.amount_minor::numeric ELSE -l.amount_minor::numeric END ELSE 0 END),0)
    INTO available,reserved,pending FROM marketing_finance_journals j JOIN marketing_finance_lines l ON l.journal_id=j.id WHERE j.host_id=NEW.host_id AND j.currency=NEW.currency;
  IF account_row.available_minor <> available OR account_row.reserved_minor <> reserved OR account_row.refund_pending_minor <> pending THEN RAISE EXCEPTION 'HARVO_FINANCE_BALANCE_DRIFT'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER marketing_account_reconciled AFTER INSERT OR UPDATE ON marketing_finance_accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION marketing_finance_check_account();
CREATE CONSTRAINT TRIGGER marketing_journal_account_reconciled AFTER INSERT ON marketing_finance_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION marketing_finance_check_account();

-- Trusted server composition sets transaction-local actor context; unset context fails closed.
DO $$ DECLARE tbl TEXT; BEGIN
  FOREACH tbl IN ARRAY ARRAY['marketing_finance_quotes','marketing_finance_accounts','marketing_finance_captures','marketing_finance_reservations','marketing_finance_refunds','marketing_finance_journals'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
    EXECUTE format('CREATE POLICY harvo_finance_tenant ON %I USING (host_id::text = current_setting(''app.current_user_id'',true) OR current_setting(''app.marketing_admin'',true) = ''true'') WITH CHECK (host_id::text = current_setting(''app.current_user_id'',true) OR current_setting(''app.marketing_admin'',true) = ''true'')',tbl);
  END LOOP;
END $$;
ALTER TABLE marketing_finance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_finance_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY harvo_finance_policy_read ON marketing_finance_policies FOR SELECT USING (NULLIF(current_setting('app.current_user_id',true),'') IS NOT NULL);
CREATE POLICY harvo_finance_policy_write ON marketing_finance_policies FOR INSERT WITH CHECK (current_setting('app.marketing_admin',true) = 'true');
ALTER TABLE marketing_finance_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_finance_authorizations FORCE ROW LEVEL SECURITY;
CREATE POLICY harvo_finance_authorization_read ON marketing_finance_authorizations FOR SELECT USING (EXISTS(SELECT 1 FROM marketing_finance_reservations r WHERE r.id=reservation_id));
CREATE POLICY harvo_finance_authorization_write ON marketing_finance_authorizations FOR INSERT WITH CHECK (current_setting('app.marketing_admin',true) = 'true');
ALTER TABLE marketing_finance_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_finance_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY harvo_finance_lines_tenant ON marketing_finance_lines USING (EXISTS(SELECT 1 FROM marketing_finance_journals j WHERE j.id=journal_id)) WITH CHECK (EXISTS(SELECT 1 FROM marketing_finance_journals j WHERE j.id=journal_id));
ALTER TABLE marketing_finance_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_finance_provider_events FORCE ROW LEVEL SECURITY;
CREATE POLICY harvo_finance_events_system ON marketing_finance_provider_events USING (current_setting('app.marketing_admin',true) = 'true') WITH CHECK (current_setting('app.marketing_admin',true) = 'true');
-- Override permissive pre-existing default ACLs. Application/service roles require explicit grants.
REVOKE ALL ON marketing_finance_policies,marketing_finance_quotes,marketing_finance_accounts,
 marketing_finance_captures,marketing_finance_provider_events,marketing_finance_reservations,
 marketing_finance_authorizations,marketing_finance_refunds,marketing_finance_refund_operations,
 marketing_finance_journals,marketing_finance_lines FROM PUBLIC;
