-- Migration: 001_add_listings_slug.sql
-- Milestone: Phase 3 Milestone 2 (Published Projection, Canonical Routes & Address Privacy)
-- Purpose: Add deterministic, collision-safe slug to listings, backfill existing listings, and enforce uniqueness.
-- Contract: Non-destructive. Rollback preserves all listings and related table data.

-- 1. Add slug column as nullable initially
ALTER TABLE listings ADD COLUMN IF NOT EXISTS slug VARCHAR(255);

-- 2. Backfill stable deterministic slugs for existing rows
-- Format: lower(regexp_replace(regexp_replace(title, '[^a-zA-Z0-9\s-]', '', 'g'), '[\s_-]+', '-', 'g')) || '-' || id
UPDATE listings
SET slug = CASE
  WHEN COALESCE(TRIM(regexp_replace(regexp_replace(title, '[^a-zA-Z0-9\s-]', '', 'g'), '[\s_-]+', '-', 'g')), '') = ''
    THEN 'stay-' || id::text
  ELSE
    LOWER(TRIM(BOTH '-' FROM regexp_replace(regexp_replace(title, '[^a-zA-Z0-9\s-]', '', 'g'), '[\s_-]+', '-', 'g'))) || '-' || id::text
END
WHERE slug IS NULL OR slug = '';

-- 3. Create unique index on slug without blocking table reads
CREATE UNIQUE INDEX IF NOT EXISTS uq_listings_slug ON listings (slug);

-- ============================================================================
-- ROLLBACK NOTES (DO NOT RUN AUTOMATICALLY):
-- To revert this migration non-destructively:
--   DROP INDEX IF EXISTS uq_listings_slug;
--   ALTER TABLE listings DROP COLUMN IF EXISTS slug;
-- Note: Dropping the slug column does not drop or rewrite any listing, booking,
-- or financial records.
-- ============================================================================
