-- Staged only; requires stay_checkout migration. Do not run at startup.
BEGIN;
CREATE TABLE stay_payment_observations (
  id UUID PRIMARY KEY,
  checkout_id UUID NOT NULL REFERENCES stay_checkout_orders(id) ON DELETE RESTRICT,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  provider_order_id TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN ('provider_review','refund_review','captured_observed','no_capture_observed')),
  payments JSONB NOT NULL CHECK(jsonb_typeof(payments)='array' AND jsonb_array_length(payments)<=100),
  observed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK(recorded_at>=observed_at)
);
CREATE INDEX stay_payment_observation_checkout ON stay_payment_observations(checkout_id,recorded_at DESC);
CREATE TRIGGER stay_payment_observations_immutable BEFORE UPDATE OR DELETE ON stay_payment_observations FOR EACH ROW EXECUTE FUNCTION reject_stay_checkout_event_mutation();
ALTER TABLE stay_payment_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stay_payment_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY stay_payment_observation_read ON stay_payment_observations FOR SELECT USING(current_setting('app.bypass_rls',true)='true');
CREATE POLICY stay_payment_observation_insert ON stay_payment_observations FOR INSERT WITH CHECK(current_setting('app.bypass_rls',true)='true');
COMMIT;
