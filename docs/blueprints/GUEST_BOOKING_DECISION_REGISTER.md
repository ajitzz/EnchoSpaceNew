# ENCHO STAYS — GUEST BOOKING DECISION REGISTER
**Status:** ACCEPTED — ARCHITECTURAL BASELINE (Phase 3 Milestone 1)
**Classification:** Approved vs Proposed vs Blocked vs Rejected Register
**Scope:** India Stays Guest Journey & Commercial Boundaries
**Document Precedence Notice:** This document, alongside `GUEST_BOOKING_EXPERIENCE_V2_BLUEPRINT.md`, supersedes and overrules legacy Host Listing Builder blueprints (`MASTER_HOST_LISTING_BUILDER_BLUEPRINT.md` and `HOST_LISTING_BUILDER_DECISION_REGISTER.md`) on:
1. **Media Authority:** Relational `media_assets` table is primary; JSONB arrays are legacy fallback only.
2. **Pricing Authority:** Server-stored quotes (`booking_quotes`) are authoritative; client-side price comparisons and tolerance matching are strictly prohibited.
3. **Step Architecture:** 8-step Listing Builder is canonical.
4. **Database Governance:** Runtime DDL (`ensureListingsTable` / `ALTER TABLE` on boot) is prohibited. Non-destructive migrations only.

---

## 1. APPROVED AND LOCKED BUSINESS DECISIONS

The following commercial, architectural, and operational rules are formally **APPROVED** and **LOCKED**:

1. **Brand & Initial Geography:** The public brand is **Encho Stays**. Initial launch country is **India** (domestic stays).
2. **Launch Scope:** Stays only. Encho Experiences are post-launch and strictly excluded from this implementation.
3. **Marketing Exclusions:** Google Ads implementation is excluded from the guest stay transformation.
4. **Account Model:** Single unified account model allows an authenticated user to act as both Guest and Host.
5. **Supplier Identity:** The host/property owner remains the accommodation supplier. Encho operates strictly as the disclosed marketplace and collection agent.
6. **Invoicing:** The host issues the accommodation invoice; Encho generates it on the host's behalf.
7. **Guest Commission:** Guests **NEVER** pay an Encho booking commission.
8. **Gateway Surcharges:** Guests **NEVER** pay payment-gateway (Razorpay) charges.
9. **Flex Commission Model:** Flex booking commission is deducted from host settlement. Defaults to 15% but is admin-configurable.
10. **Commission Immutability:** The commission rate is snapshotted at booking confirmation. Later admin rate changes do not alter existing bookings.
11. **Encho Growth Subscription:** Costs ₹4,999 + applicable GST per property for a rolling 30-day period.
12. **Growth Commission Invariant:** Bookings confirmed while Growth is active retain 0% booking commission, even if stay dates occur after Growth expires.
13. **Growth Non-Refundable:** Growth fees are non-refundable after activation except for duplicate charges, technical failure, or legal requirements.
14. **Advertising Separation:** Advertising spend is separate from booking commission. Billed as actual media spend + 15% optimization fee + applicable GST.
15. **Advertising Optionality:** Advertising is optional for hosts.
16. **Standard Payout Schedule:** Standard payout is initiated 24 hours after verified guest check-in (subject to Founder Gate [PROPOSED-008, PROPOSED-009] approval on check-in verification mechanism).
17. **Banking Rails:** Bank credit timing depends on payout provider settlement cycles.
18. **High-Risk Hosts:** New or high-risk hosts payout schedule is gated behind founder review (subject to Founder Gate [PROPOSED-010] on checkout vs checkout + 24h).
19. **Host Reserve Balance:** High-risk hosts may have an admin-configurable reserve, defaulting to 10% for 30 days.
20. **Deficit Recovery:** Refund deficits may be recovered from reserve balances or future host payouts.
21. **Approved Payment Gateway:** Razorpay is the approved India guest-payment gateway for version one.
22. **Identity Boundary:** Guests may browse, inspect availability, and obtain a quote anonymously. A verified unified Encho account is mandatory before payment.
23. **Canonical Presentation:** `ListingDetailsNew.tsx` is the canonical property page. `ListingDetails.tsx` cannot be removed until parity, route migration, and verification are complete.
24. **Zero Fabrication Invariant:** No guest-facing field may be invented, randomized, or populated with a misleading fallback.
25. **Content Integrity:** Missing optional content must be omitted or represented by an honest empty state. Missing required content blocks publication or booking.
26. **Production Security:** Payment simulation must fail closed in production.
27. **Fulfillment Authority:** A booking may be confirmed ONLY from authoritative server-side captured-payment evidence.
28. **Quote Lock:** The guest total must never change without explicit guest review and acceptance.
29. **Address Privacy:** Exact property address and private arrival instructions must not be exposed through the public listing projection.
30. **Access Credentials Exclusion:** Door PINs, Wi-Fi passwords, gate passes, and smart locks are excluded from version one.
31. **Verified Review Integrity:** Reviews displayed as verified must originate from genuine eligible completed bookings.
32. **Statutory Tax Gate:** Taxes remain blocked behind formal Indian CA/tax-lawyer approval. No specific tax rates may be encoded as approved business rules.
33. **Canonical Stay Routing & 301 Redirection:** The canonical public property URL is `/stay/:propertySlug` (derived from title + ID). Legacy `/listing/:id` and `/listings/:id` URLs permanently redirect (HTTP 301) to the canonical stay URL. (Formerly PROPOSED-001; Approved for M2).
34. **Public Location Privacy & Address Masking:** Public stay projections expose locality, city, and coarsened approximate coordinates (2 decimal places, ~1.1km radius) only. Exact street address, house/building number, exact coordinates, host phone/email, and access credentials are strictly omitted and restricted to authenticated confirmed-booking APIs. (Formerly PROPOSED-002; Approved for M2).
35. **Room Type Photo Minimum Requirement:** A property cannot be published if any bookable room type has fewer than three approved, room-specific photos. At least one photo must show the sleeping area. Property-wide media does not satisfy this requirement. (Formerly PROPOSED-007; Approved for M3 / M12).
36. **Inventory Hold Duration:** Default inventory hold duration is 10 minutes (600 seconds), configurable only through the `HOLD_TTL_SECONDS` server environment configuration. (Formerly PROPOSED-004; Approved for M4).
37. **Growth Subscription Overlap / Extension Behavior:** Purchasing Encho Growth while an existing Growth subscription is active extends its expiration by 30 days from the current expires_at. The active term is never truncated. If no active term exists, expiration is calculated from successful activation time. (Formerly PROPOSED-011; Approved for M5).
38. **Public Verification Badge Display Rules:** A public verification badge may appear only when Encho has a recorded verification method and verification date. If either fact is unavailable, show no badge or equivalent trust claim. (Formerly PROPOSED-005; Approved for M6A).
39. **Zero Verified Reviews Display Rules ("New on Encho Stays"):** A property with zero verified reviews may show “New on Encho Stays.” It must not display a rating, review count, fabricated testimonial, or substitute social-proof claim. (Formerly PROPOSED-006; Approved for M6A).
40. **Milestone 6 Split Structure (M6A / M6B):** Milestone 6 is formally split into:
   - **M6A: Guest Presentation Truth and Luxury UX Foundation.** Executable independently before M5, eliminating guest-facing deceptive patterns and hardening the canonical guest view.
   - **M6B: Verified Quote and Booking Disclosure Layer.** Remains blocked by M5 and formal Indian legal/tax sign-off.

---

## 2. PROPOSED DECISIONS (AWAITING FOUNDER APPROVAL — NOT EXECUTABLE)
> [!WARNING]
> The following architectural proposals are submitted for final founder approval. They are **NOT EXECUTABLE** and **CANNOT BE IMPLEMENTED** until an explicit, recorded founder decision gate is passed. Any milestone dependent on these items is **BLOCKED**.

1. **[PROPOSED-001] Canonical URL Scheme (`/stay/:propertySlug`):** APPROVED by Founder for Milestone 2. (See Decision #33).
2. **[PROPOSED-002] Public Location Resolution (Masking Radius):** APPROVED by Founder for Milestone 2 coarsened to 2 decimal places. (See Decision #34).
3. **[PROPOSED-003] Centralized Cancellation Policy Templates:**
   - Proposal: Centralized, versioned cancellation templates (Flexible 24h, Moderate 5-day, Strict 14-day) selectable by hosts.
   - **Gated Milestone:** Blocks **Milestone 11** execution.
4. **[PROPOSED-004] Inventory Hold Duration (10 Minutes):** APPROVED by Founder for Milestone 4. (See Decision #36: “Default inventory hold duration is 10 minutes, configurable only through HOLD_TTL_SECONDS server environment configuration.”).
7. **[PROPOSED-007] Room Type Photo Minimum Requirement:** APPROVED by Founder for Milestone 3 / Milestone 12. (See Decision #35: “A property cannot be published if any bookable room type has fewer than three approved, room-specific photos. At least one photo must show the sleeping area. Property-wide media does not satisfy this requirement.”).
8. **[PROPOSED-008] Check-In Verification Mechanism:**
   - Proposal: Primary check-in verification via host-guest QR/code scan in app, with fallback to manual guest confirmation.
   - **Gated Milestone:** Blocks **Milestone 11** execution.
9. **[PROPOSED-009] Automatic Time-Based Check-In Confirmation:**
   - Proposal: If neither party confirms or disputes arrival within 12 hours after scheduled check-in time, check-in is auto-confirmed.
   - **Gated Milestone:** Blocks **Milestone 11** execution.
10. **[PROPOSED-010] High-Risk Host Payout Timing:**
    - Proposal: High-risk host payout schedule to be chosen between checkout date or checkout + 24 hours.
    - **Gated Milestone:** Blocks **Milestone 11** execution.
11. **[PROPOSED-012] Automated Refund Execution on Late Captured Payment:**
    - Proposal: When payment captures after hold expiration and inventory is unavailable (`PAYMENT_CAPTURED_INVENTORY_UNAVAILABLE`), automatically create and dispatch full guest refund obligation without requiring manual admin trigger.
    - **Gated Milestone:** Blocks **Milestone 9** execution.

---

## 3. LEGAL & COMPLIANCE BLOCKED DECISIONS

The following items are legally blocked pending formal Indian CA / Tax Attorney written sign-off:

1. **Accommodation GST Calculation:** Tiered GST threshold rules (12% vs 18%) across composite stay packages.
2. **Encho Service-Fee GST Treatment:** Tax treatment of the 15% platform management fee and host invoice presentation.
3. **Host Invoicing Format:** Statutory mandatory invoice fields under Indian GST Rules (Rule 46/47).
4. **Place-of-Supply Engine:** Determination of intra-state (CGST+SGST) vs inter-state (IGST) accommodation supply.
5. **TCS / TDS & Marketplace Obligations:** E-commerce operator compliance under Section 52 of CGST Act and Section 194-O of Income Tax Act.
6. **Final Cancellation & Refund Disclosures:** Legal wording for consumer cancellation windows.
7. **Disclosed Agent Legal Agreement:** Terms of Service wording defining Encho's collection-agent capacity.

---

## 4. PROVIDER BLOCKED DECISIONS

The following infrastructure items are blocked pending third-party merchant account approval and configuration:

1. **Host Payout Rail Selection:** Razorpay Route vs RazorpayX vs direct bank IMPS/NEFT payout provider.
2. **Gateway Settlement Schedules:** Razorpay T+2 / T+3 settlement window variations.
3. **Live Webhook Endpoint Configuration:** Razorpay webhook signing secrets on live merchant production account.
4. **Razorpay Order Querying by Receipt / Notes:** Razorpay does not guarantee public filter/query on `/orders` by arbitrary `notes` or `receipt` across all merchant tiers without merchant-specific indexing. Querying by receipt/notes is **PROVIDER BLOCKED** pending official provider documentation verification / sandbox integration proof. Safe operational fallback: pass unique immutable merchant payment-attempt reference (`attempt_id`, UUID) in Razorpay `receipt` (max 40 chars). If order query by receipt is unavailable, fallback to webhook-driven reconciliation with write-once binding from trusted signed payload (or opening a `payment_reconciliation_cases` investigation if untrusted/unbound), never blind retry.

---

## 5. REJECTED DECISIONS

The following proposals are **REJECTED** and prohibited from implementation:

1. **[REJECTED] Static Manual UPI VPA Checkout:** Exposes untracked payment vectors and invites severe fraud.
2. **[REJECTED] External QR-Code Payment Generator:** Relies on third-party insecure APIs (`api.qrserver.com`) without server order binding.
3. **[REJECTED] Client-Generated Booking Confirmation:** Browser-side mock IDs violate accounting and audit truth.
4. **[REJECTED] Static Property Door PINs:** Hardcoded credentials present grave guest physical safety risks.
5. **[REJECTED] Plaintext Wi-Fi Passwords in Public Projections:** Leaks private property credentials.
6. **[REJECTED] Synthetic Urgency & Viewers:** Dark pattern violating consumer trust.
7. **[REJECTED] Unsplash Stock Photos in Property Galleries:** Deceptive advertising liability.
8. **[REJECTED] sessionStorage as Authoritative Recovery:** Volatile and insecure for financial checkout state.
9. **[REJECTED] Runtime DDL (CREATE/ALTER TABLE on Boot):** Unacceptable for production database management.
10. **[REJECTED] Disabling Quote Verification as Rollback:** Bypassing financial validation creates unrecoverable accounting liability.
11. **[REJECTED] Dropping Financial/Inventory Tables as Rollback:** Destructive action causing catastrophic data loss.
