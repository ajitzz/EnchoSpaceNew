-- Canonical blocks use room_type_id; legacy display labels are not required authority.
ALTER TABLE room_calendar_blocks ALTER COLUMN room_tier_key DROP NOT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_date DATE;
-- Calendar requests retain idempotency and immutable evidence after a block is removed.
CREATE TABLE calendar_operations (
  id BIGSERIAL PRIMARY KEY,
  actor_id INT NOT NULL REFERENCES users(id),
  listing_id INT NOT NULL REFERENCES listings(id),
  request_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATE_BLOCK', 'REMOVE_BLOCK', 'ADMIN_READ')),
  fingerprint TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(actor_id, request_id)
);
ALTER TABLE calendar_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY calendar_operations_actor ON calendar_operations
  USING (actor_id = NULLIF(current_setting('app.current_user_id', true), '')::int)
  WITH CHECK (actor_id = NULLIF(current_setting('app.current_user_id', true), '')::int);
CREATE FUNCTION preserve_calendar_operations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Calendar operation evidence is immutable'; END;
$$;
CREATE TRIGGER calendar_operations_immutable BEFORE UPDATE OR DELETE ON calendar_operations
  FOR EACH ROW EXECUTE FUNCTION preserve_calendar_operations();
