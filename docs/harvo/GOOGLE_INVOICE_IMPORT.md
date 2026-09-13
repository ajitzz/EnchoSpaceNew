# Google monthly invoice import

13 September 2026. Authorized local implementation; no real invoice, payment, provider or remote database request is part of verification.

## Impact and plan

Category: Google integration and financial evidence. The current financial close accepts manually sourced documents and requires independent review before a balanced ledger settlement. The missing boundary is authenticated invoice retrieval with retained original evidence. This change adds invoice documents, not campaign spending permission or accounting finality.

Implement a read-only v25 InvoiceService transport bound to an explicit serving customer, billing setup, paying manager, currency and documented monthly-invoicing prerequisite. Verify the named administrator against the current database role before OAuth or network access, and again before storing documents. Preserve the original bounded JSON response bytes and SHA-256 in the existing immutable document table. Request bodies cannot choose credentials, account, endpoint or API-verification metadata.

An issue month is distinct from the invoice service period. Retain provider issue date, service dates, exact gross/subtotal/tax micros and correction/replacement references. The document allocation ceiling is the exact gross amount in minor units; it is never labeled media spend or divided among campaigns. Reject unsupported currency, consolidated other-account coverage, negative credit documents and gross amounts requiring invented rounding. Import never creates billing closure, approvals, campaign allocations or financial journal entries.

Google v25 granular campaign summaries contain a description, quantity, unit and amount, but no campaign resource identity. A description is not an identity. The importer therefore returns `INDEPENDENT_EVIDENCE_REQUIRED` for campaign allocation and retains the existing separately verified campaign billing detail and dual-control close.

Affected files: a new invoice transport/parser, narrow settlement service integration, isolated transport/PostgreSQL tests and this record. Existing migration 012, manual upload contract and host settlement summary remain unchanged. Root coordinates runtime configuration, route and administrator UI integration. No property field or guest display contract changes.

Independent review superseded the initial no-new-table assumption. An empty month or a different operator importing an existing invoice cannot bind a request key through invoice rows alone. Migration 016 therefore adds a real import-intent and write-once observation table, protected by FORCE RLS and immutable request fields. This retains empty results and original response bytes without inventing invoice markers. Canonical per-invoice fingerprints distinguish changes to invoice contents from reordering, formatting or additions to the monthly response. Original invoice documents retain their first observation; the import observation retains each complete authenticated response.

Observed positive correction/replacement links remain immutable evidence and block allocating both the linked originals and their replacements through ordinary settlement. A shared billing-account transaction lock serializes that check with import. An already settled invoice is not automatically reversed; a separate accounting remediation must establish the correction. Non-positive/credit-memo, foreign-currency and other-account consolidated shapes are explicitly unsupported by this bounded importer and never become guessed financial entries.

Risks: consolidated billing data, copied credentials in URLs, account switching, malformed micros, changed invoice evidence, oversized responses and operator revocation while a read is pending. Tests cover each boundary, immutable/idempotent persistence, original byte download and zero ledger/approval mutation. Rollback disables invoice import while retaining all imported evidence and the manual upload path.

## Provider prerequisites and limits

The account must use monthly invoicing. The optional login customer header must identify its paying manager. Automatic/manual card payment settings do not establish eligibility; `NOT_INVOICED_CUSTOMER` is an explicit unsupported result. A successful invoice read proves only that observation, and does not prove all future corrections have arrived. [Google invoice guide](https://developers.google.com/google-ads/api/docs/billing/invoice).

The v25 request is an authenticated GET with serving customer, billing setup, issue year/month and optional granular details. No invoice mutation endpoint is used. [Official service definition](https://github.com/googleapis/googleapis/blob/master/google/ads/googleads/v25/services/invoice_service.proto).

The invoice records gross, subtotal, tax, regulatory/export amounts and original correction/replacement links separately. Invoice resource and billing setup identity are retained. [Invoice reference](https://developers.google.com/google-ads/api/reference/rpc/v25/Invoice).

Campaign summaries cannot establish Encho campaign ownership because the provider schema contains no campaign ID and the description may differ from the campaign name. [Campaign summary reference](https://developers.google.com/google-ads/api/reference/rpc/v25/Invoice.CampaignSummary).

Verification results and final supported input/output contract will be appended after implementation and scoped checks.
