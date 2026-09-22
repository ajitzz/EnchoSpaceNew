# Dynamic AdTech strategy delivery

Date: 22 September 2026. Authority: the founder's ADT-0–ADT-7 directive, continuing Discussion 034. The initial delivery below records local-only evidence. The subsequent explicit production directive and clarification authorize 032–035 on primary Neon and a strictly PAUSED canary. The [production rollout report](ADTECH_PRODUCTION_ROLLOUT.md) supersedes the local-only boundary for that operation: migrations committed, but restricted-runtime and provider district/canary gates remain open. Staging remains unconfigured.

## Delivery and acceptance

ADT-0 through ADT-6 are implemented and locally verified. ADT-7's local release checks are recorded in [execution verification](../harvo/ADTECH_EXECUTION_VERIFICATION.md); its isolated Neon rehearsal and paused provider canary remain unexecuted. Seven of eight ADT milestones are locally complete: **87.5%**. Historical marketing milestone acceptance remains **5/10**, separately from this new track. This is not a production-readiness or paid-launch certification.

The administrator manages database-backed price profiles, geographic corridors and immutable releases at `/admin/marketing/adtech`. Hosts receive canonical price classification, released budget suggestions and bounded public feeder controls in Campaign Studio. Approved campaigns compile from their own saved strategy; a later administrator change cannot rewrite a funded or historical revision. Research for unknown destinations creates proposals and requires review followed by a separate corridor publication.

Verification: 85 new AdTech tests pass; 24 desktop/mobile browser scenarios pass; lint, application/server compilation, private/public artifact checks and isolated runtime smoke pass. The single full regression sweep had 1,940 passes and five legacy timezone failures; all five were repaired and 80 affected tests then passed, including two new non-UTC regression cases. A clean full rerun is not claimed. The machine-readable evidence is [ADTECH_LOCAL_RELEASE_RECEIPT.json](../harvo/ADTECH_LOCAL_RELEASE_RECEIPT.json).

No remote database was used for this delivery's tests. No real ad, payment, provider mutation, Git commit, push or deployment was performed.

## Milestone results and implementation boundaries

| Milestone | Delivered locally | External or deliberately bounded behavior |
|---|---|---|
| ADT-0 | Shared Zod contracts; exact paise conversion; registry-supplied half-open intervals; compiler/capability contracts | Canonical INR entire-place nightly prices only. Missing, invalid, below-range and ambiguous room prices return an actionable unclassified result. |
| ADT-1 | Migration 032; immutable profiles/releases/audits; idempotent administrator mutations; CAS publication and rollback receipts | SQL seeds encode the approved tiers and planning hypotheses. They are not measured acquisition forecasts. |
| ADT-2 | Migration 033; corridor versions and evidence; city/coordinate adapters; mandatory district exclusion | Wayanad/North Goa/South Goa destination identities are seeded. Provider IDs, accepted districts and live corridors are **not fabricated**. |
| ADT-3 | Migration 034; atomic campaign/revision binding; Meta and Google compilation and effective-setting readback | Published identities retain revision/hash references. Spending controls reload that exact immutable binding; missing evidence or drift blocks spending, while safety pause remains available. |
| ADT-4 | Deep-linked admin profile, corridor, research and audit workspace; map/form controls; release diff and rollback | Map circles represent public feeders. Exact district polygons are not drawn because authoritative provider boundary geometry has not been supplied. Verified exclusions appear as locked labels. |
| ADT-5 | Dynamic tier/budget presets; quick draft preparation; optional feeder selection/radius controls; retained language and Keyword Planner workflow | Quick preparation does not bypass media rights, AI/human review, funding, inventory, consent or activation authority. Keyword Planner research uses available feeder-city constants and explicitly does not claim radius/exclusion-equivalent volumes. |
| ADT-6 | Migration 035; deduplicated research requests; quota/fenced worker; retry/DLQ; immutable proposals and audited review/retry UI | AI cannot publish a corridor or an advertisement. Approval saves an unpublished corridor version. Google geocoding/provider checks establish geographic identity, not proven travel demand or road-travel times. |
| ADT-7 | Disposable PostgreSQL rehearsal, strict catalog/grant checks, test/build/browser/runtime checks | Staging migration execution, named Wayanad/Goa paused canaries and real provider acceptance remain blocked on environment availability. |

## Source and impact

- `src/shared/adtech/` and `src/lib/marketing/adtech/`: typed strategies, price authority, registry, geography, revision bindings, compilers, readback and inference.
- `src/migrations/032_*` through `035_*`: 16 additive tables, seven sequences, forced RLS, immutable evidence guards, validation constraints and advisory-lock use. No existing financial balances or campaign history is backfilled or rewritten.
- `workflow.ts`, `engine.ts`, `ai.ts`, provider compilers/adapters: save/verify/load the approved strategy, review its public audience evidence and compare remote configuration before spending. Old unbound campaigns retain their existing contract; new/revised drafts require a binding only when adoption is enabled.
- `src/server/marketing/adtechRoutes.ts`, router/runtime/server composition: authenticated owned defaults/research and persisted-admin strategy operations.
- `components/marketing/Adtech*`, `AdaptiveAudience`, Campaign Studio and routing: admin authoring/review and host controls; no new guest listing field was introduced. The property page is unchanged because this feature changes campaign policy, not published property facts.
- `src/server/marketing/adtechWorker.ts`: separate research process. Slow inference/geography never shares the critical pause/refund/inventory worker loop.
- `src/server/deployment/adtech*`: exact catalog/grant checks and a rollback-only rollout rehearsal. New SQL is packaged with the private server artifact, not the public client bundle.

API additions retain the existing v2 authentication, persisted role lookup, error handling and request limiting:

| Scope | Routes |
|---|---|
| Admin profile/release | `GET/POST /api/marketing/v2/admin/adtech/profiles`, `PUT /profiles/:id`, `POST /releases`, `POST /releases/:id/rollback` |
| Admin corridor | `GET/POST /api/marketing/v2/admin/adtech/corridors`, `PUT /corridors/:id`, `POST /corridors/:id/publish`, `GET /geography` |
| Admin research | `GET /api/marketing/v2/admin/adtech/inference`, `POST /inference/:id/review`, `POST /inference/jobs/:id/retry` |
| Owned listing | `GET /api/marketing/v2/listings/:id/targeting-defaults`, `GET/POST /listings/:id/corridor-research` |

Mutation APIs require bounded idempotency keys; release publication uses the expected predecessor. Replays return the recorded result; collisions are conflicts, not silent overwrites. Geography HTTP requests occur outside registry transactions. Research claims release database locks before external requests and fence completion against stale leases.

## Security, capability and operating limits

1. Registry/corridor changes require a persisted administrator. Host APIs expose owned price evidence and public feeder positions, not private stay coordinates, account credentials or raw AI responses. Google city constants are public geographic resources used by the existing research API.
2. FORCE RLS is tested through actual non-superuser/non-BYPASSRLS runtime and host logins. Catalog readiness rejects extra policies, unsafe grants, mutable-history access and altered/disabled immutable guards. These tests exercise the application's server-established actor context; they do not grant end users arbitrary SQL access.
3. Profile edits do not override executable safeguards. Meta lead conversion/instant forms and Advantage+ without a verified Audience Network exclusion contract remain unsupported. No residents-only guarantee is asserted. Provider capability validation refuses unsupported configurations rather than coercing them into a different product.
4. Exact district resolution is a strict requirement. A provider lacking a suitable district returns `EXCLUSION_UNRESOLVED`; no state/national fallback is permitted. Real provider radii, attribution and default-field normalization still require a paused canary. Conservative readback can block a campaign on unrecognized provider defaults.
5. Default budget and CAC ranges are hypotheses. Geographic identity checks do not prove an optimal feeder corridor, affluent audience, transport connection or booking lift. Private amenities and creative claims still require their existing canonical evidence.
6. OpenStreetMap tiles are used for public feeder maps. Browser verification blocks external requests, so it verifies geometry, controls and responsive layout, not tile service availability or production capacity. Production must review the tile provider's usage/capacity requirements.
7. Paid pools remain disabled. Accepted canonical booking/current-consent composition and the existing guest legal/provider gates remain prerequisites for activation. Enabling AdTech does not clear them.

## Staging rollout runbook — prepared, not executed

1. Create an isolated Neon branch and distinct migration/runtime roles. Runtime must not own tables or sequences, inherit privileged/owner roles, or have superuser, BYPASSRLS, CREATEROLE, CREATEDB or replication privileges. Retain a restorable branch snapshot. Never infer staging from `.env` or `.env.local`.
2. Prepare a mode-0600 non-symlink `.env.staging.local` containing `HARVO_STAGING_CONFIRMED=true`, `HARVO_STAGING_BRANCH_ID`, `HARVO_STAGING_EXPECTED_HOST`, `HARVO_STAGING_EXPECTED_DATABASE`, `HARVO_STAGING_MIGRATION_URL`, and `HARVO_STAGING_RUNTIME_ROLE`. Use the direct, pinned Neon endpoint. Keep secrets outside Git and logs. Branch labeling is operator-attested; the tool validates the endpoint/database/TLS and privileges.
3. On the reviewed Node 24 server artifact run `node build/server/src/server/deployment/adtechRehearsalCli.js --env-file /absolute/private/path/.env.staging.local`. It validates the packaged predecessor checksums, takes advisory lock 82749102 on one held connection, executes 032–035 and the exact grants, checks the restricted-role catalog, then **always rolls back**. A rehearsal receipt is not a persistent deployment.
4. For persistent staging application, use the reviewed migration-owner session and exact packaged manifest, reject any existing checksum drift, preserve migration order, and record each version/checksum under the migration lock. Apply the grants returned by `adtechRolloutGrants(runtimeRole)` from the deployed module. Existing predecessor grants and server dependencies remain required. The legacy runner's checksum-warning behavior is not sufficient by itself for unattended promotion.
5. Reconnect using the actual restricted runtime login and run full database readiness. Confirm exact 032–035 checksums and all application catalog checks; inspect HTTP readiness and authenticated workspace behavior. Migration-owner success alone is not runtime proof. If any check fails, keep rollout disabled.
6. Configure server-only geographic and AI authority: `HARVO_GEOCODING_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MARKETING_MODEL`, the existing master provider credentials and a persisted `policyAdminId` in marketing configuration. Set `HARVO_ADTECH_ENABLED=true` only in the isolated staged web/research environment. Run `npm run marketing:adtech-worker` separately; supervise its dedicated health file (`HARVO_ADTECH_WORKER_HEALTH_FILE`, default `/tmp/harvo-adtech-worker-health.json`). Retain the existing critical marketing worker.
7. Admins verify provider-resolved Wayanad and the correct North/South Goa district plus public feeder evidence, save reviewed corridor versions and publish them deliberately. Research can propose additional corridors, never invent provider identities. Obtain named approved test listing IDs before any provider mutation.
8. Create staged host drafts in each price tier, check canonical price/overrides/budget evidence, and verify accepted revisions remain unchanged after a new profile release. Use test-only funding/authority with no real host capital. The dedicated publication path must create **PAUSED** provider resources; leave activation/spend flags off.
9. Inspect Meta/Google actual effective targeting, radii, exact exclusions, attribution, bidding, placements, creative and identities against the revision hash. Test that drift blocks resume, while pause and audited recovery remain usable. Confirm host/admin projection, fresh status and correlation evidence. Record actual provider request IDs privately and sanitized test receipts.
10. Independently review the receipts, deployed restricted-role readiness, canonical checkout/current consent, provider-policy acceptance and bounded pilot budget/operator/stop conditions. Only then authorize production promotion and any spending canary. This report does not authorize or claim that transition occurred.

## Rollback and recovery

Turn off new-draft AdTech adoption and stop the research worker if required. Existing bound revisions must continue to load their immutable contracts; never deploy an older publisher that ignores them. Roll back a profile using a new CAS release pointing at previous immutable versions; do not edit/delete published history. Pause remotely created campaigns through their verified provider control path before changing deployment. Preserve provider idempotency claims, unknown-outcome quarantine, funding reservations and audit evidence. Failed research can be retried by an administrator with an audited reason; no retry resets a payment or provider operation. Additive production tables should be retained for evidence rather than destructively down-migrated.

## Local findings, not production incidents

Development checks caught seed inserts occurring after FORCE RLS for a non-bypass migration owner, provider control paths omitting strategy revalidation, and context cleanup masking an original SQL error after transaction failure. Seeds now precede RLS installation within the same transaction, spending controls revalidate the immutable published revision, and failed transactions preserve their first error while rolling back local actor settings. Tests record these corrections. No production exploitation, financial loss or live resolution is asserted.

Provider contract references: [Google location targeting](https://developers.google.com/google-ads/api/docs/targeting/location-targeting), [Google v25 Maximize Conversions](https://developers.google.com/google-ads/api/reference/rpc/v25/MaximizeConversions), [Meta targeting reference](https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-specs/). Runtime capability assertions remain narrower than the set of fields described in documentation; field existence is not account-level acceptance.
