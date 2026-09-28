# Main-branch source sync — 29 September 2026

**Purpose:** Record the evidence and limits of the founder-requested complete local-worktree push to GitHub `main`. This is source synchronization, **not** CR1 independent acceptance, deployment approval or production certification.

At start, local `main` and `origin/main` both resolved to `0e4c6fec2fe86f1b793760c5f7a3daf08bbf7508`. The worktree already contained a large mixed staged/unstaged corrective implementation and documentation set, including removal of source migration files 041–046 that remain in observed Neon history. User explicitly requested pushing the complete local project. No database migration, provider call, payment, customer message or deployment was performed for this sync.

## Credential containment before staging

A file-content scan found hard-coded Neon connection URLs in six already tracked maintenance/seed scripts. Their literal URLs were removed; `check_user.cjs`, `get_event.cjs` and `seed_detailed_events.cjs` now require `DATABASE_URL_UNPOOLED`; `scripts/seed_showcase_sanctuaries.cjs`, `seed_test_event.cjs` and `update_user_db.cjs` now require `SEED_DATABASE_URL`. No matching Neon password prefix, payment live/test key, GitHub token, private key or Google API-key pattern remained in the tracked/untracked candidate set after the change. This scanner is a bounded pattern check, not a complete secret audit. **The credentials remain exposed in prior Git history and require rotation by their owner; a new commit cannot erase earlier exposure.** These scripts were not executed against any database.

## Verification run on the local candidate

| Check | Result | Boundary |
|---|---|---|
| Node 24 `npm run lint` | exit 0 | Entire current source, not release acceptance |
| Node 24 `npm run build:offline` | exit 0 | Credential-free client/server/worker package and public-artifact scan; no remote database check |
| Node 24 `npm run typecheck` | initial exit 2, repaired fixture type mismatches, final exit 0 | Seven fixture/audit-probe parameter and type-shape corrections; no assertions relaxed |
| Five affected test files | 45 passed / 0 failed | Focused workforce, pilot and staging-runbook fixtures |
| Full isolated test command | **2,830 passed, 15 failed, 3 files failed** | This is a failed release sweep. Do not use this push as a green regression receipt. |
| `operations_boundary.test.ts` rerun | 4 passed, 1 failed | One visible failure is a stale source-pattern assertion expecting the retired Workbox API sync route in `vite.config.ts`. Other full-sweep failures remain to be triaged from a non-truncated test report. |

The full isolated run used Node 24 `scripts/testing/run.mjs`; test environment variables were allowlisted and did not inherit live provider/database secrets. Test failures and the applied SQL/source mismatch are explicit release blockers. This document does not resolve them or change the 0/32 full corrective-card and 0/48 independent original-package acceptance counts.

## Post-sync review required

Reconcile the exact pushed commit and tree, review deletions and route compatibility, recover original applied migration SQL (especially 047), triage all 15 full-sweep failures without weakening current authority, rotate the previously embedded Neon credentials, and complete the original CR1/external acceptance process. Any later Antygravity/Codex review should compare its work against the pushed source-sync commit rather than the older `0e4c6fe` baseline.
