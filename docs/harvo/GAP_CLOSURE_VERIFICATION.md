# HARVO — Gap closure verification

13 September 2026. Authorized continuous execution under HARVO-017. The founder reports hosting/configuration completed; this record distinguishes that report from observed source, local test and deployed evidence.

## Implemented boundaries

| Boundary | Result | Practical limit |
|---|---|---|
| Deployment | Node24 compiled web/HARVO worker, separate public/private artifacts, private SQL packaging, health/RLS/schema checks, explicit inventory-hold cleanup, worker progress supervision and graceful drain | Linux image/deployment and remote operating behavior are not observed here; Docker daemon is unavailable |
| Campaign settlement | Immutable original billing documents, source/account/campaign/period/cost checks, independent current finance-admin review and atomic ledger close; historical search/pagination; admin and host interfaces; bounded Google monthly-invoice observation/import with response bytes and hash | Google invoice descriptions do not reliably identify campaigns, so imported evidence remains independently allocatable and cannot be marked automatic provider finality; approved accounting policy, real bills, later correction procedure and live acceptance remain necessary |
| Conversion delivery | Google Data Manager v1 purchases and destination diagnostics, Google Ads v25 order adjustments, Meta v26 Purchase; immutable claims and quarantine of uncertain writes; worker and readiness wiring | Default runtime has no accepted canonical booking/capture verifier or current-consent attribution resolver. Meta corrections require separate remediation. A receipt is not attributed or incremental bookings |
| Host targeting | Real Google-supplied locations/languages, canonical-name/ID validation, Meta country selection, shared PostgreSQL request budgets, replay before provider lookup | Actual provider credentials/account access and metadata responses need deployed verification |
| AI drafting | Listing-grounded Gemini suggestions with exact source evidence, strict output validation and explicit host application; no automatic budget/targeting/save/publish | Missing model/key returns unavailable. Chosen-model quality, actual generation and conversion lift are not established by fixtures |
| Host/admin operations | Search and stable bounded campaign/property pages, related approved media, operational queue/readiness view, independent financial-close workflow and host totals | Unknown provider writes still require evidence-led operator reconciliation; no blind replay or manual paid/live switch |
| Creative preparation | Real source-preserving JPEG variants, exact normalization/output provenance, conditional checksum-verified immutable S3 image and manifest storage; authenticated host/admin review API and revision-bound Meta selection | Configured S3/CDN, Linux worker execution and provider acceptance remain open; no unseen derivative replaces approved media |

No property schema field was added. Existing listing ownership, public visibility, media moderation and unified guest/host account authority remain in use. No guest checkout/legal milestone was accepted or bypassed.

## Verification evidence

Final source-aligned results are being recorded below after the in-progress checks complete. Do not treat a partial run, an initial failed run or a utility-only test as milestone acceptance.

The broad Node24 run discovered an unnecessary extra workspace query and a disposable PostgreSQL `initdb` startup timeout. The query was eliminated by combining bounded property-picker and related-campaign metadata in one SQL operation; the original 14-statement / 3-connection / one financial-read assertion is retained. The PostgreSQL setup deadline and financial assertions were not weakened; failed/affected suites are rerun separately.

Browser verification found and corrected an initial search-debounce timer resetting a quick page change, and confirmed that persisted independent document verification remains visible after approval. A test timing assertion now waits for the completed workspace refresh before expecting the refund button to disappear. Local compiled-runtime smoke previously found and corrected symlinked entrypoint detection. These are local engineering findings, not observed production incidents.

Provider/payment/storage tests inject explicitly labelled HTTP or SDK responses and disposable local PostgreSQL; they do not use real accounts, real money or the configured Neon database. Browser tests mount current components with intercepted local fixtures and block unrelated requests. They cover interface behavior, not actual provider approval or deployed performance. Raw invoice bytes in UI tests are explicitly artificial fixtures.

## Configuration and remaining acceptance

The local `.env` presence-only operator check reports absent v2 financial policy/service actor/checkout references, Gemini key/model, Google serving customer, Meta pixel/dedicated verification token, and relevant Razorpay account/marketing webhook configuration. It prints no credential values. This local result does not establish the state of the founder's remote environment.

To complete remote acceptance, evidence must identify the deployed web/API version and URL, its worker, applied migration checksums 009–016 and least-privilege role, actual provider/payment/storage/model configuration, the accepted accounting and canonical guest-checkout/consent authority, and a named property/stay window with explicit per-channel real-spend limits. Actual capture/refund, provider delivery, billing close, booking attribution, operating/restore drills and host economics then need observation. No ad spend limit or specialist/provider acceptance is inferred from a generic implementation instruction.

Unfinished acceptance is explicit: accepted checkout/capture/consent adapters, invoice-to-campaign allocation and later billing corrections, configured CDN/provider acceptance, and measured bounded optimization/eligible advanced channels. These remain in M4/M5/M6/M9/M10; they are not relabelled as mere deployment settings.

**Current Completion Status: 50% — M1, M2, M3, M7 and M8 locally verified; five of ten milestones. This is a milestone count, not a production-readiness score.** Additional implemented portions do not close a milestone whose end-to-end acceptance remains unmet. No 100% or 10/10 production certification is claimed.

## Supporting records

- [Deployment hardening](DEPLOYMENT_HARDENING.md)
- [Settlement implementation and limits](SETTLEMENT_COMPLETION.md)
- [Conversion delivery](CONVERSION_COMPLETION.md)
- [AI drafting](CAMPAIGN_DRAFT_GUIDANCE.md)
- [Creative preparation/storage](CREATIVE_PIPELINE_COMPLETION.md)
- [Operating procedure](OPERATIONS_RUNBOOK.md)
- [Current milestone criteria](../implementation/HARVO_MARKETING_EXECUTION_PLAN.md)

Rollback preserves all financial, provider and audit evidence: drain workers, disable new funding/publication/activation, restore the last verified compatible artifact, retain additive migration data and reconcile uncertain provider writes. Do not restore synthetic success or delete journal/document history.
