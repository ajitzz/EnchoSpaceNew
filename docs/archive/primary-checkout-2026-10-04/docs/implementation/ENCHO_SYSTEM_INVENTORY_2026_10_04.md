# Encho system inventory and maturity review — active, 4 October 2026

**Status:** Incremental source inventory, not a release certificate or a line-by-line audit of the whole repository. The primary checkout is `6ec5b66` plus pre-existing dirty changes. The isolated Antigravity W0 candidate is at `b63a7ae`, uncommitted and unmerged. Deployed artifact identity and current production behavior are not established by this document. Preserve the [CR1 checkpoint](CR1_GOLDEN_PATH_CHECKPOINT_2026_10_02.md), [W0 review](W0_PUBLIC_TRUTH_REVIEW_2026_10_04.md), Constitution, HARVO and controlling decisions.

## Domain map and review queue

| Domain | Intended user outcome | Current review state | Next evidence |
| --- | --- | --- | --- |
| Guest discovery and public stay truth | Find a real, approved, bookable property and understand its room/media/price evidence | **Traced below; W0 `CHANGES_REQUESTED`** | Mounted Host→Admin→catalogue/detail/SEO and real 360px browser checks |
| Host listing and Admin moderation | Author distinct rooms and media, submit and safely publish successor facts | Partially traced with Guest W0; publication writers remain under R3-01 review | Two-connection writer tests, same-class room identity, durable media removal and audit |
| Inventory, quotes, booking and payments | Reserve one exact offer without oversell or payment ambiguity | Existing modules and historical receipts; no new semantic audit in this inventory | Canonical offer/hold/capture/booking/refund journey under approved legal terms |
| Host campaign creation, strategy and provider operation | Launch a reviewed, funded, PAUSED-first dedicated ad and monitor real observations | Existing modules and historical receipts; no new semantic audit in this inventory | Exact revision→finance→provider readback→guarded activation path |
| Fuel meter and top-up | Show source-labeled authorized, reserved, spent and remaining amounts per flight | Historical provisional UI; top-up is not accepted | Quote/capture/journal/provider budget mutation and unknown-outcome recovery |
| Guest–Host CRM and staff service desk | Deliver, reply, notify and resolve inquiries with correct authority | Existing modules and historical receipts; no new semantic audit in this inventory | Real POST→outbox→worker→inbox→reply and cross-tenant/restart tests |
| Workforce IAM and Admin operations | Delegate scoped work with independent approval and audit | Existing modules and historical receipts; deployed restricted-role proof open | Separate LOGIN roles, maker/checker and revocation/drill evidence |
| Build, database, worker and deployment | Reproducible offline build and controlled, observable release | Historical gate record; not audited here | Exact source/artifact/schema identity, isolated staging and rollback drill |

Rows outside Guest W0 are **navigation for future domain audits**, not claims that their features are complete or absent. Update a row only after tracing its UI→API→service→database→worker/provider path and recording its tests and failure behavior.

## Feature inventory: Guest public discovery, listing card and stay detail (W0)

| Inventory field | Current source path / authority |
| --- | --- |
| Personas and outcome | Guest searches public stays, opens the same published property's detail, and sees only truthful room, price and approved media; Host authors, Admin moderates. |
| Entry points and screens | `App.tsx` fetches `/api/listings` for search and `/api/v2/stays/:slug` for direct stays; `ListingCard.tsx` renders search cards; `ListingDetailsNew.tsx` renders detail and refreshes `/api/listings/:id`; `HostForm.tsx` edits listing data; `AdminDashboard.tsx` and media review routes manage approval. |
| APIs | `GET /api/listings`, `GET /api/v2/stays/:propertySlug`, `GET /api/listings/:id`, `GET /api/seo`, direct `/stay/:slug`; Host `POST/PUT /api/listings`; Admin draft/status/media routes. All are currently mounted through `server.ts`. |
| Services and client state | `src/lib/stayProjection.ts` supplies public projections; `src/server/guest/publicStayAuthority.ts` hydrates relational rooms/media before detail projection; `ListingDetailsNew.tsx` may replace its supplied projection with a later numeric-ID fetch. |
| Data and validation | `listings` plus relational `room_types` and `media_assets` from migration 003; media moderation status is the accepted-media boundary. Public stay detail has an allowlisted listing query and Zod-validated relational hydration. Public cards still project raw listing image/room/price columns in the primary checkout. |
| Permissions | Public routes restrict unpublished stays; owner/Admin management reads can return editing fields. `GET /api/listings` resolves current reader before granting owner/Admin feed. The end-to-end tenant/migration-role proof is still open. |
| External/deployment dependencies | Neon PostgreSQL; Redis public-card cache; uploaded media URLs/CDN; Vercel direct-link/SEO routing. Candidate worktree disables public Redis card cache; this is not merged. |
| Current tests | `src/test/m2_privacy_and_routes.test.ts`, `src/test/m3_room_media_authority.test.ts`; isolated worker candidate adds `src/test/p0_4_public_catalogue_truth.test.tsx` and `src/test/w0_real_route_truth.test.ts`. Prior 5/5 local route and 13/13 UI passes cover only the candidate's narrow assertions. |

### Source-backed defects and priorities

1. **P0 public integrity:** Primary `ListingCard.tsx:393-405` inserts unrelated Unsplash property photos when real media are missing; `HostForm.tsx:784` can persist an unrelated image. Public `stayProjection.ts:486-510` and primary `/api/seo` read mutable listing media, while detail hydrates `media_assets`. The mounted worker test previously reproduced a pending raw image on catalogue while detail withheld it. The candidate repairs part of this but remains unaccepted.
2. **P0 authority gap:** `publicStayAuthority.ts` only replaces raw image/video fields inside `if (assets.length)`. A published listing with zero media rows can therefore revive raw fields. With multiple approved rows, detail can choose a raw-listed nonhero image while candidate card/SEO choose the approved hero. Candidate media-query errors also collapse into successful empty-image responses. A database failure is not an empty gallery.
3. **P1 offer/room truth:** Public card projection still uses raw `listings.rooms` and `listings.price`; detail prefers relational `room_types`. Same-class rooms lack independently proven identity/photo binding. A card may display a price without an accepted dated sellable offer. Do not replace a missing offer with a fabricated `starts from` claim.
4. **P1 edit lifecycle:** The Host form's empty image array does not delete retained `media_assets` under partial `PUT`; published updates return 422. A separate authorized successor/removal command needs a reviewed contract. Admin/Host publication writers need parent-first lock/version tests.
5. **P1 caching and bounded reads:** The primary public Redis card cache rechecks publication but not media moderation. Candidate bypasses that cache, which is safer but not a complete invalidation design. The candidate impact note claims a 200-row cap while its public SELECT is unbounded; pagination/query plan remains unproven.
6. **P2 UX and discoverability:** Numeric privacy percentages in `ListingCard.tsx` are inferred from category/title rather than measured property facts. Missing media needs an intentional accessible state. Mobile, keyboard, slow-network and direct-built-link checks remain missing.

### Provisional W0 maturity scores (primary source path only)

| Dimension | Score /10 | Why this is capped |
| --- | ---: | --- |
| Product completeness | 4 | Discovery exists, but card/detail/offer truth and photo removal do not agree. |
| UX | 4 | Strong visual surface; fabricated imagery/claims and unverified empty/error states undermine trust. |
| Architecture | 3 | Two public authorities (raw listing versus relational moderation) compete. |
| Reliability | 3 | Cache/media-read failure and partial-edit semantics can produce stale or misleading output. |
| Security and data integrity | 4 | Detail privacy boundary exists; unapproved media and tenant/worker evidence remain unresolved. |
| Performance | 4 | Candidate batches media, but public result bound, cache transition and p95 are unproven. |
| Maintainability | 4 | Shared projection modules exist; `server.ts` route composition and duplicated media selection still diverge. |
| Testing | 4 | Meaningful local M2/M3 and candidate mounted tests exist; negative tenant, same-class, failed-read and browser paths are absent. |
| Operational readiness | 2 | No independently accepted built/deployed W0 receipt or failure drill. |

These are **engineering triage judgments for this one feature**, not a platform rating or a certified production percentage. Production behavior cannot yet be empirically verified from this inventory.

### Upgrade contract and implementation order

1. **Media authority:** For published public reads, choose one approved primary-image rule (approved hero, then stable order), clear all raw image/video fallbacks when no approved rows exist, and return an observable unavailable result on relational read failure. Preserve separate owner/Admin draft-edit access. Prove failing-before and passing-after cases via mounted real routes on disposable PostgreSQL, including zero rows, two approved assets and forced read error.
2. **Offer authority:** Project card and detail from the same accepted room/offer identity and dated price basis; retain listing-level discovery only where the product explicitly permits no priced offer. Add two same-class room tests. Do not invent a policy to bypass guest checkout's legal gate.
3. **Authoring/moderation:** Define explicit media removal and successor approval with immutable history and tenant checks; run real Host→Admin→public tests, including duplicate submit, stale version, publication race and other-tenant denial.
4. **Read reliability:** Introduce bounded pagination and a measured query plan; either invalidate public cache on every media/publication transition or keep it bypassed with an explicit performance budget. Preserve source-labeled 503 behavior when authority is unavailable.
5. **Experience acceptance:** Inspect the production-built local artifact at 360px and desktop with keyboard/screen reader basics, empty gallery, failed request, refresh, direct stay URL and card→detail consistency. The investor showcase remains isolated and never supplies ordinary catalog facts.

**W0 exit condition:** One published property returns the same approved primary media and accepted room/offer facts in card, detail and SEO; no unapproved or unrelated image appears; a missing authority fails honestly; Host/Admin edits cannot silently mutate an accepted public version; all critical negative tests and browser checks pass. Then an independent reviewer may evaluate the exact diff and artifact. Passing a narrower media test does not by itself accept W0 or a CR1 package.
