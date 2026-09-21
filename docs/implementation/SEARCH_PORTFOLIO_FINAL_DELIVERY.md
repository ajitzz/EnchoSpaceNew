# HARVO-033 implementation and verification report

Authority: founder HARVO-033, 21 September 2026. **Status: substantial local implementation; the full definition of done is not met.** This is not a production or 10/10 certificate. The existing dirty worktree was preserved. No commit, push, deployment, production database migration, real payment or live ad was performed by this execution.

**Subsequent HARVO-034:** founder accepts the six local workstreams and paid-pool containment. The [rollout preparation plan](HARVO_034_ROLLOUT_PLAN.md) records local key provisioning, migration/grant rollback rehearsal, the explicit local-only clarification and a new release-verification run. That later evidence does not rewrite the HARVO-033 test result below or establish a live Dedicated Stays launch.

## Delivery by workstream

| Workstream | Implemented locally | Remaining acceptance / implementation |
|---|---|---|
| SP4 / RFC-E1 | Canonical nightly-price lookup, explicit nights/margin/booking assumptions, exact minor-unit arithmetic, planned CAC and break-even guidance; host-safe overlap advisory | Advice is a scenario, not an outcome forecast. No portfolio blocking authority was introduced. |
| RFC-X1 | Versioned Asia/Kolkata Wednesday 06:00 to Monday 23:59:59 flight; delayed explicitly authorized activation, independent stop sweep, expired-flight guards, provider-local date checks; cancelling undispatched activation fences its job and queues provider pause/readback | Live provider/account-timezone acceptance and worker operating evidence. No promise of delivery at an exact second. |
| RFC-M1 | Opaque signed revision/provider/card/expiry links; explicit optional measurement consent; secure browser identity established before evidence; immutable consent/touchpoint receipts; separate 30-day browser payload retention; withdrawal; stable conversion event UUID contract | Accepted canonical booking/Purchase and current-consent adapters are absent from deployed composition. No fabricated booking authority or browser Purchase is enabled. |
| SP5 | Pool lifecycle and owner opt-in, independent property eligibility review, separate quote/reservation contracts, INR 1,000 minimum, INR 10,000 daily authorization cap, immutable claims/events, weighted collection placement, own-host projection, occupancy/fact checks, bounded background maintenance, pause/resume and unfunded withdrawal | **Partial.** Paid pooled provider publication and observed provider-bill allocation/settlement are absent. Deployment refuses pool quotes/checkout/activation. Collection responses are not verified impressions. No money is charged for this unfinished product. |
| SP6 / RFC-C1 | Four distinct approved property images and literal canonical labels; independent review/revocation; public spatial sections; Meta four-card carousel; Google four sitelinks and two image extensions; bound signed URLs; exact returned asset association and content checks | Live account capability/policy review and representative image quality acceptance. Current story images are bounded at 150 KB each to fit the existing semantic request limit; dimensions are 1080×1080 and 1200×628. Google image readback reports dimensions/association, not a returned-byte hash. |
| SP7 / RFC-O1 | Host budget meter/delivery evidence, separate Encho inquiry/visit metrics, unknown booking metrics when unconfigured, generic connected inbox notifications, participant-bound inbox, stable message retries, bounded message pagination, administrative correlations/audit/recovery; desktop/mobile checks | Actual SLO/operating acceptance, disconnected-device notification delivery, real canonical booking outcomes and named/bounded provider pilot. Existing provider protection remains active. |

## Source map

- `src/shared/marketingFlight.ts`, `src/lib/marketing/portfolio/preflight.ts`, `workflow.ts`, `engine.ts`, `components/marketing/PreflightPanel.tsx`: planning and scheduling.
- `src/shared/marketingAttribution.ts`, `src/lib/marketing/portfolio/attribution.ts`, `touchpoints.ts`, `src/server/marketing/measurementRouter.ts`, `components/marketing/MeasurementChoices.tsx`: signed visits and explicit consent.
- `src/lib/marketing/portfolio/pools.ts`, `components/marketing/DestinationPools.tsx`, `DestinationCollection.tsx`: separate destination contracts and the explicit paid-execution gate.
- `src/shared/marketingStory.ts`, `src/lib/marketing/portfolio/spatialStories.ts`, provider spatial plan/readback modules, `components/marketing/SpatialStoryWorkspace.tsx`, `PublicSpatialStory.tsx`: reviewed multi-asset publishing.
- `src/lib/marketing/inquiryInbox.ts`, `src/lib/marketing/portfolio/outcomes.ts`, `components/InboxPage.tsx`, `components/marketing/StudioShared.tsx`, `api.ts`: private inquiries, notifications and truthful metrics.
- `src/migrations/027_*` through `031_*`, `src/server/deployment/portfolioReadiness.ts`, `src/server/marketing/worker.ts`: schema, minimum privileges and supervised maintenance.

## Commercial and financial interpretation

HARVO-033 explicitly approves contribution-weighted impression rotation, fully occupied properties receiving no allocation/debit, INR 1,000 minimum host contribution, INR 10,000 daily destination cap, and Wayanad/Coorg/Goa villas. The implemented response-placement algorithm is smooth weighted rotation: a 1:2 contribution ratio produces 4:8 featured responses over 12 eligible selections. This is **not** evidence of equal provider impressions, a user view, a booking or an approved per-host provider-bill allocation rule.

Rotation, inventory pauses, resume and guest page requests never write the financial ledger. Durable pre-dispatch claims retain uncertain capacity and enforce destination/day and member-lifetime ceilings. They do not represent observed spend and are not exposed as a live publisher. Reusing the dedicated campaign publisher for a pool would bypass product and consent authority, so it is rejected. A deployed `POOL_EXECUTION_UNAVAILABLE` error cannot be disabled through an environment flag.

## Security and concurrency evidence

- Real disposable PostgreSQL tests use non-superuser, non-BYPASSRLS runtime roles. New tenant/evidence tables force RLS; host isolation, persisted administrator roles, immutable receipts and exact policy expressions are checked.
- Signed URLs contain no raw campaign or host IDs. Signature verification also binds canonical path, revision, provider, card and expiry. A valid token does not authorize tracking or payment.
- Consent/visit retries preserve identity without re-granting revoked consent. Advertising data and personalization are separate opt-ins. Optional click IDs/user-agent data is deleted on withdrawal and by a bounded retention job; expired values cannot be returned by conversion lookup. Immutable audit receipts retain hashes and event relationships, not that browser payload.
- Inquiry thread creation resolves the canonical published owner. Reads and sends require actual participation. A forged recipient is rejected. Messages, unread state and consent-bound inquiry attribution commit atomically. Retried messages neither duplicate the record nor re-notify the recipient.
- Paused scheduling races, simultaneous daily spend claims, occupancy pauses, consent withdrawal/replay and changed creative/readback content are exercised. Uncertain provider outcomes stay in reconciliation; no dedupe lock is erased to manufacture a successful retry.

## Verification record

Targeted development runs passed for the changed contracts. The single full regression recorded 1,843 passing and one failing test across 143 files, with no pending tests. The malformed-fragment failure was corrected before an unrelated database lookup; all 23 tests in the five affected suites then passed. No second full-suite loop was run, so this report does not claim a clean full run of the corrected tree. TypeScript, lint (after a test-fixture declaration correction), isolated client/server compilation and the final compiled smoke pass. See `docs/harvo/SEARCH_PORTFOLIO_EXECUTION_VERIFICATION.md` for exact evidence and limitations. Local diagnostics are in `/tmp/harvo033-*`; they are not committed artifacts.

Browser checks use actual production components with local fixture HTTP, denied external access and no database/provider connection. Twenty scenarios cover host, admin, calendar, keyword research, planning, destination administration, guest collection, public story, editorial review and measurement choices at 1440 and 390 pixels. They check consent-before-measurement, withdrawal, required attestations, canonical links, host identity isolation, recovery prerequisites, keyboard access and overflow. Visual inspection corrected mobile monetary wrapping and the pool heading control. These are not screenshots of a deployed site.

Bounded corridor staging uses disposable fixture properties in Wayanad/Coorg/Goa test cases. Background full-occupancy detection pauses allocation without moving funds or publishing ads. **It is not the named customer/provider pilot.** Exact approved listing IDs and the operating administrator were requested; none have been supplied in this execution.

## Deployment and rollback

1. Apply all reviewed migrations in order with the migration owner. Migrations 027–031 are new and have not been installed by this run. Do not rewrite an already-applied external migration; reconcile history/checksums first.
2. Runtime role must remain non-owner, non-superuser and non-BYPASSRLS, with no role path to the owner. Existing source-table and finance grants remain required. New grants: SELECT/INSERT on attribution links, consent receipts, touchpoints, pool events/exposures/spend claims, spatial stories/reviews, inquiry attribution; SELECT/INSERT/UPDATE on destination pools and memberships; SELECT/INSERT/DELETE only on expiring measurement payloads. USAGE, without UPDATE/ownership, on the consent and story-review sequences. Do not add PUBLIC, TRUNCATE or TRIGGER grants. Catalog readiness checks these exact boundaries.
3. Configure the real service administrator and origin, signing key ring (`HARVO_ATTRIBUTION_KEYS`), provider accounts and approved creative storage through secret management. Key ring values must be canonical base64url 32-byte secrets, not example values. Preserve retired signing keys until issued capabilities expire. No key or identity is supplied by this report.
4. Deploy the same tested web and worker artifact together. The worker owns retention, timed stops, bounded destination eligibility, observations and existing conversion/image work. Retention continues when attribution signing is disabled.
5. Verify the actual staged/production Neon catalog, permissions, migration checksums, worker progress, storage, HTTPS cookies, same-origin consent and canonical public routes. Local PostgreSQL success does not attest Neon.
6. Retain live activation gates until real canonical checkout/conversion, provider/legal acceptance and bounded pilot prerequisites are met. Pool paid activation remains unavailable until its missing publisher and settlement protocol are implemented and verified.

Rollback stops new publication/activation first and drains workers. Retain financial, provider and audit records. Do not delete claims, rewrite money balances or reuse old dedupe keys. An older binary without signed-story/product guards cannot publish newly bound revisions safely; use a compatible forward fix. Retention cleanup must retain an operational owner even if the measurement UI is disabled.

## Unfulfilled definition of done

SP5 paid execution/observed settlement, end-to-end canonical booking/Purchase integration, actual production role/migration acceptance and the named live pilot remain unfinished. RFC-T1 residents-only provider capability also remains the earlier unresolved provider question; no guessed `location_types` fallback was introduced. Current source and tests are meaningful progress, but marking historical completion 10/10 would be inaccurate.

**Current Completion Status: 50% — five of ten historical marketing milestones remain locally accepted. This is an acceptance count, not a percentage of lines implemented or a production-readiness score.**
