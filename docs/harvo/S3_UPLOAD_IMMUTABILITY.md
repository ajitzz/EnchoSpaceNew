# HARVO — S3 upload capability hardening

Date: 2026-09-13. Classification: Security / upload API compatibility. This is verified source and offline signing evidence, not a live S3 deployment acceptance. No bucket, production credentials, database or live cloud API was accessed.

## Finding, impact and implementation

A host could reuse an ordinary presigned PUT URL during its one-hour lifetime to replace an already uploaded object. Campaign approval fingerprints media IDs, URLs and review flags, so changing bytes at the same URL could evade a later snapshot check. Random keys prevent choosing another object's name but do not prevent reusing an issued capability.

The authenticated `/api/upload-url` S3 path now uses `src/lib/immutableS3Upload.ts`. It signs `PutObjectCommand` with `IfNoneMatch: '*'`, a ten-minute lifetime and signed `content-type` / `if-none-match` headers. The server returns an additive `uploadHeaders: { 'If-None-Match': '*' }` field alongside the existing `uploadUrl`, `fileUrl` and `publicUrl`. The existing random server-generated object key and exact media MIME allowlist remain authoritative.

All five callers apply `lib/mediaUploadHeaders.ts`: HostForm, HostExperienceForm, AdminExperiences, HostMarketing and the offline sync handler. The helper forwards only the supported condition and rejects any unexpected directive, including Authorization, Cookie, duplicate conditions and content-type overrides. It retains each file's original content type. The signed local upload capability response, which omits this S3 directive, remains compatible. The separate Mux upload API is unchanged. No schema or campaign state changes are required.

The installed AWS SDK also generated `x-amz-checksum-crc32=AAAAAA==` when presigning an unknown browser body. That value is the checksum of empty bytes, so it is unsuitable for the nonempty media sent later. The dedicated presigning client factory uses `requestChecksumCalculation: 'WHEN_REQUIRED'`; this setting does not change other S3 clients or server-side transformations. Tests verify that its URL carries no fabricated checksum. TLS and the signed storage condition/content type remain in force. This does not claim end-to-end content hashing; adding a browser-computed, signed SHA-256 with byte validation would be separate work.

AWS documents that conditional PUT returns 412 when a current object already exists, and concurrent conflicts may return 409. For concurrent writes to an absent key, only one conditional creation can succeed. Changing or omitting the signed condition invalidates the capability. These are provider guarantees verified from primary documentation, not outcomes of a live AWS request in this session. [AWS PutObject API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html), [AWS conditional-write semantics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html), [JavaScript SDK checksum behavior](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-checksums.html).

## Required operator rollout

1. Before enabling the updated browser path, inspect the existing CORS rules for the actual application origins. Their upload rule must allow `PUT` and both `content-type` and `if-none-match` request headers. Existing matching wildcard header rules already permit them. Merge with required existing rules; do not replace unrelated GET/Mux/application configuration. Use the actual approved origins, not an invented or universal wildcard origin. `if-none-match` belongs in `AllowedHeaders`, not `ExposeHeaders`. Browser preflight must succeed for the deployed origin. [AWS CORS elements](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html).
2. Release the server and five updated clients together, accounting for cached browser/service-worker bundles. An older client will fail the signed PUT because it lacks the required header. Do not weaken the server condition to support stale clients. A failed/expired URL must lead to a new server-issued random object key; clients must never retry without the condition or treat 412 as proof that their intended file was uploaded.
3. Reconcile already-issued one-hour URLs and existing approved assets before clearing the media gate. This source change does not revoke old capabilities. Apply a reviewed bucket policy requiring conditional creation for the relevant uploaded-object prefix and restrict privileged overwrite/copy/delete routes. Existing other server writers, including image processing, need an explicit compatible policy and versioning strategy before broad policy rollout. No bucket policy was changed by this implementation. [AWS bucket policy enforcement](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html).
4. In an isolated staging bucket, verify browser CORS, one successful upload, refusal of a second write to the same key, refusal when the header is removed/changed, expiry, correct displayed media and observed 412/409 handling. Record the actual object/version evidence and all five client entry points. These live checks remain outstanding.
5. Restrict approved media origins to stores with verified immutability. Conditional writes examine the current version: deletion or a current delete marker can permit another creation at that key. Privileged writes, mutable CDN aliases and arbitrary external media URLs are outside this capability's guarantee. Retention/delete permissions and/or immutable version-specific URLs still require operator acceptance before marketing activation.

The change adds one signed header and no storage read before PUT; S3 evaluates the condition atomically. There is no check-then-write race introduced by this path. The rollback for failed rollout is to disable affected direct uploads/marketing release while correcting CORS or clients. Restoring overwrite-capable presigning would reopen the reviewed security hole.

## Verification

`src/test/harvo/s3_upload_contract.test.ts` uses the actual installed AWS SDK with explicit fake credentials and a request handler that throws on any attempted network request. It independently reconstructs SigV4 with Node crypto to prove that the returned browser headers verify, while a removed/changed condition, changed content type or changed key fails signature verification. It checks ten-minute expiry, no empty-body checksum, strict client header allowlisting, all five source call sites, server helper wiring and preservation of local/Mux contracts. The call-site checks are structural integration evidence, not rendered UI or live S3 tests.

Run only this isolated suite with:

```sh
npx vitest run --config vitest.marketing-m1.config.ts src/test/harvo/s3_upload_contract.test.ts
```

Completed local result: **25/25 passed**; final rerun 2026-09-13 16:54:09 local, total suite duration 3.62 seconds. A separate esbuild parse check passed for all eight changed application TypeScript files, including the five callers and server. A focused strict TypeScript check passed for the signing helper, browser header helper and contract test. No full application compiler, PostgreSQL test or live S3 test was run for this bounded patch. Production bucket/CORS behavior and externally mutable media remain explicit deployment gates.
