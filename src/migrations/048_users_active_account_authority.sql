-- The legacy bootstrap added users.is_active only when DDL was permitted at web
-- startup. The numbered migration restores this authority on deployed catalogs.
-- Existing accounts remain active, matching the pre-column behavior. If an
-- installation already has nullable is_active values, NULL is fail-closed.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
UPDATE public.users SET is_active = FALSE WHERE is_active IS NULL;
ALTER TABLE public.users ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN is_active SET DEFAULT TRUE;
