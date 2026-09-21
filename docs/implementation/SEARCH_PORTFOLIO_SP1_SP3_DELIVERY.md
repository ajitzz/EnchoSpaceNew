# SP1–SP3 implementation, threat boundaries and deployment contract

Authority: HARVO-032. Date: 21 September 2026. This records implemented local source and remaining acceptance work; it does not certify production or replace the founder's SP0–SP7 roadmap.

## Milestone position

| Track | Implemented in this batch | Remaining acceptance or implementation |
|---|---|---|
| SP0 | Historical suite repaired without exclusion; version-bound provider statuses; durable recovery claims; strict catalog/readiness; isolated build and smoke | Actual Neon migration/grants/restore, required GitHub checks and promotion controls, independent operating acceptance |
| SP1 | Dedicated and pooled service contracts; immutable canonical facts; dedicated revision/product binding; host/admin projection; owned asset verification and non-bypass tests | Full pooled membership/contribution/allocation implementation and independent threat/finance review; dedicated free-text copy is not yet a literal fact compiler |
| SP2 | Google v25 read-only adapter, historical metrics, durable tenant cache, shared customer lease/cooldown, host keyword research and deliberate selection | Actual permitted Keyword Planner account/quota evidence and staged observation |
| RFC-T1 | Provider capability investigation | Meta v26 residents-only support and radius restrictions remain unverified; no silent replacement with broader location types |
| SP3 | Bounded normalized index; administrator-triggered shadow inspection; immutable receipts and idempotent evidence review UI; no critical-path invocation | Separately deployed observer scheduling, representative real-traffic coverage, adjudicated false-positive measurements, geographic ancestry/semantic scope extensions |
| RFC-M1 | Existing canonical conversion consumer/deduplication guards preserved | Opaque touchpoint-token issuance/redemption and accepted consent/checkout adapters are not implemented by this batch; live transmission remains gated |
| SP4 / RFC-E1 / RFC-X1 | Existing host guidance remains available | Accepted warning policy, measured economics inputs and timezone-safe hour-level provider schedules. Nightly rate alone cannot establish CAC/margin |
| SP5 | Distinct product, membership-state and non-transferable contribution contract definitions | Allocation rule awaits founder input; migration/service/guest collection/host opt-in/admin management/accounting remain implementation work |
| SP6 / RFC-C1 | Real prepared-image approval/hash verifier reused in fact capture | Four-card compiler, truthful spatial classification, working guest deep links, Google extensions, mutation/readback/reconciliation and configured CDN/provider acceptance |
| SP7 / RFC-O1 | Existing budget/status/recovery views retained; research and shadow evidence added; host pause reachability fixed | Complete portfolio command center/alerts, dedicated-versus-pooled outcomes, accepted operating SLOs and bounded live pilot |

No row in this table is promoted to production acceptance by local test counts. Existing marketing milestone acceptance remains 5/10. The full SP0–SP7 mandate is not complete.

## SP1: authority and transaction boundaries

`CanonicalMarketingFacts` reads the owned published listing and bounded room/amenity facts. Statements remain labelled `HOST_SUPPLIED_PUBLISHED`: publication is not independent certification of a pool, suite, spa, accessibility feature or quality rating. Fact IDs and aggregate hashes derive from the actual values. No geographic wealth inference or invented named gallery category is introduced.

Migration 023 persists a bounded immutable projection and approved asset evidence. Capture uses a stable request key, request fingerprint and transaction-scoped advisory lock. An identical retry returns the existing snapshot; changed input conflicts. The shared creative verifier checks retained source/output bytes, exact manifests, current source moderation, host confirmation, independent administrator review and recorded CDN verification. The test CDN is a fixture, not evidence that production storage is accepted.

New dedicated campaign revisions bind the snapshot and `marketing_revision_products` record (025) within their existing save transaction. The original listing hash is computed before adding the product contract. A new regression caught an accidental alias of the source object that would otherwise reject every newly saved draft as changed; the implementation now copies the creative snapshot before adding product evidence. Existing revisions are not retroactively assigned invented evidence.

Existing review and publication guards re-read current canonical facts and asset authority. A changed room description, amenities, slug, price, publication status or approved image invalidates the prior evidence. This supplements existing guards; it is not a guarantee that an unconstrained free-text headline is factually true. The later creative compiler must bind every emitted claim to selected source facts. No funds are released or moved by a fact snapshot or product record.

## SP2: research contract

Authenticated owned-listing research accepts seeds, an exact fact hash, resolved geography and one language. The server supplies the serving customer and trusted canonical URL. Client-supplied account IDs, URLs or extra fields are rejected. The adapter uses `generateKeywordIdeas`, `GOOGLE_SEARCH`, no adult keywords and a single bounded page. It exposes historical search volume, competition and bid ranges; missing metrics remain null and zero stays zero. Int64 quantities remain decimal strings. A page token only marks truncation; it does not authorize unbounded pagination.

Migration 024 stores tenant/customer/request-scoped results and a separate admin-only shared customer slot. Independent application instances coalesce the same request, permit only one active customer read and enforce at least one second of cooldown after completion. SQL transactions end before provider HTTP calls. Fences and expiring leases reject late responses; a stale reader cannot release a successor's claim. New remote research is limited to 30 attempts per host/hour; geography validation also consumes the distributed targeting budget. Generic HTTP limits remain additional protection.

Results expire after 24 hours, sanitized errors after 30 seconds; bounded cleanup removes old cache rows, not live claims or financial history. Pending, empty, unavailable and available are distinct. The host sees historical evidence and must explicitly select a suggested keyword. Research never modifies a draft, quote, reservation, provider operation or spend authority automatically.

## SP3: zero-blocking observer

Migration 026 contains only observer targets, scopes, assessment receipts and evidence reviews. All four tables force admin-only RLS. The analyzer reads immutable current revision drafts and indexes normalized terms, match type, provider/configured customer, provider geographic resources, language and calendar dates. Different geography IDs are treated as unresolved overlap, not proof of disjoint territory. Identical terms in a shared account are not reported as proof of self-bidding or CPC inflation.

The initial observer is explicitly invoked from the administrator drawer. It is absent from publishing, activation, funding, inventory and the operational worker maintenance loop. Tests hold a campaign row locked in a different transaction while inspection completes; the observer's test role has no writes to campaign/job/financial tables. Assessment writes cannot authorize an operation or change either campaign. Shared database resource contention cannot be mathematically eliminated; statement/lock timeouts and bounded work limit its exposure. Do not claim zero infrastructure cost.

Bounds: 100 candidate campaigns, 50 candidate pairs, 20 shared terms per pair, 1.5-second statement timeout and 150-ms lock timeout. Receipts disclose truncation and skipped scopes. Current candidate coverage is not a complete portfolio census. Semantic variants, geographic ancestry/radius geometry, provider search-term delivery and account-timezone interactions require further evidence.

An administrator can append `CONFIRMED_OVERLAP`, `FALSE_POSITIVE` or `INSUFFICIENT_EVIDENCE` with a reference and explanation. Stable per-actor request identity prevents interrupted/concurrent submissions inflating the review count. These annotations are not automatic ground truth or policy decisions. No false-positive rate is claimed from fixture records.

## Threat and failure matrix

| Threat | Enforced control / test | Limit |
|---|---|---|
| Host reads another host's facts/cache/product | Persisted HTTP actor, explicit ownership, FORCE RLS and adversarial non-bypass role | Production role membership/grants still need actual validation |
| Forged admin/system identity | Service checks persisted admin; HTTP never accepts supplied system role | A trusted application DB credential can set context; it must not be exposed to hosts |
| Invented source/asset or stale revision | Canonical hashes, existing exact-byte creative authority, immutable snapshots and current revalidation | Full fact-bound copy compiler is later work |
| Duplicate snapshot/review, research storm | Durable request keys, fingerprints, per-customer lease/cooldown, bounded distributed budgets | Real provider quota/account acceptance remains external |
| Late remote result overwrites newer cache | Fence and live-lease predicates, successor claim identity | Cache is research evidence, not financial authorization |
| Observer influences another host's funds | No financial mutation path or critical-path invocation; whole-state before/after tests | Later host warnings must not silently gain blocking authority |
| Catalog altered after migration | Exact policy expressions/counts, forced RLS, immutable function/trigger checks, least privileges and package checksums | These checks complement independent deployment review |
| Unexpected provider error leaks secrets | Bounded normalized outputs, safe code allowlist and existing HTTP sanitization | Operators still need accepted correlation/retention procedures |

## Deployment order and privileges

1. Review the complete worktree and package, retaining all earlier required migrations. Apply migrations 020–026 in order with the migration owner, not the application role. New files in this batch have not been deployed; do not edit a migration already applied in an external environment.
2. Use an actual non-superuser, non-BYPASSRLS runtime principal that cannot assume the table owner. Never grant application writes to `schema_migrations`. Supply only SELECT for reading its history.
3. For the new portfolio tables, grant exactly:
   - SELECT, INSERT: `marketing_fact_snapshots`, `marketing_revision_products`, `marketing_campaign_search_targets`, `marketing_campaign_search_scopes`, `marketing_search_conflict_assessments`, `marketing_search_conflict_reviews`.
   - SELECT, INSERT, UPDATE, DELETE: `marketing_keyword_research` (a bounded expiring cache).
   - SELECT, INSERT, UPDATE: `marketing_keyword_customer_slots`.
   No PUBLIC, TRUNCATE, TRIGGER or ownership privileges. Existing source-table, sequence and finance permissions remain separately reviewed contracts; this table is not a replacement for the full runtime grant plan.
4. Exact recovery-table grants and invariants remain required. Both recovery and portfolio catalog checks participate in database readiness. The operator's migration check now reads every packaged migration, replacing the old 009–016 subset.
5. Validate readiness and tenant/adversarial tests against the intended staged Neon role, then run the approved restore and independent review. Table existence alone never turns readiness green.
6. Promote only the same tested artifact through required green GitHub checks. Remote branch protection/promotion settings have not been verified here. Recheck browser/API compatibility, configured provider metadata, keyword quotas and public canonical pages.
7. Authorize no live spend from this document. The named pilot, spend limit, provider/checkout/consent/legal acceptance and real evidence remain separate prerequisites.

Rollback disables new research/observer routes and rolls back application callers first, retaining immutable facts, revisions, observations and financial history. A previous binary that ignores the new product fact guard is not a safe publisher for newly bound revisions: stop new publication/activation until a compatible forward fix is deployed. Never delete snapshots, reset dedupe keys or use table drops as a production rollback.

## Verified follow-up constraints

- Existing Google campaign-total scheduling compiles full-day bounds in the serving customer's timezone; Meta currently uses UTC day bounds. A Wednesday 06:00 IST preset cannot honestly be bolted onto date-only inputs. RFC-X1 must add a versioned schedule contract and provider readback, with tests for timezone/DST and compatibility.
- A scoped search of guest components did not find the RFC's advertised `#vistas`, `#suites`, `#wellness` IDs. Sitelinks must wait for truthful canonical sections and cross-surface editorial authority; gallery order alone is not verification.
- Deployed conversion composition deliberately lacks accepted canonical checkout and consent/attribution adapters. It remains fail-closed. Creating an opaque token alone would not establish consent or booking payment.
- Meta's official targeting pages were inaccessible in this session. The official SDK confirms geographic search/city structures, not residents-only v26 behavior. No assertion of `home` support or invisible broader fallback is made.

Validation results and artifacts are maintained in `docs/harvo/SEARCH_PORTFOLIO_EXECUTION_VERIFICATION.md`.
