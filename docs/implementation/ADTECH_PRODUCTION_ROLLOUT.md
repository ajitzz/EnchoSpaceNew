# ADT-7 production rollout — 22 September 2026

**Result: migrations 032–035 committed; production readiness and paused provider canary remain blocked.** This is a partial rollout receipt, not a production certificate. ADT milestone completion remains 7/8 (87.5%); historical marketing acceptance remains 5/10.

## Authority and deployment identity

The founder explicitly authorized the primary Neon database in `.env`, sequential migrations 032–035 under advisory lock `82749102`, and a strictly PAUSED, zero-spend provider canary. Staging remains unconfigured. Listing 1 is approved for the canary; using it avoids creating a synthetic public property. This supersedes the earlier local-only instruction for this bounded rollout. No activation is authorized.

The Vercel production dashboard identifies `e4b9af45bfa03f0ca978b8faf03afdf4c573a757` as the deployed source for `www.encho.co.in`. Its connected `neon-bole-door` integration matches `.env`'s direct endpoint and database `neondb`. The different `.env.local` endpoint was not used.

## Persistent migration execution

- Existing repository migrations through 031 matched their recorded SHA-256 checksums; no unknown ledger entries were found. The repository intentionally has no 008 migration.
- A bounded rehearsal executed the SQL and grants, then rolled back when Neon denied `SET ROLE encho_app_prod`. That attempt is not a successful runtime rehearsal.
- Persistent execution used verified TLS/channel binding, one held direct connection, one transaction, advisory transaction lock `82749102`, 2-second lock timeout, 30-second statement timeout and a 60-second idle transaction timeout.
- Exact 032, 033, 034 and 035 SQL executed in order. Each checksum was recorded transactionally. The entire batch committed at **2026-09-22 07:33:12.781 UTC**; the connection then held no migration lock.
- The documented `adtechRolloutGrants('encho_app_prod')` grants were applied. `verifyAdtechCatalog` passed all five predicates for that named role: policies, privileges, immutable guards, key integrity and overall readiness. This inspected privileges for the named role through the migration session; it was **not a login using the runtime credential**.
- A separate read-only connection confirmed all four persisted checksums. All 16 AdTech tables have FORCE RLS. No previous migration SQL or customer campaign/funding row was edited.

Machine-readable evidence: [ADTECH_PRODUCTION_ROLLOUT_RECEIPT.json](../harvo/ADTECH_PRODUCTION_ROLLOUT_RECEIPT.json). Preserve the earlier local release receipt as historical evidence.

## Production findings and narrow correction

The live readiness endpoint initially returned HTTP 503 with 16 missing AdTech tables. After the migration, its missing-table list is empty, but it remains HTTP 503: the application uses `neondb_owner`, which has BYPASSRLS and owns the schema. Existing recovery/portfolio grants and an actual restricted-runtime connection are still required. The existing `encho_app_prod` role has no privileged memberships, but lacks predecessor application grants, including SELECT on `users`, `listings` and campaign revisions. **Do not switch production to that role merely because the new AdTech grants pass.** Prepare and verify the complete predecessor grant contract and actual application flows first. No passwords, role memberships or production connection variables were changed.

A second, independent readiness defect was reproduced: production `listings.publication_status` is `pg_catalog.varchar`, while fixtures used `pg_catalog.text`. PostgreSQL includes an explicit varchar-to-text cast in two correct RLS policies. `portfolioReadiness.ts` now derives the exact expected spelling from that specific column's catalog type. Arbitrary casts, altered boolean grouping and permissive policies are still rejected. The existing real-PostgreSQL adversarial suite now runs against both column types. This changes a catalog checker only; migrations and RLS policies remain unchanged.

Impact: one readiness module, its database regression suite and evidence documents. No financial, targeting, quote, campaign state-machine or UI contracts change. Rollback can restore the previous checker while retaining all additive migration/evidence tables; the previous checker will continue to conservatively reject the varchar catalog. A privileged runtime is never accepted by either version.

## Paused canary preflight

The approved listing exists and is published as **Villa Satori • The Cliffside Glass Pavilion**, city **Goa**, entire-place INR pricing. Its actual database nightly price is **₹48,000**, not the ₹8,000 supplied in the instruction. The canonical resolver correctly classifies it as PREMIUM. Its price was not changed.

No approved corridor versions or geographic evidence exist after the identity-only seeds. The generic `Goa` city value does not identify North versus South Goa; that district must be established from verified property authority before binding an exclusion. Read-only Meta v26 region search returned no candidates for North Goa, South Goa and Wayanad. Google v25 suggestions returned no matching `District` target for those names; inspected alternatives included postal codes, subdistricts and unrelated locations. These results establish that the current adapter cannot resolve the requested exclusion in this run, not that every possible provider integration is permanently incapable of doing so. Do not substitute those alternatives or silently broaden the audience. Google's [geo-target reference](https://developers.google.com/google-ads/api/data/geotargets) distinguishes administrative target types; their names are not interchangeable authority.

`HARVO_GEOCODING_API_KEY` is absent from local configuration and the inspected Vercel project HARVO environment list. No new AdTech adoption flag appeared in that list. Provider account read access does not replace geographic validation, approved immutable media or publication authorization. No geographic evidence, corridor release, synthetic listing or campaign was fabricated. **No ad was created or activated and this execution caused zero ad spend.** A safe preflight rejection is not a passing provider canary.

## Validation

| Check | Result |
|---|---|
| Baseline full regression at `e4b9af4` | 1,947 passed, 155 files, zero failed/pending |
| Readiness correction | 47 passed across portfolio readiness, AdTech readiness and rollout-preparation suites; both TEXT/VARCHAR and hostile policy changes covered |
| TypeScript, lint, isolated client/server build | Passed; existing bundle-size and Babel large-file notices remain |
| Compiled runtime smoke | Passed; web and both workers retain unconfigured fail-closed behavior |
| Desktop/mobile component browser checks | 24 passed at 1440/390 widths, fixture APIs and blocked external networking |
| Live public checks | Liveness 200; unauthenticated workspace 401; readiness remains 503 |
| Live authenticated browser | Existing host campaign workspace renders after evidence refresh; no claim of a completed provider publication |
| Actual restricted Neon login / paused provider canary | Not completed |

The full sweep preceded the narrowly scoped readiness correction. Its additional tests were run in the targeted gate, not represented as another full all-green run. No staging test or live-provider mutation is inferred from fixture browser checks.

## Remaining rollout gates

1. Supply the restricted runtime connection through a private local secret file, verify/review the complete predecessor grants, then test the actual login and all required application paths before changing Vercel/worker credentials. The current CLI has no Vercel credential; its authenticated dashboard remains available.
2. Configure the authorized server geocoder and prove the actual district plus provider-supported exact exclusion. If the provider cannot express the required district, retain `EXCLUSION_UNRESOLVED` and take an explicit architecture decision rather than weakening the invariant.
3. Publish reviewed feeder corridors and prepare the approved listing's immutable revision/media through the normal authorization flow. Provision/supervise the separate research worker and retain the critical marketing worker.
4. Execute and read back the complete PAUSED hierarchy on both providers, including effective geography, attribution, placements, bids, media and strategy hash. Leave activation disabled. Existing checkout/current-consent/provider/legal and paid-pool gates remain unchanged.
5. Certify ADT-7 only after those actual receipts exist. The missing credentials and provider district authority are concrete blockers, not a reason to claim 100%.
