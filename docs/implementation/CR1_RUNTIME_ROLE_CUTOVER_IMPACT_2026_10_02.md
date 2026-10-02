# CR1 runtime role cutover impact — local preparation, 2 October 2026

## Source and incident

The production `/api/health/ready` response identifies an owner/bypass-RLS login; auth calls `databaseReadiness` before querying `users`, so login fails closed. The applied migration 041–047 bytes were restored separately in `89ce3bd`; this work addresses the remaining database login authority. It does not authorize a remote role or Vercel change.

## Scope and authority

- Source of truth: `databaseReadiness`, its runtime authority/history/recovery/portfolio/adtech catalog checks, and the existing grant helpers. This addition generates a **fresh** role plan; application startup never grants itself rights.
- Affected code: one deployment-only plan module and disposable PostgreSQL tests. No schema migration, API, UI, worker, finance, provider or tenant data change.
- The plan grants only the catalog and account-authentication minimum. A green readiness result alone does not establish every Guest/Host/Admin route. Production cutover requires a route privilege matrix and mounted journey checks under a real separate LOGIN, including listing edit/publication, inventory hold, conversation, campaign funding/pause, recovery and Admin review. Any failure blocks cutover.
- Security: no owner membership, CREATE, BYPASSRLS, mutation of `schema_migrations`, recovery evidence alteration, protected portfolio/adtech history alteration, or blanket table grants. `users` remains a legacy table with broad SELECT for its current login query and no DB-enforced per-user RLS; this residual exposure requires separate remediation.
- Compatibility: the current owner URL continues running until an independently reviewed restricted-role cutover. Migration owner credentials remain separate. No current runtime role is modified.

## Validation and rollback

- On disposable Unix-socket PostgreSQL, create a distinct `NOINHERIT/NOBYPASSRLS` LOGIN, apply the generated grants and connect through a new pool as that login. Verify authority, migration-history immutability, recovery catalog and authentication queries; deny privileged operations and cross-role switching. Reuse portfolio/adtech helper tests for their exact policy/trigger/grant contracts.
- A partial fixture must not be reported as a green complete production readiness gate. Verify complete schema and relevant mounted journeys under an isolated staging login before changing production credentials.
- Rollback of a future cutover is credential-routing only, after ensuring the previous credential remains available and safe. Never weaken `databaseReadiness`, alter applied migration bytes, grant owner membership, or use the migration-owner URL as the runtime fallback.
