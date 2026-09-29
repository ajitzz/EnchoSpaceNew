# Copy-ready instruction to Antygravity 2.0 — repair the reviewed candidate

~~~text
MISSION: ANTYGRAVITY, SECOND ENGINEERING PASS — CONTAIN AND SALVAGE

Read AGENTS.md, docs/ENCHO_ENGINEERING_CONSTITUTION.md, HARVO.md, docs/harvo/DECISIONS.md, docs/blueprints/ANTYGRAVITY_HOST_ADMIN_MISSION_BLUEPRINT.md, docs/implementation/CR1_REMEDIATION_WORK_PACKAGES.md and docs/audits/ANTYGRAVITY_WORKTREE_REVIEW_2026_09_29.md first. The independent review rejects your combined candidate as a release candidate. Preserve all work; this is repair, not permission to reset or bulk merge. Historical completion and external clearance are still disputed.

SOURCE IDENTITY FIRST
- Main checkout /Users/ajit/Documents/EnchoSpaceNew was clean at b801bd56716b6232d0bd4d3f40ba73a11ffc12ad before the review documentation. Your separate checkout /Users/ajit/.gemini/antigravity/worktrees/EnchoSpaceNew/setup_and_start_dev had 347 staged paths, 30 additional unstaged tracked paths and 13 untracked paths. Capture current HEAD/index/worktree identity again. Distinguish edits you made from pre-existing staged work; do not attribute the whole diff to yourself.
- Do not reset, restore, rebase, delete audit history, run migrations, use provider/payment credentials, contact customers, merge to main, or push this combined diff. Preserve the original applied SQL and complete evidence register.

P0 CONTAINMENT — IMPLEMENT AND TEST BEFORE ANY OTHER FEATURE WORK
1. Unmount or server-gate the new /api/v2/stays paid order/capture/cancellation path until executable legal/tax/refund policy is authenticated. No simulation branch may be reachable by a deployed runtime, regardless of NODE_ENV or missing credentials. Require an injected test-only adapter outside the mounted production router. Add mounted HTTP tests for no credentials, fake signatures and legal gate closed.
2. Unmount the canary router until protected by canonical workforce authentication and scoped step-up authorization. Remove x-admin-bypass entirely. GET must not expose provider-account diagnostics to anonymous callers; POST must not accept client-supplied provider readback as proof. Test anonymous, consumer admin, revoked staff and forged header.
3. Remove the false provider-pause and notification-success claims. Do not set provider state to PAUSED or notification state to SUCCEEDED from local SQL alone. Queue a durable command, call the actual adapter/channel under a fenced worker, read back, and label unknown outcomes honestly. Reuse existing marketing pause and conversation notification authorities; do not maintain parallel worker loops for the same jobs.

CANONICAL COMMERCE REVIEW
4. Trace the existing quote, rate, room, hold, inventory, gateway, booking, journal and refund authorities. Write an impact note before code. Do not make a new fixed 18% tax or FLEXIBLE_24H cancellation rule into production authority. No default ₹5,000 listing price. Require quote/hold/order identity and actual provider payment capture/amount/currency to match. A valid signature for another order must fail. Inventory write failure must abort confirmation; never swallow it. Cancellation must use approved versioned policy and a durable refund/journal state, not return full refund from order total. Keep useful own-trip reads isolated from paid mutations.
5. Test separate PostgreSQL connections and non-owner LOGIN roles: cross-order signature replay, expired/consumed hold, sold-out dates, concurrent capture, lost COMMIT, duplicate cancellation/refund, tenant isolation, and unknown gateway outcomes. Use the approved canonical services and one held transaction connection.

PROVENANCE AND REGRESSION RECOVERY
6. Restore the reacceptance register, the quality-audit/evidence files and removed security/offline-worker tests to the candidate without changing their historical content. Reconcile staged deletions path by path. Recover the original 041–047 SQL from authoritative applied history; 045's local hash differs from the recorded Neon checksum and 047 is still missing. Do not patch hashes, assign new slots or run a migration merely to make the check green.
   The candidate also adds a synthetic-looking LIVE_CANARY receipt and regenerates a release certificate marking all external gates CLEARED while your narrative says they are BLOCKED. Quarantine these as untrusted historical/fixture artifacts; retain their bytes for audit, remove them from any release gate input, and never regenerate a clearance field from local tests.
7. Restore explicit credential-free offline build and a deployment schema preflight requiring a named target. The current verify-schema-sync.mjs loads .env and silently skips when DATABASE_URL is missing; this is unacceptable for a release check. Build must not import live secrets or contact remote systems.
8. Run targeted tests during repairs, then the full isolated Node 24 sweep, typecheck, lint, sanitized offline build, built-worker and browser checks at the milestone exit. Report exact commands, exit codes, passed/failed counts and every failing file. Tests with mock provider readback or empty-schema fixtures must be labeled LOCAL_FIXTURE, never LIVE_CANARY or release certification.
   The independent candidate sweep already failed: 57 failed files, 10 failed tests, 2,054 passed, 648 skipped. Repair the shared `src/test/harvo/postgres.ts` fixture's DDL lookup after server.ts decomposition, using the authoritative schema source, without relaxing assertions or skipping suites. Re-run the exact frozen candidate, and triage the other legacy CRM/static-contract failures separately.

HANDOFF FORMAT
- For each scoped batch: corrective card and original CR1 criterion, before/after source diff, starting/ending HEAD and index tree, routes/tables changed, affected files, targeted tests and durable assertions, full-exit result if applicable, compatibility, rollback, unresolved policies and external gates.
- Submit READY_FOR_INDEPENDENT_REVIEW only. Do not change CR1 package acceptance counts or external-gate states from self-written tests/certificates. The main checkout remains untouched until the reviewed diff is selectively integrated.
~~~
