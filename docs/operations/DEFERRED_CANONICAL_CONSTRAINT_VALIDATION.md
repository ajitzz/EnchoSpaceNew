# Deferred Canonical Constraint Validation Runbook

## Scope & Purpose
Migration `004_canonical_constraints.sql` adds database check constraints using `NOT VALID` so that existing historical data in Neon is not rejected or blocked upon deployment.

This document describes the operational procedure and SQL script to validate those constraints **only after**:
1. `scripts/preflight_m3_constraints.ts` runs against Neon in `BEGIN READ ONLY` mode and returns `totalViolations: 0` (excluding legacy NULLs which are handled per compatibility plan).
2. Any historical invalid records have been manually reviewed and remediated with an audit trail entry.

## Preflight Verification Step
Before executing validation, run the read-only preflight check:
```bash
npx tsx scripts/preflight_m3_constraints.ts
```

Ensure the output returns:
- Status: `CLEARED`
- Total Violations: `0`
- Tables verified: `media_assets`, `room_types`

## Deferred Validation SQL
Once preflight clears 100%, execute the following statements in a controlled deployment window:

```sql
-- Encho Deferred Validation Step for Milestone 3 Canonical Constraints
-- Invariant: Run ONLY when preflight returns zero violations.

BEGIN;

-- 1. Validate media_assets.moderation_status
ALTER TABLE media_assets VALIDATE CONSTRAINT chk_media_assets_moderation_status;

-- 2. Validate room_types.base_price
ALTER TABLE room_types VALIDATE CONSTRAINT chk_room_types_base_price;

-- 3. Validate room_types.max_occupancy
ALTER TABLE room_types VALIDATE CONSTRAINT chk_room_types_max_occupancy;

-- 4. Validate room_types.inventory_count
ALTER TABLE room_types VALIDATE CONSTRAINT chk_room_types_inventory_count;

-- 5. Validate room_types.min_stay_nights
ALTER TABLE room_types VALIDATE CONSTRAINT chk_room_types_min_stay_nights;

COMMIT;
```

## Rollback / Abort Plan
If any statement fails during execution:
- The transaction rolls back cleanly.
- Historical data remains untouched.
- Re-run `scripts/preflight_m3_constraints.ts` to identify newly introduced violating rows.
