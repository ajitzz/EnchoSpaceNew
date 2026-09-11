-- Migration: 007_legacy_conflict_ledger_uniqueness.sql
-- Milestone: Phase 3 Milestone 4 (Durable Ambiguous-Block Conflict Ledger Non-Destructive Idempotency)
-- Purpose:
--   Add nullable dedupe_key column and partial unique index on legacy_block_conflict_ledger.
--   New writes use deterministic SHA-256 fingerprint derived from (block_id, conflict_reason).
--   Historical rows are preserved exactly without any deletion, deduplication, or alteration.
-- Contract:
--   Strictly non-destructive forward-only migration. Zero DELETE/UPDATE on historical data.

-- 1. Add nullable dedupe_key column
ALTER TABLE legacy_block_conflict_ledger ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(64);

-- 2. Add partial unique index on non-null dedupe_key
CREATE UNIQUE INDEX IF NOT EXISTS uq_legacy_block_conflict_dedupe_key
ON legacy_block_conflict_ledger (dedupe_key)
WHERE dedupe_key IS NOT NULL;

