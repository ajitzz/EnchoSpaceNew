-- Durable read intent and original Google monthly response, never a synthetic invoice.
-- Rollback disables imports while preserving all request/evidence records.
CREATE TABLE marketing_google_invoice_imports (
 id UUID PRIMARY KEY, operator_id INTEGER NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
 request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'), request_snapshot JSONB NOT NULL,
 state TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(state IN ('REQUESTED','OBSERVED')),
 source_url TEXT, response_content BYTEA CHECK(octet_length(response_content) BETWEEN 1 AND 5242880),
 response_hash TEXT CHECK(response_hash ~ '^[a-f0-9]{64}$'), result JSONB, observed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(operator_id,request_key),
 CHECK((state='REQUESTED' AND source_url IS NULL AND response_content IS NULL AND response_hash IS NULL AND result IS NULL AND observed_at IS NULL)
  OR(state='OBSERVED' AND source_url IS NOT NULL AND response_content IS NOT NULL AND response_hash IS NOT NULL AND result IS NOT NULL AND observed_at IS NOT NULL))
);
CREATE FUNCTION harvo_google_invoice_import_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'HARVO_INVOICE_IMPORT_IMMUTABLE'; END IF;
 IF OLD.state<>'REQUESTED' OR NEW.state<>'OBSERVED' OR
  (to_jsonb(NEW)-ARRAY['state','source_url','response_content','response_hash','result','observed_at']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['state','source_url','response_content','response_hash','result','observed_at'])
 THEN RAISE EXCEPTION 'HARVO_INVOICE_IMPORT_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_google_invoice_import_immutable BEFORE UPDATE OR DELETE ON marketing_google_invoice_imports FOR EACH ROW EXECUTE FUNCTION harvo_google_invoice_import_immutable();
ALTER TABLE marketing_google_invoice_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_google_invoice_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY harvo_google_invoice_import_operator ON marketing_google_invoice_imports
 USING(current_setting('app.marketing_admin',true)='true') WITH CHECK(current_setting('app.marketing_admin',true)='true');
REVOKE ALL ON marketing_google_invoice_imports FROM PUBLIC;
