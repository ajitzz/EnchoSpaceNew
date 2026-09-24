# Track 4: Bounded Commercial Pilot Agreement & Stop-Loss Charter

**DOCUMENT AUTHORITY:** L7/L8 Principal Systems Architect, Commercial Operations & AdTech Division  
**TARGET GATES:** `PILOT-01` | Package `P8.4` (CR1 Release Tranche)  
**STATUS:** **FORMAL COMMERCIAL PILOT AGREEMENT, STOP-LOSS CHARTER & BOARD GO/NO-GO PROTOCOL**  
**REVISION:** 1.0 (24 September 2026)  
**CONTROLLING PLAN:** [`docs/implementation/CR1_EXECUTION_PLAN.md`](file:///Users/ajit/.gemini/antigravity/worktrees/EnchoSpaceNew/setup_and_start_dev/docs/implementation/CR1_EXECUTION_PLAN.md)  
**CONTROLLING MANIFEST:** [`docs/releases/CR1_PRODUCTION_RELEASE_MANIFEST_AND_EXTERNAL_GATE_DOSSIER.md`](file:///Users/ajit/.gemini/antigravity/worktrees/EnchoSpaceNew/setup_and_start_dev/docs/releases/CR1_PRODUCTION_RELEASE_MANIFEST_AND_EXTERNAL_GATE_DOSSIER.md)  

---

## 1. Executive Summary & Zero-Trust Charter Mandate

Under the Encho Engineering Constitution and Zero-Trust Operating Directive, open-ended marketplace commercialization carries existential systemic risk (runaway ad spend, uncontained chargebacks, platform API bans, and statutory non-compliance).

To eliminate unhedged balance sheet exposure, **Complete Release 1 (CR1) implements a Strictly Bounded Commercial Pilot Tranche (`PILOT-01`, Package P8.4)**. This charter establishes the binding operational, financial, and contractual invariants governing live commercial execution.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 ENCHO BOUNDED COMMERCIAL PILOT BOUNDARY (CR1)               │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
     ┌─────────────────────────────────┼────────────────────────────────┐
     ▼                                 ▼                                ▼
[HARD STOP-LOSS CAPS]         [PROPERTY ISOLATION]          [COMMERCIAL TERMS]
 - Max Aggregate: ₹50,000      - Strictly Listing 1           - 15% Platform Commission
 - Max Daily: ₹2,000           - Wayanad Sanctuary            - 3-5% Ad Margin Markup
 - 95% Auto Circuit-Breaker    - Bangalore Corridor           - Non-refundable Wallet Lock
```

---

## 2. Definitive Pilot Scope & Property Isolation

Commercial operations during CR1 are strictly quarantined to a single verified property corridor to maintain 100% human and programmatic oversight:

| Parameter | Specification | Enforcing Code / Schema |
|---|---|---|
| **Authorized Listing** | `listing_1` ("Wayanad Sanctuary") | `PILOT_CONSTRAINTS.AUTHORIZED_LISTING_ID` in `scripts/deployment/pilot-tranche-monitor.mjs` |
| **Geographic Corridor** | Bangalore Urban / Wayanad Retreat Corridor | Meta Campaign Targeting Specification (`geo_locations: { cities: ['Bangalore'] }`) |
| **Consenting Host** | Verified Host Account `pilot_host_wayanad` | IAM Identity Ledger (`iam_users`, `iam_principals`) |
| **Listing Status** | Fully Audited, 8/10+ AI Gatekeeper Score | `ListingDetailView`, `HostListingBuilder` Step 8 Verification |

> **Fail-Closed Rule:** Any attempt by any host or automated worker to create or activate an ad campaign targeting any listing other than `listing_1` is rejected at the API gateway with `403 FORBIDDEN (UNAUTHORIZED_PILOT_PROPERTY)`.

---

## 3. Financial Guardrails & Stop-Loss Architecture

To prevent overspend, runaway ad bidding, or double charges, the following hard limits are enforced in software and financial ledgers:

### 3.1 Hard Aggregate & Daily Caps
1. **Maximum Aggregate Spend Cap:** **₹50,000 INR** (5,000,000 paise).
   - Under no circumstances may total cumulative spend across Meta and Google exceed this threshold.
2. **Maximum Daily Spend Cap:** **₹2,000 INR** (200,000 paise) per 24-hour rolling window.
3. **Automatic Circuit-Breaker Trigger (95% Rule):**
   - When cumulative spend reaches **₹47,500 INR** (4,750,000 paise / 95% of cap), the `OperationalDrillEngine` and `pilot-tranche-monitor` immediately fire an automated pause payload (`status: 'PAUSED'`) to both Meta Marketing API and Google Ads API.
   - Campaign state transitions to `CIRCUIT_BREAKER_PAUSED`.

### 3.2 Idempotency & Burst Suppression
- Hosts refuel or fund ad campaigns via the Host Campaign Dashboard.
- Rapid duplicate clicks (e.g. 5 clicks within 200 milliseconds) are intercepted by `processPilotTopUpIdempotent()`.
- An in-flight promise deduplication map guarantees **exactly one execution**; subsequent calls return the cached outcome tagged with `isReplay: true`.

### 3.3 Trapped Cash / Wallet Escrow Non-Refundability
- When campaigns pause or conclude with remaining unspent balance, funds are **never refunded to external credit cards** (avoiding gateway processing fees and interchange loss).
- Unspent balance is immutably credited to the host’s Encho Internal Wallet (`wallet_credit`), available for future campaign refueling or platform service fees.

---

## 4. Pilot Host Agreement & Terms of Participation

The designated pilot host enters into this binding agreement prior to campaign activation:

### 4.1 Master Account Architecture Disclosure
The Host explicitly acknowledges and agrees that:
1. Advertisements are deployed via Encho’s Master Business Manager and Google MCC accounts. The Host does not connect or require their own advertising accounts.
2. Encho exercises full editorial and algorithmic control over ad copy, imagery, and targeting parameters, guided by the Encho AI Pre-Flight Gatekeeper (scoring $\ge 8.0/10$).
3. Ads will run under Meta's mandatory **Housing Special Ad Category** (`HOUSING`) and conform to all fair housing advertising regulations.

### 4.2 Walled Garden CRM & Anti-Disintermediation
1. All guest inquiries, leads, and click-throughs generated by Encho advertising are routed exclusively into the Encho Host Inbox.
2. External contact details (phone numbers, email addresses, WhatsApp links, URL redirects) are programmatically redacted (`[REDACTED]`) by the Walled Garden CRM.
3. The Host agrees to conduct all guest communication, date confirmation, and booking fulfillment exclusively inside the Encho platform. Attempting to circumvent the platform to avoid the 15% booking commission results in immediate termination of the pilot and forfeiture of wallet balances.

### 4.3 Commercial Fee Structure
| Component | Rate / Mechanism | Statutory Tax Application |
|---|---|---|
| **Booking Commission** | 15% of Gross Base Accommodation Price | Subject to 18% GST (Encho issues Tax Invoice to Host) |
| **Advertising Engine Fee** | Net Ad Cost $C$ + Markup $p$ (3% to 5%) | Subject to 18% GST on Markup under SAC 998313 |
| **Statutory TCS (Sec 52)** | 1% of Net Taxable Accommodation Value | Deducted by Encho and remitted via Form GSTR-8 |

---

## 5. Post-Pilot Audit & Go/No-Go Evaluation Protocol

Upon exhausting the ₹50,000 INR budget or completing a 30-day operating cycle, the platform triggers an automated audit evaluating the following Key Performance Indicators (KPIs):

1. **Return on Ad Spend (ROAS):** Target $\ge 3.0\times$ (Gross Booking Value generated / Net Ad Spend).
2. **Lead Conversion Velocity:** Target $\ge 15\%$ inquiry-to-confirmed-booking conversion.
3. **Inbox Isolation & Security:** 100% data containment with zero leaked off-platform communications.
4. **Tax Remittance Reconciliation:** 100% reconciliation between GSTR-8 TCS ledger, GSTR-3B commission reports, and bank deposits.

---

## 6. Formal Board Go/No-Go Execution Register

Live expansion beyond Listing 1 into general marketplace availability requires unanimous board approval recorded below:

### BOARD SIGN-OFF MATRIX

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               CR1 COMMERCIAL PILOT TRANCHE VERDICT & SIGN-OFF               │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Signatory 1: Founder & Chief Executive Officer (CEO)
- **Role:** Commercial & Strategic Authority
- **Determination:** `[  ] GO — PROCEED TO MARKETPLACE EXPANSION` / `[  ] NO-GO — REMEDIATE`
- **Signature:** _____________________________________________
- **Date:** ________________________

#### Signatory 2: L7/L8 Principal Systems Architect & SRE Lead
- **Role:** Technical Integrity, Stop-Loss & Reliability Authority
- **Determination:** `[  ] GO — ZERO RUNAWAY SPEND, 100% UPTIME` / `[  ] NO-GO — DRIFT DETECTED`
- **Signature:** _____________________________________________
- **Date:** ________________________

#### Signatory 3: Head of Commercial Operations & Legal Compliance
- **Role:** Statutory Tax & Contractual Audit Authority
- **Determination:** `[  ] GO — TAX & TCS 100% RECONCILED` / `[  ] NO-GO — DISCREPANCY FOUND`
- **Signature:** _____________________________________________
- **Date:** ________________________

---

### Executed Receipt Artifact
When signed, the evaluation data and board verdict are committed to:  
`docs/harvo/receipts/CR1_PILOT_GO_NOGO_RECEIPT.json`
