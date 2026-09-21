-- Stable client message identity protects offline replay and network retries.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_event_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_request_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_event ON messages(sender_id,client_event_id) WHERE client_event_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS marketing_inquiry_attributions (
 id UUID PRIMARY KEY,
 thread_id INT NOT NULL REFERENCES threads(id),
 message_id INT NOT NULL REFERENCES messages(id),
 campaign_id INT NOT NULL,
 revision INT NOT NULL,
 host_id INT NOT NULL REFERENCES users(id),
 listing_id INT NOT NULL REFERENCES listings(id),
 visit_id UUID NOT NULL REFERENCES marketing_attribution_touchpoints(event_id),
 consent_id UUID NOT NULL REFERENCES marketing_measurement_consents(id),
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(campaign_id,revision) REFERENCES marketing_campaign_revisions(campaign_id,revision),
 UNIQUE(thread_id,campaign_id)
);
CREATE INDEX IF NOT EXISTS marketing_inquiry_host ON marketing_inquiry_attributions(host_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS marketing_inquiry_campaign ON marketing_inquiry_attributions(campaign_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS marketing_touchpoint_link ON marketing_attribution_touchpoints(link_nonce,occurred_at);
ALTER TABLE marketing_inquiry_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_inquiry_attributions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harvo_inquiry_service ON marketing_inquiry_attributions;
CREATE POLICY harvo_inquiry_service ON marketing_inquiry_attributions FOR ALL USING(current_setting('app.marketing_admin',true)='true') WITH CHECK(current_setting('app.marketing_admin',true)='true');
DROP POLICY IF EXISTS harvo_inquiry_owner ON marketing_inquiry_attributions;
CREATE POLICY harvo_inquiry_owner ON marketing_inquiry_attributions FOR SELECT USING(host_id::text=current_setting('app.current_user_id',true));
DROP TRIGGER IF EXISTS marketing_inquiry_immutable ON marketing_inquiry_attributions;
CREATE TRIGGER marketing_inquiry_immutable BEFORE UPDATE OR DELETE ON marketing_inquiry_attributions FOR EACH ROW EXECUTE FUNCTION harvo_reject_evidence_mutation();
REVOKE ALL ON marketing_inquiry_attributions FROM PUBLIC;
