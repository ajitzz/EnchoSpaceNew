-- Apply only after isolated database validation and an approved backup/rollback plan.
BEGIN;
CREATE TABLE stay_checkout_orders (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  room_id TEXT NOT NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL CHECK (check_out > check_in),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  quote JSONB NOT NULL,
  guest_name TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  total_minor BIGINT NOT NULL CHECK (total_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'INR'),
  state TEXT NOT NULL CHECK (state IN ('creating','ready','review','confirmed','expired')),
  provider_order_id TEXT UNIQUE,
  payment_id TEXT UNIQUE,
  booking_id INTEGER UNIQUE REFERENCES bookings(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX stay_checkout_inventory ON stay_checkout_orders(listing_id, room_id, check_in, check_out) WHERE state IN ('creating','ready','review');
CREATE TABLE stay_checkout_events (
  id BIGSERIAL PRIMARY KEY,
  checkout_id UUID NOT NULL REFERENCES stay_checkout_orders(id),
  actor_id INTEGER NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION reject_stay_checkout_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Checkout audit events are append-only'; END $$;
CREATE TRIGGER stay_checkout_events_immutable BEFORE UPDATE OR DELETE ON stay_checkout_events FOR EACH ROW EXECUTE FUNCTION reject_stay_checkout_event_mutation();
ALTER TABLE stay_checkout_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE stay_checkout_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY stay_checkout_owner ON stay_checkout_orders USING (user_id::text = current_setting('app.current_user_id', true) OR current_setting('app.bypass_rls', true) = 'true');
ALTER TABLE stay_checkout_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stay_checkout_events FORCE ROW LEVEL SECURITY;
CREATE POLICY stay_checkout_event_owner ON stay_checkout_events USING (actor_id::text = current_setting('app.current_user_id', true) OR current_setting('app.bypass_rls', true) = 'true');
COMMIT;
