# Track 2: Statutory Tax Clearance Memorandum & CA Sign-Off Packet

**DOCUMENT AUTHORITY:** L7/L8 Principal Systems Architect, Legal & Tax Compliance Division  
**TARGET GATES:** `LEGAL-01`, `COMM-01` | Packages `P4.3`, `M5`, `M6B`  
**STATUS:** **FORMAL LEGAL COMPLIANCE PACKET FOR CHARTERED ACCOUNTANT REVIEW & SIGN-OFF**  
**REVISION:** 1.0 (24 September 2026)  
**CONTROLLING PLAN:** [`docs/implementation/CR1_EXECUTION_PLAN.md`](file:///Users/ajit/.gemini/antigravity/worktrees/EnchoSpaceNew/setup_and_start_dev/docs/implementation/CR1_EXECUTION_PLAN.md)  
**CONTROLLING MANIFEST:** [`docs/releases/CR1_PRODUCTION_RELEASE_MANIFEST_AND_EXTERNAL_GATE_DOSSIER.md`](file:///Users/ajit/.gemini/antigravity/worktrees/EnchoSpaceNew/setup_and_start_dev/docs/releases/CR1_PRODUCTION_RELEASE_MANIFEST_AND_EXTERNAL_GATE_DOSSIER.md)  

---

## 1. Executive Mandate & Purpose

Under the Encho Engineering Constitution and Zero-Trust Operating Protocol, **live customer checkout and monetary collection in India are strictly blocked** (`STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE = 503`) until an accredited Indian Chartered Accountant (ICAI Fellow/Associate) or qualified Indian Tax Lawyer executes this clearance memorandum.

The purpose of this document is to establish the definitive legal and statutory tax posture under the **Central Goods and Services Tax (CGST) Act, 2017**, **Integrated Goods and Services Tax (IGST) Act, 2017**, and the **Income-tax Act, 1961**.

---

## 2. Business Model & Transaction Flow Summary

Encho operates a three-sided hospitality operating platform facilitating stays and accommodations across India.

```
       [GUEST]
          │
          │ 1. Booking Request & Payment (₹ Total = Base + 18% GST)
          ▼
   [ENCHO PLATFORM] (E-Commerce Operator / Intermediary)
     │          │
     │          │ 2. Platform Commission Invoice (15% + 18% GST)
     │          ▼
     │       [HOST] (Property Accommodation Supplier)
     │          │
     │ 3. Net Payout (Base - 15% Comm - 1% TCS under Sec 52)
     ▼
[STATUTORY TAX AUTHORITIES]
 - 1% TCS remitted via Form GSTR-8
 - GST on commission remitted via Form GSTR-3B
 - GST on stay remitted under Sec 9(5) (if host is unregistered)
```

---

## 3. Detailed Statutory Invariants & Legal Positions

### Section 1: GST on Accommodation Services under Section 9(5) CGST Act

#### Statutory Baseline:
Under Section 9(5) of the CGST Act, 2017 read with **Notification No. 17/2017-Central Tax (Rate)** (as amended), the tax on intra-State supplies of specified services shall be paid by the electronic commerce operator (ECO) if such services are supplied through it.
- **Service Specified:** Services by way of providing accommodation in hotels, inns, guest houses, clubs, campsites or other commercial places meant for residential or lodging purposes.
- **Critical Proviso:** The ECO is liable to pay tax **ONLY IF** the person supplying the service through the ECO is **not liable for registration** under Section 22(1) of the CGST Act (i.e. annual aggregate turnover does not exceed ₹20 Lakhs / ₹10 Lakhs in special category states).
- **If Host is Registered:** If the property host holds a valid active GSTIN, the host remains the taxable person liable to pay GST; Encho does NOT discharge Section 9(5) liability for registered hosts.

#### Technical Enforcement in Software:
1. `HostCreationForm` and `HostListingBuilder` mandate collecting:
   - Host GSTIN (15-character statutory format: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`), OR
   - Explicit declaration: *"My annual turnover is below the statutory GST threshold (₹20 Lakhs) and I am exempt from GST registration."*
2. If Host is unregistered:
   - Database flags `host_gst_status = 'UNREGISTERED'`.
   - Encho's tax engine routes stay GST to Encho’s GSTR-3B under Table 3.1.1(i).
3. If Host is registered:
   - Database flags `host_gst_status = 'REGISTERED'`.
   - Host issues tax invoice to guest; Encho reports supply in Table 3.1.1(ii).

---

### Section 2: Tax Collected at Source (TCS) under Section 52 CGST Act

#### Statutory Baseline:
Every electronic commerce operator (ECO) not being an agent, shall collect an amount calculated at the rate of **1%** (0.5% CGST + 0.5% SGST or 1% IGST) of the net value of taxable supplies made through it by other suppliers where the consideration with respect to such supplies is to be collected by the operator.
- **Registration Mandate:** Under Section 24(x) of the CGST Act, 2017, an ECO is required to obtain **mandatory registration** in every Indian State/UT where supplies are effected, irrespective of turnover threshold.
- **Filing Frequency:** Encho must file monthly statement in **Form GSTR-8** by the 10th of the succeeding month, depositing the collected TCS with the Government.

#### Technical Enforcement in Software:
1. `StaysCommerceEngine` calculates payout to host:
   $$\text{Net Payout} = \text{Base Price} - \text{Encho Commission (15\%)} - \text{TCS (1\% on Base Price)}$$
2. TCS ledger entries are written immutably into `platform_tax_withholding_ledger` with state-specific GSTIN tags.

---

### Section 3: Invoicing Architecture & Cancellation Credit Notes

#### Statutory Baseline:
Under Section 31 read with Section 34 of the CGST Act, 2017 and Rule 46 of the CGST Rules:
1. **Invoice Numbering:** Consecutive serial numbers, not exceeding 16 characters, unique for a financial year.
2. **Cancellation Credit Notes:** When a booking is cancelled and a refund is issued:
   - A Credit Note must be issued linking the original tax invoice number and date.
   - Tax liability must be adjusted in the return for the month in which the credit note is issued.

#### Technical Enforcement in Software:
1. Cancellation pipeline in `StaysCommerceEngine.cancelBooking()` triggers atomic issuance of:
   - Guest Refund Credit Note (reversing stay charge and GST).
   - Platform Fee Adjustment Note (reversing commission and commission GST).
2. Prevents double-accounting or irrecoverable tax leakage.

---

### Section 4: Advertising Engine Margin Tax Treatment (`COMM-01`)

#### Statutory Baseline:
Encho provides an optional managed advertising engine for hosts (Meta/Google ad campaigns).
- Under founder decision `HARVO-008/009`, host is charged:
  $$\text{Campaign Charge} = C \times (1 + p)$$
  where $C$ is the recognized ad spend and $p$ is the optimization markup (3–5%).
- **Tax Classification:** The optimization markup ($C \times p$) is classified as *Online Information and Database Access or Retrieval (OIDAR)* or *Advertising Agency Services* (SAC 998313).
- **GST Rate:** **18% GST** applies on the management fee ($C \times p$).
- The pure ad spend $C$ paid to Meta/Google is billed to Encho as business expense or disbursed as pure agent (subject to CA determination below).

---

## 4. Formal Questions for Chartered Accountant Sign-Off

The reviewing CA/Tax Counsel must review and confirm the following 5 questions:

| # | Statutory Question | Proposed Platform Posture | CA Confirmation (Agree / Modify) |
|---|---|---|---|
| **Q1** | Does Encho qualify as an E-Commerce Operator liable for GST under Section 9(5) for unregistered accommodation hosts? | **YES.** Encho discharges GST liability on stay amounts for hosts with turnover < ₹20L. | `[   ] AGREE   [   ] MODIFY` |
| **Q2** | Is 1% TCS deduction under Section 52 applicable on payouts to registered and unregistered hosts? | **YES.** 1% TCS deducted on net taxable supplies; Form GSTR-8 filed monthly. | `[   ] AGREE   [   ] MODIFY` |
| **Q3** | Is 18% GST applicable on the 15% booking commission charged by Encho to hosts? | **YES.** SAC 998311 / 998559; B2B Tax Invoice issued to hosts with 18% GST. | `[   ] AGREE   [   ] MODIFY` |
| **Q4** | Does the cancellation credit note workflow satisfy Section 34 CGST Act requirements for tax adjustment? | **YES.** Credit notes link original invoice UUID, date, and reverse proportional GST. | `[   ] AGREE   [   ] MODIFY` |
| **Q5** | Is the 3–5% AdTech optimization markup subject to 18% GST under SAC 998313? | **YES.** 18% GST charged on the markup fee portion; pure spend treated per agency contract. | `[   ] AGREE   [   ] MODIFY` |

---

## 5. Formal Sign-Off & Clearance Certificate

*(To be executed by the practicing Chartered Accountant / Tax Lawyer)*

```
================================================================================
           INDEPENDENT CHARTERED ACCOUNTANT TAX CLEARANCE CERTIFICATE
================================================================================

I / We have reviewed the business model, transactional flow, software architecture,
and statutory tax positions set forth in this Track 2 Statutory Tax Clearance
Memorandum for the platform "Encho" (Complete Release 1 - CR1).

Based on our examination of the CGST Act 2017, IGST Act 2017, and relevant rules
and notifications, I / we hereby certify that:
1. The proposed tax calculation and collection architecture complies with Indian GST laws.
2. The Section 9(5) and Section 52 TCS withholding models are correctly structured.
3. The platform may proceed with commercial checkout activation upon execution of this document.

Reviewing Chartered Accountant / Tax Counsel Details:

Full Name          : ___________________________________________________________

ICAI Membership No : ___________________________________________________________

Firm Name          : ___________________________________________________________

Firm Reg. No. (FRN): ___________________________________________________________

City / Jurisdiction: ___________________________________________________________

Date of Execution  : ____________________

UDIN (If applicable): ___________________________________________________________


Signature & Official Seal:

___________________________________________________________
[SEAL / STAMP]
================================================================================
```

---

## 6. Filing and Archival Protocol

1. Once physically or digitally signed with valid ICAI membership / UDIN, scan and archive the signed document at:
   `docs/harvo/receipts/INDIAN_TAX_LEGAL_CLEARANCE_OPINION.pdf`.
2. Update Gate `LEGAL-01` in `docs/implementation/CR1_EXTERNAL_GATE_REGISTER.md` to `CLOSED`.
3. Unlock package `P4.3` in `docs/implementation/CR1_EXECUTION_PLAN.md` to `COMPLETE`.
4. Only then may the production flag `STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE` be set to `false`.
