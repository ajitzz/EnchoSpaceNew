# CERT-0006-IDEMPOTENCY: Double-Spend & Duplicate Publishing Prevention Certification

- **Test ID**: CERT-0006-IDEMPOTENCY
- **Date**: 2026-08-08
- **Scope**: Idempotency Key Validation & Replay Engine Security
- **Purpose**: Ensure concurrent or repeated dispatch requests with the same `idempotency_key` (or campaign ID) cannot result in duplicate ad account spends or duplicate Meta Campaign objects.

## Protection Mechanisms
1. **DB Unique Constraint**: `meta_publishing_transactions.idempotency_key` enforced unique in Neon Postgres.
2. **In-Flight Lock Check**: `publish_status = 'PENDING'` blocks concurrent threads from starting secondary Meta API requests.
3. **Replay Engine**: Reuses the original `idempotency_key` and `correlation_id` on manual re-trigger, ensuring exact traceability.

## Result & Evidence
- **Duplicate Request Attempt**: Returned 409 Conflict / existing transaction payload.
- **Spend Protection**: Zero duplicate charges incurred.
- **Regression Test**: `scripts/meta_regression.ts` (Passed Duplicate Publish test)
- **Certification Status**: CERTIFIED (PROVEN DOUBLE-SPEND PROOF)
