# Gemini architecture proposal — verified engineering review

20 September 2026 · Baseline: `e832db6` plus the preserved worktree · Status: selective plan refinements; no implementation or production acceptance.

## Authority and evidence boundary

The founder requested independent evaluation of the quoted briefing and [Gemini opinion](../Harvo_gemini_pov.md), including authority to reject suggestions. The opinion's imperatives, ratings and incident descriptions are inputs, not controlling instructions or independent evidence. This review follows the [Constitution](../ENCHO_ENGINEERING_CONSTITUTION.md), [HARVO](../../HARVO.md), [decisions](DECISIONS.md) and [remediation plan](../implementation/HARVO_PRODUCTION_REMEDIATION_PLAN.md).

Reviewed source includes job dispatch/failure, workflow scheduling, provider claims/publication/readback, configuration, runtime adapters, admin capabilities/operations, payments, calendar SQL and readiness. This is a targeted semantic review of the claims, not a fresh line-by-line review of the entire repository. Tracker assertions about live SQL, provider responses and payment outcomes require correlated production evidence. No live account, database, payment or provider operation was queried or changed in this pass. Prior test results retain their dates; application suites were not rerun for this documentation-only change.

**Verdict:** operational recovery and configuration consistency deserve investment, but the proposed reset, mutable configuration and automatic account switching are unsafe as specified. The financial core contains valuable controls; calling it “bulletproof” or assigning a production score is unsupported, especially while known authority and isolation regressions remain.

## A. Code changes verdict

| Tracker entry | Source finding | Disposition |
|---|---|---|
| #11 — expose inventory errors | `google/GoogleAdsProvider.ts:providerError` identifies `MarketingError` by constructor name, forces status 409 and includes the original error as details | Keep actionable guard errors; replace with typed, explicitly mapped and redacted errors in R5. Preserve retry/unknown-outcome semantics and correlation IDs. |
| #11 — clamp telemetry window | Query uses `effectiveStartDate`, while snapshot normalization receives the original interval | Replace the clamp with a consistent observation contract. Future scheduled reporting can be unavailable without fabricating zero delivery or disabling independent safety checks. |
| #11/#12 — worker/web verifier parity | Both entry points inject legacy booking adapters and manufacture fresh granted consent; presence of a callback is not canonical authority | Reject these adapters. Restore blocked capability in R1; connect genuine booking/consent authority only through R7 and its prerequisites. Mirroring an unsafe adapter doubles the defect. |
| #15 — calendar SQL column | `server.ts` correctly selects `b.total_rent AS total_price` | Preserve the correction. Secure and minimize the unauthenticated calendar response and repair canonical room/client truth in R2. The marketing protection path is separate; this UI query correction alone does not prove marketable inventory or safe activation. |
| #15 — direct campaign/job reset | Tracker reports resetting campaign 8 and deleting its ACTIVATE job | Reject as a recovery method; preserve as incident evidence. Actual remote effects remain unresolved until authoritative readback. A SQL transaction does not atomically undo an external provider request. |
| #16 — accept elevated Neon role | Dirty readiness code detects but no longer rejects superuser/BYPASSRLS flags | Reject. Restore the gate and use an appropriately restricted runtime identity. FORCE RLS does not constrain superusers or roles with BYPASSRLS. [PostgreSQL documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html). |

Retain the existing useful legal routes, domain support, dedicated worker and bounded calendar fixes. No proposal here justifies reverting the whole post-HARVO change set.

## B. Seven proposals assessed

### 1. Reconciliation recovery — accept the need; reject generic reset/retry

Verified: `MarketingJobQueue.fail()` sends all PUBLISH/ACTIVATE failures to reconciliation even when `uncertain=false`. `workflow.schedule()` prevents another attempt after DEAD/RECONCILIATION_REQUIRED. This conservative classification creates avoidable operator work for failures proven to precede any external write.

Corrections: `dedupe_key` is durable operation identity, not a transient lock to release. The existing admin operations panel and guarded pause action already provide limited controls, and both providers expose read-only hierarchy reconciliation. There is no verified generic canonical v2 recovery command for the reported cases. “Zero controls anywhere” overstates the gap.

Meta publication is a sequence of writes. A campaign may exist before ad-set/ad creation fails. Its adapter retains partial evidence and treats attempted writes or resumed evidence conservatively. An invalid-argument code or a later failed account check alone cannot prove that a whole operation had no external effect. A lost response after successful creation is the critical duplicate-spend case.

Replace the proposed endpoint with an evidence-driven recovery case and narrowly permitted actions:

| Evidence classification | Allowed resolution |
|---|---|
| Proven no dispatch, no previous/resumed side effects | Correct configuration or create a reviewed draft revision; permit a fenced retry only after current authorization and evidence checks. |
| Confirmed rejection with proof of no partial effect | Same bounded path; error code alone is insufficient proof. |
| Known partial hierarchy or ambiguous write | Reconcile original account/operation; verified pause where supported. Retain quarantine until exact effects are established. |
| Confirmed remote success and matching ownership/content/budget | Adopt through the canonical service with audited local completion; do not create again. |
| Stale/conflicting/incomplete evidence | Keep quarantine and expose the missing evidence/operator action. |

The server determines available actions, never the browser. Require persisted admin authority, campaign/revision/account binding, expected state/version, a reason, idempotency, lease fencing, immutable evidence references and existing financial dual control where relevant. Preview is read-only; execution rechecks evidence freshness and all invariants. Reuse the original financial reservation where valid; a recovery attempt is not new funding or a fresh escrow release. An edited intent requires new review and quote/financial checks as applicable.

Historical jobs, dedupe keys and publishing records remain intact. If an attempt-generation model is needed, specify it in an ADR/migration with a unique parent-operation relationship and no second live attempt. A warning banner can be resolved while its historical error remains recorded. No blanket reset to APPROVED.

### 2. Operational configuration — accept a staged versioned design

Verified: independently booted web/worker processes can load different environment snapshots. Current Meta config permits an empty placements array, while `buildMetaCampaignPlan()` rejects it before dispatch. Move that validation earlier and make capability reasons specific.

Corrections: malformed supplied JSON already throws `MARKETING_CONFIG_INVALID`; it is not silently accepted. Missing configuration is worse: it currently invents enabled testing authority, a P0 repair already in R1. Markup already has a versioned database path through `financeBridge.setMarkup()` and `/admin/policy`; do not introduce a second authority. Publishing obtains its pixel from `META_PIXEL_ID` in `MetaAdsClient`; `conversions.meta.pixelId` is a distinct delivery binding. Validate their intended consistency rather than assuming one setting fixes both.

A mutable JSONB row plus 60-second cache does not prevent divergent decisions. Refine the design as follows:

- First validate explicit environment configuration and expose a non-secret effective-config fingerprint, release identity and observed worker freshness. Do not delay P0 repairs for a configuration migration.
- Then introduce schema-versioned immutable non-secret config revisions, a staged validation/review process and compare-and-swap activation. Reuse existing commercial-policy authority. Keep credentials in the secret store/environment; the database may reference secret versions, never expose their values to the UI or logs.
- Bind reviewed intent, quotes and jobs to the applicable semantic configuration and provider identities. Recheck revocation and spending gates immediately before dispatch; a TTL cache cannot authorize spending after disablement. Configuration changes that alter approved content, targeting, price or destination require the appropriate new revision/review.
- Cache display/read projections where safe. If authoritative spending state is unavailable, block new spend. Preserve separately authorized pause and reconciliation against original identities.
- Migrate by validating/importing explicit values, shadow-comparing projections, then selecting one writer/authority. Avoid dual mutable env/DB precedence. Older immutable versions remain available for in-flight reconciliation; rollbacks cannot silently retarget old operations.

### 3. Account pool — accept health visibility; defer routing and reject mandatory failover

Verified: Meta checks account identity, status, currency, page and pixel before publication; `checkHealth()` already exists. The source rejects status other than 1. The particular live response and its claimed billing cause remain reported evidence, not independently inspected account state. The generic error also covers identity and currency mismatches. A Meta outage blocks that configured Meta route; it does not itself prove all Google advertising is blocked.

Near-term plan: make provider/account health, observation time, stale/unknown status and operation-specific blockers visible through existing admin readiness/operations. Poll with bounded retries/rate budgets and check required current authority at dispatch. Status 1 is necessary in the current adapter, not proof of all billing, policy, permission or destination prerequisites. Do not invent Google “policy strike threshold” APIs or guarantee a 15-minute probe prevents losses.

Defer a multi-account registry/router to a separate justified ADR and controlled migration. If adopted, it needs provider-scoped unique identities, currency/region/legal authority, credential references, allowed destinations and durable account binding before any external side effect. Every subsequent pause, readback, telemetry, conversion, settlement and recovery must use the original bound account. Current provider ownership checks use the configured client identity, so adding a table alone would break lifecycle assumptions.

Reject automatic rerouting after uncertain or partial publication. Permit future reassignment only before side effects are proven absent and after all account/financial/policy checks. Shared business credentials and enforcement can correlate accounts: risk partitioning cannot guarantee isolation. Account routing must not evade enforcement; Google explicitly prohibits circumvention through accounts. [Google policy](https://support.google.com/adspolicy/answer/15938075?hl=en). Legitimate multi-account operations are not categorically prohibited by that statement.

No evidence establishes 3–5 accounts per region or a mandatory day-one pool as a release requirement. Resolve actual billing/permissions and provide honest unavailability first. Hosts still do not connect their own ad accounts. The opinion's 15% advertising-margin premise is superseded by HARVO-008/009; target markup is 3–5% on defined cost, separate from booking commission.

### 4. UI/worker capability parity — refine existing controls

The asserted frontend environment authority is not present in the inspected canonical v2 workspace. `workflow.workspace()` projects server capabilities; `AdminMarketingWorkspace.tsx` consumes them. `OperationsPanel.tsx` already calls `/admin/operations` and `/admin/readiness`.

Extend those contracts with worker heartbeat/release/config fingerprint, provider-bound health and reason codes for each action. Keep server authorization authoritative at dispatch. A worker possessing a token is not enough to override finance, content, inventory, consent or provider gates. A new duplicate status endpoint is unnecessary unless the established contract cannot support this information.

### 5. Webhook observability — accept bounded diagnostics, reject raw payload dumping

The inspected payment ingress verifies signatures and stores a minimal durable envelope; processing checks capture/account binding and jobs retain failure codes. Engine logs provide correlated failures. The alleged silent account-prefix drop is not proven without the original provider event ID, ingress response, job and safe error evidence.

Trace verified ingress → durable receipt → job → provider capture readback → financial outcome. Expose sanitized reason codes, replay outcome, retry/quarantine state and correlation IDs. Invalid signatures should produce bounded metrics/security diagnostics, not an unbounded table of attacker-controlled raw payloads. Preserve existing data minimization, retention and access boundaries. Classify the actual mismatch; do not invent `ACCOUNT_PREFIX_MISMATCH` or rewrite external account IDs to make them pass. Durable verified receipts must survive disablement of new funding.

### 6. Input preflight — accept validation before approval

Use provider-specific schemas and field-level guidance in host/admin preview and server dispatch. Meta already checks countries, placements, page relationships and format compatibility; extend earlier readiness rather than bypassing these guards. Google documents commas among invalid keyword symbols, not a restriction exclusive to exact match. [Google keyword guidance](https://support.google.com/google-ads/answer/2453981?hl=en-GB).

Normalize only well-defined representation before hashing/review (for example accepted country-code casing). Show semantic edits to the user. Do not silently split keywords, broaden geography, replace placements or rewrite approved copy during dispatch. If the payload changes materially, invalidate the affected approval and re-evaluate the revision. Preserve deterministic fingerprints and original submitted intent for audit.

### 7. Sandbox — accept isolated fixtures; reject a production bypass switch

Extend existing injected provider fixtures and deterministic clock tests in a separate test environment. Synthetic captures, consent, telemetry and accelerated escrow belong only to that environment. Require isolated databases, provider test identities, storage and secrets; prevent production credentials/endpoints from being loaded and mark synthetic data explicitly.

A runtime `HARVO_SANDBOX_MODE=true` that can bypass production escrow/verification is not acceptable. Test outage, timeout-after-success, partial Meta creation, replay, worker crash, lost lease and concurrent operators without directly editing production state. Sandbox results do not substitute for the eventual bounded live pilot.

## C. Roadmap, impact and acceptance

Keep R0–R8 and their safety-first order. R1 gains cross-field validation and configuration identity; R5 gains earlier provider preflight and safe field diagnostics; R6 gains evidence-bound recovery actions and traceable webhook outcomes; R7 gains operation/account health and staged non-secret configuration management; R8 gains isolated clock/provider chaos fixtures. Multi-account routing stays deferred pending its own justified design. No generic reset endpoint or production sandbox bypass is included.

Recovery and config management require reviewed schema/API/UI changes and migrations, unlike the immediate gate restorations. Document transitions and compatibility in an ADR before code; preserve original ledger/provider evidence on rollback. Extend existing admin surfaces rather than replacing them. Config publication and recovery both require durable audit, current actor authorization and concurrency guards. Cost, account or consent changes cannot silently reinterpret historical contracts.

Minimum additional adversarial evidence: two concurrent recovery operators; stale browser revision; provider success followed by lost response; failure after each hierarchy write; lease expiry with a still-running request; success adoption; repeat recovery; config revocation during cache lifetime; web/worker revision mismatch; original-account pause after config change; duplicate/out-of-order webhook; invalid signature flood; sandbox attempts to use production identities. Assert both local journal/reservation invariants and absence of duplicate external side effects.

**Completion:** this review refines the engineering plan only. All remediation implementation/acceptance batches remain pending; known P0 defects and legal/provider/checkout/consent gates remain. No “10/10” production certification is awarded.
