# Google sign-in incident — 2 October 2026

**Status:** Repair candidate; live Gmail sign-in remains unverified until the Vercel database-role cutover and browser readback. Do not use this receipt as CR1 release acceptance.

## Impact and proven cause

The live Google sign-in request returned HTTP 500 with `DATABASE_MIGRATIONS_OR_ROLE_NOT_READY`. The same deployment's `/api/health/ready` returned 503. A read-only query of the connected Neon production database found 46 applied migrations through 047 with checksums matching the source manifest. The connected role was `neondb_owner`, which owns database objects, can create objects and bypasses RLS. The production guard correctly rejects that role. This is a runtime credential-authority failure, not a missing migration or Google branding failure. Vercel Production has `VITE_GOOGLE_CLIENT_ID`, matching the public `/api/config` audience; the prior inference that the server audience was absent was disproved.

## Candidate and compatibility

### Narrow deployment impact decision

The restricted-role staging rehearsal did not prove all Host/Admin mutations. A
whole-application `DATABASE_URL` cutover would therefore create new failures.
Instead, `CONSUMER_AUTH_DATABASE_URL` will supply a separate two-connection
pool for Google sign-in and session reads. Google account SQL, its readiness
check and the experience-host setting read use that pool. Existing account
tokens and API response contracts are unchanged. No schema migration is
needed. An absent/invalid dedicated URL falls back to the existing pool, whose
owner-role readiness guard still fails closed in Production. Targeted tests
cover the role, auth route, and session; live readback must still prove Gmail.
Rollback is removing the dedicated variable and redeploying the prior commit;
that restores the known 503 instead of allowing an unsafe owner sign-in.


The candidate separates consumer identity readiness from full marketing-catalog readiness. It still requires a non-owner, non-BYPASSRLS role with the exact `users` column/sequence privileges before issuing a token. The full `/api/health/ready` check remains strict. The legacy cross-tenant calendar mutation route is retired with HTTP 410; the canonical room-calendar route remains. Public catalogue/experience read grants are included in the restricted-role plan because their legacy handlers otherwise returned misleading empty HTTP 200 responses after permission errors.

An isolated Neon staging branch was brought from migration 016 through 047 with the hardened runner. A new restricted staging LOGIN passed full readiness and consumer Google-link readiness. Mounted staging checks returned 200 for health, public listings (7 rows), listing detail, experiences, password registration/login/session, and read-only Host/Admin pages after exploratory grants. The **exploratory blanket grants were staging-only** and initially failed the immutable-evidence readiness checks; the strict portfolio/recovery/adtech grants were restored and full readiness returned 200. This demonstrates why blanket grants must not be copied to Production.

On Production, a separate `encho_web_prod_20261002` LOGIN was created with the checked auth/catalog/public-read plan and a random credential stored outside Git in a mode-0600 local file. Read-only checks using that actual role returned safe authority, matching migration history, full catalog readiness, Google-link readiness and seven published listings. **Vercel has not yet been switched to this role at the time of this note.** The plan deliberately does not grant every Host/Admin mutation; a role cutover is not a certificate that all product journeys work.

## Release sequence and rollback

1. Build and test the exact candidate commit offline; record the Git tree.
2. Add the restricted `CONSUMER_AUTH_DATABASE_URL` to Vercel Production, preserving `DATABASE_URL`. Deploy the candidate commit.
3. Verify live Google sign-in returns an authenticated session and `/api/auth/me` reads it. The primary `/api/health/ready` remains a separate strict gate and is expected to report 503 while the old owner-backed `DATABASE_URL` remains. Do not infer Host/Admin readiness from a successful sign-in.
4. On failure, remove the dedicated variable and redeploy the last known deployment. Do not weaken the readiness guard, edit applied migration bytes or promote a staging credential to Production.

**Open:** Actual Google browser token exchange, full Host/Admin route grant matrix, workforce identity, legal/payment and provider gates. Preserve correlation IDs and failed/repaired receipts separately.
