# CR1 P0 Route and Schema Authority Inventory

**Status:** Phase P0 structural audit · documentation only
**Snapshot:** working tree on 24 September 2026
**Baseline commit:** `85b52ba`; line anchors and schema totals also include concurrent CR1 P1/P2/P3 work present in the shared working tree at final validation time, including migrations 036–038
**Authority:** Complete Release 1 execution under the [master blueprint](../blueprints/ENCHO_THREE_SIDED_OPERATING_PLATFORM_BLUEPRINT.md)
**Scope:** Express route declarations, mounted route authority, SQL migration ownership, runtime DDL, source-level authentication guards and P0/P1 containment decisions
**Non-claim:** This is a complete structural inventory of the declared HTTP surface and table-creation authorities. It is not a completed semantic security review of every handler, proof of the deployed database catalog, provider acceptance, or production certification.

## 1. Executive verdict

The repository does not yet have one API or schema authority. It has a strong modular marketing-v2/calendar layer embedded beside a much larger legacy application surface.

- **330 syntactic or generated Express method declarations** expand to **353 registered method/path patterns** after array aliases and marketing/session action loops are expanded.
- **229 declarations / 248 path patterns live directly in `server.ts`**. The modular marketing, AdTech, measurement, calendar, conversation, service and operations files own the remaining 101 declarations / 105 paths.
- **105 path patterns live in canonical modular route owners**, and 10 of those belong to the deferred destination-pool product whose spend activation remains fail-closed. Another 12 paths are canonical behavior still embedded in `server.ts` and therefore need extraction rather than rewriting.
- The **LEGACY_BLOCKED_410 disposition contains 42 declarations / 57 aliased path patterns**, including legacy Meta/ad-network webhook ingress. Four more declarations in quarantine/replacement categories are now also stopped by the preceding boundary; their category is retained pending retirement evidence. That is a valuable containment control and must stay until callers and definitions are retired.
- **18 route declarations remain assigned to the quarantine track.** Working-tree hardening has already closed or reduced several immediate exposures; the ledger retains their quarantine disposition until tests, scoped authorization and retirement evidence satisfy the stated exit conditions.
- SQL authority is split: migrations create **121 unique domain tables**, while runtime TypeScript creates a disjoint **62 unique domain tables**. There is **zero table-name overlap** between the two creation authorities. Migrations modify and reference runtime-created base tables, so the migration directory cannot reproduce a fresh database on its own.
- Source inspection finds FORCE RLS on **114 of the 121 migration-created tables**. The seven guest/inventory tables without source FORCE RLS are listed below. Among the 62 runtime-created tables, three receive FORCE RLS through migrations 018/037, six remain ENABLE-only, and 53 have no source RLS declaration. Deployed catalog state still requires an actual restricted-role query.

P0 cannot close until the publicly reachable privileged routes are contained, base schema authority is converted to migrations, every table receives an owner and access model, and the actual application/worker roles prove least-privilege login against the target catalog.

## 2. Counting method and reproducibility

The read-only `scripts/cr1/verify-inventory.mjs` uses the TypeScript AST to enumerate production `app|router.<method>(...)` calls, validate the complete ledger and exact source anchors, and expand literal aliases/template paths. Current route owners are:

- `server.ts`
- `src/server/calendar.ts`
- `src/server/conversations/router.ts`
- `src/server/conversations/serviceRouter.ts`
- `src/server/marketing/adtechRoutes.ts`
- `src/server/marketing/measurementRouter.ts`
- `src/server/marketing/router.ts`
- `src/server/operations/router.ts`
- `src/server/operations/sessionRouter.ts`

It excludes tests and ignores non-route calls such as `req.app.get('io')`. Array path arguments are expanded. Each marketing/session action loop counts as one declaration and three paths. Mounted prefixes are verified against actual `app.use`/`router.use` calls; `serviceRouter.ts` uses lexical factory-specific mappings because participant and staff factories have different prefixes and trust boundaries.

```bash
rg -n --glob '*.ts' '^\s*(app|router)\.(get|post|put|patch|delete|options|head|all)\s*\(' server.ts src/server
rg -n "for\(const action of \['publish','activate','pause'\].*router\.post" src/server/marketing/router.ts
rg -n -i 'create\s+table' src/migrations server.ts src/server src/lib
rg -n 'ENABLE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY|CREATE POLICY' src/migrations server.ts src/lib
```

The AST resolves 330 declarations and 353 expanded path registrations. It excludes Express setting reads, comments and nested `req.app.get` access. The prior 322/343 receipt predates canonical conversation extraction, participant/staff service routers, workforce review/assignment routes and the isolated session action loop. Earlier 320/341 and 319/339 receipts are historical; the earlier blueprint estimate of approximately 328 was explicitly approximate. Counts describe source registration, not runtime acceptance.

## 3. Route inventory summary

### 3.1 Source distribution

| Source | Declarations | Expanded paths |
|---|---:|---:|
| `server.ts` | 229 | 248 |
| `src/server/calendar.ts` | 4 | 4 |
| `src/server/conversations/router.ts` | 7 | 7 |
| `src/server/conversations/serviceRouter.ts` | 5 | 5 |
| `src/server/marketing/adtechRoutes.ts` | 13 | 13 |
| `src/server/marketing/measurementRouter.ts` | 3 | 3 |
| `src/server/marketing/router.ts` | 65 | 67 |
| `src/server/operations/router.ts` | 3 | 3 |
| `src/server/operations/sessionRouter.ts` | 1 | 3 |
| **Total** | **330** | **353** |

### 3.2 Disposition classes

| Class | Meaning | Declarations | Expanded paths | P0/P1 action |
|---|---|---:|---:|---|
| `CANONICAL_MODULAR` | Versioned/domain-owned modular route | 91 | 95 | Preserve; extend only through owning module |
| `CANONICAL_DEFERRED` | Canonical management contract for a deferred product; paid activation is fail-closed | 10 | 10 | Preserve circuit breaker; exclude from CR1 activation |
| `CANONICAL_TRANSITIONAL` | Canonical behavior still inside `server.ts` | 12 | 12 | Extract behind contract tests |
| `CORE_TRANSITIONAL` | Required core/listing/auth/upload path without final module owner | 26 | 26 | Assign owner; extract with compatibility telemetry |
| `PUBLIC_INFRA` | Intended public legal/health/SPA infrastructure | 7 | 7 | Preserve; keep response minimal |
| `LEGACY_BLOCKED_410` | Legacy paid-marketing/provider ingress stopped by an explicit 410 boundary | 42 | 57 | Retain 410 until callers are gone, then delete shadowed handlers and boundary |
| `LEGACY_REPLACE` | Reachable legacy path with known canonical direction | 61 | 64 | Instrument callers, replace, deprecate, retire |
| `UNSAFE_QUARANTINE` | Privileged, unauthenticated, weakly authenticated, schema-mutating, synthetic or abuse-prone | 18 | 18 | P0 repair/block; do not expose in CR1 |
| `UNRESOLVED_OWNER` | Feature exists but CR1 owner/retention decision is absent | 63 | 64 | Assign domain owner or explicitly exclude/retire |
| **Total** |  | **330** | **353** |  |

Classification describes migration disposition, not security acceptance. A canonical label does not waive legal, provider, RLS, input-validation or operational gates.

### 3.3 Declared guard styles

| Declared guard | Declarations |
|---|---:|
| JWT middleware; handler-owned authorization | 116 |
| pre-handler 410 boundary | 46 |
| JWT + persisted actor | 40 |
| JWT + persisted actor + admin | 38 |
| public or handler-local only | 35 |
| JWT + canonical participant scope | 10 |
| provider signature/HMAC | 7 |
| public authentication flow | 5 |
| JWT middleware; 503 grounded-assistance boundary | 4 |
| verified JWT + persisted admin role | 3 |
| JWT middleware; 403 scoped staff boundary | 3 |
| JWT + resource scope | 3 |
| same-origin JSON + first-party cookie | 3 |
| provider challenge | 2 |
| public projection | 2 |
| verified JWT + persisted admin role + explicit development fixture gate | 2 |
| fixed-origin JSON + opaque staff session + exact case assignment | 2 |
| opaque workforce session + scoped projection | 2 |
| signed upload ticket + persisted session | 1 |
| JWT middleware; 503 canonical conversation boundary | 1 |
| JWT middleware; 410 retirement | 1 |
| optional verified JWT; production checkout blocked | 1 |
| JWT middleware; production 410 retirement | 1 |
| fixed-origin JSON + opaque staff session + fenced assignment | 1 |
| fixed-origin JSON + isolated workforce identity flow | 1 |

`JWT middleware; handler-owned authorization` means authentication is middleware-backed but authorization remains handler-specific. It does not prove IDOR resistance. `public or handler-local only` includes legitimate public reads and unsafe handlers; the critical findings below distinguish them.

## 4. P0 security and authority findings

This table records both open findings and controls landed in the shared working tree during this audit. `Mitigated in working tree` means the inspected source now contains the control; it is not release acceptance until the owning slice supplies its contract tests and the final integration sweep passes.

| ID | Evidence | Severity | Required disposition |
|---|---|---|---|
| P0-R01 | `GET /api/admin/integration-inspection` at `server.ts:883` returned the integration audit report without authentication at the baseline. It now uses verified JWT plus persisted admin-role middleware. | Critical | **Mitigated in working tree.** P2 must replace broad admin with the operations permission and add a redacted response-contract test. |
| P0-R02 | `GET /api/admin/payments/overview` at `server.ts:17676` previously checked only for a Bearer-header prefix. It now uses verified JWT plus persisted admin-role middleware; `components/AdminDashboard.tsx` remains an active caller. | Critical | **Mitigated in working tree.** Preserve the client contract while P2 adds the finance permission, bounded projection and access receipt. |
| P0-R03 | `POST /api/init-db` is now admin-authenticated, production-blocked and opt-in for development; request-triggered initialization middleware was removed. `ensureDbInitialized()` still auto-runs at process startup and owns 59 runtime-created tables. | Critical | **Partially mitigated.** Move every base table to the checksum migration runner, prove empty-catalog bootstrap, then remove startup/runtime DDL. |
| P0-R04 | The WhatsApp challenge now fails closed when its environment token is absent, and POST ingest now validates the Meta HMAC over the captured raw body. | Critical | **Mitigated in working tree.** Add route-level signature, payload-limit, replay and sanitization tests; converge ingestion on the durable webhook inbox. |
| P0-R05 | Three listing-assistance endpoints—`/api/ai/curate-rules`, `/radar-scan`, `/suggest-sensory-tags`—now require persisted authentication and terminate at a 503 grounded-assistance boundary before their old handlers. `/api/ai/suggest-reply` has the same fail-closed availability disposition through a separate conversation boundary. Unverified amenity/place claims, rule changes and fabricated conversation replies are not exposed through these entrypoints. | High | **Contained in working tree.** Preserve manual authoring and original messages. Restore assistance only through resource-scoped, rate-limited, Zod-validated services that distinguish evidence-backed facts from proposals and preserve rule meaning. These boundaries do not certify existing saved content or complete an AI replacement. |
| P0-R06 | Legacy lead and pixel handlers remain in the file, but the earlier `legacyMarketingBoundary` now returns 410 for `/api/marketing/leads/webhook` and `/api/telemetry/pixel-event`, including case/trailing-slash variants. | High | **Mitigated in working tree.** Keep the boundary and fixed-cardinality caller telemetry; retire shadowed definitions after migration to canonical signed/consented ingestion. Legacy rows remain unverified outcomes. |
| P0-R07 | `GET /api/image` previously used substring host matching and unbounded buffering. It now applies exact/suffix-safe allowlisting, DNS/private-address checks, redirect rejection, time/byte/pixel bounds and rate limiting through `src/server/media/remoteImageProxy.ts`. | High | **Mitigated in working tree.** Require the focused SSRF/redirect/oversize contract suite before release; migrate advertising assets toward immutable owned media. |
| P0-R08 | `/api/mock-upload` previously returned a synthetic success publicly. It now always returns 404; signed local upload with a persisted session remains the supported development transport. | High | **Mitigated in working tree.** Remove the dead registration after caller telemetry confirms zero use. |
| P0-R09 | `GET /api/health/db` previously returned raw connection failures. It now emits a bounded generic failure; canonical readiness handlers already provide structural status. | Medium | **Mitigated in working tree.** Retire the redundant endpoint in favor of `/api/health/ready`. |
| P0-R10 | Seed routes mutate production-shaped data. Both require verified admin identity plus `requireExplicitDevelopmentFixture`, which fails closed in production and requires an explicit development flag. `AdminExperiences` now renders its seed button only under `import.meta.env.DEV`. | High | **Contained in working tree.** Preserve production UI/route denial and move fixtures out of the runtime server; retain route tests proving 404/403 behavior outside explicit disposable development. |
| P0-R11 | `/api/payments/razorpay/verify` now requires a persisted authenticated session and returns production/Vercel 410; `/api/create-payment-intent` requires authentication and always returns 410. Legacy Razorpay order branches return production/Vercel 503. The admin escrow-release path is also behind the 410 boundary. Non-production legacy HMAC/write code still exists. | Critical | **Contained for production entrypoints in working tree.** Preserve tests; all CR1 money must use immutable server quotes, signed provider webhooks and idempotent fulfillment. Remove shadowed/development finance paths only after ownership and compatibility evidence; canonical commerce remains legally gated. |
| P0-R12 | Legacy `/api/bookings` now returns production/Vercel 503 before its legacy writes. Its non-production handler still performs runtime `ALTER TABLE`, accepts client price fields, treats price-query failure as non-blocking, and operates beside canonical holds. | Critical | Keep online stay checkout fail-closed; implement the legally approved quote→hold→payment-event→booking path before replacing the client call. |
| P0-R13 | `optionalAuthenticateToken` no longer fabricates user 1. Missing credentials produce an anonymous principal with no RLS bypass; presented tokens must pass HS256 verification and resolve to a persisted session. The legacy order route requires an authenticated effective user outside its production block. Persisted legacy admins still receive the broad bypass identified in R15; the separate operations workspace uses an opaque workforce session instead. | High | **Contained authentication defect in working tree.** Preserve forged/deleted-session denial and production checkout closure. Future guest commerce needs its approved anonymous holder-token contract. The listing/conversation AI 503 boundaries in R05 do not establish resource-scoped AI authority. |
| P0-R14 | Duplicate registrations exist for `GET /api/admin/metrics` and `POST /api/admin/marketing/campaigns/:id/resync-meta`. | Medium | Select one owner, add contract tests, and remove shadowed aliases after telemetry. |
| P0-R15 | Current admin authentication sets `app.bypass_rls=true` for every persisted `role='admin'`. This cannot support scoped staff or maker/checker separation. | Critical | P1/P2 principal port must keep normal admin/staff traffic non-bypass; reserve a separately authenticated service/break-glass role for bounded operations. |
| P0-R16 | The replacement track contains 61 declarations / 64 paths. This is a disposition count, not a reachability count: geo-router, legacy Stripe and production checkout routes are now contained, while other legacy reads/operations remain. | High | Preserve the 410 boundary and fixed-cardinality telemetry; measure callers for remaining legacy families and retire by vertical slice. Handler authorization and reachability require individual evidence. |
| P0-R17 | The legacy Meta challenge now uses environment-only verification configuration, and an early `app.all` boundary returns 410 for `/api/webhooks/meta` and `/api/webhooks/ad-network`. Shadowed legacy handlers still contain a `Date.now()` dedupe component and caller-selected provider logic; the canonical provider-specific v2 ingress already exists. | Critical | **Partially mitigated.** Keep the 410 boundary, move provider subscriptions to `/api/webhooks/marketing/v2/*`, prove canonical replay/idempotency behavior, then delete the shadowed legacy handlers. |
| P0-R18 | The geo-router definitions still contain substring-based country inference, a fixed exchange rate and client-priced 15% fee logic, but both `/api/payments/geo-route/detect` and `/api/payments/geo-route/initiate` are stopped by the preceding 410 boundary, with fixed-cardinality retirement telemetry and no call-through to the shadowed handler. | Critical | **Contained entrypoints in working tree.** Preserve the boundary and migrate callers to canonical server-priced quote/fund commands. Retire the shadowed code; jurisdiction, currency and markup must come from verified evidence and versioned policy. Neither the operations shell nor this route inventory activates a money path. |

No source observation above is presented as an exploited production incident.

### 4.1 Verified active callers that prevent abrupt removal

| Legacy/unsafe contract | Current caller evidence | Required cutover |
|---|---|---|
| `GET /api/admin/payments/overview` | `components/AdminDashboard.tsx:267` | Preserve the response shape behind verified finance permission, switch the client, then retire the weak handler. |
| `POST /api/ai/curate-rules` | `components/AdminDashboard.tsx:1094`, `components/HostForm.tsx:519` | Move both flows to authenticated, resource-scoped AI commands with quotas and evidence. |
| `POST /api/ai/radar-scan` | `components/HostForm.tsx:592` | Replace with the same scoped listing-quality service before blocking the route. |
| `POST /api/ai/suggest-sensory-tags` | `components/SensoryTagPicker.tsx:262` | Preserve the grounded-assistance unavailable state; replace with scoped, reviewed catalog enrichment before restoring generated suggestions. |
| `POST /api/experiences/seed` | `components/AdminExperiences.tsx:157`, rendered only in development | The server requires admin plus an explicit development-fixture gate; preserve the production UI exclusion and eventually use a disposable-development service. |
| `POST /api/payments/razorpay/verify` | `src/lib/razorpay.ts:26`, `lib/razorpay.ts:46`, `components/HostMarketing.tsx:505` | Split by product; marketing goes through v2 quote/fund plus signed webhook, while legally gated stay/experience flows remain closed. |
| `POST /api/bookings` | `App.tsx:759`, online actor-fenced reservation command | Keep stay checkout unavailable until the canonical quote→hold→provider-event→booking flow and legal gates are complete. Local optimistic booking insertion no longer precedes canonical command success. |

These are static source callers, not proof that production traffic still reaches each route. Retirement requires request telemetry and a defined zero-caller observation window.

## 5. Canonical route authority and replacement map

| Domain | Canonical owner now | Transitional/legacy surfaces | Decision |
|---|---|---|---|
| Marketing workflow, finance, review and operations | `/api/marketing/v2/*` in `src/server/marketing/router.ts` | `/api/marketing/*`, `/api/admin/marketing/*`, `/api/admin/campaigns/*` | V2 is authoritative. Keep legacy mutation 410s; migrate reads and remove old handlers after caller telemetry. |
| AdTech profiles/corridors/inference | `/api/marketing/v2/admin/adtech/*` | Ad-hoc legacy targeting/campaign routes | Preserve immutable releases/CAS. P2 replaces broad admin with permissions. |
| Workforce operations projection | `GET /api/operations/v1/workspace` in `src/server/operations/router.ts` | Legacy Admin Dashboard role-based entry | Additive read-only projection using an independent opaque workforce session and scoped assignments. No staff identity issuance or assignment mutation endpoint is certified by this inventory. |
| First-party marketing measurement | `/api/marketing/measurement/*` and `/api/webhooks/marketing/v2/:provider` | `/api/telemetry/pixel-event`, `/api/marketing/track/*`, `/api/marketing/pixel` | Canonical routes only; old synthetic claims cannot be backfilled as truth. |
| Public stay projection | `GET /api/v2/stays/:propertySlug` | `GET /api/listings`, `GET /api/listings/:id`, numeric HTML redirects | Slug projection is public authority; keep legacy reads only for existing UI until migration. |
| Inventory/calendar | `src/server/calendar.ts` room-calendar + availability; canonical hold service under `/api/v2/stays/holds` | `/api/listings/:id/calendar`, direct booking overlap queries | Preserve locks/fail-closed drift; remove legacy calendar/booking writes after canonical commerce exists. |
| Inquiry conversation | Domain router owns `/api/threads`, `/api/threads/:id/messages`, explicit `POST /api/threads/:id/read`, booking history and unread counts; secure Socket.IO thread subscription | Legacy `/api/messages` and broad admin thread/message handlers remain behind explicit retirement boundaries | Migration 037 supplies sequence/read-cursor and atomic notification-intent authority; migration 038 supplies participant-requested cases, internal notes and scoped content-access receipts. Staff routes use separate opaque identity and exact assignment fencing. Source integration does not certify deployed roles, real outbound notification delivery or service response authority; no fabricated translation or reply is canonical evidence. |
| Listing/room/media moderation | Current routes at `server.ts:3986–4210` backed by relational authority | General listing/draft JSON routes and legacy room blobs | Extract, do not rewrite; enforce three-surface parity and future offer authority. |
| Authentication | Current persisted-session JWT paths | In-memory OTP map and anonymous user-id fallback | Assign identity owner; move ephemeral/anonymous state to bounded durable primitives. |
| Upload/media | Signed ticket local upload, authenticated upload URL/Mux paths | Public mock/base64 paths and ad-hoc resizer | Consolidate behind media service, scanning and immutable asset authority. |
| Guest commerce | Atomic holds only are accepted foundation | `/api/bookings`, Razorpay client verification, client amount Stripe intent | Remains legally gated. No legacy path becomes canonical by continued use. |
| Experiences, settings, wishlists, SEO | No CR1 authority assigned | 63 unresolved-owner path registrations | Explicitly exclude from CR1 or assign product/domain owner; do not silently refactor during P1. |

## 6. Schema authority inventory

### 6.1 Machine-verifiable totals

| Authority | Unique domain tables created | Notes |
|---|---:|---|
| Versioned SQL migrations 001–038 | 121 | 37 files because version 008 is intentionally absent; excludes runner-owned `schema_migrations` |
| Runtime TypeScript DDL | 62 | 59 created by `server.ts`; 3 lazy-created by library services |
| Names created by both authorities | 0 | Zero; this is not healthy separation because migrations reference runtime base tables |
| Total unique domain table names | 183 | Current source creation authorities only |

The absence of duplicate names does **not** mean clean ownership. Migrations 001/002 alter runtime-created `listings`; migration 006 alters runtime-created `room_calendar_blocks`; migration 009 references runtime-created `users`, `listings` and `host_marketing_campaigns`; later migrations inherit the same dependency. A fresh catalog therefore needs undocumented runtime DDL before the versioned runner can succeed.

### 6.2 Source RLS coverage

| Set | FORCE RLS | ENABLE-only | No source RLS | Qualification |
|---|---:|---:|---:|---|
| 121 migration-created tables | 114 | 0 | 7 | Dynamic migration loops, including all 34 migration-036 IAM tables and migration-038 service tables, are expanded by this count |
| 62 runtime-created tables | 3 | 6 | 53 | Source declaration only; deployment catalog may differ |

Migration-created tables without source FORCE RLS:

- `room_types`
- `media_assets`
- `backfill_conflict_records`
- `inventory_days`
- `booking_holds`
- `booking_hold_nights`
- `legacy_block_conflict_ledger`

Runtime-created `host_outreach_leads` receives FORCE RLS through migration 018; `threads` and `messages` receive FORCE RLS through migration 037. Runtime bootstrap enables, but does not force, RLS for `host_wallets`, `host_marketing_campaigns`, `wallet_transactions`, `bookings`, `experience_bookings` and `host_social_posts`. The remaining runtime-created tables have no source RLS declaration.

### 6.3 Runtime DDL defects

1. `server.ts` creates 59 tables and also issues route-time `ALTER TABLE`/`CREATE TABLE` statements. Schema state therefore depends on which endpoint or startup branch has run.
2. `experience_bookings` has five `CREATE TABLE IF NOT EXISTS` definitions; `experiences` has three; `host_outreach_leads` and `processed_payments` each have multiple definitions; retargeting tables are created in route handlers. `IF NOT EXISTS` hides divergent definitions instead of reconciling them.
3. `src/lib/distributedLock.ts`, `dynamicPricingSyncService.ts` and `retargetingPixelService.ts` lazily create their own tables, bypassing migration checksums and release ordering.
4. Request-triggered initialization was removed in the shared working tree, but process startup still auto-runs `ensureDbInitialized()` and catches its failure. The server can therefore remain alive against a partial catalog and fail later with a misleading domain error.
5. The migration runner uses a held session advisory lock and per-file transactions/checksums, which is strong, but it sorts filenames and intentionally has no 008 file. The absence of 008 is documented history; future sequencing must keep it explicit.

## 7. Domain/table ownership map

| Domain owner | Authoritative or candidate tables | Current status |
|---|---|---|
| Identity and internal organization | Runtime-created `users`; migration-036 organization, permission/policy/role/version, invitation/membership/grant, staff-session, identity/login receipt, passkey/factor, authorization/approval, assignment/access-review, lifecycle and immutable event tables | P2 candidate has FORCE RLS, separate opaque sessions, exact commands and bounded directory evidence; no automatic staff member, passkey enrollment or production policy release. `users` remains runtime-created. Reviewed identity/factor policy, NOLOGIN owner topology, restricted runtime grants and deployed evidence remain gates. |
| Stay catalog | `listings`, `listings_drafts`, `room_types`, `media_assets`, `backfill_conflict_records`, `seo_configurations` | Relational room/media is canonical; base listing tables remain runtime-owned. |
| Inventory and guest commerce | `room_calendar_blocks`, `inventory_days`, `booking_holds`, `booking_hold_nights`, `legacy_block_conflict_ledger`, `calendar_operations`, `bookings` | Holds/calendar are strong foundations; booking authority remains legacy/legal-gated; seven tables need FORCE-RLS decision. |
| Conversation and service | Runtime `threads`/`messages`; migration-037 cursors and notification intent/events; migration-038 cases, requests, events, internal notes and content-access receipts; existing inquiry attribution and legacy lead tables | Canonical participant routes preserve history with 037 durability and FORCE RLS. Staff content uses consented case scope and assignment fences; broad legacy admin routes remain retired. Base table creation, deployed grants and outbound channel acceptance remain incomplete. |
| Marketing workflow | `host_marketing_campaigns`, `marketing_campaign_workflows`, `marketing_campaign_revisions`, `marketing_workflow_events`, `marketing_jobs`, request/attempt/product/fact tables | V2 migrations are canonical, but root campaign table is runtime-created. Preserve IDs and bridge; do not recreate history. |
| Marketing finance/settlement | `marketing_finance_*`, `marketing_settlement_*`, `marketing_google_invoice_imports` | Canonical migration-owned evidence. Legacy wallet/ledger/payment tables are separate and require retirement/reconciliation policy. |
| Provider operations/legacy telemetry | `provider_entities`, `provider_publishing_transactions`, `meta_*`, `campaign_*rollups`, `variant_*` | Mostly runtime-created legacy. P6 must choose retained evidence versus canonical projections and never delete financial/provider IDs. |
| AdTech strategy | `marketing_adtech_*`, corridor, strategy-binding and inference tables | Canonical migration-owned, FORCE RLS, immutable/versioned. Offer-level binding remains future work. |
| Measurement/conversion | `marketing_measurement_*`, attribution, conversion outbox/deliveries | Canonical migration-owned. Legacy pixel tables are synthetic/unverified and excluded from canonical evidence. |
| Destination pools | `marketing_destination_pools`, memberships/events/exposures/spend claims | Canonical contracts but paid execution intentionally unavailable; excluded from CR1 activation. |
| Experiences/community | `experiences`, bookings/reviews/videos/messages/wishlists | Runtime-owned, outside the approved CR1 golden path unless founder assigns scope. |
| Platform operations | Runner-owned `schema_migrations`; IAM command/read receipts; conversation notification intent/events; service content-access receipts | Scoped durable primitives now exist through 036–038. Common outbox convergence and empty-catalog bootstrap remain separate work; do not merge distinct domain receipts or claim external delivery from intent alone. |

## 8. Migration ledger and authority

| Migration | Tables created | Domain / effect | P0 status |
|---|---|---|---|
| `001_add_listings_slug.sql` | No new table; alters existing authority | Stay catalog slug | depends on runtime-created base table |
| `002_add_listings_publication_status.sql` | No new table; alters existing authority | Stay publication | depends on runtime-created base table |
| `003_canonical_room_and_media_authority.sql` | `room_types`, `media_assets`, `backfill_conflict_records` | Canonical room/media | migration authority; FORCE-RLS gap on created tables |
| `004_canonical_constraints.sql` | No new table; alters existing authority | Catalog constraints | migration authority |
| `005_inventory_days_and_atomic_holds.sql` | `inventory_days`, `booking_holds`, `booking_hold_nights` | Inventory/holds | migration authority; FORCE-RLS gap on created tables |
| `006_legacy_calendar_block_mapping.sql` | `legacy_block_conflict_ledger` | Legacy calendar mapping | depends on runtime-created base table; FORCE-RLS gap on created tables |
| `007_legacy_conflict_ledger_uniqueness.sql` | No new table; alters existing authority | Conflict idempotency | migration authority |
| `009_harvo_marketing_finance.sql` | `marketing_finance_policies`, `marketing_finance_quotes`, `marketing_finance_accounts`, `marketing_finance_captures`, `marketing_finance_provider_events`, `marketing_finance_reservations`, `marketing_finance_authorizations`, `marketing_finance_refunds`, `marketing_finance_refund_operations`, `marketing_finance_journals`, `marketing_finance_lines` | Marketing finance | migration authority |
| `010_harvo_marketing_workflow.sql` | `marketing_campaign_workflows`, `marketing_campaign_revisions`, `marketing_workflow_events`, `marketing_jobs`, `marketing_ai_attempts`, `marketing_checkout_attempts`, `marketing_commercial_preferences`, `marketing_create_requests` | Marketing workflow/jobs | migration authority |
| `011_harvo_marketing_measurement.sql` | `marketing_booking_measurements`, `marketing_measurement_events`, `marketing_conversion_outbox` | Marketing measurement/outbox | migration authority |
| `012_harvo_marketing_settlement.sql` | `marketing_settlement_documents`, `marketing_settlement_proposals`, `marketing_settlement_reviews`, `marketing_settlement_allocations` | Marketing settlement | migration authority |
| `013_harvo_marketing_conversion_delivery.sql` | `marketing_conversion_deliveries`, `marketing_conversion_delivery_events` | Conversion delivery | migration authority |
| `014_harvo_marketing_request_limits.sql` | `marketing_request_limits` | Request quotas | migration authority |
| `015_harvo_marketing_creative_review.sql` | `marketing_creative_derivatives`, `marketing_creative_events` | Creative review | migration authority |
| `016_harvo_google_invoice_imports.sql` | `marketing_google_invoice_imports` | Google invoice imports | migration authority |
| `017_calendar_operation_audit.sql` | `calendar_operations` | Calendar audit | migration authority |
| `018_outreach_lead_tenant_boundary.sql` | No new table; alters existing authority | Legacy lead RLS repair | migration authority |
| `019_marketing_operational_isolation.sql` | No new table; alters existing authority | Marketing operational RLS | migration authority |
| `020_marketing_pause_recovery.sql` | `marketing_pause_recoveries` | Pause recovery | migration authority |
| `021_legacy_telemetry_evidence.sql` | No new table; alters existing authority | Legacy telemetry compatibility | migration authority |
| `022_marketing_pause_recovery_attempts.sql` | `marketing_pause_recovery_attempts` | Recovery attempts | migration authority |
| `023_marketing_product_facts.sql` | `marketing_fact_snapshots` | Canonical marketing facts | migration authority |
| `024_marketing_keyword_research.sql` | `marketing_keyword_research`, `marketing_keyword_customer_slots` | Keyword research | migration authority |
| `025_marketing_revision_products.sql` | `marketing_revision_products` | Revision products | migration authority |
| `026_search_portfolio_shadow.sql` | `marketing_campaign_search_targets`, `marketing_campaign_search_scopes`, `marketing_search_conflict_assessments`, `marketing_search_conflict_reviews` | Search portfolio shadow | migration authority |
| `027_marketing_attribution_links.sql` | `marketing_attribution_links` | Signed attribution links | migration authority |
| `028_marketing_consent_touchpoints.sql` | `marketing_measurement_consents`, `marketing_attribution_touchpoints`, `marketing_measurement_payloads` | Consent/touchpoints | migration authority |
| `029_marketing_destination_pools.sql` | `marketing_destination_pools`, `marketing_pool_memberships`, `marketing_pool_events`, `marketing_pool_exposures`, `marketing_pool_spend_claims` | Destination pools | migration authority |
| `030_marketing_spatial_stories.sql` | `marketing_spatial_stories`, `marketing_spatial_story_reviews` | Spatial stories | migration authority |
| `031_marketing_inquiry_attribution.sql` | `marketing_inquiry_attributions` | Inquiry attribution | migration authority |
| `032_marketing_adtech_registry.sql` | `marketing_adtech_tier_profiles`, `marketing_adtech_profile_versions`, `marketing_adtech_releases`, `marketing_adtech_release_members`, `marketing_adtech_current_release`, `marketing_adtech_strategy_audits` | AdTech profiles/releases | migration authority |
| `033_marketing_adtech_corridors.sql` | `marketing_destination_corridors`, `marketing_corridor_geography_evidence`, `marketing_destination_corridor_versions`, `marketing_corridor_current_versions` | AdTech corridors | migration authority |
| `034_marketing_adtech_bindings.sql` | `marketing_campaign_strategy_bindings` | Strategy bindings | migration authority |
| `035_marketing_corridor_inference.sql` | `marketing_corridor_inference_policy`, `marketing_corridor_inference_jobs`, `marketing_corridor_inference_requests`, `marketing_corridor_inference_rate`, `marketing_corridor_inference_proposals` | Corridor inference | migration authority |
| `036_internal_organization_iam.sql` | `internal_organizations`, `internal_permission_catalog`, `internal_iam_policy_versions`, `internal_iam_current_policy`, `internal_role_definitions`, `internal_role_versions`, `internal_role_permissions`, `internal_role_current_versions`, `internal_organization_invitations`, `internal_organization_memberships`, `internal_membership_grants`, `internal_membership_grant_revocations`, `internal_staff_sessions`, `internal_step_up_challenges`, `internal_action_authorizations`, `internal_action_approvals`, `internal_work_assignments`, `internal_assignment_commands`, `internal_access_reviews`, `internal_access_review_items`, `internal_break_glass_events`, `internal_iam_events`, `internal_invitation_identity_receipts`, `internal_workforce_lifecycle_commands`, `internal_workforce_identity_policies`, `internal_workforce_current_identity_policy`, `internal_workforce_login_challenges`, `internal_workforce_login_receipts`, `internal_workforce_factor_policies`, `internal_workforce_current_factor_policy`, `internal_workforce_passkey_enrollments`, `internal_workforce_passkey_state`, `internal_workforce_passkey_ceremonies`, `internal_workforce_passkey_receipts` | Internal organization and scoped workforce IAM | migration authority in working tree; FORCE RLS; no staff bootstrap; deployment grants and runtime integration remain gated |
| `037_conversation_delivery.sql` | `conversation_read_cursors`, `notification_intents`, `notification_intent_events` | Conversation sequence, read cursor and durable notification intent | Local candidate; FORCE RLS and restricted-role verification required; no remote application claimed |
| `038_service_cases.sql` | `service_case_runtime_bindings`, `service_cases`, `service_case_requests`, `service_case_events`, `service_case_internal_notes`, `service_case_content_access_receipts` | Participant-requested service cases and scoped staff evidence | Local candidate; FORCE RLS and restricted-role verification required; no remote application claimed |
## 9. P0 blockers and exit evidence

| Blocker | Evidence required to close | Owner |
|---|---|---|
| Public/weak privileged endpoints | Route contract tests proving production 404/401/403; client migrated where active; no DDL/seed/debug handler reachable | Platform + Security |
| Split schema authority | Additive migrations for every runtime-only base table, exact catalog diff, repeatable empty-database bootstrap, runtime DDL disabled | DBA + Platform |
| Incomplete RLS | FORCE/policy/grant matrix for every CR1 table; adversarial host/staff/worker tests; no owner connection in app runtime | DBA + Security |
| Broad admin bypass | Persisted `PrincipalContext`, deny-by-default permission port, normal admin/staff non-bypass, separate service/break-glass evidence | Identity + Security |
| Legacy caller uncertainty | Request/client call inventory, deprecation telemetry and zero-caller window for each retired route | Frontend + Platform |
| Guest booking collision | Online stay checkout remains closed until legal-approved canonical quote/hold/provider-event/booking flow replaces `/api/bookings` and legacy payment RPC | Guest Commerce + Legal/Finance |
| Webhook ambiguity | Raw-body signature tests, replay/idempotency tests, payload caps, DLQ and accepted-provider receipt semantics | Integrations + Security |
| Missing deployment proof | Actual restricted web/worker login catalog report and isolated staging deployment; source inspection alone is insufficient | SRE + DBA |

## 10. P1 strangler order derived from this inventory

1. **Install route registry tests** that assert method/path, declared policy, owner, feature flag and deprecation state. Prevent new direct `server.ts` domain routes.
2. **Retain and contract-test the current admin exposure closures** (`integration-inspection`, `payments/overview`), then migrate broad-admin checks to scoped operations/finance permissions without changing intended UI behavior.
3. **Retain the production blocks on schema/seed/mock paths** and move every base table plus fixture authority out of runtime code into checksummed additive migrations or disposable test tooling.
4. **Integrate existing `PrincipalContext` and policy port** into remaining admin handlers while preserving consumer JWT/session semantics and separate workforce credentials; migrate admin reads first, then mutations.
5. **Preserve 036–038 scoped command/read/outbox receipts** while converging remaining CRM/provider/payment side effects; an intent alone never establishes delivery.
6. **Keep grounded-assistance 503 boundaries** until resource-scoped listing/conversation services supply Zod/quota/factual-evidence contracts; preserve manual editing and original conversation text.
7. **Validate the extracted conversation and Service Desk routes**, preserve IDs/history, retain legacy admin/delete retirement boundaries and complete deployed assignment/access-receipt acceptance.
8. **Migrate legacy listing readers** to slug/canonical projections; extract relational listing/room/media mutations behind contract tests.
9. **Keep all legacy marketing mutation 410s** while moving reads to marketing v2. Delete definitions only after request and client telemetry show zero callers.
10. **Keep legacy stay checkout unavailable** until P4 legal and engineering gates produce the canonical fulfillment path.

## Appendix A — Complete Express declaration ledger

Every syntactic route declaration in the counted files appears exactly once below. Array aliases and generated action paths share one declaration row. Factory-specific prefixes distinguish participant service routes from staff service routes in the same module.

| Source | Method | Registered path(s) | Declared guard | Disposition |
|---|---|---|---|---|
| `server.ts:836` | GET | `/api/health/live` | public or handler-local only | `PUBLIC_INFRA` |
| `server.ts:880` | GET | `/privacy` | public or handler-local only | `PUBLIC_INFRA` |
| `server.ts:881` | GET | `/terms-of-service` | public or handler-local only | `PUBLIC_INFRA` |
| `server.ts:883` | GET | `/api/admin/integration-inspection` | verified JWT + persisted admin role | `UNSAFE_QUARANTINE` |
| `server.ts:893` | GET | `/api/admin/metrics` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:901` | GET | `/api/admin/alerts` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:1052` | GET | `/api/stays/:slug/spatial-story` | public or handler-local only | `CANONICAL_TRANSITIONAL` |
| `server.ts:1053` | GET | `/api/explore/:destination` | public or handler-local only | `CANONICAL_TRANSITIONAL` |
| `server.ts:1059` | GET | `/api/webhooks/marketing/v2/meta` | provider challenge | `CANONICAL_TRANSITIONAL` |
| `server.ts:1060` | POST | `/api/webhooks/marketing/v2/:provider` | provider signature/HMAC | `CANONICAL_TRANSITIONAL` |
| `server.ts:1074` | ALL | `/api/webhooks/meta`<br>`/api/webhooks/ad-network` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:1089` | GET | `/api/health/ready` | public or handler-local only | `PUBLIC_INFRA` |
| `server.ts:1090` | GET | `/api/encho/health` | public or handler-local only | `PUBLIC_INFRA` |
| `server.ts:1100` | GET | `/api/config` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:1107` | GET | `/api/webhook/whatsapp` | public or handler-local only | `UNSAFE_QUARANTINE` |
| `server.ts:1180` | POST | `/api/webhook/whatsapp` | provider signature/HMAC | `UNSAFE_QUARANTINE` |
| `server.ts:2880` | GET | `/api` | public or handler-local only | `PUBLIC_INFRA` |
| `server.ts:2904` | POST | `/api/auth/otp/send` | public authentication flow | `CORE_TRANSITIONAL` |
| `server.ts:2920` | POST | `/api/auth/otp/verify` | public authentication flow | `CORE_TRANSITIONAL` |
| `server.ts:2972` | POST | `/api/auth/register` | public authentication flow | `CORE_TRANSITIONAL` |
| `server.ts:3013` | POST | `/api/auth/login` | public authentication flow | `CORE_TRANSITIONAL` |
| `server.ts:3051` | POST | `/api/auth/google` | public authentication flow | `CORE_TRANSITIONAL` |
| `server.ts:3091` | GET | `/api/auth/me` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:3108` | GET | `/api/admin/settings/experience-hosts` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:3120` | POST | `/api/admin/settings/experience-hosts` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:3132` | GET | `/api/admin/reviews` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:3154` | DELETE | `/api/admin/reviews/:id` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:3177` | GET | `/api/admin/offers` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:3188` | POST | `/api/admin/offers` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:3203` | DELETE | `/api/admin/offers/:id` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:3214` | GET | `/api/listings/:id/calendar` | public or handler-local only | `CORE_TRANSITIONAL` |
| `server.ts:3231` | POST | `/api/listings/:id/calendar` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:3266` | GET | `/api/admin/users` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:3300` | DELETE | `/api/admin/users/:id` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:3312` | GET | `/api/keep-alive` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:3339` | GET | `/api/seo` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:3441` | GET | `/api/health/db` | public or handler-local only | `UNSAFE_QUARANTINE` |
| `server.ts:3456` | POST | `/api/init-db` | verified JWT + persisted admin role | `UNSAFE_QUARANTINE` |
| `server.ts:3478` | GET | `/api/image` | public or handler-local only | `UNSAFE_QUARANTINE` |
| `server.ts:3551` | POST | `/api/marketing/assets/resize` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:3585` | PUT | `/api/mock-upload` | public or handler-local only | `UNSAFE_QUARANTINE` |
| `server.ts:3590` | PUT | `/api/upload-local` | signed upload ticket + persisted session | `CORE_TRANSITIONAL` |
| `server.ts:3603` | POST | `/api/upload-base64` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:3617` | POST | `/api/upload-video-url` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:3633` | GET | `/api/mux/upload/:uploadId` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:3650` | POST | `/api/upload-url` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:3686` | GET | `/api/admin/seo/:type/:id` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:3699` | PUT | `/api/admin/seo/:type/:id` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:3718` | PUT | `/api/listings/:id` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:4003` | PATCH | `/api/admin/listings/:id/status` | JWT middleware; handler-owned authorization | `CANONICAL_TRANSITIONAL` |
| `server.ts:4044` | PUT | `/api/listings/:id/rooms` | JWT middleware; handler-owned authorization | `CANONICAL_TRANSITIONAL` |
| `server.ts:4143` | PATCH | `/api/admin/media-assets/:id/moderation` | JWT middleware; handler-owned authorization | `CANONICAL_TRANSITIONAL` |
| `server.ts:4227` | POST | `/api/admin/backfill/room-media-authority` | JWT middleware; handler-owned authorization | `CANONICAL_TRANSITIONAL` |
| `server.ts:4423` | PUT | `/api/listings/:id/mode` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:4480` | GET | `/api/marketing/campaigns` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4514` | GET | `/api/marketing/analytics` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4572` | GET | `/api/marketing/campaigns/:id/control-center`<br>`/api/marketing/campaigns/:id/telemetry` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4602` | GET | `/api/admin/marketing/campaigns/:id/control-center`<br>`/api/admin/campaigns/:id/control-center` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4634` | GET | `/api/marketing/campaigns/:id/analytics` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4703` | GET | `/api/marketing/campaigns/:id/analytics/performance` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4730` | GET | `/api/marketing/campaigns/:id/analytics/funnel` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4755` | GET | `/api/marketing/campaigns/:id/analytics/anomalies` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4785` | GET | `/api/marketing/campaigns/:id/report/pdf` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4816` | GET | `/api/admin/marketing/analytics/portfolio` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4844` | POST | `/api/marketing/leads/webhook` | pre-handler 410 boundary | `UNSAFE_QUARANTINE` |
| `server.ts:4882` | GET | `/api/marketing/leads` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4907` | GET | `/api/marketing/leads/:id` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4932` | PATCH | `/api/marketing/leads/:id/status` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:4961` | POST | `/api/marketing/leads/:id/message` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:5027` | POST | `/api/admin/marketing/leads/notifications/process` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:5044` | GET | `/api/admin/marketing/leads/health` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:5060` | POST | `/api/marketing/pre-flight-check` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:5114` | GET | `/api/marketing/campaigns/:id/preflight` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:5169` | POST | `/api/marketing/copilot` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:5338` | POST | `/api/marketing/campaigns` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:5405` | POST | `/api/telemetry/pixel-event` | pre-handler 410 boundary | `UNSAFE_QUARANTINE` |
| `server.ts:5434` | POST | `/api/marketing/campaigns/:id/sync-pricing` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:5447` | GET | `/api/marketing/campaigns/:id/pricing-history` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:5461` | PUT | `/api/marketing/campaigns/:id` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:5637` | DELETE | `/api/marketing/campaigns/:id` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:5666` | GET | `/api/host/social-posts` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:5684` | POST | `/api/host/social-posts/generate-caption` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:5822` | POST | `/api/host/social-posts` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:5899` | POST | `/api/host/social-posts/:id/boost` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:5963` | DELETE | `/api/host/social-posts/:id` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:5982` | GET | `/api/admin/social-posts` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:6169` | POST | `/api/admin/social-posts/:id/approve` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:6191` | POST | `/api/admin/social-posts/:id/reject` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:6237` | GET | `/api/listings/:id/social-posts` | public or handler-local only | `CORE_TRANSITIONAL` |
| `server.ts:6265` | POST | `/api/marketing/assets/upload` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:6285` | POST | `/api/marketing/social/publish` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:6322` | POST | `/api/marketing/campaigns/:id/ai-check` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:6536` | POST | `/api/marketing/campaigns/:id/sync-meta` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:6615` | GET | `/api/marketing/recommend-targeting` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:6702` | POST | `/api/marketing/grade-targeting` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:6793` | POST | `/api/marketing/ai-generate-copy` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:6990` | GET | `/api/marketing/campaigns/:id/leads` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:7212` | POST | `/api/marketing/leads/:leadId/convert-booking` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:7311` | POST | `/api/marketing/leads/:leadId/message` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:10682` | POST | `/api/payments/webhook` | provider signature/HMAC | `LEGACY_REPLACE` |
| `server.ts:10874` | GET | `/api/webhooks/meta` | provider challenge | `LEGACY_REPLACE` |
| `server.ts:10926` | POST | `/api/webhooks/meta` | provider signature/HMAC | `LEGACY_REPLACE` |
| `server.ts:10950` | POST | `/api/webhooks/ad-network` | provider signature/HMAC | `LEGACY_REPLACE` |
| `server.ts:11118` | POST | `/api/marketing/campaigns/:id/subscribe` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:11432` | GET | `/api/marketing/campaigns/:id/invoice` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:11509` | POST | `/api/marketing/campaigns/:id/pacing` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:11576` | GET | `/api/admin/marketing/campaigns/:id/traces` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:11596` | GET | `/api/admin/marketing/dashboard/stats` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:11662` | GET | `/api/admin/marketing/dlq` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:11683` | POST | `/api/admin/marketing/replay/:transactionId` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:11724` | GET | `/api/admin/marketing/health` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:11777` | POST | `/api/admin/marketing/kill-switch` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:11799` | GET | `/api/admin/marketing/transactions/:id/traces` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:11822` | POST | `/api/admin/marketing/dlq/resolve/:id` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:11842` | POST | `/api/admin/marketing/rollback/:metaId` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:11868` | GET | `/api/admin/marketing/transactions` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:11889` | GET | `/api/admin/marketing/campaigns` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:11924` | POST | `/api/admin/marketing/campaigns/:id/approve` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:11928` | POST | `/api/admin/marketing/campaigns/:id/resync-meta` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:11972` | POST | `/api/marketing/campaigns/:id/sync-telemetry` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:11991` | POST | `/api/marketing/campaigns/:id/sync-engagement` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12010` | POST | `/api/admin/marketing/campaigns/:id/reject` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12054` | POST | `/api/marketing/campaigns/:id/action-preview`<br>`/api/admin/marketing/campaigns/:id/action-preview`<br>`/api/admin/campaigns/:id/action-preview` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12084` | POST | `/api/marketing/campaigns/:id/pause`<br>`/api/admin/marketing/campaigns/:id/pause`<br>`/api/admin/campaigns/:id/pause`<br>`/api/admin/marketing/campaigns/:id/pause-meta` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12134` | POST | `/api/admin/marketing/campaigns/:id/emergency-pause`<br>`/api/admin/campaigns/:id/emergency-pause` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12170` | POST | `/api/marketing/campaigns/:id/resume`<br>`/api/admin/marketing/campaigns/:id/resume`<br>`/api/admin/campaigns/:id/resume`<br>`/api/admin/marketing/campaigns/:id/resume-meta` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12220` | POST | `/api/marketing/campaigns/:id/resync`<br>`/api/admin/marketing/campaigns/:id/resync`<br>`/api/admin/campaigns/:id/resync`<br>`/api/admin/marketing/campaigns/:id/resync-meta` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12250` | POST | `/api/admin/marketing/campaigns/:id/reconcile`<br>`/api/admin/campaigns/:id/reconcile` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12282` | POST | `/api/admin/marketing/campaigns/:id/objects/:objectType/:objectId/status`<br>`/api/admin/campaigns/:id/objects/:objectType/:objectId/status` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12332` | POST | `/api/admin/marketing/campaigns/:id/kill-meta` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12389` | POST | `/api/marketing/campaigns/:id/cancel` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12432` | POST | `/api/admin/marketing/campaigns/:id/activate` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12445` | POST | `/api/marketing/campaigns/:id/activate` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:12461` | GET | `/api/admin/audit-logs` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:12492` | POST | `/api/marketing/threads/:id/score-intent` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:12542` | GET | `/api/admin/outreach-leads` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:12562` | POST | `/api/admin/outreach-leads` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:12582` | PUT | `/api/admin/outreach-leads/:id` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:12621` | DELETE | `/api/admin/outreach-leads/:id` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:12638` | GET | `/api/listings/draft/:id` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:12649` | POST | `/api/listings/draft` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:12674` | POST | `/api/admin/listings/draft/:id/approve` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:12896` | POST | `/api/listings` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:13056` | GET | `/api/wishlist` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:13057` | GET | `/api/wishlists` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:13104` | POST | `/api/wishlists` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:13129` | DELETE | `/api/wishlists/:listingId` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:13153` | GET | `/api/experience-wishlists` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:13170` | POST | `/api/experience-wishlists` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:13195` | DELETE | `/api/experience-wishlists/:experienceId` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:13214` | GET | `/api/listings/:id/can-review` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:13235` | GET | `/api/listings/:id/reviews` | public or handler-local only | `CORE_TRANSITIONAL` |
| `server.ts:13252` | POST | `/api/listings/:id/reviews` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:13279` | GET | `/api/v2/stays/:propertySlug` | public projection | `CANONICAL_TRANSITIONAL` |
| `server.ts:13414` | POST | `/api/v2/stays/holds` | public or handler-local only | `CANONICAL_TRANSITIONAL` |
| `server.ts:13492` | POST | `/api/v2/stays/holds/:id/release` | public or handler-local only | `CANONICAL_TRANSITIONAL` |
| `server.ts:13544` | GET | `/api/v2/stays/holds/config` | public or handler-local only | `CANONICAL_TRANSITIONAL` |
| `server.ts:13553` | GET | `/listing/:id`<br>`/listings/:id` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:13582` | GET | `/api/listings/:id` | public or handler-local only | `CORE_TRANSITIONAL` |
| `server.ts:13678` | GET | `/api/listings` | public or handler-local only | `CORE_TRANSITIONAL` |
| `server.ts:13981` | GET | `/api/host/reservations` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:14065` | PUT | `/api/host/reservations/:id/status` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:14171` | POST | `/api/messages` | JWT middleware; 503 canonical conversation boundary | `LEGACY_REPLACE` |
| `server.ts:14235` | DELETE | `/api/listings/:id` | JWT middleware; handler-owned authorization | `CORE_TRANSITIONAL` |
| `server.ts:14265` | GET | `/api/admin/metrics` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:14364` | GET | `/api/admin/threads` | JWT middleware; 403 scoped staff boundary | `LEGACY_REPLACE` |
| `server.ts:14402` | DELETE | `/api/admin/messages/:id` | JWT middleware; 403 scoped staff boundary | `LEGACY_REPLACE` |
| `server.ts:14413` | GET | `/api/admin/threads/:id/messages` | JWT middleware; 403 scoped staff boundary | `LEGACY_REPLACE` |
| `server.ts:14430` | POST | `/api/ai/suggest-price` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:14482` | POST | `/api/ai/suggest-reply` | JWT middleware; 503 grounded-assistance boundary | `UNRESOLVED_OWNER` |
| `server.ts:14523` | POST | `/api/ai/suggest-listing` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:14573` | POST | `/api/ai/curate-rules` | JWT middleware; 503 grounded-assistance boundary | `UNSAFE_QUARANTINE` |
| `server.ts:14621` | POST | `/api/ai/radar-scan` | JWT middleware; 503 grounded-assistance boundary | `UNSAFE_QUARANTINE` |
| `server.ts:14791` | POST | `/api/ai/suggest-sensory-tags` | JWT middleware; 503 grounded-assistance boundary | `UNSAFE_QUARANTINE` |
| `server.ts:14875` | POST | `/api/ai/evaluate-listing` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:14971` | POST | `/api/ai/nearby-pois` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:15018` | POST | `/api/leads/soft-exit` | public or handler-local only | `UNSAFE_QUARANTINE` |
| `server.ts:15050` | GET | `/api/host/soft-leads` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:15070` | PUT | `/api/user/profile` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:15088` | GET | `/api/user/bookings` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:15156` | PUT | `/api/user/bookings/:id/cancel` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:15202` | POST | `/api/bookings` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:15511` | GET | `/api/settings/whatsapp` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:15528` | POST | `/api/settings/whatsapp` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:15545` | GET | `/api/settings/experiences_page` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:15568` | POST | `/api/settings/experiences_page` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:15589` | GET | `/api/settings/call` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:15606` | POST | `/api/settings/call` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:15623` | GET | `/api/settings/demo_properties` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:15641` | POST | `/api/settings/demo_properties` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:15753` | GET | `/api/seed-ajith` | verified JWT + persisted admin role + explicit development fixture gate | `UNSAFE_QUARANTINE` |
| `server.ts:15807` | GET | `/api/experiences` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:15861` | POST | `/api/experiences/seed` | verified JWT + persisted admin role + explicit development fixture gate | `UNSAFE_QUARANTINE` |
| `server.ts:15948` | POST | `/api/experiences` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:15979` | PUT | `/api/experiences/:id` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16023` | DELETE | `/api/experiences/:id` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16056` | GET | `/api/experiences/:id/reviews` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:16079` | GET | `/api/experiences/:id/reviews/eligible` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16095` | POST | `/api/experiences/:id/reviews` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16132` | GET | `/api/experiences/:id/videos` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:16151` | POST | `/api/experiences/:id/videos` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16177` | POST | `/api/experiences/videos/:id/like` | public or handler-local only | `UNSAFE_QUARANTINE` |
| `server.ts:16197` | GET | `/api/experiences/:id/lobby/participants` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16238` | GET | `/api/experiences/:id/lobby/messages` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16279` | POST | `/api/experiences/:id/lobby/messages` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16330` | POST | `/api/experience-bookings` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16377` | GET | `/api/experience-bookings` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16394` | PUT | `/api/user/experience-bookings/:id/cancel` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16435` | GET | `/api/admin/experience-bookings` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16455` | GET | `/api/settings/payment_rates` | public or handler-local only | `UNRESOLVED_OWNER` |
| `server.ts:16473` | POST | `/api/settings/payment_rates` | JWT middleware; handler-owned authorization | `UNRESOLVED_OWNER` |
| `server.ts:16497` | POST | `/api/create-payment-intent` | JWT middleware; 410 retirement | `LEGACY_REPLACE` |
| `server.ts:16574` | GET | `/api/marketing/ledger` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:16603` | GET | `/api/marketing/admin/ledgers` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:16665` | GET | `/api/marketing/wallet` | JWT middleware; handler-owned authorization | `LEGACY_REPLACE` |
| `server.ts:16726` | POST | `/api/marketing/meta/webhooks`<br>`/api/meta-webhooks` | provider signature/HMAC | `LEGACY_REPLACE` |
| `server.ts:16825` | POST | `/api/marketing/wallet/refuel` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:16935` | POST | `/api/marketing/simulate-webhook` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:16986` | POST | `/api/checkout/razorpay/order` | optional verified JWT; production checkout blocked | `LEGACY_REPLACE` |
| `server.ts:17152` | POST | `/api/payments/razorpay/verify` | JWT middleware; production 410 retirement | `UNSAFE_QUARANTINE` |
| `server.ts:17349` | GET | `/api/payments/geo-route/detect` | pre-handler 410 boundary | `LEGACY_REPLACE` |
| `server.ts:17406` | POST | `/api/payments/geo-route/initiate` | pre-handler 410 boundary | `LEGACY_REPLACE` |
| `server.ts:17676` | GET | `/api/admin/payments/overview` | verified JWT + persisted admin role | `UNSAFE_QUARANTINE` |
| `server.ts:17725` | POST | `/api/admin/payments/escrow/release` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:17824` | POST | `/api/marketing/webhooks/meta-leads` | provider signature/HMAC | `LEGACY_REPLACE` |
| `server.ts:17927` | GET | `*all` | public or handler-local only | `PUBLIC_INFRA` |
| `server.ts:19132` | POST | `/api/marketing/track/view` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:19159` | POST | `/api/marketing/track/interaction` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `server.ts:19171` | POST | `/api/marketing/pixel` | pre-handler 410 boundary | `LEGACY_BLOCKED_410` |
| `src/server/calendar.ts:168` | GET | `/api/listings/:id/room-calendar` | JWT + resource scope | `CANONICAL_MODULAR` |
| `src/server/calendar.ts:169` | POST | `/api/listings/:id/room-calendar/block` | JWT + resource scope | `CANONICAL_MODULAR` |
| `src/server/calendar.ts:170` | DELETE | `/api/listings/:id/room-calendar/block/:blockId` | JWT + resource scope | `CANONICAL_MODULAR` |
| `src/server/calendar.ts:171` | GET | `/api/listings/:id/availability` | public projection | `CANONICAL_MODULAR` |
| `src/server/conversations/router.ts:39` | GET | `/api/messages/:bookingId` | JWT + canonical participant scope | `CANONICAL_MODULAR` |
| `src/server/conversations/router.ts:40` | GET | `/api/threads` | JWT + canonical participant scope | `CANONICAL_MODULAR` |
| `src/server/conversations/router.ts:41` | GET | `/api/unread-counts` | JWT + canonical participant scope | `CANONICAL_MODULAR` |
| `src/server/conversations/router.ts:42` | POST | `/api/threads` | JWT + canonical participant scope | `CANONICAL_MODULAR` |
| `src/server/conversations/router.ts:43` | GET | `/api/threads/:id/messages` | JWT + canonical participant scope | `CANONICAL_MODULAR` |
| `src/server/conversations/router.ts:44` | POST | `/api/threads/:id/read` | JWT + canonical participant scope | `CANONICAL_MODULAR` |
| `src/server/conversations/router.ts:45` | POST | `/api/threads/:id/messages` | JWT + canonical participant scope | `CANONICAL_MODULAR` |
| `src/server/conversations/serviceRouter.ts:22` | GET | `/api/conversations/v1/threads/:id/assistance` | JWT + canonical participant scope | `CANONICAL_MODULAR` |
| `src/server/conversations/serviceRouter.ts:23` | POST | `/api/conversations/v1/cases` | JWT + canonical participant scope | `CANONICAL_MODULAR` |
| `src/server/conversations/serviceRouter.ts:24` | POST | `/api/conversations/v1/cases/:id/withdraw` | JWT + canonical participant scope | `CANONICAL_MODULAR` |
| `src/server/conversations/serviceRouter.ts:38` | POST | `/api/operations/v1/service/read` | fixed-origin JSON + opaque staff session + exact case assignment | `CANONICAL_MODULAR` |
| `src/server/conversations/serviceRouter.ts:39` | POST | `/api/operations/v1/service/notes` | fixed-origin JSON + opaque staff session + exact case assignment | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:16` | GET | `/api/marketing/v2/admin/adtech/inference` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:17` | POST | `/api/marketing/v2/admin/adtech/inference/jobs/:id/retry` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:18` | POST | `/api/marketing/v2/admin/adtech/inference/:id/review` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:19` | GET | `/api/marketing/v2/admin/adtech/corridors` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:20` | POST | `/api/marketing/v2/admin/adtech/corridors` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:21` | PUT | `/api/marketing/v2/admin/adtech/corridors/:id` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:22` | POST | `/api/marketing/v2/admin/adtech/corridors/:id/publish` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:23` | GET | `/api/marketing/v2/admin/adtech/geography` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:24` | GET | `/api/marketing/v2/admin/adtech/profiles` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:25` | POST | `/api/marketing/v2/admin/adtech/profiles` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:26` | PUT | `/api/marketing/v2/admin/adtech/profiles/:id` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:27` | POST | `/api/marketing/v2/admin/adtech/releases` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/adtechRoutes.ts:28` | POST | `/api/marketing/v2/admin/adtech/releases/:id/rollback` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/measurementRouter.ts:19` | POST | `/api/marketing/measurement/session` | same-origin JSON + first-party cookie | `CANONICAL_MODULAR` |
| `src/server/marketing/measurementRouter.ts:23` | POST | `/api/marketing/measurement/visit` | same-origin JSON + first-party cookie | `CANONICAL_MODULAR` |
| `src/server/marketing/measurementRouter.ts:29` | POST | `/api/marketing/measurement/revoke` | same-origin JSON + first-party cookie | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:57` | GET | `/api/marketing/v2/listings/:id/targeting-defaults` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:58` | POST | `/api/marketing/v2/listings/:id/corridor-research` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:59` | GET | `/api/marketing/v2/listings/:id/corridor-research` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:67` | GET | `/api/marketing/v2/listings/:id/spatial-stories` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:68` | POST | `/api/marketing/v2/spatial-stories` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:69` | POST | `/api/marketing/v2/admin/spatial-stories/:storyId/review` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:70` | GET | `/api/marketing/v2/destination-pools` | JWT + persisted actor | `CANONICAL_DEFERRED` |
| `src/server/marketing/router.ts:71` | POST | `/api/marketing/v2/admin/destination-pools` | JWT + persisted actor + admin | `CANONICAL_DEFERRED` |
| `src/server/marketing/router.ts:72` | POST | `/api/marketing/v2/admin/destination-pools/:poolId/state` | JWT + persisted actor + admin | `CANONICAL_DEFERRED` |
| `src/server/marketing/router.ts:73` | POST | `/api/marketing/v2/admin/destination-pools/:poolId/invitations` | JWT + persisted actor + admin | `CANONICAL_DEFERRED` |
| `src/server/marketing/router.ts:74` | POST | `/api/marketing/v2/pool-memberships/:memberId/consent` | JWT + persisted actor | `CANONICAL_DEFERRED` |
| `src/server/marketing/router.ts:75` | POST | `/api/marketing/v2/admin/pool-memberships/:memberId/review` | JWT + persisted actor + admin | `CANONICAL_DEFERRED` |
| `src/server/marketing/router.ts:76` | POST | `/api/marketing/v2/pool-memberships/:memberId/activate` | JWT + persisted actor | `CANONICAL_DEFERRED` |
| `src/server/marketing/router.ts:77` | POST | `/api/marketing/v2/pool-memberships/:memberId/resume` | JWT + persisted actor | `CANONICAL_DEFERRED` |
| `src/server/marketing/router.ts:78` | POST | `/api/marketing/v2/pool-memberships/:memberId/withdraw` | JWT + persisted actor | `CANONICAL_DEFERRED` |
| `src/server/marketing/router.ts:79` | POST | `/api/marketing/v2/pool-memberships/:memberId/pause` | JWT + persisted actor | `CANONICAL_DEFERRED` |
| `src/server/marketing/router.ts:80` | GET | `/api/marketing/v2/listings/:id/marketing-facts` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:81` | POST | `/api/marketing/v2/marketing-fact-snapshots` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:86` | POST | `/api/marketing/v2/preflight/economics` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:91` | GET | `/api/marketing/v2/campaigns/:id/preflight` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:95` | GET | `/api/marketing/v2/admin/readiness` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:96` | GET | `/api/marketing/v2/admin/settlements/documents` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:97` | POST | `/api/marketing/v2/admin/settlements/documents` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:98` | POST | `/api/marketing/v2/admin/settlements/import/google` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:99` | GET | `/api/marketing/v2/admin/creatives` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:100` | POST | `/api/marketing/v2/admin/creatives/:id/review` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:101` | GET | `/api/marketing/v2/admin/settlements/documents/:documentId` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:106` | GET | `/api/marketing/v2/admin/settlements` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:107` | POST | `/api/marketing/v2/admin/settlements` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:108` | GET | `/api/marketing/v2/admin/settlements/:settlementId` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:109` | POST | `/api/marketing/v2/admin/settlements/:settlementId/review` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:110` | POST | `/api/marketing/v2/admin/settlements/:settlementId/commit` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:111` | POST | `/api/marketing/v2/admin/settlements/:settlementId/withdraw` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:112` | GET | `/api/marketing/v2/campaigns/:id/settlement` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:113` | POST | `/api/marketing/v2/campaign-guidance` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:121` | GET | `/api/marketing/v2/creatives` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:122` | POST | `/api/marketing/v2/creatives` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:123` | GET | `/api/marketing/v2/creatives/:id/image` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:124` | POST | `/api/marketing/v2/creatives/:id/confirm` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:127` | POST | `/api/marketing/v2/admin/campaigns/:id/portfolio-shadow` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:132` | POST | `/api/marketing/v2/admin/portfolio-assessments/:assessmentId/reviews` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:136` | POST | `/api/marketing/v2/targeting/google/keyword-ideas` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:141` | GET | `/api/marketing/v2/targeting/google/locations` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:142` | GET | `/api/marketing/v2/targeting/google/languages` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:143` | POST | `/api/marketing/v2/targeting/google/resolve` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:144` | GET | `/api/marketing/v2/workspace` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:145` | GET | `/api/marketing/v2/admin/workspace` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:146` | POST | `/api/marketing/v2/campaigns` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:147` | GET | `/api/marketing/v2/campaigns/:id` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:148` | PATCH | `/api/marketing/v2/campaigns/:id` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:149` | POST | `/api/marketing/v2/campaigns/:id/evaluate` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:150` | POST | `/api/marketing/v2/campaigns/:id/submit` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:151` | POST | `/api/marketing/v2/campaigns/:id/quote` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:152` | POST | `/api/marketing/v2/campaigns/:id/fund` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:153` | POST | `/api/marketing/v2/campaigns/:id/refund` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:158` | POST | `/api/marketing/v2/campaigns/:id/cancel` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:164` | POST | `/api/marketing/v2/campaigns/:id/review` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:165` | POST | `/api/marketing/v2/campaigns/:id/publish`<br>`/api/marketing/v2/campaigns/:id/activate`<br>`/api/marketing/v2/campaigns/:id/pause` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:166` | POST | `/api/marketing/v2/admin/policy` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:167` | GET | `/api/marketing/v2/campaigns/:id/events` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:168` | GET | `/api/marketing/v2/campaigns/:id/advice` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:169` | POST | `/api/marketing/v2/campaigns/:id/refresh` | JWT + persisted actor | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:170` | GET | `/api/marketing/v2/admin/operations` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:177` | GET | `/api/marketing/v2/admin/campaigns/:id/recovery` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/marketing/router.ts:178` | POST | `/api/marketing/v2/admin/campaigns/:id/recovery/adopt-pause` | JWT + persisted actor + admin | `CANONICAL_MODULAR` |
| `src/server/operations/router.ts:32` | GET | `/api/operations/v1/workspace` | opaque workforce session + scoped projection | `CANONICAL_MODULAR` |
| `src/server/operations/router.ts:48` | POST | `/api/operations/v1/assignments/:id/actions` | fixed-origin JSON + opaque staff session + fenced assignment | `CANONICAL_MODULAR` |
| `src/server/operations/router.ts:75` | GET | `/api/operations/v1/workforce` | opaque workforce session + scoped projection | `CANONICAL_MODULAR` |
| `src/server/operations/sessionRouter.ts:34` | POST | `/api/operations/v1/session/begin`<br>`/api/operations/v1/session/complete`<br>`/api/operations/v1/session/logout` | fixed-origin JSON + isolated workforce identity flow | `CANONICAL_MODULAR` |

## Appendix B — Runtime table creation ledger

Creation anchors are source evidence; RLS labels describe migration/runtime declarations, not deployed role acceptance.

| Table | Creation source(s) | Source RLS |
|---|---|---|
| `admin_audit_logs` | `server.ts:2291` | No source RLS declaration |
| `async_webhook_queue` | `server.ts:1965` | No source RLS declaration |
| `bookings` | `server.ts:1394` | ENABLE only |
| `calendar_prices` | `server.ts:1597` | No source RLS declaration |
| `campaign_creative_variants` | `server.ts:2469` | No source RLS declaration |
| `campaign_daily_rollups` | `server.ts:2153` | No source RLS declaration |
| `campaign_financial_contracts` | `server.ts:2307` | No source RLS declaration |
| `campaign_metrics` | `server.ts:2128` | No source RLS declaration |
| `campaign_raw_event_logs` | `server.ts:2142` | No source RLS declaration |
| `dco_evaluation_transactions` | `server.ts:2536` | No source RLS declaration |
| `dco_external_actions` | `server.ts:2568` | No source RLS declaration |
| `encho_distributed_worker_locks` | `src/lib/distributedLock.ts:39` | No source RLS declaration |
| `experience_bookings` | `server.ts:1415`<br>`server.ts:1625`<br>`server.ts:2851`<br>`server.ts:17081`<br>`server.ts:18082` | ENABLE only |
| `experience_messages` | `server.ts:1672` | No source RLS declaration |
| `experience_reviews` | `server.ts:1647` | No source RLS declaration |
| `experience_videos` | `server.ts:1658` | No source RLS declaration |
| `experience_wishlists` | `server.ts:1541` | No source RLS declaration |
| `experiences` | `server.ts:1455`<br>`server.ts:2827`<br>`server.ts:18051` | No source RLS declaration |
| `host_marketing_campaigns` | `server.ts:1787` | ENABLE only |
| `host_meta_identities` | `server.ts:2381` | No source RLS declaration |
| `host_outreach_leads` | `server.ts:1906`<br>`server.ts:1988` | FORCE via migration |
| `host_social_posts` | `server.ts:2346` | ENABLE only |
| `host_wallets` | `server.ts:2052` | ENABLE only |
| `inbound_webhooks` | `server.ts:1947` | No source RLS declaration |
| `lead_inquiries` | `server.ts:1805` | No source RLS declaration |
| `lead_lifecycle_events` | `server.ts:2639` | No source RLS declaration |
| `lead_notification_intents` | `server.ts:2656` | No source RLS declaration |
| `lead_security_audit_logs` | `server.ts:2680` | No source RLS declaration |
| `ledger_entries` | `server.ts:2092` | No source RLS declaration |
| `ledger_lines` | `server.ts:2102` | No source RLS declaration |
| `listing_pricing_sync_events` | `src/lib/dynamicPricingSyncService.ts:89` | No source RLS declaration |
| `listings` | `server.ts:1263` | No source RLS declaration |
| `listings_drafts` | `server.ts:1286` | No source RLS declaration |
| `messages` | `server.ts:1435` | FORCE via migration 037 |
| `meta_api_traces` | `server.ts:2229` | No source RLS declaration |
| `meta_external_truth` | `server.ts:2333` | No source RLS declaration |
| `meta_publishing_dlq` | `server.ts:2273` | No source RLS declaration |
| `meta_publishing_events` | `server.ts:2209` | No source RLS declaration |
| `meta_publishing_transactions` | `server.ts:2179` | No source RLS declaration |
| `meta_reconciliation_incidents` | `server.ts:18586` | No source RLS declaration |
| `offers` | `server.ts:1567` | No source RLS declaration |
| `operation_idempotency_keys` | `server.ts:2323` | No source RLS declaration |
| `processed_payments` | `server.ts:1926`<br>`server.ts:17203` | No source RLS declaration |
| `processed_webhook_events` | `server.ts:1897` | No source RLS declaration |
| `provider_entities` | `server.ts:2728` | No source RLS declaration |
| `provider_publishing_transactions` | `server.ts:2747` | No source RLS declaration |
| `retargeting_pixel_events` | `server.ts:19137`<br>`server.ts:19179` | No source RLS declaration |
| `reviews` | `server.ts:1586` | No source RLS declaration |
| `room_calendar_blocks` | `server.ts:1296` | No source RLS declaration |
| `seo_configurations` | `server.ts:1756` | No source RLS declaration |
| `settings` | `server.ts:1447` | No source RLS declaration |
| `soft_exit_leads` | `server.ts:1818` | No source RLS declaration |
| `threads` | `server.ts:1514` | FORCE via migration 037 |
| `users` | `server.ts:1216` | No source RLS declaration |
| `variant_daily_rollups` | `server.ts:2615` | No source RLS declaration |
| `variant_meta_snapshots` | `server.ts:2516` | No source RLS declaration |
| `variant_raw_event_logs` | `server.ts:2584` | No source RLS declaration |
| `visitor_pixel_events` | `src/lib/retargetingPixelService.ts:73` | No source RLS declaration |
| `wallet_accounts` | `server.ts:2081` | No source RLS declaration |
| `wallet_transactions` | `server.ts:2064` | ENABLE only |
| `webhook_dlq` | `server.ts:2114` | No source RLS declaration |
| `wishlists` | `server.ts:1576` | No source RLS declaration |

## Appendix C — Validation record

Run the read-only structural validator from the repository root:

```bash
node scripts/cr1/verify-inventory.mjs
git diff --check -- docs/implementation/CR1_P0_ROUTE_SCHEMA_INVENTORY.md scripts/cr1/verify-inventory.mjs
```

<!-- CR1_INVENTORY_COUNTS {"declarations":330,"expandedPaths":353,"migrationFiles":37,"migrationTables":121,"runtimeTables":62,"overlappingTables":0,"totalTables":183} -->

The validator compares every ledger method, expanded path and line anchor to AST-derived declarations; rejects missing/phantom routes and newly untracked route-owner files/factories; expands generated action loops; validates mounted factory prefixes, including two different prefixes in `serviceRouter.ts`; verifies every runtime table source anchor, migration table ledger, source-distribution summary and declared guard/disposition totals. Four focused parser checks pass via `node --test scripts/cr1/verify-inventory.test.mjs`. Guard/disposition counts validate internal ledger consistency, not handler semantics. Table totals are source creation declarations, excluding runner-owned `schema_migrations`; they do not prove an actual deployed catalog. RLS semantics and individual handler authorization require separate tests.

Final local structural validation on 24 September 2026: **PASS** — 330 declarations, 353 expanded paths, 121 migration-created tables, 62 runtime-created tables, zero overlapping creation authorities and 183 total domain table names. This receipt validates repository structure and documentation consistency only; it does not claim a deployed catalog or production release.
