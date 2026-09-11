-- Migration: 002_add_listings_publication_status.sql
-- Milestone: Phase 3 Milestone 2 (Published Projection, Canonical Routes & Address Privacy)
-- Purpose: Add publication_status column to listings table with default 'published' for legacy rows, and 'draft'/'unlisted' support.
-- Contract: Non-destructive. Rollback preserves all listings and related table data.
-- Concurrency: Uses standard transactional DDL with advisory lock in runner.

-- 1. Add publication_status column with safe non-public default 'draft' (does NOT auto-publish)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS publication_status VARCHAR(50) DEFAULT 'draft';

-- 2. Do NOT backfill existing listings to 'published'. Existing listings retain NULL or 'draft'.
-- NULL is strictly treated as NOT PUBLIC in all public read and canonical query paths.
-- Controlled admin moderation path is required to explicitly approve and publish listings.

-- 3. Create index for fast publication status filtering on canonical queries
CREATE INDEX IF NOT EXISTS idx_listings_publication_status ON listings (publication_status);

-- ============================================================================
-- ROLLBACK NOTES (DO NOT RUN AUTOMATICALLY):
-- To revert this migration non-destructively:
--   DROP INDEX IF EXISTS idx_listings_publication_status;
--   ALTER TABLE listings DROP COLUMN IF EXISTS publication_status;
-- ============================================================================
