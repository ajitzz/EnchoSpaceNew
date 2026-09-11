# Encho Stays — connected platform transformation

Date: 2026-09-09. Authorization: product owner requested implementation of a coordinated Guest, Host and Admin upgrade, then explicitly requested completion across all six milestones in one continuation. This supersedes the earlier one-milestone response cadence. Preserve the approved ListingDetailsNew and gallery visual direction. A quality target is not a production certification.

## Baseline and impact analysis

The existing application is React/Vite, Express, Socket.IO, Neon Postgres, workers, Stripe/Razorpay and provider adapters. Retain this architecture and existing listing fields. No migration, production data modification, paid advertising, or payment execution is authorized by this local implementation step.

Source review found shared account dispatch, separate host identity documentation, contradictory checkout calculations, incomplete date inventory enforcement, simulated Google hierarchy creation, invented booking attribution, and admin approval that changes financial clearance. Existing certification documents do not establish current deployment readiness.

Guest → listing content → room selection → server quote → inventory reservation → payment confirmation → host reservation is one contract. Host → listing → campaign → AI assessment → admin approval → verified funding → escrow release → provider publication → observed delivery → inbox → attributed booking is another. Changes must cover every consumer of the affected contract.

| Milestone | Connected scope | Acceptance evidence | Status |
| --- | --- | --- | --- |
| 1. Operational experience and campaign trust | Host reservations/navigation, admin navigation/approval visibility, shared campaign readiness, funding separation, honest analytics, guest accessibility/offline behavior | 27 isolated regression tests, production build, scoped lint | Implemented and locally validated; release checks pending |
| 2. Booking and property truth | Guest gallery/reviews, HostForm, admin content review, selected-room identity, server quote, checkout, confirmation, guest identity | Quote/identity tests and staged UI/API; production recovery/currency/content acceptance open | Staged; incomplete |
| 3. Availability and guest operations | Date-scoped room inventory, atomic holds, cancellation/refund handling, host calendar, guest reservations, admin booking controls | Isolated PostgreSQL concurrency/expiry/idempotency tests pass; refund/admin/calendar contracts open | Partially implemented |
| 4. Provider publication and control | Meta/Google verified identities, live API hierarchy, funding allocation per network, admin review, host pause/resume, reconciliation | Unsupported Google controls fail explicitly; real API/allocation work and canaries outstanding | Safety remediation only; incomplete |
| 5. CRM and revenue attribution | Real recipients and delivery adapters, lead ownership, inbox, guest conversion events, completed bookings, refunds, revenue reports | Recipient/signature/no-fake-delivery tests pass; adapters/identity-linking/attribution outstanding | Safety remediation only; incomplete |
| 6. Release and performance certification | Role E2E, accessibility/browser testing, mobile performance, security, deployment/rollback | Build/type checks, 59 ordinary tests and 7 isolated PG tests; browser/runtime/live release gates outstanding | Local validation progressed; not certified |

## Milestone 1 implementation plan

Root cause: independently built views have diverged from financial and provider truth. Approval currently releases escrow and marks payment paid; the orchestration path trusts the event name. Some reporting fabricates results. A service worker retries arbitrary POST requests while their authorization context may have changed. Host reservations have inert tabs, hidden fetch errors and inconsistent status casing.

Solution: use one pure campaign readiness contract across host/admin and backend entry points; make moderation change only moderation fields, preserving payment and escrow; display approval separately from launch readiness; remove invented ROI; provide coherent accessible working surfaces with real counts, functioning reservation filters and retry states. Preserve guest visual design and improve keyboard/reduced-motion behavior. Never replay arbitrary financial/approval mutations offline.

Affected components: HostDashboard, AdminDashboard, HostMarketing, shared workspace/readiness components, server campaign approval/orchestration, Vite service-worker settings, shared styles, isolated tests. No new property fields or database schema. Existing API envelopes remain compatible; readiness is additive. Existing audit/idempotency/row locks remain required.

Risks: legacy campaigns may be blocked until verified payment/escrow records exist; this is intentional. Unsupported Google creation must not be described as live. Isolated unit tests cannot certify live providers or database migrations. Existing unrelated defects must remain visible in the milestone ledger.

Testing: run pure logic and UI component tests using a configuration that does not load environment secrets or touch a database; static route integration tests where the monolith prevents safe import; production build and scoped lint/type checks. Do not run the existing database-seeding suite against the configured Neon database.

Rollback: revert only this milestone's tracked diff after review, leaving user files untouched. No destructive commands, data deletion or migration rollback required. Do not restore fabricated analytics or offline mutation replay as a production workaround.

## Milestone 1 handoff

Implemented shared responsive workspace navigation and a functional host reservation overview, independent host/admin campaign readiness indicators, moderation-only idempotent approval, guarded publication/activation, honest missing-performance states, persisted lead retrieval, explicit Google simulation boundaries, and restricted offline mutation replay. Existing ListingDetailsNew/gallery styling was preserved. No property fields or database schema changed.

Checks: `npm exec vitest -- run --config vitest.platform.config.ts` passed all 27 tests in three files. The route harness executes extracted server handlers with injected dependencies; it does not prove database constraints or external provider behavior. `npm run build` passed frontend and server compilation. Scoped ESLint passed on new components, shared helpers, and tests. `git diff --check` passed. A frontend-only local preview returned HTTP 200; no browser interaction audit was performed.

Known remaining limits: booking quote/identity and inventory issues belong to milestones 2–3. Real Google publication, cross-network allocation and complete entry-point coverage belong to milestone 4. Pricing-sync projection still contains legacy optimistic defaults and requires provider evidence in milestone 4. Notification delivery, full tenant isolation and attribution belong to milestone 5. Existing integration tests were not run because they can seed the configured database. No payments, ads, production migrations or deployment were executed. Build still warns about an entry chunk over 500 kB and the existing NODE_ENV setting; no runtime speed rating or conversion improvement is claimed. Browser/accessibility, provider/payment canaries and production performance remain milestone 6 gates.

Next incomplete acceptance work starts in **2. Booking and property truth**; implementation has advanced through connected safety/performance areas without declaring later milestones complete. See [current release gates](PLATFORM_RELEASE_GATES.md). Do not repeat completed changes.

### Sites deployment boundary

Sites was explicitly requested and its building/hosting skills were read. No existing Sites project is registered. Hosted Sites require Worker-compatible request handlers and do not support raw TCP database connections. The existing Node listener, pg connections and background intervals are not a compatible deployable artifact. Keep local validation on the existing stack; deploying a static shell would not deliver this application's backend. Migration or deployment to its existing Node hosting remains a separate release decision.

## Definition of done

Each milestone must name its actual checks and limitations. Full production readiness remains pending until the complete guest payment/booking and host funding/advertising journeys are verified, tenant boundaries and recovery tested, and the target deployment validated. Never report an unmeasured 10/10 rating or a fake conversion multiplier.

## Milestones 2–3: checkout and inventory implementation impact

Category: Payment/Security, connected UI and Database. Root cause proven in source: client/server totals differ; unsigned-in checkout defaults to user 1; missing gateway keys fabricate payment; selected room identity and checkout date are lost; direct booking accepts client totals and decrements lifetime inventory. Booking confirmation fabricates credentials.

Plan: isolate stay checkout in a dependency-injected router and pure quote contract. Use exact room identity, validated dates/occupancy and configured fees, immutable quote snapshots, durable user-scoped idempotency, listing-row serialization and dated holds. Verify gateway signature plus captured payment amount/currency/order binding before inserting confirmed booking. Disable legacy stay-creation bypasses. Preserve guest gallery layout but remove invented content and wire real room selection. Replace unsupported payment widgets with the actual gateway checkout. No new host-facing property fields; preserve existing price/capacity/inventory inputs including zero inventory.

Database impact: add a reviewed SQL migration for durable checkout attempts and audit events, indexes and RLS. Do not apply it to configured Neon. New checkout is opt-in behind STAY_CHECKOUT_ENABLED until migration, tax/rate settings, isolated DB concurrency tests and gateway tests pass. Unknown order-creation outcomes remain review-blocked and retain inventory rather than auto-retry a potentially created order. Cancellation refunds remain a separate financial workflow and must not be falsely declared complete.

API impact: new /api/stays/quote, /orders and /verify endpoints; legacy stay writes return an explicit migration error. Security: authenticated user ownership, no PII in provider notes, no sandbox payment success, no public confirmation IDs. Compatibility: pending legacy bookings remain conservatively inventory-blocking; malformed legacy dates require reconciliation. Performance: indexed checkout lookup; per-listing lock limits contention to one property. Tests: pure quote/interval/payment checks, injected route tests and build; no production DB or paid provider operations. Rollback: disable new checkout first; preserve ledger/history and existing user edits, never restore insecure payment paths as a fallback.

## Milestones 4–5: additional source-proven release gaps

Category: Meta Integration/Security and CRM. Google provider pause/resume/budget and telemetry currently modify/read local synthetic state instead of the ad network. Live creation alone being blocked is insufficient. The provider paths must explicitly report unsupported operations outside sandbox until actual provider reconciliation and separate network spend authorizations are available. Missing pricing-sync evidence must not display a generated price or a synchronized badge.

CRM notification workers currently mark intents delivered without an adapter, construct recipients from host IDs, and accept a fallback webhook secret. Correct these boundaries before implementing delivery adapters: resolve real host contact records, fail closed on missing webhook secret, only accept explicit adapters, and require a host identity for lead mutations. Keep outbox/audit data and surface failures. Full adapter delivery, guest identity linkage and financial attribution remain separate acceptance gates; local safety fixes are not completion evidence for those gates. No external notifications or provider mutations will be sent during this work.
