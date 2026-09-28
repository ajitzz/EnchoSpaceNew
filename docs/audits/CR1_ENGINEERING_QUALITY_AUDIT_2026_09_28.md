# CR1 engineering quality audit — 28 September 2026

**Verdict: the current implementation does not support a “10/10 FAANG L7/L8”, “48/48 fully verified”, or production-certified claim.** There are valuable, well-engineered foundations. There are also release-blocking security regressions, disconnected prototypes, and generated evidence being presented as external verification.

The central problem is not insufficient visual polish. It is a mismatch between the strength of the completion claims and the authority, integration and evidence behind them. Preserve the good foundations; repair that mismatch before adding more product surface.

## 1. Scope, snapshot and limits

The founder requested an independent assessment, not further implementation or deployment. This audit reads the Constitution, HARVO, the CR1 blueprint and execution ledger, the business plan and decision history, then checks selected high-risk source paths and targeted tests against their claims.

| Evidence boundary | Audited state |
|---|---|
| Committed source | HEAD 0e4c6fec2fe86f1b793760c5f7a3daf08bbf7508 |
| Existing staged changes | 66 files; 19,189 additions and 30,946 deletions before audit documentation |
| Material staged changes | server.ts restored to 19,180 lines; extracted routers/services, some UI, migrations 041–046 and associated tests removed |
| Existing unstaged change | Release-candidate certificate also differs from the index; not treated as independent external evidence |
| Claimed ledger | All 48 packages COMPLETE_LOCAL; 100% checkpoint on 25 September |
| Actual evidence collected here | Source tracing, eight targeted test files, client/server TypeScript, scoped ESLint, inventory validation and offline adversarial probes |
| Not inspected or executed | Production database, remote staging, live provider accounts, real payment capture, current deployed UI, full regression, full build, browser/a11y/load/restore certification |
| Changes made by this audit | Audit report, reproducible offline probes/receipts and documentary qualifications only |

This is a detailed **risk-based semantic review**, not a claim that every line of every file was independently audited. A class name, comment, certificate file, successful compile or historical test count is not proof of deployment or product completion. No production compromise, unauthorized ad spend or actual customer loss was established.

The staged changes must not be mistaken for the last committed release. Conversely, findings in removed HEAD-only code must not be reported as currently reachable vulnerabilities.

## 2. Assessment of the engineering standard

“L7/L8” is an organizational role label, not a software certification. The useful question is whether this release demonstrates coherent authority, repeatable delivery, isolation, financial correctness, recovery and truthful evidence.

The following scores are judgment, not calibrated measurements or completion percentages:

| Dimension | Assessment | Reason |
|---|---|---|
| Architectural direction | 8/10 | The controlling blueprint addresses offers, delegated staff, immutable revisions, provider uncertainty and three-sided journeys correctly |
| Audited canonical foundations | 7/10 | Durable outbox, marketing finance, conversation ordering and SQL IAM checks show substantive engineering; wider integration remains unproven |
| Recent implementation consistency | 4/10 | New prototype engines duplicate existing authority; runtime wiring and current source diverge from completion claims |
| Security boundary consistency | 3/10 | Production owner-issuer exception, insecure remote TLS and competing staff administration paths undermine deliberate isolation |
| Verification and release evidence | 2/10 | Synthetic receipts assert external clearance; targeted security regressions and inventory failure coexist with 100% claims |
| Three-sided CR1 delivery | Not complete | Accepted guest commerce, exact offer campaigns and operational proof are not demonstrated end to end |
| Production reliability/performance | Unrated | No representative current deployment, restore, load, incident or pilot evidence inspected |
| UI quality/accessibility | Unrated | Source review does not establish responsive usability, accessibility or measured performance |

**Overall release-quality judgment: approximately 4/10, with production sign-off withheld.** This does not mean only 40% of code exists. It means the assembled release lacks the proof and integrated safeguards required for its intended financial and operational responsibility.

The architecture is considerably better than the current release discipline.

## 3. Where the engineers did good work

### 3.1 Durable asynchronous execution is a real asset

[src/lib/platform/durableOutbox.ts](/Users/ajit/Documents/EnchoSpaceNew/src/lib/platform/durableOutbox.ts:292) has persisted command identity, request fingerprints, database claims, lease fencing, bounded retries and explicit reconciliation for unknown external outcomes. Claims use SKIP LOCKED; completion checks fence/worker/lease state.

Why this matters: two workers, a crashed process or a delayed response must not publish the same financial/provider command twice. The implementation addresses those failure modes at the database boundary rather than relying solely on process memory.

**Preserve and reuse this component.** New “hardening engines” should not invent separate Map-based substitutes.

### 3.2 Marketing finance has stronger authority than the new convenience paths

[src/lib/marketing/financeService.ts](/Users/ajit/Documents/EnchoSpaceNew/src/lib/marketing/financeService.ts:53) uses host/currency row locks, balanced journal checks, immutable quote fingerprints, exact minor units, capture-to-quote matching and reservation conflicts. These are appropriate controls for host funds.

The audit’s outbox and finance tests passed **32 tests across two files**. They exercise disposable PostgreSQL; external payment verification is supplied by controlled test adapters. This is good local evidence, not a live gateway or settlement certificate.

The correct next step is to integrate all funding/refuel/settlement paths with this authority, not to maintain a second floating-point wallet implementation.

### 3.3 Canonical messaging is more than a cosmetic inbox

The existing conversation work binds participants, orders messages, makes duplicate writes deterministic and writes notification intent transactionally. Scoped support access is separated from participant messaging, with access receipts and current authority checks.

Combined conversation-delivery and privileged-action suites passed **37 tests**. That deserves credit. It still does not prove that every notification channel, service dispatch, disclosed staff response and grounded AI flow is integrated into the product.

### 3.4 SQL IAM guards provide meaningful defense in depth

[Migration 036](/Users/ajit/Documents/EnchoSpaceNew/src/migrations/036_internal_organization_iam.sql:413) checks independent approvers, command hashes, current permission, step-up evidence and authorization transitions in SQL. An application-supplied “approved” flag is insufficient.

This is the right principle. Some newly added administrative code does not follow that protocol, but the database guard should be preserved rather than removed to make that code pass.

### 3.5 Canonical room observations tell the truth about their authority

[src/lib/offers/canonicalRoomReader.ts](/Users/ajit/Documents/EnchoSpaceNew/src/lib/offers/canonicalRoomReader.ts:40) distinguishes observed availability from a held room, accepted quote or publishable price. It validates host ownership and reads room/inventory evidence coherently.

That explicit refusal to manufacture booking authority is good engineering. Calling the observation a completed sellable-offer system is not.

### 3.6 Migration execution is stronger than the new build-time checker

[src/migrations/execution.ts](/Users/ajit/Documents/EnchoSpaceNew/src/migrations/execution.ts:53) holds a connection, verifies migration history/checksums, serializes execution and distinguishes failed statements from uncertain COMMIT outcomes.

Keep this as the canonical migration contract. Reuse its validation semantics in deployment tooling.

### 3.7 Existing containment prevents some bad legacy code from becoming a live path

[src/server/marketing/legacyBoundary.ts](/Users/ajit/Documents/EnchoSpaceNew/src/server/marketing/legacyBoundary.ts:7) retires old paid-marketing mutations. Guest checkout also remains gated. These restrictions are useful safeguards, not defects to remove merely to demonstrate a successful button click.

The source-aware campaign metrics and separate desired/observed provider states are also sound product decisions. Continue showing freshness and uncertainty rather than promising instantaneous network statistics.

## 4. Findings, evidence and required corrections

Severity refers to release significance and potential impact. A prototype-only flaw is explicitly distinguished from a currently mounted route.

### A01 — Release-blocking: generated fixtures are being represented as external clearance

**Evidence**

- [Staging receipt generator](/Users/ajit/Documents/EnchoSpaceNew/scripts/compliance/generate-staging-preflight-receipt.mjs:27) assigns non-superuser/non-BYPASSRLS values directly and emits STAGING_CLEARED_LEAST_PRIVILEGE_VERIFIED. It does not establish those properties by logging in to the named staging database.
- [Canary receipt generator](/Users/ajit/Documents/EnchoSpaceNew/scripts/compliance/generate-provider-canary-receipt.mjs:141) constructs HTTP 200 and PAUSED readback objects in code. Its example remote campaign identifiers are authored constants. It does not call Meta or Google to obtain these responses.
- The tax generator authors attestation fields and treats syntax validation as clearance.
- [Release dossier generator](/Users/ajit/Documents/EnchoSpaceNew/scripts/compliance/generate-cr1-rc-dossier.mjs:48) sets external gates to CLEARED and packages to 48/48, then emits CERTIFIED_RELEASE_CANDIDATE.
- HARVO and CR1-036 through CR1-043 promote these artifacts into claims of verified external operating gates.

**Impact**

A release decision can be made on evidence the software wrote about itself. Hashing such a file proves byte integrity, not the truth of its contents, a professional signature, a provider response or a database role.

This audit establishes invalid evidence provenance. It does not establish the authors’ intent or prove that no independent approval exists elsewhere.

**Required improvement**

Keep these generators only as clearly labeled fixture/demo tooling. Prevent them from emitting production clearance. Preserve the historical artifacts, attach an audit invalidation/qualification and require separately sourced evidence.

A production receipt needs exact artifact/tree identity, schema checksums, environment identity, executed command, observation time, authenticated response references, redaction policy and independent approval where required. Secret values must not be embedded.

**Acceptance:** fixture data cannot pass release promotion; missing, stale, wrong-environment or wrong-artifact evidence fails closed. Actual provider readback and restricted database login must be observed. Legal clearance requires a real approved document and authorized review.

**Traceability:** P0.4–P0.5, P4.3, P6.1/P6.4, P8.1–P8.4; blueprint §18.

### A02 — High: staff session issuance accepts an owner connection in production

[staffSessionIssuer.ts](/Users/ajit/Documents/EnchoSpaceNew/src/lib/iam/staffSessionIssuer.ts:28) enables the owner path whenever execution is outside test/sandbox, even without HARVO_ALLOW_OWNER_ROLE. Ownership plus permission to execute one helper returns success before the strict isolation checks.

The offline probe reproduces this with production environment flags and a fake owner-role query result. It demonstrates the decision defect, not the privileges of a live Neon role.

**Impact:** the supposedly execute-only identity issuer can accept broad table authority. Other IAM readiness checks remain stricter, so the result may also be a confusing “login works, workspace unavailable” split.

**Correction:** remove the production owner exception; require distinct, explicitly configured issuer/runtime roles and verify actual session_user/current_user, inherited privileges, table access and permitted functions. Administrative bootstrap needs its own reviewed operation.

**Acceptance:** actual owner, inherited privileged and raw-table-capable logins are rejected; the narrowly granted issuer can complete login without acquiring table rights.

**Traceability:** P2.3, P0.4, blueprint §6.7/§18.

### A03 — High: workforce connection and origin configuration weaken the intended boundary

[runtime.ts](/Users/ajit/Documents/EnchoSpaceNew/src/server/operations/runtime.ts:35) falls back from CR1_WORKFORCE_DATABASE_URL to generic DATABASE_URL and sets remote TLS rejectUnauthorized to false. The comment above the setting claims strict certificate validation, but the value disables it.

Origin inference also accepts a localhost HTTP origin under an explicitly STAGING environment.

**Observed tests:** two tests in cr1_operations_api.test.ts fail on these contracts. The first stops at the unexpected generic database fallback; source independently shows the insecure TLS value. The second reproduces insecure staging origin acceptance.

**Correction:** explicit environment-bound URLs and origins, certificate/hostname validation, separate production/staging/local policy and no general database fallback for privileged workforce services.

**Acceptance:** the existing security tests pass without relaxing them; add negative certificate/hostname and actual restricted-login coverage.

**Traceability:** P2.3/P2.7, P8.1/P8.2.

### A04 — High: the new workforce admin API creates a competing authorization path

[server.ts](/Users/ajit/Documents/EnchoSpaceNew/server.ts:1060) mounts /api/admin/workforce through consumer-account authentication and global admin checks, using the general pool.

[workforceAdminService.ts](/Users/ajit/Documents/EnchoSpaceNew/src/lib/iam/workforceAdminService.ts:262) can create an ACTIVE membership and a PRODUCTION platform_owner grant from the administrator identity. Hiring writes an ACTIVE accepted membership before the invitation is accepted. Ratification writes approval/status directly rather than going through the complete workforce session/step-up protocol.

This is not the same as the scoped Operations command boundary.

**Important qualification:** persisted user-role checks and SQL checker/authorization triggers still exist. Therefore the evidence does **not** support a claim that any guest can administer staff or that every approval bypass succeeds. Protected operations may instead be rejected by the stronger database policy. Both outcomes reveal an inconsistent design.

The 11 passing admin-workforce tests use a privileged disposable PostgreSQL fixture, not a complete production-shaped restricted staff login.

**Correction:** make the admin UI a client of the canonical IAM commands. Separate reviewed owner bootstrap, invitation acceptance, scoped grant lifecycle and checker approval. Do not auto-promote consumer administrators as a convenience side effect.

**Acceptance:** real HTTP flows with restricted roles cover invite, verified acceptance, factor, scoped command, independent approval, revocation and expired-session denial. Ordinary staff remain unable to acquire global admin.

**Traceability:** P2.3–P2.6.

### A05 — High: a second offline queue persists requests outside the actor-scoped protections

[vite.config.ts](/Users/ajit/Documents/EnchoSpaceNew/vite.config.ts:88) installs a generic 24-hour Workbox background queue for API POSTs. Its exclusions cover marketing-v2 and room-calendar paths, but not operations-v1, admin/workforce or conversations-v1.

The installed Workbox StorableRequest implementation serializes the request body and all request headers into its stored representation. Bearer Authorization headers can therefore be persisted for matching failed requests. The app’s actor-scoped sync service does not establish equivalent logout/purge fencing for this separate queue.

**Impact:** commands and credentials can outlive the visible session, and two independent retry systems can disagree about ownership and current intent. Server authorization may still reject a replay; this audit did not reproduce a cross-user exploit in a real browser.

**Correction:** remove blanket background replay for privileged and financial commands. Use explicit domain allowlists, credential-free intents, fresh authentication, actor/session fences and visible reconciliation. Define service-worker upgrade/logout cleanup.

**Acceptance:** production-built service-worker tests cover offline submit, logout, different-account login, token expiry, tab concurrency and retry. No previous actor’s body or credential may be replayed as the new actor’s intent.

**Traceability:** P1.4/P1.7, P3.6, P8.2.

### A06 — High: disconnected prototype engines are being counted as integrated product delivery

Source/import tracing did not establish a production route/worker path for the newly credited StaysCommerceEngine, CanonicalOfferAuthorityEngine, ConversationDeskEngine, CreativePackageEngine, ProviderPackageEngine and PortfolioCampaignEngine comparable to the claimed CR1 journeys.

For example, [staysCommerceEngine.ts](/Users/ajit/Documents/EnchoSpaceNew/src/lib/commerce/staysCommerceEngine.ts:72) describes a server-authoritative quote, but multiplies caller-provided nightlyRatePaise and writes test_commerce_* tables. The current staged tree removes its later commerce router and migration. That class is not evidence of a working guest booking authority.

The host CampaignStudio still initiates a listing-based draft. The read-only room observer explicitly denies accepted booking/campaign/price authority. Together these do not demonstrate the required offer-revision chain.

**Correction:** build one vertical slice through existing canonical services: selected room/rate/conditions → immutable offer → server quote/hold → verified capture → confirmed booking; and offer → campaign revision → review/funding → paused provider readback. Trace every UI action through actual router, service, schema, worker and receipt.

Do not “fix” disconnected engines by exposing them directly.

**Acceptance:** end-to-end tests invoke mounted APIs and real disposable schemas with tenant roles; restarting processes retains state; changing client price or another host’s identifiers cannot alter authority.

**Traceability:** P3.4–P3.6, P4.2–P4.6, P5.1–P5.5, P6.2–P7.3.

### A07 — High: new hardening engines use process memory as durable replay/sequence authority

[pausedCanaryHardeningEngine.ts](/Users/ajit/Documents/EnchoSpaceNew/src/lib/compliance/pausedCanaryHardeningEngine.ts:72) holds completed results and sequence state in Maps. Several companion engines repeat this pattern.

Offline reproductions show:

1. Two engine instances attempt two registry inserts for the same key.
2. Reusing a key with a different listing/campaign returns the prior result instead of an idempotency conflict.
3. A fresh instance accepts sequence 6 after another instance applied sequence 9.

The fake query recorder proves attempted duplicate writes and lost in-process state. It does not prove a live database committed duplicate rows.

**Correction:** database uniqueness over scoped command identity, a canonical payload fingerprint, compare-and-swap sequence state and held-client transactions. Reuse the existing durable outbox. Treat lost COMMIT/provider acknowledgement as uncertain, not automatically retryable.

**Acceptance:** separate processes/connections, restarts, conflicting payloads, timeout after COMMIT and lease expiry all preserve a single correct outcome.

**Traceability:** P1.3/P1.7, P6.5, P8.3/P8.4.

### A08 — High before integration: new SQL paths interpolate command fields

The canary engine’s inserts at [line 166](/Users/ajit/Documents/EnchoSpaceNew/src/lib/compliance/pausedCanaryHardeningEngine.ts:166) interpolate identifiers/operator fields directly. A benign operator value containing an apostrophe produces malformed SQL, confirmed by the probe. Similar patterns occur in new compliance/creative/portfolio prototype code.

**Exposure qualification:** the audited canary engine was not established as a mounted public API. This is unsafe code awaiting integration, not a confirmed internet-exploitable production endpoint.

**Correction:** Zod at each trust boundary, parameterized SQL, constrained canonical IDs and a transaction port that cannot accidentally execute BEGIN/COMMIT through unrelated pool connections.

**Acceptance:** quotes and unusual Unicode are safely handled; oversized/invalid data is rejected; malicious strings remain values; adversarial tests use real PostgreSQL.

### A09 — High: “exact provider readback” does not compare enough authority

[pausedCanaryHardeningEngine.ts](/Users/ajit/Documents/EnchoSpaceNew/src/lib/compliance/pausedCanaryHardeningEngine.ts:103) accepts a readback tagged GOOGLE_ADS against a META_ADS request in the offline probe.

Checking campaign ID, PAUSED and zero daily budget is not exact verification. Provider identity, account binding, child resources, revision/assets, geography, finance authorization and effective settings must be included.

A zero budget is also not the same fact as observed zero spend, and it is not proof that the provider accepts the requested object configuration.

**Correction:** authenticated versioned adapters must read back the actual account/campaign/ad-group-or-ad-set/ad hierarchy and compare the capability-specific normalized snapshot. Preserve valid provider budget requirements while verifying non-spending status and observed spend separately.

**Acceptance:** wrong provider/account, stale revision, child activation, targeting drift and ambiguous partial creation all fail verification or enter reconciliation. No synthetic readback clears a canary gate.

**Traceability:** P6.1/P6.2/P6.5/P8.3.

### A10 — Release-blocking for commerce: tax authority and attestation are not validly established

[statutoryTaxVerificationEngine.ts](/Users/ajit/Documents/EnchoSpaceNew/src/lib/compliance/statutoryTaxVerificationEngine.ts:109) hardcodes GST, commission, TCS and TDS arithmetic without an effective-dated approved policy. It applies a nightly threshold to an aggregate input and does not model the required supplier/booking policy conditions. Another new commerce engine uses unconditional 18% GST, so there are conflicting authorities.

Its attestation method at [line 210](/Users/ajit/Documents/EnchoSpaceNew/src/lib/compliance/statutoryTaxVerificationEngine.ts:210) returns verified:true for a merely well-shaped string. The audit supplied a fictional name and a generated 18-character value and received ATTESTATION_VALIDATED.

The code’s 1% Section 194-O rate also conflicts with the official department’s published 2025 text, which gives 0.1% and records the 1 October 2024 amendment. That alone invalidates the claim that these fixed constants demonstrate reviewed statutory accuracy. This audit does not determine every tax applicable to a September 2026 transaction; current legal applicability and any successor provisions need professional review. [Income Tax Department, Section 194-O](https://www.incometaxindia.gov.in/w/section-194-o-6).

**Correction:** one approved, effective-dated policy authority with supplier status, tax basis, commission plan, rounding, withholding, refund/credit-note treatment and signed professional evidence. Treat identifier syntax as syntax only. Keep checkout gated.

**Acceptance:** independent approved examples match quote, capture, invoice, payout and cancellation. Fake, expired or unreviewed attestations cannot unlock commerce.

**Traceability:** P4.3–P4.6, P6.4.

### A11 — High: the build-time schema checker overstates what it checks

[scripts/deployment/verify-schema-sync.mjs](/Users/ajit/Documents/EnchoSpaceNew/scripts/deployment/verify-schema-sync.mjs:44) selects checksums but only compares presence of version names. Changed checksums and unexpected database history do not prevent its SYNCHRONIZED success result.

It also loads .env and contacts DATABASE_URL as part of npm run build; certificate validation is weakened in its connection configuration.

**Correction:** separate artifact compilation from explicitly targeted deployment verification. Compare exact manifest and database checksums, reject unknown/out-of-order history, validate actual role/catalog authority and reuse canonical validation.

**Acceptance:** altered SQL, extra migrations, missing predecessor grants, privileged runtime and wrong environment all fail. Offline builds require no production secrets or database access.

**Audit handling:** npm run build was deliberately not used to avoid silently contacting the generic remote database during this local review.

**Traceability:** P0.4, P8.1/P8.2.

### A12 — High: the current tree is not the artifact that historical acceptance describes

Migrations 041–046, extracted modules, some UI workspaces, a worker and tests are staged for deletion; server.ts is restored to 19,180 lines. This may remove unsafe recent implementations, but it also means their historical completion receipts cannot certify the current tree.

The inventory check currently fails with “Uninventoried Express route owner: src/server/admin/workforceRouter.ts”.

If any removed migration was applied to a target database, deleting the source is not an acceptable rollback. This audit did not inspect remote history, so it does not assert that those migrations were applied.

**Correction:** explicitly classify the staged change set as retained, intentional rollback, replacement or accidental loss. Reconcile deployed migration history before further schema changes. Bind all receipts to the actual complete artifact/tree and environment, not just an older commit hash.

**Acceptance:** route inventory is clean; every live schema version remains recoverable; accepted functionality is traced through current source; rollback follows compatibility contracts.

**Traceability:** P0.2/P1.5, all phase exits, P8.

### A13 — Medium: the “Merkle audit trail” is a narrower hash chain and has concurrency gaps

[workforceAdminService.ts](/Users/ajit/Documents/EnchoSpaceNew/src/lib/iam/workforceAdminService.ts:184) computes a linear SHA-256 chain, not a Merkle tree. The serialized hash payload does not bind all stored actor/evidence fields. Appending reads the latest hash without serializing all appends for the organization.

Two concurrent transactions can read the same predecessor and create competing successors. Append-only triggers are helpful but do not automatically solve chain ordering or full-field integrity.

**Correction:** use a canonical envelope covering actor, command, policy, evidence digest and ordered predecessor; serialize appends per scope, or adopt a correctly specified event stream/anchoring model. Do not claim resistance to a database administrator who can rewrite both data and hashes without an independent anchor.

**Acceptance:** concurrent appends verify consistently; changing every security-relevant field is detectable; audit export/retention/verification are independently exercised.

**Traceability:** P2.5/P2.6/P8.2.

### A14 — Medium/high delivery issue: the latest refuel fix does not complete safe top-ups

HEAD commit 0e4c6fe adds campaign ownership and balance checks. These are useful repairs in isolation.

However, in the committed legacyMarketing.router.ts refuel handler:

- Caller-supplied paymentMethod other than wallet skips the funding branch.
- Balance locking and debit are separate pool queries without a held transaction.
- There is no accepted incremental quote, verified capture or complete journal/idempotency contract around the budget increase.
- The endpoint is behind the legacy marketing retirement middleware.

The current staged tree deletes that router. Therefore this is **a committed-code review finding, not a claim that the current production endpoint successfully permits unfunded spending**.

**Correction:** do not restore or expose it as the fuel-gauge backend. Implement top-up as a revision-bound financial command with explicit allowed payment rails, accepted cost/tax scope, verified funds, atomic reservation and provider budget readback.

**Acceptance:** double click, concurrent withdrawals, forged paymentMethod, capture replay, provider failure and uncertain acknowledgement never create unauthorized spend.

**Traceability:** P6.4, P7.1/P7.2.

### A15 — High process issue: test labels and counts overstate verification depth

Canary/certificate suites use fake query ports and single-instance Promise.all bursts. They establish local branching and some rollback intent. They do not establish database atomicity across workers, an observed 200 ms performance guarantee, a provider response or a professional attestation.

Both the client and server TypeScript checks passed here, but the client configuration is not globally strict; lint disables no-explicit-any and some other rules. “Lint passed” is not equivalent to the stated strictness standard.

**Correction:** separate pure unit, actual database, restricted-role integration, deployed browser, provider sandbox/canary and external approval evidence. Improve strictness incrementally at new boundaries rather than weakening tests or attempting a repository-wide speculative rewrite.

**Acceptance:** each package has a current artifact-linked test/evidence set matching its exit criteria, including negative cases. A test name cannot clear an external gate.

## 5. Does the software implement the founder’s vision?

| Journey | What is credible now | What is not established | Required integrated proof |
|---|---|---|---|
| Guest discovery | Existing listing/gallery and canonical room/inventory foundations | Complete truth/accessibility/performance acceptance for current tree | Room-specific content, dates and price conditions agree across surfaces |
| Guest books a stay | Inventory authority and deliberate checkout containment | Complete accepted quote → hold → gateway capture → confirmed trip → cancellation/refund | Real mounted flow, tenant roles, duplicate/failure recovery and approved legal policy |
| Host promotes mixed-room resort | Read-only per-room observations; existing versioned strategy and marketing-v2 foundations | Campaign bound to the exact chosen sellable offer/rate/conditions | Budget room and premium suite remain distinct through creative, landing page, quote and spend |
| Host uploads a new Reel/post/carousel | Existing media/story foundations and review concepts | End-to-end external Creative Package rights, derivatives, exact-byte review and provider integration in the current staged tree | Guest/host/admin projection parity and capability-specific delivery |
| Host launches without ad expertise | Existing campaign studio and defaults | Complete staff-authored expert program replacing host-facing technical setup | Host chooses subject, bounded intent, creative, locations and cost; provider mechanics remain staff-owned |
| Host monitors four campaigns | Existing outcome/observation infrastructure | Current four-flight golden path, deduplicated booking totals and failure UX | Four independent flights with source/window/freshness; one booking cannot be counted four times |
| Staff help admin safely | Strong IAM primitives, Operations shell and admin workforce UI | One coherent scoped command path across all desks | Separate author/reviewer, step-up, session revocation and auditable support access |
| Guest inquiry becomes booking | Durable conversations and access-controlled service foundations | Complete notification receipt, disclosed staff reply/AI assist and commerce linkage | Guest asks, host receives alert, replies, staff assists lawfully, guest books once |
| Admin operates providers | Actual existing Meta/Google adapter foundations | Native-console parity, current cleared accounts and independently observed canary | Capability-bounded studio and authenticated write/readback/rollback evidence |
| Company knows whether ads work | Consent/outcome concepts and financial journal | Reconciled commercial pilot with fulfilled stays, refunds and staff cost | Campaign cohort evidence separating attribution from incremental lift |

The business must not confuse an observed click, an inquiry, a paid booking and a fulfilled profitable stay. Each is a different event with different uncertainty and economics.

## 6. Commercial and operating alignment

1. **Zero Host OAuth is a user experience, not a provider-risk shield.** Correct account topology and provider approval still matter. AI plus human review reduces risk; neither guarantees protection from suspension.
2. **Offer economics must drive strategy.** One resort can contain several price bands. A property’s lowest price does not authorize premium-room claims. Discovery campaigns and specific offers need distinct price language.
3. **Advertising markup and booking commission are separate.** The old business plan still says 15% advertising fee, while the Constitution records 3–5% cost-plus direction. At C = ₹10,000 and p = 5%, target markup is ₹500 before costs outside that accepted base. That is a constraint on review/support effort, not evidence of profitability.
4. **Campaign optimization is not a conversion guarantee.** Show genuine delivered outcomes, freshness, costs, uncertainty and host obligations. An animated budget gauge cannot establish product-market fit.
5. **A staffed CRM is part of the product.** Measure first-response distribution, unanswered inquiries, provider notification receipts, escalation coverage and assistance-to-booking outcomes.
6. **Pooled campaigns remain a separate product.** Collection ordering is not ad-network impression allocation; do not move funds between hosts to make a pool look active.
7. **Paid advertising and organic social publishing need separate authority.** Brand-page posting is not automatically authorized by campaign funding.
8. **No invented company survival probability.** Percentages in the historical business plan are unsupported judgments, not investor-grade forecasts.

A credible pilot measures provider spend, captured/refunded funds, fulfilled booking contribution, review minutes, support minutes, host satisfaction and repeat funding. Growth should follow this evidence.

## 7. What to preserve, refactor, replace or quarantine

| Treatment | Components | Reason |
|---|---|---|
| Preserve | Marketing-v2 finance, durable outbox, canonical room/inventory, conversation ordering, core SQL IAM guards | Stronger existing authority and meaningful local tests |
| Preserve containment | Retired legacy mutations, blocked checkout/paid pool boundaries | Missing acceptance must not become live spend or guest charges |
| Refactor additively | Workforce admin UI/backend, deployment verification, service-worker command handling | Keep useful UX while restoring one canonical boundary |
| Integrate | Offer revision, Creative Package, staff program, conversation/service and campaign outcomes | Finish vertical journeys rather than add isolated classes |
| Quarantine as fixtures | Synthetic external-clearance generators and receipts | Useful examples are not production evidence |
| Replace before integration | Map-authoritative idempotency, raw SQL interpolation, format-only external verification | Conflicts with existing durability/security contracts |
| Reconcile, not blindly restore | Staged deleted migrations/modules/UI/tests | Restoring unsafe code wholesale would not improve quality |
| Clarify documentation | Business plan, HARVO acceptance narrative, ledger/certificates | Historical direction, proposals and evidence must remain distinguishable |

## 8. Package ledger disposition

This audit does not invent a new completion percentage. Reopening a release claim is not the same as deleting all work already accomplished. A full independent reacceptance of all 48 packages was not performed.

| Packages | Audit disposition |
|---|---|
| P0.1 | Preserve architecture/decision reconciliation; qualify the newer unsupported clearance claims |
| P0.2 | Reopen current inventory exit: new route owner is unregistered and staged topology changed |
| P0.3 | Recheck environment/evidence ownership; do not accept generated clearance as configuration proof |
| P0.4–P0.5 | Require actual role/bootstrap/staging evidence; current synthetic receipts cannot close these exits |
| P1.1–P1.3 | Preserve foundations; P1.3 has passing targeted database evidence |
| P1.4 | Reopen offline credential/actor guarantee because Workbox creates a second persistence path |
| P1.5–P1.7 | Keep legacy containment; reverify callers, cross-domain command adoption and production service-worker recovery |
| P2.1–P2.2 | Preserve SQL guards and scoped permission foundations; deployed role acceptance remains separate |
| P2.3–P2.6 | Reopen issuer configuration and admin integration acceptance; retain useful primitives/UI |
| P2.7 | Current phase exit is not green: two Operations boundary tests fail |
| P3.1–P3.2 | Preserve canonical identity/ordered-write work; retain the passing delivery evidence |
| P3.3–P3.6 | Require complete notification, staff-assistance, AI and browser journey evidence; previous limitations are not resolved by prototypes |
| P4.1 | Current guest truth/accessibility/performance exit needs direct browser evidence |
| P4.2 | Read-only room observation is partial, not accepted sellable-offer/price authority |
| P4.3–P4.6 | Require authentic policy approval and integrated commerce/recovery; checkout remains contained |
| P5.1–P5.5 | Require actual offer/creative/review/provider three-surface integration in current source |
| P6.1–P6.5 | Require account/capability proof, expert program integration, correct funding and exact provider recovery |
| P7.1–P7.3 | Require real host one-click, concurrent portfolio and inquiry/a11y journeys; UI/class presence is insufficient |
| P8.1–P8.4 | Not independently certified; synthetic staging/canary/pilot/certificate artifacts do not meet exits |

This covers all 48 package identifiers without pretending each received exhaustive semantic reinspection.

## 9. Recommended correction sequence

These are audit recommendations, not newly approved commercial policies or a claim that implementation was performed.

| Order | Work package | Owner | Exit evidence |
|---|---|---|---|
| 1 | Correct evidence provenance and qualify 100%/clearance statements | Engineering lead + release reviewer | Fixture artifacts cannot certify production; gate owners/evidence are named |
| 2 | Reconcile committed/index/deployed source and migration history | Release/database lead | Reviewed change manifest; no lost deployed migration; clean route inventory |
| 3 | Restore workforce issuer/TLS/origin isolation and consolidate admin commands | IAM/security lead | Restricted LOGIN-role HTTP tests; two current failures repaired; no owner fallback |
| 4 | Remove generic privileged offline replay | Frontend/platform lead | Production service-worker logout/account-switch/offline tests |
| 5 | Replace duplicate pseudo-durable hardening with canonical outbox/finance boundaries | Platform/finance lead | Multi-process replay, conflicting payload, crash and unknown-COMMIT tests |
| 6 | Complete one legally approved room-offer booking slice | Commerce + product + professional policy owner | Quote/hold/capture/booking/refund agrees in UI, API, journal and receipts |
| 7 | Complete one offer campaign slice with exact paused readback | Marketing/provider + review staff | Immutable facts/assets/account/revision, accepted funding, no unsupported controls |
| 8 | Complete inquiry-to-service-to-booking and four-flight portfolio | CRM/product/frontend | Freshness-aware outcomes, dedupe, alert receipts, scoped assistance and accessibility |
| 9 | Execute release and bounded pilot acceptance on the exact artifact | Independent reviewer + operations | Full CI, browser/load/restore drills, authenticated canary, reconciled pilot |

Estimate tasks only after orders 1–2 establish the actual source and deployed baseline. The quantity of staged reversion makes a confident full-release date premature.

No architectural rewrite is needed to start. The important correction is to make existing strong modules own the new flows.

## 10. Verification performed in this audit

| Check | Result | Interpretation |
|---|---|---|
| Canary hardening + release certificate unit suites | 10 passed, 2 files | Their mocks pass; not external clearance |
| Privileged actions + conversation delivery | 37 passed, 2 files | Valuable targeted foundation coverage |
| Admin workforce + Operations API | 18 passed, 2 failed, 2 files | Security/config regressions reproduced |
| Durable outbox + marketing finance | 32 passed, 2 files | Valuable database-backed foundation coverage |
| Total targeted tests | **97 passed, 2 failed; 99 tests across 8 files** | This is not the full repository suite |
| Client TypeScript | Passed | Static compile only |
| Server TypeScript | Passed | Static compile only |
| Scoped ESLint on five reviewed source files | Passed | Not full-repository lint or proof of secure semantics |
| CR1 route/schema inventory | Failed | Uninventoried admin workforce route |
| Offline adversarial probes | Eight assertions reproduced the documented contract weaknesses | No actual database/provider contacted by the probe |
| Full regression / full build / browser / live canary | Not run in this audit | No claim of passing or failing these checks |

The test runner used Node 24 and the repository’s sanitized test environment. Database tests used disposable local fixtures. No remote migration, provider mutation, deployment, customer message or charge was performed.

Reproduce the focused tests with Node 24 and scripts/testing/run.mjs, using the named files in the accompanying validation receipt. Reproduce the adversarial probes with:

    npx -y node@24 --import tsx docs/audits/CR1_QUALITY_AUDIT_2026_09_28_PROBES.mts

The [offline probe results](/Users/ajit/Documents/EnchoSpaceNew/docs/audits/CR1_QUALITY_AUDIT_2026_09_28_PROBES.json) and [validation receipt](/Users/ajit/Documents/EnchoSpaceNew/docs/audits/CR1_QUALITY_AUDIT_2026_09_28_VALIDATION.json) distinguish simulation from observed local commands.

## 11. What a defensible senior-engineering sign-off would require

A release reviewer should be able to answer, with evidence:

- Which exact artifact, schema and configuration are running?
- Which authority approved this offer, creative, policy, staff action and funding?
- What happens after a timeout, duplicate callback, worker restart or revoked session?
- Can another host or an overpowered application role bypass this boundary?
- Does provider readback match the approved revision and account?
- Can the guest finish and later cancel/manage the actual stay?
- Can staff support the case without impersonating the host or exposing private content?
- Are metrics delayed, attributable, deduplicated and financially reconciled?
- Have restore, pause, rollback and support escalation been exercised?
- Which statements are measured, which are simulated, and which remain unknown?

The current source provides good answers in some foundational modules and inadequate answers across the assembled release. That is why the right response is targeted integration and evidence repair, not more “10/10” labels.

**Recorded completion: 100% claimed (48/48). Audit outcome: not independently certified; no replacement numeric completion is asserted.**
