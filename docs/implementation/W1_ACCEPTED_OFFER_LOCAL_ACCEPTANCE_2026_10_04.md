# W1 accepted dated sellable offer — local acceptance receipt

**Canonical development base:** `dbe20c6a1b318bb5ddee2a5d33adaa536c44c212`. Its primary-checkout reconciliation receipt was already committed separately at that base. **Frozen W1 code subject:** `7acda61b399db8b50ad030bde41aef47bcd84872` on `codex/w1-accepted-offers`. This receipt is a later documentation commit and does not rewrite the reviewed code subject.

**Contract accepted locally:** A provider-independent `sellable_offers` identity has numbered commercial revisions. A Host creates a draft with a durable command ID and explicitly submits the exact revision. Scoped workforce authority accepts or retires it against the current property, room, approved media, inventory, source facts and expected version. Accepted revisions and lifecycle evidence are immutable; a price change creates a successor. Staff self-acceptance and a stale inventory submission fail closed at both service and database boundaries. Host ownership, staff permission and public read authority remain separate.

**Public meaning:** The accepted amount is INR paise **per room night** for an explicit half-open stay-date interval, effective-time interval, guest capacity and minimum-night condition. It is an informational accepted offer price, not a bookable quote, tax-inclusive itinerary total or availability guarantee. Public `Rooms from` selects only an eligible accepted revision with a qualifying open stay and carries its offer/room/date context. Draft, submitted, expired, retired, stale, foreign-property and legacy/base-price values cannot supply public price. Without an eligible accepted offer, W0's `price = null` and `VERIFIED_OFFER_UNAVAILABLE` remain. Catalogue/card/map, detail, refresh and SEO use this authority without client-side price inference.

**Schema:** Additive `src/migrations/049_accepted_sellable_offers.sql`, tested only on disposable PostgreSQL. It uses FORCE RLS, scoped grants, immutable revision/event guards and deferred parent/event consistency. The restricted public read requires a separate public-offer LOGIN allowed to execute safe projection functions but not read offer tables. Pre-049 null-price compatibility requires the exact recorded migration 048 checksum and no later recorded version; absent or drifted history fails closed. No applied migration bytes were changed. Migration 049 was **not** applied to Neon or any deployed environment.

**Failing-before and repairs:** The prior public projection had only room/listing base-price evidence, with no accepted offer capable of legitimately exposing a Guest price. Review of the first W1 candidate then reproduced three P1 failures: pre-049 compatibility on unverified migration history, raw staff self-acceptance, and raw staff acceptance after inventory changed. Commits `020fde4` and `7acda61` repaired these without changing the W0 public fallback rule. The independent reviewer reran all three reproductions on the frozen subject; each now failed closed, with no accepted pointer created.

| Verification | Result | Evidence boundary |
| --- | --- | --- |
| W1 real-PostgreSQL lifecycle, idempotency, mounted public and projection suites | 4 files, 17/17 tests pass | Fresh disposable PostgreSQL with separate LOGIN roles |
| W0 real public routes | 19/19 pass | Fresh disposable PostgreSQL |
| M2 privacy and M3 room/media suites | 60/60 pass | Credential-scrubbed local runner |
| W1/public presentation and price suites | 19/19 pass | Local component/contract tests |
| Offer UI, router, runtime and Operations access suites | 7/7 pass | Mounted/local tests |
| Combined targeted rerun after final P1 repairs | 11 files, 122/122 pass | Node 24; credential-scrubbed runner |
| Independent read-only review of `7acda61` | **PASS**; focused 4 files, 17/17 tests | No remaining confirmed P0/P1 W1 finding |
| Node 24 TypeScript, full repository lint, source diff check | Exit 0 | Local source |
| Fresh sanitized offline build | Exit 0; `HARVO_PUBLIC_BUILD_VERIFIED`, 45 files | Production-shaped local artifact; source and packaged 049 checksums match |
| Built direct HTTP and Chromium desktop/360px journey | **PASS**; `W1_BUILT_JOURNEY_PASS` | Disposable PostgreSQL; no remote service mutation |

The built journey covered direct `/stay/:slug`, catalogue → detail → refresh, same-name rooms with distinct offer/media identity, keyboard use, an accepted `Rooms from` value, no-offer and retirement withholding, authority outage and disabled checkout. Its first build attempt correctly stopped on a stale **generated** migration 049 copy from an earlier candidate. Only generated `build/server` output was preserved at `/tmp/encho-w1-stale-build.vxBS8S/server`; a clean rebuild passed, and the tracked source tree stayed unchanged. A full repository regression was started on an earlier W1 candidate and interrupted after code changed; it has no passing final result and is not claimed here.

**Disposition:** W1 implementation **complete locally**; W1 local verification **pass**; independent review **pass**; W1 local exit **accepted** for the defined offer-authority scope. The reviewed code remains frozen at `7acda61`. No checkout, paid booking, tax/refund policy, channel adapter, provider ad activation or legal gate was enabled. Primary checkout, remote `main`, primary Neon and deployed Vercel were not changed by this W1 work.

**Deployment/external evidence:** Pending. Before release, reconcile the actual deployed migration history, apply 049 through the held-connection hardened runner in an explicitly named target, verify restricted Host/workforce/public LOGIN grants and readiness, then test the deployed artifact and migration rollback/forward plan. Local acceptance does not certify production behavior. To disable the new feature before deployment, remove its route/runtime configuration and preserve W0 null-price behavior; never restore legacy listing/base-price fallback or delete accepted historical rows.
