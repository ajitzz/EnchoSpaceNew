# HARVO — Hosting recommendation and rollout guide

> Historical snapshot. Packaging and integration changes are documented in [GAP_CLOSURE_VERIFICATION.md](GAP_CLOSURE_VERIFICATION.md) and [DEPLOYMENT_HARDENING.md](DEPLOYMENT_HARDENING.md). Earlier defect/status statements are not a fresh audit of the later source.

Date: 13 September 2026. Status: **RECOMMENDATION + SOURCE REVIEW; NOT DEPLOYED**. Requested by the founder after the current Vercel readiness evaluation. This document does not accept a paid pilot, apply migrations, purchase services or change existing account/legal authority. Constitution section 20 and the marketing operations runbook remain controlling.

## Recommendation

Use **Render for the web/API and a separate marketing worker; retain Neon Postgres and the existing S3 media integration**. Keep the existing domain registrar/DNS initially. Cloudflare can be introduced for DNS and carefully scoped edge delivery later; moving DNS is not a prerequisite for this launch.

Vercel is capable, but the current Vercel configuration does not run the required consumer. A Vercel web/API deployment plus a separate worker remains a viable alternative after its own staging validation. Changing providers does not connect missing financial settlement, canonical checkout/conversion, approved policy or provider permissions.

| Component | Proposed location | Purpose |
|---|---|---|
| React frontend + Express API | Render paid Web Service | One public origin for pages, authentication, API requests and signed webhooks; preserve existing route behavior |
| HARVO marketing consumer | Render paid Background Worker | Run durable PostgreSQL jobs for payment verification, publishing/control, refunds and observations |
| Relational data and marketing queue | Existing Neon Postgres | Keep current transactional/ledger design; deploy required schema and non-BYPASSRLS application roles |
| Images and videos | Existing S3 integration | Immutable media with verified bucket/CORS restrictions; do not rely on container-local uploads |
| Domain/DNS | Existing provider; Cloudflare optional | No immediate nameserver migration or broad API caching |

This is an engineering fit judgment. Render supports [Express web services](https://render.com/docs/web-services) and [continuously running background workers](https://render.com/docs/background-workers). It avoids a new serverless job adaptation for the existing consumer. Railway also supports [persistent container services](https://docs.railway.com/services), making it a reasonable alternative if there is an existing operational preference.

Cloudflare Workers has a [documented Node compatibility surface](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), rather than an unrestricted conventional Node process. Encho uses native media libraries and a continuously polling worker. Cloudflare also offers [Containers](https://developers.cloudflare.com/containers/); hosting Encho there is possible in principle but requires its own lifecycle, packaging and integration verification. A wholesale migration offers no demonstrated conversion or reliability benefit for this checkout today.

## What the founder can do now

1. Create or select a **private GitHub repository** for Encho. Keep source history and deployment ownership under the company. Push only reviewed source and required documentation/configuration; exclude secrets, customer exports, environment files and operational dumps. Avoid an unchecked bulk upload of this workspace.
2. Create a Render account/workspace and connect the intended GitHub account. Service creation starts deployment, so wait for the packaging and staging configuration below before creating live services. An account alone does not require a production DNS cutover.
3. In Neon, record the existing database **region and plan** and prepare an isolated staging database/branch. Prefer schema-only plus sanitized fixtures; ordinary branching may copy customer data. Do not replace or overwrite the existing database. See [Neon branching options](https://neon.com/docs/get-started-with-neon/workflow-primer).
4. Keep access to the existing domain/DNS and S3 account. No domain transfer or storage-provider migration is needed. Keep secrets in provider dashboards or the deployment secret store, never in HARVO, GitHub files or chat.
5. Gather the actual Meta/Google serving-account identities, payment account/webhook configuration and approved cost-policy references described in `OPERATIONS_RUNBOOK.md`. Existing keys are not evidence of valid permissions. Preserve the separate checkout/legal acceptance gates.

## Render dashboard click sequence

Use this sequence for **staging first**. The labels can change slightly as Render updates its dashboard, but the order and stop gates should remain the same.

1. Open the Render dashboard → **New** → **Blueprint** → **Connect a repository** → choose the private Encho repository and staging branch → review the detected `render.yaml` → choose the workspace and region → **Apply**. If Blueprint import is unavailable, choose **New → Web Service** and **New → Background Worker** separately, selecting the same repository and revision and the Dockerfiles shown in `render.yaml`.
2. Open the new **encho-web** service → **Settings → Build & Deploy**. Confirm Docker runtime, `Dockerfile` path, Node 24 image build, one instance and automatic deploys off. Confirm the health check is `/api/health/live` for the first boot.
3. Open **encho-web → Environment → Add Environment Group** (or **Add Environment Variable**). Add the server-only values from the runbook: `NODE_ENV=production`, `DISABLE_BACKGROUND_WORKERS=true`, the staging `DATABASE_URL`, a generated `JWT_SECRET`, `ALLOWED_ORIGINS` for the staging HTTPS origin and the reviewed `HARVO_MARKETING_CONFIG`. Add provider, payment, Gemini, S3 and notification secrets only in these server fields. Do not add them as `VITE_*` variables.
4. Open **encho-harvo-worker → Settings → Build & Deploy**. Confirm Dockerfile path `Dockerfile.worker`, one paid instance and automatic deploys off. There is no public URL and no web health path for this service.
5. Open **encho-harvo-worker → Environment** and add the same staging `DATABASE_URL`, `HARVO_MARKETING_CONFIG`, `NODE_ENV=production`, `DISABLE_BACKGROUND_WORKERS=true`, `HARVO_HOLD_SWEEPER_ENABLED=true` and the server-side provider/payment/AI/media secrets it needs. Keep worker and web configuration revisions identical.
6. Open **encho-web → Manual Deploy → Deploy latest commit**. Watch **Logs** until the compiled process starts. Open the service URL in a new tab and check `/api/health/live`; a `200` proves only process liveness.
7. Before starting the worker, open Render **Shell** for the web service (or run the reviewed one-off migration job) against the staging database. Run the versioned migration command from the repository, then run `npm run marketing:check -- --database`. Verify migrations 009–016 are `MATCHED`, all required tables/RLS flags are present and the application role is neither superuser nor `BYPASSRLS`. Never paste a production URL into a staging shell by accident.
8. Return to **encho-web → Settings → Health Check Path**, change it to `/api/health/ready`, save and redeploy. Check the endpoint again. If it returns `503`, stop and fix the reported schema/role/configuration rather than lowering the check.
9. Open **encho-harvo-worker → Manual Deploy → Deploy latest commit**. In **Logs**, confirm `HARVO_WORKER_STARTED` and the expected maintenance names. Use the worker health command from a controlled shell/monitor to confirm fresh progress. A worker that is alive but not progressing is a failed deployment.
10. Run the no-spend smoke path. Keep funding, provider publication and activation disabled. Verify host drafting, AI fallback/human review, admin review, creative preparation/review when S3/CDN is configured, signed webhook rejection, queue claims and graceful restart.
11. For the custom domain, open **encho-web → Settings → Custom Domains → Add Custom Domain**, enter the staging hostname and copy the exact DNS record Render displays into the existing DNS provider. Leave any Cloudflare record **DNS only** (grey cloud) during staging. After propagation, update `ALLOWED_ORIGINS` and every signed webhook URL to the final HTTPS origin.
12. Promote by creating a separate production service/environment from the same verified commit, after backup/restore and pilot acceptance. Do not reuse staging secrets or database URLs. Keep one worker until queue-lag and restart evidence justify scaling.

Render's deployment lifecycle sends a termination signal and supports a bounded graceful-shutdown delay; the Blueprint's 90-second allowance must remain longer than the tested worker drain. See the [Render deploy lifecycle](https://render.com/docs/deploys), [web-service settings](https://render.com/docs/web-services) and [Blueprint specification](https://render.com/docs/blueprint-spec).

Choose a Render region close to the database and intended users. [Singapore is supported](https://render.com/docs/regions) and is a candidate for India-first service, but measure latency to the existing Neon region before choosing. Do not move a live database merely to make region labels match.

## Engineering prerequisites before creating deployment services

Scope: infrastructure/build/security evidence for the staging rollout. The source packaging changes below are locally build-verified; the platform, Linux image, remote database and provider checks remain operator acceptance work.

| Finding | Required change and acceptance |
|---|---|
| Legacy worker/public-output/EOL-image packaging | The verified source now builds the HARVO worker from `src/server/marketing/worker.ts`, separates public `dist` from private `build/server`, pins Node 24.21.0 and excludes environment/private-key variants. Build both Dockerfiles on Linux and inspect the image before rollout. |
| Web/worker ownership | Set `DISABLE_BACKGROUND_WORKERS=true` on the web service and run the dedicated worker with `HARVO_HOLD_SWEEPER_ENABLED=true`; confirm the worker owns hold expiry, campaign jobs, observations, creative preparation when configured and conversions exactly once. |
| Compiled entrypoints | The web starts `node build/server/server.js`; the worker starts `node build/server/src/server/marketing/worker.js`. The worker has no HTTP listener, so use the private progress-file health command rather than a web probe. |
| Health endpoints do not establish marketing acceptance | Use `/api/health/live` for process liveness, verify web readiness against required schema, and monitor queue age/worker progress separately. Existing `/api/health/ready` establishes database connectivity only. Ignore historical hardcoded readiness scores. |

Test startup, same-origin routes, SEO/deep links, session behavior behind the proxy, immutable media and graceful shutdown in the built image. Render sends SIGTERM and defaults to a 30-second shutdown delay; configure a tested drain interval within its [supported limit](https://render.com/docs/deploys#graceful-shutdown). Unknown remote writes must retain their durable quarantine if a process is terminated. Container restart and overlapping deployment tests are part of acceptance.

Do not replace the PostgreSQL job system with Redis merely because a hosting example uses Redis. Audit any separately retained legacy Redis consumer before enabling it.

## Staging rollout, in order

1. Complete and review the packaging fixes, build a versioned artifact, and run relevant regression/container checks. Register separate Render Web Service and Background Worker definitions from the same verified source revision. Use distinct staging service names and paid continuously available compute.
2. Back up the intended database and verify a restore. Apply prior canonical prerequisites and migrations 009–016 to staging using the versioned runner and reviewed checksums. Verify tenant isolation under an application role that is neither superuser nor BYPASSRLS. Runtime startup must not silently authorize a migration or policy.
3. Configure server secrets and the existing authorized service actor. Register the reviewed immutable campaign cost policy. Keep funding, publishing and activation independently disabled until their evidence is verified. Use sandbox/test gateway configuration during sandbox tests; do not silently substitute it for real captures.
4. Deploy the web/API and the HARVO worker. Verify process health, database/schema readiness, worker progress, alert routing and recovery. Exercise host drafting → AI/human review → exact-revision admin approval with controlled test data.
5. Verify payment signature/replay handling, account identity, capture/refund lifecycle, provider permissions, media requirements and paused provider creation in explicitly approved test/pilot scope. A Google test account cannot demonstrate real ad delivery. Provider IDs and screenshots must refer to actual returned objects when recorded as live evidence.
6. Complete trusted final-billing settlement and canonical booking/conversion integration, plus model/media acceptance and the remaining operational requirements. The guest checkout/legal gates remain unchanged.
7. Run a named host/property pilot with agreed dates and a fixed maximum real spend for each channel. Record capture, paused creation, activation, observed delivery, pause, booking/correction and final reconciliation/refund as applicable. Fix failures before opening general host funding.
8. Promote the verified version/configuration to production and then perform domain cutover. Preserve the last verified release, recoverable database state and provider identities. Rolling back application code does not undo provider spend or payment captures; their obligations still require reconciliation.

## Initial cost and capacity planning

As checked on 13 September 2026, Render lists a 1 CPU / 2 GB instance at **$25/month per service**. Two such services imply **$50/month compute**. A Pro workspace adds **$25/month**, giving **$75/month before other charges**. These are one-environment planning figures, not an all-in Encho bill or a required minimum. [Compute pricing](https://render.com/pricing), [workspace pricing announcement](https://render.com/blog/better-pricing-for-fast-growing-teams).

Neon, S3, bandwidth overages, Gemini, monitoring, notification delivery, domains, applicable taxes, extra background services and a continuously running staging environment are additional. Media spend and payment processing are separate business costs. Instance sizes are provisional until memory, CPU, queue lag and request latency are measured; this is not a capacity guarantee or a highly available topology. Avoid sleeping free web instances for payment/webhook operations; Render documents [free-service inactivity spin-down](https://render.com/docs/your-first-deploy).

The next concrete engineering deliverable is a verified deployment package for staging. No accounts, paid services, DNS changes, database writes or live ads were created by this guidance. Marketing milestone completion remains 50% by local acceptance count, and changing providers alone does not raise it.
