# Search Portfolio SP0/SP1 — technical blueprint and execution contract

Date: 21 September 2026. Authority: HARVO-031, the founder's explicit approval and instruction to begin execution. The directive calls this Phase 2 execution; it authorizes both this blueprint and engineering work. Historical Boardroom restrictions on local implementation are superseded. Production acceptance, guest legal gates and paid pilot authority remain separate.

## 1. Approved product boundary

1. **Dedicated Stays Campaigns:** one host's authorized budget promotes that host's published property and verified differentiators at `/stay/{slug}`.
2. **Opt-In Pooled Destination Campaigns:** generic destination advertising lands on a curated collection. Membership, funding, allocation policy and reporting are explicit and versioned. Encho must distinguish collection exposure it controls from impressions the provider chooses. No promise of equal or guaranteed provider impression allocation is inferred from this approval.

The founder accepts the single-account auction correction, rejects account proliferation as evasion, requires canonical creative evidence and opaque signed attribution, and authorizes the integrated SP0–SP7 sequence. Keyword research, Meta geography, multi-asset creative and timezone-safe presets are expressly included. Historical 5/10 marketing acceptance does not become 100% through this directive.

## 2. Verified baseline and root causes

The fresh complete isolated Node 24 baseline on 21 September records 1,298 passed, 127 failed and 268 pending/unexecuted tests across 126 files. Forty-six historical files fail. Some expect synthetic credential success or unsigned Google sign-in; others fail before exercising their intended assertions because pg-mem fixture schemas omit real columns/tables. These are distinct causes and require individual source-contract dispositions. The per-file inventory is in `docs/harvo/SP0_RELEASE_FAILURE_REGISTER.md`; post-change counts are tracked separately.

Additional source-confirmed SP0 gaps are the partial provider status reducers, silent Meta observation failure, provider IDs in shared host presentation, weak recovery readiness checks, competing recovery reads, blanket pause quarantine, missing CI evidence retention/redaction, and regex/fixed-date inventory fixtures.

## 3. Scope and impact analysis

Classification: security, reliability, test infrastructure, API projection and documentation. SP1 adds contracts and threat modeling; it does not create spend authority.

| Area | Expected changes | Impact and regression boundary |
|---|---|---|
| Historical test gate | Source-backed fixture repairs and replacement of obsolete assertions with positive/negative current-contract coverage | No blanket skip, weakening authentication, or synthetic provider success; full suite remains required |
| Provider observations | Version-bound status maps and bounded diagnostic records | Unknown status stays unknown; credentials, response bodies and free-text errors are not logged |
| Host/admin projection | Public `submitted` indicator; provider IDs limited to authenticated admin operations | Pause/refresh/settlement remain available to hosts through Encho campaign IDs; client hiding alone is insufficient |
| Pause/recovery | Typed pre-dispatch refusal versus uncertain dispatch; durable attempt ownership | No dedupe deletion, quote/reservation mutation, or automatic replay of uncertain provider writes |
| Readiness | Check migration identity, expected RLS policies, append-only protections and privileges | Read-only catalog inspection; production role/schema drift fails closed |
| Inventory benchmark | Explicit fixture manifest and future dates relative to fixture clock | Disposable cluster only; use entire migrations; no application startup or live database |
| CI evidence | Bounded retention and summaries without assertion payloads | Preserve exit status and failure identities; raw fixture diagnostics remain local |
| SP1 schema/API | Versioned draft contracts described below | No migration until contract review and SP0 prerequisites pass; no silent field introduction |

## 4. SP0 numbered execution units

### SP0.1 — Failure inventory

Generate an inventory from the complete test result with file, failed/unexecuted counts and a stable failure category. Investigate suite setup failures from the local log. Keep a disposition register with source authority, correction and rerun evidence for each file. No file is excused merely because it is old.

### SP0.2 — Observation and presentation integrity

Record failed Meta reads with local observation correlation ID, provider version, bounded error code, safe provider trace identifier and duration. Keep unknown results fail-closed. Introduce a host-safe `delivery.submitted` boolean and remove external IDs from host JSON and shared host rendering; preserve IDs for persisted administrators. Host event history keeps event identity, revision, type and time, with only explicitly allowed host-facing evidence (currently the host’s refund reason); arbitrary internal audit payloads remain administrative. Contract-test host detail, workspace and action projections as well as UI behavior.

Version-specific Google/Meta enum coverage follows explicit official reference inspection. Review, eligibility, serving, spend coverage and final billing remain independent; new enums cannot default to success.

### SP0.3 — Fixture and CI integrity

Replace inventory benchmark regex extraction with a checked-in, explicit baseline plus the complete ordered canonical migrations. Assert one successful hold, 99 conflicts, zero other outcomes and exactly two held nights. Use relative future dates. Verify missing prerequisites fail rather than skip.

CI emits a safe failure/count summary and retains it for seven days. It does not upload unrestricted raw provider/fixture logs or JSON containing assertion bodies. Local logs remain available for investigation. The original test exit code always controls CI outcome.

### SP0.4 — Recovery and readiness

Claim a recovery attempt durably before the provider read; identify exact actor/revision/payload and deterministic replay/conflict. Do not hold a transaction over HTTP. Verify demotion and unchanged operation evidence before committing recovery. Use a new additive migration only after the claim model is reviewed.

Expand readiness catalog checks to expected policy definitions/roles, receipt immutability trigger/function, runtime grants and applied migration checksums. Require non-bypass-role adversarial tests. Distinguish local catalog acceptance from production rollout proof.

### SP0.5 — Complete gate and promotion

Run repository lint, both TypeScript checks, the complete isolated Node 24 suite, public/private build audit, compiled smoke, impacted browser interactions and migration-backed concurrency/restore checks. Review actual GitHub protection/deployment settings before claiming remote promotion is enforced. A green local suite cannot prove remote settings or production readiness.

## 5. SP1 service contracts

### 5.1 Authority and versioning

Server-resolved persisted actor, host, listing and serving-account bindings are authoritative. Caller bodies never select credentials, account IDs, arbitrary URLs, approval states, finance references or another host. Every write checks expected revision, an idempotency key and a semantic fingerprint. Policy changes invalidate affected preflight evidence and require re-review; they never mutate accepted historical quotes.

Initial overlap assessments run in **shadow mode**. This is an engineering rollout default, not a founder-approved right to block or redistribute host traffic. Escalation to warnings/acknowledgements/blocks requires validated thresholds and a published policy. Administrative policy activation is designed for independent review; exact activation roles remain an explicit contract item.

### 5.2 Keyword research

Request: owned listing ID, expected listing version/hash, bounded keyword seed, resolved Google geo/language resources and network. The canonical URL seed is built by the server. Result: research ID, provider/API version, source, fetch time, historical period, nullable volume/competition/CPC values, currency, typed availability and cache expiry.

Port: `KeywordResearchPort.research(context, request)`. It is read-only. Coalescing/cache keys include tenant, serving account and all semantic filters. Shared account quotas are enforced across workers; credentials and raw responses are never returned. No-results, rate limit, unavailable and zero remain distinct.

### 5.3 Canonical facts and creative

`CanonicalMarketingFactProjection` returns host-supplied/moderated fields with source identity, revision and evidence hash. The creative manifest contains approved source/derivative hashes, fact citations, aspect ratios, card order and canonical destination. Removed amenities, media, rights or publication status invalidate unused approval. No gallery DOM/array position is an authority.

### 5.4 Search assessment

`SearchPortfolioConflictAnalyzer.assess()` consumes an immutable campaign revision, normalized comparison terms, exact match types, geo/language scopes, bounded dates and policy version. Original provider terms remain unchanged. Admin evidence may identify competing campaigns; host output contains fixed explanation codes and that host's own configuration, without rival names, terms, budgets or performance. The service cannot debit, publish, move funds or promise provider selection.

### 5.5 Meta geography and schedules

`MetaGeoResolver` returns only provider-resolved capabilities/identities valid for the configured API version, geography and reviewed policy category. Host selection is revision-bound. Exact provider constraints must be verified before a compiler accepts new target types; no fixed 25 km or residents-only rule is assumed.

`CampaignSchedule` distinguishes ad flight from guest stay dates and records IANA timezone, local wall times and resolved instants. Ambiguous/nonexistent local times require explicit resolution, never silent shift. Google date-only account-timezone contracts remain separate from Meta timestamp contracts. Presets resolve to reviewed values; workers do not reinterpret them later.

### 5.6 Pooled membership and allocation

State proposal: `INVITED -> CONSENTED -> ELIGIBLE -> ACTIVE`, with `PAUSED`, `WITHDRAWN`, `EXPIRED` and `INELIGIBLE` carrying reason and effective time. Each contribution references its own accepted quote/capture/reservation; pool membership itself cannot debit a wallet. Withdrawals stop future allocation according to the disclosed policy without rewriting historical exposure or attribution. Provider impression totals, collection exposure, click attribution and booking attribution are distinct evidence series. Allocation algorithm, accounting/tax close and refund treatment require finalized contracts before funding Product 2.

### 5.7 Attribution

Issue signed opaque campaign-revision/asset references; signing keys stay server-side with key ID/rotation/expiry. Public reference integrity is not proof of a human click, consent, payment or booking. Replay/copying cannot create billable authority. Authoritative session/consent and booking sources remain separate. Use server deduplication and purpose-limited retention before provider conversion delivery.

## 6. Data/API impact

Proposed additive tables retain responsibilities in the integrated report: research requests/ideas, campaign search targets/scopes, immutable assessments/acknowledgements, destination pools/memberships. Tenant tables use FORCE RLS with actual non-bypass-role tests; cross-tenant portfolio analysis uses a constrained service authority, never a host query. Cache entries containing listing seeds stay tenant-scoped.

Proposed endpoints remain `/api/marketing/v2/targeting/google/keyword-ideas`, revision-bound campaign assessment/acknowledgement, bounded Meta geo lookup, and admin portfolio review. Strict body schemas reject unexpected fields. Future collection pages require guest display, host membership controls and admin moderation together. No Product 2 launch occurs with only a backend table.

The SP0 host projection change intentionally narrows `delivery.externalCampaignId` and event evidence. Updated clients use `delivery.submitted`; deployment must coordinate client/server versions and refresh cached clients. Unknown/missing submission evidence disables controls until refreshed. The immutable internal record and authenticated admin projection retain their identities.

## 7. Threat model and tests

| Threat | Required control and adversarial test |
|---|---|
| Cross-host data/cache leakage | RLS, owned listing lookup, tenant cache keys, sanitized host assessment; host A cannot infer host B strategy |
| AI prompt injection/fabricated facts | Untrusted listing content, exact canonical citations, no autonomous approval/spend |
| Public token replay/tampering | MAC, expiry/key rotation, opaque IDs, deduplication; never treat URL possession as booking/payment authority |
| Stale revision or policy | Fingerprint/version checks at review, queue claim and pre-dispatch; reject changed evidence |
| Provider uncertainty | Original claims and readback, quarantine unknown writes, no reset/failover bypass |
| Pooled cross-subsidy | Contribution-level ceiling/accounting and explicit consent; no transferring one host reservation into another |
| Quota exhaustion | Shared account limiter, tenant budget, cache/coalescing; concurrent workers cannot exceed allocation |
| False live state | Separate configured/readiness/reporting/serving evidence and timestamps; unknown stays unknown |
| Diagnostic leaks | Allowlisted telemetry and safe CI summaries; malicious errors cannot serialize credentials or PII |

## 8. Rollout and rollback

SP0 corrections land in independently verifiable batches. Preserve pre-existing worktree edits and dated evidence. SP1 contracts precede migrations; new features default off and begin with read-only/shadow operation. No pooled money, provider mutation or conversion upload is activated by these contracts alone.

Rollback disables new feature routes/flags while preserving immutable operations, receipts, reservations and audit history. Do not restore synthetic success, unsigned authentication or raw host provider-ID projections. Database rollback retains additive evidence tables and restores the compatible application version.

## 9. Acceptance and execution evidence

SP0 exits only on a green complete release gate plus verified operational prerequisites; a historical test replacement requires documented equivalent behavior, not deletion. SP1 exits when contracts, threat model, schema impacts and host/admin boundaries have implementation evidence and security review. Product approval is already recorded; it is not a pending permission request.

Current execution results are maintained in `docs/harvo/SEARCH_PORTFOLIO_EXECUTION_VERIFICATION.md`. Production account/policy, genuine checkout/consent, independent review and bounded live pilot evidence remain separately tracked blockers. No milestone is accepted by document creation.
