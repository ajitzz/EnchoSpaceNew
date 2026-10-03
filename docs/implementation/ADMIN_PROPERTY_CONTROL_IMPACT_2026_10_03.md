# Admin property control: impact and execution boundary (3 October 2026)

**Status:** Local engineering impact note. This is not a production approval or a change to the published-offer policy.

## Source of truth and defect

`listings` is the parent authority; `room_types` and `media_assets` carry relational room and photo evidence. AdminDashboard offers many single-field controls, but most call the draft-only general listing PUT. The buttons remain enabled on published or unlisted properties, where that route correctly returns 422. The broad luxury/features payload can include `publication_status` or unrelated fields and either fail or enter the legacy full-overwrite branch. The media desk can currently present approval for an image that the reviewer could not display. Publication transitions and draft factual changes have incomplete atomic admin audit coverage. There is no accepted immutable successor version for changing a published offer.

## Safe contract for this batch

- Preserve the published/unlisted factual-write lock. An administrator may immediately unlist for safety, but cannot silently rewrite accepted room, rate, media or guest claims in place.
- Keep existing parent-first transaction order. Reauthorize a currently active administrator on the held connection before media moderation or publication effects; append the publication audit receipt in the same transaction.
- Make the Admin UI tell the truth: distinguish a photo-minimum check from complete listing review; disable unavailable accepted-state edit actions; prevent approval when image evidence is not viewable; avoid full-listing payloads for bounded draft edits.
- Expose only validated, field-specific draft changes already represented in the Guest/Host/Admin models. No new field or property claim is added in this batch.
- Preserve unknown-outcome locks and current moderation receipts. Do not merge the broad Antigravity worktree or use the primary production database for testing.

## Follow-on required for complete Admin control

An admin must eventually be able to stage **every** property correction, compare old and proposed accepted facts, obtain required independent review, and atomically activate a successor version while keeping historical quotes, bookings, approved media and campaign revisions bound to their original evidence. That requires a reconciled migration/version contract and a complete writer inventory: HostForm, general listing PUT, room PUT, media moderation, publication transitions, calendar/inventory, legacy backfill, marketing video cross-write and deletion. Until that contract is implemented and tested, “God mode” means complete *operational visibility and ability to initiate corrections*, not bypassing publication and tenant controls.

## Impact, checks and rollback

Affected surfaces: Admin listings action row, room editor, media desk, draft field PATCH/PUT branch, publication transition, audit and relevant mounted UI/PostgreSQL tests. The initial scope had no migration; a local candidate became necessary after the deployed catalog check below. There is no provider/payment API change. Security impact is a narrower active-admin gate and fewer misleading write controls. Compatibility: existing draft data and published URLs remain unchanged; published edits continue to return 422. Verify deactivated/demoted admin denial, audit rollback, unseen-image refusal, duplicate-save prevention, and draft-only field changes with targeted sanitized tests and typecheck. Rollback disables the new controls or reverts scoped code while retaining any committed audit facts; never edit applied migration bytes or delete historical receipts.

## 3 October evidence and schema qualification

The preceding paragraph described the initial scope. A read-only catalog inspection of the `.env` Neon candidate found 46 applied versions ending at `047_campaign_flight_controls_and_drain_requests.sql`, but **no `users.is_active` column**. The legacy startup initializer contains an unnumbered `ALTER TABLE` for that column; deployed schema startup is intentionally read-only. Existing protected listing/media routes and the new draft editor therefore fail closed on that catalog. This is a release blocker, not a reason to assume all accounts are active in request handlers.

The original 041–047 migration files were restored additively in this checkout from `origin/main` without editing their bytes; local 047 SHA-256 matches the read-only recorded applied checksum `a3d4a1b91ea5c3e00c208803b0611354a7fc520050d5a43953696bc44ce7369e`. Candidate migration `048_users_active_account_authority.sql` adds the missing boolean with the pre-column active default and treats pre-existing `NULL` as inactive. Its absent-column and nullable-column shapes pass two disposable-PostgreSQL tests. It has **not** been applied to Neon; role grants, all applied checksums, staged route matrix and deployed readiness must be independently verified before rollout. The current limited copy of 041–047 remains untracked in this dirty checkout and is not a deployment artifact.

The new Admin draft editor reloads the authenticated canonical detail, PATCHes only changed facts with exact field-level `expected_current` values, and rejects stale same-field edits. It deliberately excludes parent capacity changes because current publication validation does not reconcile parent capacity with canonical `room_types`; room/offer capacity truth requires a separate contract. The Admin dashboard hides legacy prompt edits that bypass this CAS/audit path. Published or unlisted facts remain locked; emergency unlist is available. A reviewed successor version and database-enforced immutability for listing audit rows remain open. Focused local UI (3/3), service (9/9), and migration (2/2) tests pass; no live Admin edit has been performed.
