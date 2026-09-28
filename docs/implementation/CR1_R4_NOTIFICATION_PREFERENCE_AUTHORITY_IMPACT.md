# R4 notification preference authority impact

Status: IN_PROGRESS — local readiness containment, not R4-01 acceptance.

Source of truth: migration `039_conversation_notification_preferences.sql`, the existing preference catalog contract and grant generator, canonical conversation readiness for migration 037, and the shared recursive runtime-role authority check. Applied SQL bytes remain unchanged.

Root cause observed in source: preference readiness tests column/function privileges for `current_user` only. A restricted LOGIN with NOINHERIT membership can pass those checks yet SET ROLE into a role with forbidden preference writes or trigger-function execution. Column-level REFERENCES and PUBLIC column grants are also omitted from its current checks.

Affected files: `src/server/deployment/notificationPreferencesReadiness.ts`, a focused actual-LOGIN test file and this evidence note/receipt. Parent separately owns API mounting. No route, UI, provider, message delivery, migration or business-policy change is included.

Implementation: reuse the canonical reachable-role SQL predicate for excess table/column/function authority while preserving the exact required current-role grant contract. Reject PUBLIC column grants. Keep conversation readiness and immutable schema/trigger/body checks intact; do not grant or repair privileges at runtime.

Security/compatibility: correctly restricted participant LOGIN remains ready. Excess grants become explicitly not ready rather than silently accepted. This checks database authority, not user consent, external delivery or proof of production isolation. API/schema shapes remain unchanged except additional readiness diagnostics if necessary.

Validation: disposable PostgreSQL with separate migration, participant runtime and notification-worker LOGIN roles. Capture failures before repair for NOINHERIT role escalation, direct column REFERENCES, and PUBLIC columns. Retest after revocation. Run only this test and existing notification-preference contract tests through Node 24 `scripts/testing/run.mjs`; scoped typecheck/lint after implementation. No remote endpoint or customer notification is involved.

Rollback: revert only the readiness guard/test changes if necessary; do not weaken grants or modify applied migrations to obtain readiness. A deployment should remain closed until configured roles satisfy the original least-privilege contract.
