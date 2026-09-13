-- HARVO billing close: additive evidence, dual review and transactionally allocated costs.
-- Rollback stops callers; financial evidence is retained, never rewritten or dropped.
CREATE TABLE marketing_settlement_documents (
 id UUID PRIMARY KEY, kind TEXT NOT NULL, issuer TEXT NOT NULL, account_id TEXT NOT NULL,
 external_document_id TEXT NOT NULL, currency TEXT NOT NULL CHECK(currency IN ('INR','USD')),
 total_minor BIGINT NOT NULL CHECK(total_minor>=0), period_start DATE NOT NULL, period_end DATE NOT NULL,
 issued_at TIMESTAMPTZ NOT NULL, content_type TEXT NOT NULL, content BYTEA NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 5242880),
 content_hash TEXT NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), metadata JSONB NOT NULL,
 uploaded_by INT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(period_end>=period_start),
 UNIQUE(issuer,account_id,kind,external_document_id), UNIQUE(uploaded_by,request_key)
);
CREATE TABLE marketing_settlement_proposals (
 id UUID PRIMARY KEY, campaign_id INT NOT NULL REFERENCES marketing_campaign_workflows(campaign_id),
 host_id INT NOT NULL, revision INT NOT NULL, reservation_id UUID NOT NULL REFERENCES marketing_finance_reservations(id),
 snapshot JSONB NOT NULL, fingerprint TEXT NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 prepared_by INT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK(status IN ('PENDING_REVIEW','APPROVED','REJECTED','SETTLED')),
 settlement_result JSONB,commit_key TEXT,committed_by INT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(prepared_by,request_key),UNIQUE(committed_by,commit_key),
 CHECK((status='SETTLED' AND settlement_result IS NOT NULL AND commit_key IS NOT NULL AND committed_by IS NOT NULL)
    OR (status<>'SETTLED' AND settlement_result IS NULL AND commit_key IS NULL AND committed_by IS NULL))
);
CREATE UNIQUE INDEX marketing_settlement_one_open ON marketing_settlement_proposals(reservation_id) WHERE status IN ('PENDING_REVIEW','APPROVED','SETTLED');
CREATE INDEX marketing_settlement_documents_page ON marketing_settlement_documents(created_at DESC,id DESC);
CREATE INDEX marketing_settlement_proposals_page ON marketing_settlement_proposals(created_at DESC,id DESC);
CREATE TABLE marketing_settlement_reviews (
 id UUID PRIMARY KEY, proposal_id UUID NOT NULL REFERENCES marketing_settlement_proposals(id),
 reviewer_id INT NOT NULL REFERENCES users(id), decision TEXT NOT NULL CHECK(decision IN ('APPROVE','REJECT')),
 evidence JSONB NOT NULL, fingerprint TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(proposal_id)
);
CREATE TABLE marketing_settlement_allocations (
 proposal_id UUID NOT NULL REFERENCES marketing_settlement_proposals(id),
 document_id UUID NOT NULL REFERENCES marketing_settlement_documents(id), cost_code TEXT NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(amount_minor>=0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(proposal_id,document_id,cost_code)
);
CREATE INDEX marketing_settlement_allocation_document ON marketing_settlement_allocations(document_id);
CREATE TRIGGER marketing_settlement_document_immutable BEFORE UPDATE OR DELETE ON marketing_settlement_documents FOR EACH ROW EXECUTE FUNCTION marketing_finance_immutable();
CREATE TRIGGER marketing_settlement_review_immutable BEFORE UPDATE OR DELETE ON marketing_settlement_reviews FOR EACH ROW EXECUTE FUNCTION marketing_finance_immutable();
CREATE TRIGGER marketing_settlement_allocation_immutable BEFORE UPDATE OR DELETE ON marketing_settlement_allocations FOR EACH ROW EXECUTE FUNCTION marketing_finance_immutable();
CREATE FUNCTION harvo_settlement_proposal_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'HARVO_SETTLEMENT_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','settlement_result','commit_key','committed_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','settlement_result','commit_key','committed_by','updated_at']) OR OLD.status IN ('REJECTED','SETTLED') THEN RAISE EXCEPTION 'HARVO_SETTLEMENT_IMMUTABLE'; END IF;
 IF NOT ((OLD.status='PENDING_REVIEW' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status='APPROVED' AND NEW.status IN ('SETTLED','REJECTED'))) THEN RAISE EXCEPTION 'HARVO_SETTLEMENT_STATE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_settlement_proposal_immutable BEFORE UPDATE OR DELETE ON marketing_settlement_proposals FOR EACH ROW EXECUTE FUNCTION harvo_settlement_proposal_guard();
DO $$ DECLARE tbl TEXT; BEGIN
 FOREACH tbl IN ARRAY ARRAY['marketing_settlement_documents','marketing_settlement_proposals','marketing_settlement_reviews','marketing_settlement_allocations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY harvo_settlement_operator ON %I USING(current_setting(''app.marketing_admin'',true)=''true'') WITH CHECK(current_setting(''app.marketing_admin'',true)=''true'')',tbl);
 END LOOP;
END $$;
CREATE POLICY harvo_settlement_host_read ON marketing_settlement_proposals FOR SELECT USING(host_id::text=current_setting('app.current_user_id',true));
REVOKE ALL ON marketing_settlement_documents,marketing_settlement_proposals,marketing_settlement_reviews,marketing_settlement_allocations FROM PUBLIC;
