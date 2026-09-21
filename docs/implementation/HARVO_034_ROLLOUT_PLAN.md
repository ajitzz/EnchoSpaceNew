# HARVO-034 — dedicated campaign rollout preparation

Date: 21 September 2026. Authority: founder HARVO-034 and subsequent local-only clarification. Status: local rollout preparation; staged/production cutover not performed.

## Scope and implementation plan

The founder accepts the six HARVO-033 implementation workstreams, authorizes local/staged attribution keys and staged Neon migration verification, and explicitly retains the paid-pool circuit breaker. Dedicated campaigns have their own product contracts. This does not establish that their deployed activation prerequisites are satisfied.

Categories: infrastructure, security, verification and documentation. No campaign, payment, guest-checkout, provider or financial state-machine change is planned in this rollout preparation.

Verified gaps: local environment files contain Neon connections without an identified staging branch; deployed composition still omits accepted booking/current-consent verifier ports; the legacy migration runner warns and continues on checksum drift. The HARVO-033 full test run had one failure followed by a passing affected-suite rerun, not a clean full regression of the corrected tree.

Plan: prepare an ignored owner-readable attribution key file without overwriting an existing key; add a bounded migrations 027–031 rehearsal that rejects checksum drift, checks the exact runtime grant/RLS contract and always rolls back; verify against disposable PostgreSQL first; execute against Neon only after the staged target is identified. Preserve all existing migration SQL. Finish with current release checks and explicit rollout/pilot gates.

Impact: operator-only tooling, no automatic startup/deployment changes, no public API changes, no new schema. The rehearsal temporarily acquires schema/index locks, so it uses bounded lock/statement timeouts and a migration advisory lock. It reads catalog/history metadata, does not seed customer fixtures and never starts web/worker/provider code. Runtime role checks do not manufacture a trusted service administrator. Key provision uses exclusive creation and never logs secret values. Rehearsal rollback preserves existing data; retain signing keys while issued links remain valid. Local test fixtures must never be run against Neon.

Validation: secret overwrite/permission checks, exact key-ring runtime parsing, real PostgreSQL migration/grant rollback and drift rejection, targeted existing attribution/dedicated/pool/creative/scheduling tests, then one full final regression and release/build/browser evidence. Staged results and local results will be recorded separately below.

## 1. Clarifications and current readiness

**Founder clarification:** run the migration/grant rollback rehearsal on disposable local PostgreSQL only. Do not connect to remote endpoints in `.env` or `.env.local`. The founder will separately prepare `.env.staging.local` before staging or production cutover. This supersedes any earlier permission to run against an unidentified staged connection. No remote database connection was made by HARVO-034.

| Question | Verified answer |
|---|---|
| Can Dedicated Stays operate independently of paid pools? | Yes at the product/quote/publication contract boundary. A campaign without an active pool binding is unaffected by `POOL_EXECUTION_UNAVAILABLE`; a consented pool campaign cannot borrow dedicated authority. New regression checks both paths and verifies no quote/reservation is created by the rejected pool request. |
| Is Dedicated Stays ready to spend live now? | **No.** `createDeployedMarketingRuntime` still does not inject the accepted booking/capture verifier and current-consent resolver. `activationEnabled` is reduced by actual conversion readiness. Environment acceptance strings cannot supply these code integrations. |
| Can paused publication be rehearsed before activation? | It has separate authority and is supported in source; a real-provider test still requires its actual staged catalog, approved funding/reservation/risk evidence, provider clearance, storage and named campaign scope. No remote publication was attempted. |
| Are migrations 027–031 verified on Neon? | **No.** Their local rollback rehearsal and minimum portfolio grants are tested; Neon is intentionally deferred by the founder. |
| Are signing keys configured? | A local ring was generated in ignored `.env.harvo-attribution.local`, with one canonical 32-byte key and file mode `0600`. Pure runtime parsing and a signed visitor round trip pass. Load this file explicitly for local runs; the normal `.env` and hosting secrets were not modified. Staged/production provisioning remains separate. |
| Does the key enable purchases or host tracking automatically? | No. A valid link is not consent, a captured booking or activation authority. The existing optional measurement and missing Purchase integration boundaries remain. |
| Can pooled campaigns accept money? | No. Quote/checkout/activation remain blocked; pool provider execution and shared invoice allocation/settlement are unfinished. |

A names-only, no-network inspection of local `.env` found missing `GEMINI_API_KEY`, `GEMINI_MARKETING_MODEL`, `META_MARKETING_WEBHOOK_VERIFY_TOKEN`, settlement policy and two distinct settlement operators. Other credentials/configuration were present but unverified. Requested funding/publication/activation flags were true in that file; they were left unchanged and no application was started. **Do not copy that configuration into staging as a safe default.** The canonical authority guard still blocks live activation.

## 2. Local tools delivered

- `scripts/deployment/provision-attribution-key.mjs`: exclusively creates a local secret file, refuses symlinks/unsafe permissions/invalid existing rings, preserves existing valid keys, and returns metadata only. Run with Node 24: `node scripts/deployment/provision-attribution-key.mjs`. It never loads application `.env` or connects to services.
- `src/server/deployment/portfolioRehearsal.ts`: compares prior migration history against exact packaged checksums; acquires the same advisory lock as the legacy runner; executes only missing 027–031; applies only their new grants; checks effective restricted-role policy/privilege/immutability; **always rolls back** DDL, grants and history. Lock wait is two seconds; each statement is bounded to 30 seconds; idle transactions expire after 60 seconds. A timeout is failure, not permission to remove the bound.
- `src/server/deployment/portfolioRehearsalCli.ts`: future staged entry point, explicit secret-file input only, direct Neon endpoint/database pin, verified TLS and no fallback to ambient `.env`. The branch ID is operator-attested metadata, not independent Neon API verification. This command does not commit migrations or certify deployment.

The local fixture provides the relevant existing parent schema and a **synthetic migration-history baseline** to exercise drift handling. Exact 027–031 SQL executes on real disposable PostgreSQL. This is not a complete 001–031 bootstrap or proof about a remote catalog. Existing source/RLS suites separately exercise tenant and immutable-evidence behavior.

## 3. Staged Neon rollout sequence — deferred until configured

1. In Neon, select the intended project, then **Branches**, and create/select the isolated staging branch. Record its project/branch/compute identity and recovery point. Copy that branch's connection details, not the main branch's. Each branch has its own compute connection; see [Neon compute/branch documentation](https://neon.com/docs/manage/endpoints/).
2. Record the deployed revision/artifact and compare the staging `schema_migrations` ledger with every packaged migration before 027. Stop on absent or changed checksums. Existing migration SQL must not be edited to fit a remote history. Establish prerequisite schemas, including the actual `threads` and `messages` tables, through their reviewed migration path.
3. Use separate migration-owner and application roles. The runtime role must be non-owner, `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION`, without inherited **or SET ROLE** paths to an owner/privileged role. The owner must be able to set the runtime role for this transactional catalog rehearsal. Do not grant ownership or administrative flags to runtime to make the check pass.
4. Store actual values in private, ignored `.env.staging.local`. Rehearsal inputs are `HARVO_STAGING_CONFIRMED=true`, `HARVO_STAGING_BRANCH_ID`, `HARVO_STAGING_EXPECTED_HOST`, `HARVO_STAGING_EXPECTED_DATABASE`, `HARVO_STAGING_MIGRATION_URL` and `HARVO_STAGING_RUNTIME_ROLE`. The URL must use the **direct** endpoint. These names are a contract, not supplied credentials. Keep the actual runtime connection separately for subsequent login/readiness testing. The tool does not consume `DATABASE_URL`.
5. On the isolated branch, with no application writing during the check, run the packaged Node 24 operator entry: `node build/server/src/server/deployment/portfolioRehearsalCli.js --env-file .env.staging.local`. Retain its sanitized receipt. Expected success is `REHEARSED_ROLLED_BACK` with five executed migrations on an unapplied branch, or the explicitly reported already-recorded subset. Success intentionally leaves staging unchanged.
6. Only after that succeeds, perform the separately controlled persistent staging apply of **the same checked SQL**, in order 027, 028, 029, 030, 031, under the migration owner. Use an explicit transaction, matching advisory lock, bounded lock waits and exact history inserts/checksums. **The rehearsal has no apply switch.** Do not use the legacy `npm run migrate` as an unattended release gate: its checksum-drift behavior is warning-only. Archive the approved apply batch/receipt with the release before cutover.
7. Apply the following additive minimum grants to the actual web/worker role. Keep earlier reviewed grants; avoid blanket grants on all current/future tables. Verify `schema_migrations` remains SELECT-only for runtime, and no new tables have PUBLIC grants. Do not grant runtime ownership, UPDATE on immutable receipts, sequence UPDATE, TRIGGER or TRUNCATE.

| Migrations | Objects | Runtime privileges |
|---|---|---|
| 027–028 | `marketing_attribution_links`, `marketing_measurement_consents`, `marketing_attribution_touchpoints` | SELECT, INSERT |
| 028 | `marketing_measurement_payloads` | SELECT, INSERT, DELETE; **no UPDATE** |
| 029 | `marketing_destination_pools`, `marketing_pool_memberships` | SELECT, INSERT, UPDATE |
| 029 | `marketing_pool_events`, `marketing_pool_exposures`, `marketing_pool_spend_claims` | SELECT, INSERT |
| 030 | `marketing_spatial_stories`, `marketing_spatial_story_reviews` | SELECT, INSERT |
| 031 | `marketing_inquiry_attributions` | SELECT, INSERT |
| 028, 030 | `marketing_measurement_consents_sequence_seq`, `marketing_spatial_story_reviews_sequence_seq` | USAGE only |

Migration 031 also adds nullable message-idempotency fields and a sender/event unique index; its existing messaging grants/participant checks remain required. `portfolioRolloutGrants(actualRole)` generates the exact additive grant statements. It does not repair overly broad existing privileges silently.

8. Open a **new connection using the actual runtime credentials**, not just owner `SET ROLE`. Run read-only `databaseReadiness`, the explicit-env `marketing:check --database` operator check, and inspect `/api/health/ready`. Require exact migration hashes, no missing tables, forced RLS, correct immutable triggers, and all recovery/portfolio privilege checks. The portfolio rehearsal alone does not prove full database readiness. Run adversarial tenant scenarios only with isolated staged test identities; never point the destructive disposable-fixture suite at Neon.
9. Provision a distinct staged signing ring and inject identical `HARVO_ATTRIBUTION_KEYS` into staged web and worker secret settings. Verify the configured canonical HTTPS origin, cookie behavior, media origin/bucket and real service administrator. Keep staged funding/publication/activation disabled initially. Keys must remain server-only; retain old keys while unexpired links/cookies depend on them. Do not promote the local test key to production.
10. Deploy the same verified artifact to staged web and worker. Verify liveness, full database readiness, worker heartbeat/progress, retention (60s), flight-stop scheduling (15s), destination eligibility (15s) and observation scheduling (5min). These are scheduling intervals, not guaranteed completion deadlines. Exercise restart/drain and failed-provider containment before any live request.

No stage/production command above was executed in HARVO-034. A persistent migration cutover is not implied by a rollback rehearsal.

## 4. Dedicated campaign acceptance journey

Run these steps in the staged Encho host/admin UI after the prerequisites above. A host does not need provider-account access. Meta and Google are separately authorized campaign revisions, not a single shared publish request.

1. Select the exact pilot host and published canonical property. Verify `/stay/{slug}`, availability for the stay dates, currency, nightly rate, approved media rights and canonical facts. Record the revision and fact hash. Confirm no pool membership binds the campaign.
2. In **A story in four spaces → Compose a new spatial story**, select and prepare approved photographs; use four distinct reviewed square images, literal property facts and their correct spatial sections. Select the reviewed landscape image for Google. Click **Save story for independent review**.
3. A different authorized administrator opens **Review campaign images → Property spatial stories**, inspects the original media/facts and section assignment, enters editorial evidence, attests, then clicks **Approve exact story**. The host clicks **Use this reviewed story**. Verify mobile and desktop previews and all canonical anchors.
4. Choose the India flight preset. Confirm the displayed `Asia/Kolkata` Wednesday 06:00 through Monday 23:59:59 instants, the intended dates and separate stay inventory. Check the observed provider-account timezone; Google native dates and worker-controlled start/stop must agree. Do not promise second-accurate ad delivery.
5. Enter explicitly approved total/daily media limits and optional economics assumptions. Inspect the quote, costs/tax policy, fee and caps. Submit the exact revision for AI and human review. Missing AI evidence cannot masquerade as a pass. Changed facts/media invalidate prior authority.
6. Before accepting real money, complete canonical checkout/legal/consent integration and approved campaign-cost/settlement policy. Then verify genuine matching payment capture, reservation and risk release. Do not use direct database updates or fixture capture helpers for staged/live acceptance.
7. Publish through the audited Encho admin operation. Verify a complete, **paused** provider hierarchy with exact account, revision, assets and correlation receipts. Meta must read back four ordered carousel cards. Google must read back four sitelinks plus square/landscape image associations; it is **not** a four-card Search carousel. Dimensions/association are not proof of Google-returned image-byte hashes.
8. Only when actual activation readiness passes, submit the explicit admin activation intent for the future IST start. Verify no early spending, delayed job identity, cancellation-before-dispatch behavior, and observed provider state. Configured ACTIVE is not observed serving; under review, no data, stale data and failed observation remain distinct.
9. From an actual signed landing link, exercise optional measurement acceptance/decline/withdrawal, an idempotent guest inquiry, correct host inbox notification, and private host/admin projections. Verify the same journey with another host cannot read or act on the first host's campaign/inquiry. Provider reporting delay must remain visible.
10. Observe spend/delivery, pause/stop readback, flight expiry and fully occupied inventory containment. Close the financial journey with actual provider billing and independent review; then exercise canonical booking and a deduplicated consented conversion/correction. Record what the provider acknowledged without claiming incremental booking lift.

Local fixture tests cover contracts in these steps. They do **not** establish that the complete journey ran on real provider accounts or staging.

## 5. First live pilot: required evidence checklist

All criteria below must pass; no aggregate percentage overrides a failed item.

- [ ] **Named scope:** one initial published villa/host in Wayanad, Coorg or Goa, exact listing/revision, selected provider/account, operator and backup operator, start/end/stay dates, approved daily and total media cap, funding source and loss/abort ceiling. Start with one dedicated flight; expand only after evidence review. The pooled INR 10,000/day cap is not an authorization for a dedicated pilot's spend.
- [ ] **Release identity:** reviewed commit and identical immutable web/worker artifacts; required CI checks; no unreviewed source delta. This worktree remains uncommitted and is not a deployed release.
- [ ] **Staging catalog:** exact migration history through 031, restricted-role login and hostile-tenant checks, full structural readiness, restore/drain drill, existing index/data compatibility and archived migration evidence.
- [ ] **Accepted financial/guest authority:** genuine canonical booking/capture plus current-consent adapters composed in both web/worker; required specialist acceptance; approved campaign costing/tax/refund/settlement policy; two distinct current finance operators. No CONFIRMED-only legacy booking surrogate.
- [ ] **Service configuration:** stage/prod-specific signing keys, HTTPS origin/cookies, provider credentials/permissions and billing, real service actor, AI model/key, webhook signing/verification, immutable media storage/CDN. Presence-only checks are insufficient.
- [ ] **Provider/creative clearance:** actual account-timezone/placement/category/geography capability, representative 150KB-per-image quality, independently approved four-space facts/media, paused hierarchy/asset readback and reachable public links. Residents-only Meta targeting remains unproven; do not claim it or silently substitute another audience.
- [ ] **Controls and observability:** healthy dedicated worker, no unexplained dead/unknown jobs, reporting freshness shown, tested manual pause/readback and scheduled stop, reconciled budget/reservation, immutable operator/correlation trail, on-call incident handling. Unknown writes remain quarantined without clearing dedupe keys.
- [ ] **Host journey:** desktop/mobile builder, quote, creative review, truthful delivery/budget status, own-host metrics, guest inquiry and consent withdrawal exercised through deployed HTTPS. Unavailable metrics stay unknown. Disconnected notification delivery must either be verified or explicitly excluded from this bounded pilot's promise.
- [ ] **Closure evidence:** real capture/escrow/reservation, observed provider spend, stopped hierarchy, invoice allocation and reviewed settlement/unused-fund treatment, no unexplained ledger drift. Paid pooling remains unavailable throughout.

Current decision: **local release preparation can complete; staging cutover and live activation remain NO-GO until their own evidence exists.** The local-only instruction is the current operating boundary.

## 6. Rollback and retention

Rehearsal rollback is automatic on success/failure. For a future deployed issue, stop new publication/activation, contain provider delivery using the audited pause path, and drain workers. Disabling configuration does not prove an already-running ad has stopped. Preserve ledger, immutable receipts, pending/unknown operation identities and signing-key history. Do not drop additive evidence tables, reset dedupe keys, or erase reservations. Retain an owner for expired measurement-payload cleanup. Restore or forward-fix only with a publisher that understands the new bound revision/product/story contracts; never revert to a binary that ignores them.

## 7. Verification and milestone tracking

**Final local result:** 1,860 tests passed across 144 files, zero failed/pending, in one final full run. Application/server TypeScript, lint, client/server compilation, final compiled smoke and 20 desktop/mobile browser scenarios passed. The 15 new rehearsal/key/connection checks and 11 pool checks are included in that full total, not additional tests to add to it. Existing bundle-size warnings remain. The [sanitized release receipt](../harvo/HARVO_034_LOCAL_RELEASE_RECEIPT.json) records scope and exact 027–031 hashes; [execution verification](../harvo/SEARCH_PORTFOLIO_EXECUTION_VERIFICATION.md) records artifacts and limitations. No remote Neon, ad, payment or deployment operation occurred.

Final local release checks are recorded in `docs/harvo/SEARCH_PORTFOLIO_EXECUTION_VERIFICATION.md`. HARVO-034 accepts the delivered local systems but does not change their external acceptance evidence. SP5 paid execution remains partial; SP4/SP6/SP7 production acceptance, canonical Purchase composition and M10's named live pilot remain open. Historical accepted marketing milestones remain M1/M2/M3/M7/M8: **5/10 (50%)**, not a percentage of implemented code.

| Track | Local delivery/acceptance | Remaining rollout gate |
|---|---|---|
| SP0–SP3 | Prior founder acceptance retained; current release regression rechecked separately | Actual staged catalog/role and operating evidence; provider capabilities where unresolved |
| SP4 / E1 / X1 | Local economics, advisory preflight and IST scheduling accepted | Actual account timezone, timed activation/stop and delivery evidence |
| RFC-M1 | Signed references, explicit visit consent and inquiry attribution locally verified | Accepted canonical booking/capture and current-consent adapters in deployed composition |
| SP5 | Founder accepts foundation and endorses containment | Paid publisher and observed shared-invoice allocation/settlement; checkout stays unavailable |
| SP6 / C1 | Local reviewed story compilation and provider readback contracts accepted | Actual four-card Meta / Google extension capability, policy and representative image quality |
| SP7 / O1 | Local host/admin monitoring and connected inbox experience accepted | Deployed SLO/recovery/notification acceptance and named bounded pilot |
| Historical M10 | Not run | Exact named listing/operator/budget, real delivery/capture/stop/settlement evidence |
