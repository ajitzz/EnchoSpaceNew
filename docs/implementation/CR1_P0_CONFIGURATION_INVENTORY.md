# CR1 P0 Configuration and Secret-Surface Inventory

**Status:** source and local filename inventory complete; values were not read or copied  
**Date:** 23 September 2026

## Local configuration files present

| File | Classification | Finding |
|---|---|---|
| `.env` | unlabelled local/runtime secret source | Contains database, provider, payment, object-storage, AI and signing variable names; it is not staging evidence |
| `.env.local` | unlabelled local override | Contains similar runtime/provider variable names; it is not staging evidence |
| `.env.harvo-attribution.local` | purpose-scoped local secret | Contains `HARVO_ATTRIBUTION_KEYS` only |
| `.env.example` | tracked template | Incomplete and contains naming drift described below |
| `.env.staging.local` | expected staging-only source | **Absent** |
| `.env.production.local` | optional production-only local source | **Absent**; production secrets should normally live in the deployment secret manager, not a developer file |

No values, URLs, tokens, passwords or key material are recorded in this document.

## Secret-bearing/runtime variable families referenced by source

- **Database:** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `READ_DATABASE_URL`, `NEON_DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`, `TEST_DATABASE_URL`.
- **Application signing/privacy:** `JWT_SECRET`, `GUEST_COOKIE_SECRET`, `PII_ENCRYPTION_KEY_HEX`, `WEBHOOK_SIGNING_SECRET`, `HARVO_ATTRIBUTION_KEYS`.
- **Google identity/ads:** `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_MCC_CUSTOMER_ID`, `GOOGLE_CONVERSION_ACTION_ID`, `HARVO_GOOGLE_DATA_MANAGER_REFRESH_TOKEN`, `GOOGLE_ADS_LANDING_ORIGIN`.
- **Meta:** `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_API_TOKEN`, `META_SYSTEM_USER_TOKEN`, `META_PAGE_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_INSTAGRAM_ACCOUNT_ID`, `META_PIXEL_ID`, `META_MARKETING_WEBHOOK_VERIFY_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_BASE_URL`, `META_APP_MODE`, `META_PUBLISHING_PAUSED`, `META_HUMAN_VERIFIED_APP_MODE_LIVE`, `META_CANARY_2_READY`, `META_ADS_LANDING_ORIGIN`.
- **Payments:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_ACCOUNT_ID`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_MARKETING_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_ACCOUNT_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MARKETING_WEBHOOK_SECRET`.
- **AI/maps/geography:** `GEMINI_API_KEY`, `GEMINI_MARKETING_MODEL`, `GOOGLE_MAPS_PLATFORM_KEY`, `HARVO_GEOCODING_API_KEY`.
- **Storage/media:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET_NAME`, `HARVO_CREATIVE_BUCKET`, `HARVO_CREATIVE_CDN_ORIGIN`, `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`.
- **Cache/locks:** `REDIS_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- **Messaging:** `PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`.
- **Runtime controls:** `NODE_ENV`, `PORT`, `ALLOWED_ORIGINS`, `LOG_LEVEL`, `WORKER_MODE`, `ACTIVE_WORKER_CLASSES`, `DISABLE_BACKGROUND_WORKERS`, `HARVO_ADTECH_ENABLED`, `HARVO_HOLD_SWEEPER_ENABLED`, `HARVO_MARKETING_CONFIG`, worker-health paths and provider feature flags.

## Verified naming/configuration drift

1. `.env.example` documents `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, while inspected source primarily reads `GOOGLE_ADS_MCC_CUSTOMER_ID`. One canonical name and a deliberate compatibility window are required.
2. Source supports several database URL aliases. The deployment contract must name one writer/runtime URL, one optional read URL and one migration-owner URL by environment; fallback aliases must not silently select an unlabelled production endpoint.
3. `.env` and `.env.local` both define overlapping secrets. Precedence is therefore operationally significant and must be explicit in deployment documentation.
4. Source refers to overlapping Meta token names. Token type, principal, permission scope and allowed operation must be explicit; generic token fallback is unsafe for privileged provider writes.
5. Source contains both Stripe and Razorpay variables although current India runtime direction is Razorpay-first and Stripe remains a future/international path. Configuration presence is not provider acceptance.

## Required P0 follow-up

- Generate a versioned typed configuration manifest that marks each variable as public, secret, environment-specific, optional or required by a named worker.
- Update `.env.example` from that manifest and add a CI drift test without populating secrets.
- Make web, marketing worker, AdTech worker, migration runner and test harness load only their minimum allowlisted variables.
- Reject ambiguous production database aliases and privileged provider token fallbacks at readiness time.
- Keep `scripts/deployment/verify-public-artifacts.mjs` in every release gate and expand its fixtures whenever a new secret name is introduced.

## CR1 isolated Operations configuration (24 September 2026)

- `CR1_WORKFORCE_DATABASE_URL`: dedicated non-owner/non-bypass runtime login. There is intentionally no fallback to a generic or migration-owner URL. Remote TLS validates the server certificate and hostname.
- `CR1_WORKFORCE_ORIGIN`: exact trusted origin for staff mutations. HTTPS is required outside local development; a missing/invalid origin disables command endpoints. It is not inferred from an inbound Host header.
- Neither variable has been configured or tested against a remote environment in this execution. Staff cookies and credentials are never stored in consumer browser persistence.


## CR1 conversation hint worker configuration (24 September 2026)

- `CR1_NOTIFICATION_WORKER_ENABLED`: exact `true` enables the optional in-process socket-hint worker; default disabled.
- `CR1_NOTIFICATION_DATABASE_URL`: independent queue-only restricted login, never an alias/fallback to `DATABASE_URL` or a migration owner. Remote TLS requires validated certificates. Worker readiness rejects content-table privileges.
- The adapter reports local socket dispatch only; durable history and authenticated polling recover missed hints. Distributed socket transport, external channel consent/delivery and production rollout are separate gates.
- Names only are recorded here. Neither value was read from or written to a live environment for this slice.

## Workforce identity transport configuration (24 September 2026)

- `CR1_WORKFORCE_IDENTITY_DATABASE_URL`: a distinct EXECUTE-only identity issuer login; no consumer, broad staff, invitation-writer or migration-owner fallback.
- `CR1_WORKFORCE_GOOGLE_CLIENT_ID`: explicitly configured workforce Google audience, matching the current reviewed identity policy. Consumer Google client configuration is not used.
- `CR1_WORKFORCE_ORGANIZATION_ID`: exact organization selected by server deployment configuration, never a browser selector.
- `CR1_WORKFORCE_ENVIRONMENT`: trusted `LOCAL`, `STAGING` or `PRODUCTION` lane. Production Node processes cannot select LOCAL. Staging and production sign-in origins require HTTPS. Absent value preserves the secure production default or local development lane.
- New `/api/operations/v1/session/{begin,complete,logout}` routes use a bounded parser before the broad application parser, fixed Origin, custom command header, rate limits and Secure/HttpOnly/SameSite=Strict host cookies. No secrets are configured by this source change.
- The application entry point keeps consumer Auth/cache/Google/maps providers outside the Operations tree. Workforce client credentials are transient SDK callback input; session material is never in localStorage/sessionStorage or JSON responses.

## Participant assistance and Service Desk activation

- `CR1_SERVICE_ASSISTANCE_ENABLED`: exact `true` enables the candidate integration;
  otherwise assistance remains unavailable. No startup auto-grant or remote write.
- The service reuses explicit workforce organization/environment configuration
  and its distinct workforce runtime login. The participant pool must independently
  pass the exact conversation/service catalog and restricted-login readiness checks.
- Migration 038 rollout requires separate consumer, staff and NOLOGIN helper roles
  and a reviewed organization/environment/disclosure binding. The client supports
  only `cr1-service-assistance-v1`; an unknown disclosure cannot be accepted.
- Staff content access uses the committed-receipt protocol. Internal notes stay
  private. Channel notification configuration does not enable support access.
- No production disclosure/retention approval or remote role configuration was
  supplied or inferred by this implementation.
