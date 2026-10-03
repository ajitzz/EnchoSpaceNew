# Admin property-name release receipt — 3 October 2026

**Scope:** Integrate the existing Admin draft-property editor with current GitHub `main` (`94cb324`), preserving the recent consumer-login and calendar fixes. This is an evidence record for a bounded deployment, not a certification that the entire CR1 platform is production-ready.

## Behavior and authority

- Admin → Properties → **Edit property details** opens the authoritative draft editor. **Property title** is the guest-facing property name. Save sends only changed fields and exact previous values to `PATCH /api/admin/listings/:id/draft-property`.
- The service validates the title, locks the listing, checks active Admin authority, rejects non-drafts and stale edits, updates the name and writes before/after audit in one transaction. A replay of an already applied value does not add a second audit receipt.
- Host creation/edit and guest display already use the same `listings.title` fact; no new property field was invented. Published and unlisted names are **not** directly editable. Accepted offers, bookings and campaign revisions need an immutable successor/review path before that boundary can change.
- The integrated server also retains the local safety repairs for listing writes, room/media moderation and public cache generation. The newer GitHub consumer-auth pool and retired legacy calendar route were preserved during the three-way integration. No Antigravity worktree was wholesale merged.
- This integration did **not** copy the local candidate's central `resolvePersistedSession` change: the live restricted consumer-auth role has not been shown to have `SELECT` on the new `users.is_active` column. Protected Admin mutations recheck active authority in their own held transactions. A separate restricted-role grant and session-read proof are required before central account deactivation can be claimed across all reads.

## Database prerequisite

Read-only primary Neon `.env` preflight matched all 46 applied migration checksums through 047 and found no `users.is_active`; 048 was the only pending SQL. After disposable-PostgreSQL migration tests passed, `npm run migrate` applied only `048_users_active_account_authority.sql` through the held advisory-lock runner. A read-only follow-up confirmed the 048 checksum, NOT NULL column and default true. No applied migration bytes were modified.

## Verification and limits

- Focused draft service/UI tests: **19/19 passed**. Mounted Admin HTTP/media review: **10/10 passed**, including a name change and exact audit receipt. Migration/media-focused tests: **28/28 passed**. Revised public listing/auth fixture: **32/32 passed**. Two isolated PostgreSQL suites timed out under full parallel load and then passed **28/28** together on rerun.
- TypeScript and scoped lint passed. Offline production build passed, including the packaged server and service worker. The bundle-size warning remains open.
- The first integrated full run yielded **3,133 passed, 7 failed, 21 skipped**. Four failures reproduced on untouched `origin/main` (investor demo test import, AdTech UI test, static operations-security assertion and a phone-only `/api/auth/me` test). The static assertion was updated to require the current restricted consumer-auth pool and passed **14/14** in its focused rerun; it does not weaken persisted-session checks. Two disposable-PostgreSQL fixtures timed out only under parallel load. Four listing privacy/cache assertions failed from stale fixtures and expected cache namespace; the updated fixture passed its focused 32-test rerun. No second full run was claimed.
- The deployed `/api/health/ready` responded 503 with an owner/BYPASSRLS runtime role before this code push. Migration 048 does not fix that role. Restricted web/worker roles, production Admin route verification, published-name succession and the unrelated full-suite baseline failures remain open.

**Rollback:** revert the application release without deleting migration 048 or audit history. The additive `is_active` column remains. Do not route the runtime through an owner/BYPASSRLS exception to hide readiness failure.
