# R1-02 workforce administration remediation impact

Status: IN_PROGRESS. Local containment and command adaptation; not release acceptance.

## Verified defect and source of truth

The mounted `/api/admin/workforce` router trusts consumer `req.user` and constructs an unrestricted `WorkforceAdminService`. That service auto-enrolls consumer administrators as ACTIVE platform owners, hires staff as ACTIVE before verified invitation acceptance, directly updates IAM records, and computes a second audit hash chain. Its unscoped read API exposes organization evidence under consumer admin authority. These paths do not use the existing reviewed IAM command contracts.

Canonical authority remains `StaffSessionReader`, `WorkforceInvitations`, `WorkforceLifecycle`, `PrivilegedActions`, assignment commands and reviewed offline owner bootstrap. No new role, bootstrap, invitation acceptance, resume, quota, or emergency freeze policy is invented.

## Scope and implementation

1. Contain the legacy HTTP surface before schema queries or domain calls; return a stable 410 with Operations route. Contain exported direct service entry points before SQL too, preserving historical implementation in source while adoption proceeds.
2. Replace the consumer-token Staff UI entry with an explicit Operations handoff. Canonical Operations reads and assigned work remain available with a separate staff session. Never interpret consumer role as staff authorization.
3. Add a separate strictly validated workforce command router and adapter using the existing runtime session reader, lifecycle commands and maker/checker service. Derive organization/environment/resource/actor on the server. Exact deployment origin, same-origin cookie, command header, no-store, bounded body and rate limit are required. Request hashes bind exact command and reason; execute rechecks durable authority and CAS version.
4. Invitation issue/acceptance remains unavailable until the isolated identity writer and trustworthy evidence provider are explicitly composed. No notification is sent. Resume/quota/freeze remain unavailable until approved command contracts exist.

## Files, compatibility and security

Owned legacy service/router/UI plus additive operations workforce command files and focused tests. Parent owns main `server.ts` composition and will mount the new router without consumer `authenticateToken`/`requireAdmin`. No schema/migration changes; no existing membership/grant is rewritten. Retired legacy endpoints change to 410 deliberately; Operations API uses distinct paths. Finance, inventory, customer identity and provider mutations are untouched.

## Validation and rollback

Run focused Node 24 sanitized tests for actual restricted LOGIN HTTP boundaries, canonical lifecycle/privileged commands, invalid origin/session, wrong org/env, forbidden principal fields, stale CAS, self-checker and revoked authority. Keep prior unsafe-implementation test evidence distinct; tests asserting immediate ACTIVE hire must be replaced by denial assertions rather than using owner fixtures as runtime authority. Run targeted lint/typecheck. Existing canonical suites provide concurrency/lost-COMMIT regression coverage, with explicit scope in receipt.

Rollback disables the new adapter and preserves read-only Operations. Never restore consumer owner minting or direct IAM mutation as rollback. R0-04/IAM operational approval and external environment remain unaccepted dependencies. This first slice does not claim the full invitation or factor browser journey is delivered.

## Verified delivery of this bounded slice

- Legacy route always returns 410 before its old schema probe; all direct service mutation and unscoped read entry points reject before connecting/querying. Consumer owner minting and immediate ACTIVE hiring are contained. Historical test source and baseline11-passing receipt are retained as evidence of the old unsafe expectation, not acceptance.
- Existing UI entry now links to Operations without forwarding consumer token. Historical component retained unmounted during replacement. Resume/quota/freeze/invitation browser operations remain unavailable.
- New strict24KB lifecycle command HTTP adapter mounts before general body parsing, with dedicated staff credential/origin/configuration. Request/checker/execute/receipt use the existing canonical services; outbound Zod projection removes factor receipt identifiers. Checker supplies original command and maker reason to prove the exact lifecycle hash.
- Actual HTTP negative found that canonical lifecycle discarded its computed fingerprint: switching STANDARD approval to PROTECTED still executed. Same-transaction stored-permission/hash comparison now denies that mismatch; canonical existing tests retain unchanged expectations. No applied migration bytes changed.
- Latest targeted results: HTTP6, lifecycle13, retired adapter/UI8, privileged actions12, owner bootstrap11, invitations18 =68 passing across6 files. Lifecycle13 includes separate-connection revocation fencing, final-audit rollback and lost-COMMIT reconciliation. Server TypeScript passes. No full regression/build/browser release claim.

Remaining R1-02 work: canonical invitation authoring/verified acceptance browser and isolated identity-writer composition; reviewed passkey/factor browser composition; staff command forms and complete Operations journey browser coverage; independently accepted R0-04/IAM operational policy. The existing factor writer authority predicate requires additional inherited/database/replication hardening before new public factor routes. A local fixture factor is explicitly simulated identity evidence. This slice is READY_FOR_REVIEW, but the corrective card remains IN_PROGRESS.
