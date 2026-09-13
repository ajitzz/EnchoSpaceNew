# HARVO — Review coverage and remaining work

## Execution M1 coverage update

Discussion 010 authorizes implementation. Google client/provider, new Search builder/publishing store and DCO containment were implemented and reviewed, with dedicated HTTP and real local PostgreSQL tests. Exact scope/results are in [M1_VERIFICATION.md](M1_VERIFICATION.md), with final scoped hashes in M1_SOURCE_HASHES.json. Server schema and Google containment were inspected as source without app startup; Meta adapter/Google worker/projection gaps were recorded, not fixed. No live account/DB validation or host/admin UI acceptance occurred. This increment does not complete the entire-project semantic review described below.

## Scope and method

The requested complete semantic line-by-line review is **not finished**. HARVO v0.1 provides a cross-project structural inventory and detailed review of selected critical journeys. This is deliberately distinguished from blanket “entire codebase audited” language.

Initial baseline before HARVO documentation edits: **948 selected files / 148,590 lines**, including **146 application files / 93,087 lines**, **8 migration files / 552 lines**, **144 test/diagnostic files / 23,519 lines**, **97 documentation files / 9,460 lines**, and other maintenance/configuration text. The generated inventory may subsequently change as documentation is updated; its timestamp and hashes identify each run.

The utility reads selected first-party text files and parses JS/TS syntax trees without importing application code. It records imports, named declarations, route registrations, table-declaration names and coarse risk-pattern line numbers. Every flag is a search aid, not a proved defect. Counts include comments/blank lines and historical scripts. They do not measure engineering completion or business value.

Dependencies, generated builds, raw logs/dumps, credentials/environment files, historical chat exports, binary media and secret/token-named files are excluded. Some source files with token-related filenames are consequently excluded from the generated inventory and require explicit review. Do not interpret the selected-file inventory as every filesystem file. Never run legacy patch/seed scripts merely because they are inventoried.

## Manual semantic review completed for this baseline

The following table describes the actual depth. A range means that range was read; other portions may only be searched/indexed. It does not claim a percentage of code understood. Some lengthy tool outputs were truncated; those files are not counted as fully read.

| Area | Source inspected | Review depth |
|---|---|---|
| Governance/business | AGENTS, Constitution, strategy, guest decision register, AI protocol, bootstrap | Main controlling documents read; historical claims separated from current evidence |
| Planning | Guest implementation plan/blueprint, presentation contract, inventory shadow boundary | Headings/statuses, current-stage contracts and relevant sections; not every historical plan line |
| Deployment/tests | package scripts, Vite/Vercel/Docker config, TS configs, Vitest/Playwright setup | Core configuration read; setup/mock details inspected; no deployed environment validation |
| Server identity/security | Main startup/config, JWT/auth/OTP/Google handlers, RLS wrapper/policies, socket setup | Detailed selected function/route review |
| Server stays | Canonical/public listing projection handlers, hold routes, calendar read/write, legacy booking insert | Detailed selected handler review; not all 20,678 server lines |
| Server payments/ads | AI default/failure path, financial contract, privileged payment overview/escrow release, production stay checkout gates | Detailed selected boundaries; full publish/payment/webhook call graph not completed |
| Stay projection | `src/lib/stayProjection.ts` | Full file read for mapping/sanitization/default behavior |
| Inventory service | `inventoryHoldService.ts` ranges 1–650 and declaration map | Detailed hold path; later release/block/sweep bodies still need full independent review |
| Migrations | 001–007 and runner | Full files read; no migration applied to real Postgres |
| App | Initial state/imports, booking handler, canonical routing/render links, socket usage | Critical journey ranges traced; entire 1,649-line component not fully reviewed |
| Guest details | `ListingDetailsNew` media/room defaults, pricing, calendar use, host/review claims | Detailed key ranges and rendered-test evidence; other large branches indexed |
| Host | HostDashboard initial data/actions, HostForm steps/defaults/upload/save payload | Selected workflow review; full forms/admin parity not certified |
| Confirmation/checkout | BookingPage reference/access defaults; CheckoutPage production gate, room defaults | Targeted read; all payment UI handlers not fully traced |
| Shared auth/offline | AuthContext, generic idempotency, mask/crypto helpers, main IndexedDB sync and handlers | Full or substantial targeted read; additional sync implementation remains indexed |
| Marketing | Provider contract/registry, delivery reducer initial branches, service declarations, financial helper, auto-pause, pricing, lead notifications, pixel and worker boundaries | Critical semantics examined; large truth/control/DCO/telemetry bodies not fully reviewed |
| Tests | Three M2/M6A suites and six domain suites executed; selected assertions/setup read | 130 collected tests total; not the whole test collection; mocks limit conclusions |
| Remaining first-party sources | Generated SOURCE_INVENTORY files | Structural index only unless explicitly listed above |

No live customer data, signed-in production UI, production DB metadata, deployed source version, real payment capture/refund, real host payout, live Meta account state, or actual notification delivery was validated. DOM/SSR checks do not establish browser accessibility or visual quality.

## What must happen to finish the line-by-line request

Continue the review, recording **file + source hash + complete line ranges + behavior summary + dependencies + risks + validation + unresolved questions**. Never promote a file from structural to semantic review merely because a tool loaded it or a test imported it.

| Review batch | Remaining scope | Completion evidence |
|---|---|---|
| A — Server remainder | Every unreviewed handler/helper, all middleware ordering, auth/ownership and response paths | All server line intervals accounted for; input/output and side effects mapped |
| B — Financial execution | Full funding, webhook, escrow, refuel, refund, settlement/ledger and provider side effects | Caller transaction trace; immutable bindings; crash matrix with real isolated DB/provider sandbox where appropriate |
| C — Publishing/control/CRM | Full Meta adapters, truth projection, control plane, DCO, telemetry, lead ingestion and alert paths | State ownership, freshness, retry/unknown-outcome contracts and all call sites |
| D — Property surfaces | Entire HostForm, AdminDashboard, ListingDetailsNew, legacy details, media galleries, calendar | Field-by-field host→DB→moderation→guest parity and public/private data trace |
| E — Remaining UI | Search/maps/filters, reservations, inbox, experiences/lobby, contexts, PWA, smaller cards | User flows, error/empty/offline states, route reachability, accessibility and actual rendering |
| F — Auxiliary source | Every remaining service, utility, migration consumer and infrastructure entrypoint | Dependency graph, duplicated authority and side-effect ownership |
| G — Tests and history | Entire test suite, root maintenance scripts, historical audits/ADRs/incidents | Safe execution classification; current-source applicability; obsolete scripts retained as history until approved cleanup |
| H — Environment evidence | Actual schema/RLS/migration history, deployment version/configuration, live operational indicators | Approved read-only evidence, no secret exposure; separate controlled acceptance for mutations/side effects |

This is a review work queue, not a new Phase 2 feature blueprint. Continuing read-only analysis/documentation is within the founder's request. Fixing production code still follows phase control and the engineering protocol.

## Impact analysis of the HARVO task

- **Classification:** Documentation and analysis.
- **Problem addressed:** Project understanding is fragmented across conflicting plans, older certifications and mixed-generation code; no persistent cross-project evidence register existed under the requested name.
- **Changes:** HARVO.md, docs/harvo evidence/coverage/decision/validation/index files, and a small AGENTS startup/maintenance instruction.
- **Database/API/UI/security behavior:** No production code, schemas, API contracts or UI behavior changed.
- **Operational side effects:** Local typecheck/build and selected tests; generated `dist/` is not deployed. Tests used explicit loopback test DB configuration and project mocks. No migration, seed, legacy patch script or deliberate live integration operation was run.
- **Risk:** Stale findings, imprecise scope claims or proposals mistaken for approval. Mitigated by hashes, source references, status labels, preserved gates and coverage disclosure.
- **Validation:** Check artifact links and file references; retain summarized command outcomes; confirm application source hashes unchanged.
- **Rollback:** Remove HARVO-added documentation/utility and its AGENTS section if requested; preserve unrelated pre-existing files and generated build output unless specifically cleaning that artifact. No database rollback is involved.

## Safe resumption

Discussion 008 adds targeted GoogleAdsProvider hierarchy creation, GoogleAdsClient constructor/search/mutate/upload endpoints, full GoogleOfflineConversions and GoogleDcoStrategy reads, retargeting event structure and existing animation dependency checks. These establish H-048–H-052. Source review remains selective; no production API/account/DB validation or complete Google adapter acceptance occurred. The booking-growth report separately researches provider capabilities and experimental measurement; public Meta policy/CAPI access limits are explicit. The interactive studio uses synthetic scenario inputs and no network calls.

Discussion 007 adds detailed critical-flow reads for HostMarketing creation/AI/checkout/polling; AdminDashboard approval handler/button; server campaign creation, AI check, subscription branches, admin approval, state-machine dispatch, Meta campaign/ad-set/activation payloads, pacing writes, CRM conversion and telemetry route; campaignControlCenterService metric lineage/projections/breakdown/proof builders; metaTelemetrySyncEngine variant fetch/write; DcoEngine comparison/scheduled processing/rebalancing and server DCO reconciliation; financial/performance/advisor/proof cards and control-center polling. Exact anchors and findings are in [PAID_CAMPAIGN_AUDIT.md](PAID_CAMPAIGN_AUDIT.md).

Five additional targeted test suites ran (44 collected: 22 passed, 22 skipped, three setup failures). Seven pure projection methods and the pacing function were extracted from source and executed offline with synthetic inputs and captured database stubs; hashes/line anchors and results are retained in PAID_FUNNEL_PROBE.json. This is not a server import, route integration, real-DB or provider test.

Still incomplete: entire HostMarketing/AdminDashboard JSX and all handlers, full main HostDashboard browser interaction, complete payment/webhook transport and provider account validation, all control-plane/Google integration branches, exhaustive worker/migration interaction, real tenant isolation/concurrency, visual/accessibility/mobile/load testing. Large/truncated reads do not count as complete semantic review. The audit is detailed across critical paths, not a blanket line-by-line certification.

Discussion 003 adds targeted search/card/landing-inspector/creative/host-marketing reads and admin declaration searches, enumerated in HARVO section 20. H-032/H-033 extend the findings register. This increment does not complete the remaining server, UI or provider review batches. Etsy/Slice primary-source checks were business research, not verification of Encho production operations.

Read Constitution → HARVO → decisions/coverage → relevant source and original authority. Recheck hashes, update findings rather than repeating already completed work, and add founder business inputs when supplied. Do not interpret local certificates or generated inventory counters as independent acceptance.
