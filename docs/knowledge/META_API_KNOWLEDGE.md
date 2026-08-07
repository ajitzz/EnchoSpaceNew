# META_API_KNOWLEDGE

This document contains the engineering knowledge base for META_API_KNOWLEDGE.
Please refer to `README.md` in this directory for the knowledge entry format.


## Knowledge ID
KB-0001

---
### Topic
Meta Ad Set & Creative Validation Errors (Housing & Lead Gen)

---
### Problem
Ad Set creation failed with `Invalid parameter` and Creative creation failed with `(#100) Param instagram_actor_id must be a valid Instagram account id`.

---
### Symptoms
Campaign publish pipeline fails at `adset_creation` or `creative_creation`, returning a fatal error.

---
### Root Cause
1. **Ad Set**: `optimization_goal: 'LEAD_GENERATION'` requires `promoted_object: { page_id: <page_id> }`.
2. **Ad Set**: Special Ad Category (HOUSING) forbids demographic parameters. Including `age_min`, `age_max`, and `genders` triggers an invalid parameter error.
3. **Creative**: Invalid `instagram_actor_id` causes OAuthException #100.

---
### Investigation
See `/docs/knowledge/KB-0001-META-FORENSIC-REPORT.md`.

---
### Solution
1. Added `promoted_object: { page_id: pageId }` to the `adSetPayload`.
2. Removed `age_min`, `age_max`, and `genders` from the `targeting` block.
3. Removed `instagram_actor_id` injection from `creativePayload` (uses Page-backed IG ads).

---
### Verification
Pipeline successfully publishes Campaign -> Ad Set -> Creative -> Ad.

---
### Regression Risks
Low.

---
### Related Files
- `server.ts`

---
### Related ADR
N/A

---
### Related Incident
INC-META-001

---
### Last Verified
2026-08-07

---
### Status
Verified
