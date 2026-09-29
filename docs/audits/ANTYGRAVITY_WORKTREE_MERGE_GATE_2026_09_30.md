# Antigravity worktree merge gate — 30 September 2026

This is a bounded source/index review, not a complete semantic audit or a production certificate. The founder asked to merge the worktrees and push GitHub `main`. The reviewed primary commits were fast-forward pushed; the uncommitted Antigravity worktree changes were preserved separately because they do not pass a safe merge gate.

## Checkout identity

| Checkout | HEAD | Local state | Disposition |
| --- | --- | --- | --- |
| Primary `/Users/ajit/Documents/EnchoSpaceNew` | `de9becfce5b7868d521f2878e27153b289b0476b` | Four scoped commits ahead of the previously fetched `origin/main`; pre-existing HARVO/decision/gate and audit-document changes remain uncommitted | Four commits pushed to `origin/main`; unrelated dirty files preserved |
| Antigravity `setup_and_start_dev` | same HEAD | Index tree `06d1dd05b8fc1fb45d07e62dad032fbe1e6172ed`; 169 changed/untracked paths; tracked HEAD diff SHA-256 `4c4f28c3a4860588c122e7e6470e7f6954505f1085da74a2d8948fbbd320abbe` | **Quarantine.** No bulk stage, merge, push, migration or deploy |
| Antigravity `add_agentic_ui_testing` | `47b17459df04b3e78ba909a69dba7360e91a47a3` (an ancestor of main) | Six dirty paths; tracked HEAD diff SHA-256 `534ce05860365fdd9a9b59e90330b17ba9f45ccb4d3e84fe45d35e833d4035b5` | **Quarantine.** Its uncommitted `server.ts` changes start the server unconditionally |

The tracked diff hashes exclude untracked files. Recompute identity before any later review because either worktree can change. Git worktrees share committed objects and refs, not uncommitted working files; there is no Antigravity feature commit to merge wholesale.

## Blocking findings in the large candidate

1. `docs/ENCHO_ENGINEERING_CONSTITUTION.md` removes the current CR1-045–047 acceptance qualification that explicitly rejects synthetic legal/provider/staging evidence. The candidate also changes `CR1_STAGING_PREFLIGHT_RECEIPT.json`, `STATUTORY_TAX_CLEARANCE_DIGEST.json`, and `CR1_PRODUCTION_RELEASE_CANDIDATE_CERTIFICATE.json` to claim or refresh clearance. The founder has explicitly said written Indian CA/tax-lawyer approval is unavailable and has not identified isolated staging; these receipts cannot be promoted to authority.
2. The candidate deletes the primary checkout's reviewed `components/marketing/MediaBudgetEvidence.ts` and scoped takeover/outcome impact notes, while changing the meter, worker, provider adapters and tests. That is a conflicting replacement of locally tested F0/R6-02 work, not a clean additive merge.
3. Its `server.ts` diff removes about 19,000 lines and adds new route/bootstrap modules. TypeScript compilation passed, but this cannot establish identical route authority, migrations, startup, transactions, webhooks, shutdown, guest/host/admin behavior or production compatibility. The candidate `src/server/db/connection.ts` calls `dotenv.config()` and sets remote TLS `rejectUnauthorized: false`; this contradicts the isolated-build and validated-TLS requirements.
4. Migration `045_multi_role_security_and_rls.sql` grants broad policies via `is_admin_or_rls_bypassed()`, which trusts session settings including `app.bypass_rls`. That authorization boundary requires adversarial proof with restricted LOGIN roles, direct SQL attempts and a verified inability to self-set privilege. The candidate's fixture explicitly sets that custom value to false before its happy-path read; this is not proof against a hostile runtime principal.
5. `git diff --check HEAD` reports whitespace errors across source, SQL and docs. The candidate changes the isolated test runner by removing its bounded `--node-test` branch. Client/server TypeScript passed in the candidate, but this narrow success cannot override the security, evidence and regression findings.

The smaller `add_agentic_ui_testing` checkout upgrades Playwright without an associated reviewed browser scenario. Its uncommitted `server.ts` changes replace the guarded entry-point conditions with `if (true)` and log raw uncaught errors/rejections. Those startup and information-exposure changes are unsafe for imports, tests and serverless deployments. Its committed branch is already an ancestor of main; its dirty files are not included in main.

## Safe integration sequence

1. Keep both Antigravity worktrees intact. Freeze one bounded work package at a time with HEAD, index tree, tracked diff hash and untracked manifest. Do not change applied migration bytes or import synthetic certificates.
2. For any proposed package, write an impact note; compare against current main; carry over only source needed for a real guest/host/admin journey; repair or reject conflicting deletions. Test API, schema and UI compatibility, tenant/workforce authority, failure recovery and rollback against disposable PostgreSQL with non-bypass LOGIN roles.
3. Keep offline compilation separate from remote schema checks. Run the mandated phase-exit full regression and production-built browser verification only after a coherent integrated candidate passes focused tests. Do not substitute passing typecheck for release acceptance.
4. Treat production as a separate gate. No live top-up or paid activation until authentic tax/financial rules, isolated staging, restricted deployed roles, provider-owner paused create/readback and a bounded pilot receipt are supplied and verified.

`origin/main` now includes the four scoped fuel/outcome commits through `de9becf`. That Git push does not deploy the site, merge the quarantined worktrees, make their dirty files disappear, or establish production readiness.
