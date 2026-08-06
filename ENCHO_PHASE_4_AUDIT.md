# ENCHO - PHASE 4: ADVERSARIAL QA & SECURITY AUDIT

## Phase 4 Strategy
Now that the Encho-Meta Middleware Engine is fully built across all 5 milestones, we must execute Phase 4 (Adversarial QA, Security, OWASP Review, and Refactoring) before the application can be considered production-ready.

## 1. Security & OWASP Review

*   **SQL Injection (SQLi)**: All database queries must use parameterized queries (e.g., \`pool.query('... $1', [val])\`). No raw string interpolation (\`\${val}\`) should exist in any SQL query.
*   **Cross-Site Scripting (XSS)**:
    *   *CRM Messages*: The \`maskContactInfo\` function utilizes `xss` with strict sanitization, stripping HTML and script tags to prevent stored XSS attacks via Meta leads.
    *   *UI Rendering*: React automatically escapes text in standard curly braces \`{var}\`, but we must audit any use of \`dangerouslySetInnerHTML\` across the codebase.
*   **Idempotency & Double-Spend**:
    *   The payment routing (Stripe/Razorpay) relies on external Webhooks and idempotent processing (Gap 1).
    *   The "Smart Auto-Pause" circuit breaker and Trapped Cash Ledger ensure we never double-pause or double-refund via strict state checks (\`status = 'active'\`).
*   **Row-Level Security (RLS)**:
    *   The Neon database requires strict RLS policies to prevent hosts from querying \`host_wallets\`, \`host_marketing_campaigns\`, or \`lead_inquiries\` that do not belong to their \`host_id\`.
*   **Rate Limiting**:
    *   The Gemini AI Gatekeeper requires rate limiting (e.g., via \`express-rate-limit\`) to prevent API abuse and budget draining.
*   **Webhook Security**:
    *   The Meta webhook endpoint correctly verifies \`hub.challenge\` and \`hub.verify_token\`.
    *   However, we need to validate the \`X-Hub-Signature\` header to ensure payloads actually originate from Meta and are not forged.

## 2. Refactoring & Code Quality

*   **Database Config**: Ensure \`envDbUrl\` resolution does not inadvertently fall back to a mock string in production.
*   **Async Webhook Queue**: The \`processAsyncWebhookQueue\` background worker (polling every 10 seconds) is functional but could cause database contention at scale. In a true FAANG environment, this would be decoupled into a Redis/Celery queue, SQS, or Pub/Sub architecture.
*   **Error Handling**: Enhance `try/catch` blocks around external API calls (Meta, Gemini, Stripe) to log structured JSON errors (e.g., Winston/Pino) instead of raw `console.error`.

## 3. Next Actions for Phase 4 Execution

1.  **Implement `X-Hub-Signature` verification** for the Meta Webhook payload.
2.  **Audit `dangerouslySetInnerHTML`** usage in the frontend React components.
3.  **Implement Rate Limiting** on the AI Gatekeeper and Payment endpoints.
