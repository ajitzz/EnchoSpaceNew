# ENCHO SPACE — PAID MARKETING CAMPAIGNS EXECUTION BLUEPRINT (10/10 GOLD STANDARD)

## EXECUTIVE SUMMARY & STRATEGIC FOUNDATION
The Encho Space Paid Marketing Engine is a **Walled Garden Ad Network Architecture**. 
Hosts fund targeted ad campaigns directly from their Encho Dashboard to boost property visibility on Meta (Instagram/Facebook) and Google Ads without managing external ad accounts or OAuth credentials. Encho routes ad dollars through a central Master Ad Account, retaining a **15% SaaS Optimization Fee**.

---

## CORE STRATEGIC PILLARS (10/10 INDUSTRIAL RATING)

### 1. Daily Micro-Pacing Model ($10/day - $25/day)
- **Minimum Threshold**: $10/day minimum daily spend with a 3-day minimum duration ($30 minimum total campaign order).
- **Campaign Horizon**: Flexible 3-day, 7-day, 14-day, or 30-day run cycles.
- **Why It Wins**: Eliminates high entry barriers for hosts while guaranteeing sufficient ad delivery volume on Meta/Google algorithms.

### 2. Double-Gated Quality Assurance & Verification Engine
- **Gate 1 (Server-Side Gemini AI Pre-Check)**:
  - Scans copy, images, target locations, and pricing logic.
  - Generates a granular quality score (0.0 to 10.0).
  - **Auto-Pass (>= 8.0)**: Proceeds directly to host payment and Admin Approval Queue.
  - **Auto-Reject (< 8.0)**: Instant server-side rejection with line-by-line corrective guidance (e.g. "Headline lacks luxury hook", "Photo resolution too low for 9:16 placement").
  - **Host Override Loop**: If the host's draft fails, the host can click **"Auto-Upgrade to 9.5/10 Gold Standard AI Copy"** which automatically rewrites the copy and optimizes image crops to pass Gate 1 instantly.
- **Gate 2 (Admin Human Verification Console)**:
  - Human Admin reviews Gate 1 passed campaigns in the Encho Admin Dashboard.
  - Features a multi-format Ad Preview Modal (Feed 1:1, Story/Reel 9:16, Google Display Banner).
  - Admin can Approve (triggers live ad push) or Reject with specific field-level directives.

### 3. Walled Garden CRM & Instant High-Intent Lead Dispatch
- **Zero Leakage**: Leads generated from ads drop directly into the Encho Host Inbox.
- **Data Masking Engine**: Phone numbers, emails, WhatsApp links, and external URLs in messages are automatically sanitized and masked (`[REDACTED BY ENCHO LOGISTICS]`) to prevent commission bypass.
- **Multi-Channel Push Alert**:
  - When a lead arrives, the host receives an immediate SMS/Email notification: *"🔥 Hot Lead for [Property]! Tap to reply in Encho Inbox."*
  - Contact details are withheld in the alert, forcing the host back into the Encho app within 5 minutes.
- **AI Lead Intent Scoring**: AI analyzes lead inquiries and tags them (`🔥 HOT LEAD - High Date Intent`, `⚡ FAST CLOSER`, `🧊 EXPLORATORY`).

### 4. Smart Auto-Pause & Unused Budget Escrow Ledger
- **Calendar Breaker**: Real-time DB trigger listens to calendar bookings. If a property reaches 100% occupancy during active campaign dates, the campaign instantly **PAUSES**.
- **Trapped Cash Internal Wallet**: Unused ad budget from paused or cancelled campaigns is refunded to the host's **Encho Internal Wallet Balance** (never credit card refunds, avoiding gateway chargeback fees). Wallet credits can be re-applied to future campaigns or booking fees.

### 5. Multi-Channel Budget Split & AI Auto-Optimizer
- **Default Allocation**: 70% Meta (Instagram Reels/Stories & FB Feed) + 30% Google Display Network.
- **Automated A/B Testing**: Top 3 property images are deployed as dynamic Meta A/B creatives. After 24 hours, budget automatically routes to the winning creative based on Click-Through-Rate (CTR).

---

## TECHNICAL ARCHITECTURE & DATA FLOW

```
[Host Creates Campaign] 
        │
        ▼
[Gate 1: Gemini AI Quality Pre-Check] 
   ├── Score < 8.0 ──► [Auto-Reject + Field Feedback] ──► [Host One-Click AI Auto-Upgrade]
   └── Score >= 8.0 ──► [Hybrid Geo-Router Payment (Stripe / Razorpay + 15% Encho Fee)]
                               │
                               ▼
               [Gate 2: Admin Verification Queue]
                       ├── Approved ──► [Live Ad Sync Webhook / Mock Engine]
                       └── Rejected ──► [Host Notification + Wallet Escrow Holding]
                               │
                               ▼
               [Walled Garden Lead Engine]
                       ├── Data Masking (Sanitize External Links)
                       ├── AI Intent Scoring (Hot Lead Tagging)
                       └── Multi-Channel Push Notification
```

---

## IMPLEMENTATION ROADMAP (PHASE 3 EXECUTION STEPS)

- **Step 1: Campaign Builder & Multi-Format Creative Studio** (Daily pacing options, location pre-screening, A/B photo picker).
- **Step 2: Dual-Gate AI Pre-Check & Auto-Upgrade Engine** (Strict 8.0/10 evaluation, field-level feedback, one-click 9.5/10 auto-fix).
- **Step 3: Financial Router, Idempotency & Trapped Cash Ledger** (Stripe/Razorpay 15% fee routing, double-spend prevention, internal wallet credits).
- **Step 4: Admin Moderation Suite & Multi-Device Live Preview** (Feed/Reel/Banner previewer, single-click approval, audit trail).
- **Step 5: Walled Garden CRM, Data Masker & Push Dispatcher** (Regex sanitization, AI intent tags, instant SMS/Email alert triggers).
- **Step 6: Smart Auto-Pause Circuit Breaker & Analytics Rollup** (Calendar occupancy listener, background performance metrics rollup).

---
*Status: Approved Blueprint for Paid Marketing Engine.*
