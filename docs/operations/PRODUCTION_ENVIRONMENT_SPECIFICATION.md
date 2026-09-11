# Encho Production Environment Specification & Security Configuration

## Scope & Purpose
This document establishes the authoritative production environment variable specification, security perimeter parameters, and release constraints for Encho production deployments (Vercel / Node.js Serverless runtime).

All settings defined herein are mandatory for production safety and compliance containment.

---

## 1. Required Production Variables

| Variable Name | Required | Description & Validation Rule | Default / Fail-Safe Behavior |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **YES** | Set strictly to `production` in live Vercel deployments. Controls containment gates, strict CORS, clickjacking headers, and payment endpoints. | If not `production`, runtime acts in development mode. |
| `ALLOWED_ORIGINS` | **YES** | Comma-separated list of fully-qualified origins permitted to communicate with backend APIs. Example: `https://encho.space,https://www.encho.space`. Broad wildcards (`*.vercel.app`) are strictly rejected in production. | If missing in production, server logs a critical startup error and rejects all untrusted incoming origins. Canonical origins `https://encho.space` and `https://www.encho.space` remain permitted. |
| `DATABASE_URL` | **YES** | Neon PostgreSQL connection string with SSL enabled. | Required for all database operations. |
| `JWT_SECRET` | **YES** | High-entropy secret key used for signing host and admin JWT tokens. | Must not be empty or set to insecure placeholders. |
| `GUEST_SESSION_SECRET` | **YES** | High-entropy cryptographic secret for guest session cookie and token verification. | Required for guest session authorization. |
| `RAZORPAY_KEY_ID` | **YES** | Production Razorpay Key ID for verified domestic payments. | Checkout endpoints fail closed if invalid. |
| `RAZORPAY_KEY_SECRET` | **YES** | Production Razorpay Secret Key for HMAC signature verification. | Payment verification fails closed if invalid. |
| `STRIPE_SECRET_KEY` | Optional | Stripe production API secret key for international ad wallet payments. | Stays bookings do not use Stripe. |
| `APP_URL` | Optional | Canonical application URL (e.g. `https://encho.space`). | Defaults to `https://encho.space`. |

---

## 2. CORS Production Perimeter Rules
1. In production (`NODE_ENV === 'production'`), CORS requests are matched strictly against:
   - Canonical Encho production origins: `https://encho.space` and `https://www.encho.space`.
   - Explicitly listed origins parsed from `ALLOWED_ORIGINS`.
2. Broad domain patterns such as `*.vercel.app`, preview deployments, and local ports are unconditionally denied.
3. Missing or undefined `ALLOWED_ORIGINS` triggers an immediate server startup configuration warning:
   `"[SECURITY AUDIT] ALLOWED_ORIGINS environment variable is NOT set in production!"`
4. Requests from unapproved origins receive an immediate `HTTP 403 Forbidden` response (`CORS policy violation: Origin not allowed`).

---

## 3. Clickjacking & Frame Ancestors Policy
1. In production (`NODE_ENV === 'production'`), framing protection is unconditional:
   - `Content-Security-Policy: frame-ancestors 'self'`
   - `X-Frame-Options: SAMEORIGIN`
2. Feature flags such as `ENABLE_PREVIEW_EMBED` are strictly ignored in production runtime and cannot relax CSP headers or allow third-party iframe embedding.

---

## 4. Stay Checkout Production Compliance Gate
1. Until Milestones 5, 8, and 9 are legally and technically accepted, stays checkout endpoints in production fail closed:
   - `POST /api/checkout/razorpay/order`: Returns `HTTP 503` (`STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE`).
   - `POST /api/payments/razorpay/verify`: Returns `HTTP 503` (`STAYS_PAYMENT_UNAVAILABLE_COMPLIANCE_GATE`).
2. Client frontend (`CheckoutPage.tsx`) detects production runtime and halts execution before any payment UI, QR code, UPI input, or price calculations can render, displaying only the honest statutory compliance gate.

---

## 5. Google Ads Containment Gate (Decision #3)
1. Google Ads dispatch is unconditionally disabled in production and development.
2. The legacy v16 simulation REST call has been completely decommissioned.
3. Reactivation Gate: Re-enabling Google Ads requires:
   - Independent formal specification and acceptance of a future Google Ads v25 milestone.
   - Comprehensive written architecture review establishing gRPC/REST client SDKs, multi-tenant customer authorization, OAuth offline token refresh rotation, and double-entry budget ledger.
   - Environment variables (e.g. `ENABLE_GOOGLE_ADS_DISPATCH`) are completely prohibited from bypassing containment.
