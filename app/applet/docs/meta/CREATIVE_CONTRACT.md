# CREATIVE CONTRACT SPECIFICATION

**Document ID:** `CREATIVE_CONTRACT.md`  
**Date:** 2026-08-10  
**Status:** AUTHORITATIVE SPECIFICATION  
**Target:** Meta Graph API Ad Creative & Payload Validator  

---

## 1. SUPPORTED CREATIVE PAYLOAD FIELDS

| Field Name | Type | Source | Required | Validation Rules | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `access_token` | `string` | System Env | Yes | Valid long-lived system token | Meta API authentication |
| `name` | `string` | Campaign Title | Yes | Max 255 chars, sanitized | Internal Meta creative label |
| `page_id` | `string` | System Env | Yes | Digits only, validated in Gate 14 | Facebook Page association |
| `image_hash` | `string` | Meta AdImages API | Yes | 32-char hex string returned by Meta | Media asset reference |
| `link` | `string` | Listing URL | Yes | Must be HTTPS URL | Landing page destination |
| `message` | `string` | Campaign Feed Desc | Yes | Sanitized text, no banned claims | Primary ad body text |
| `headline` | `string` | Ad Title | Yes | Max 125 chars | Primary ad title |
| `description` | `string` | Listing Desc | Yes | Max 250 chars | Feed link description |
| `call_to_action` | `object` | Fixed | Yes | `type: 'BOOK_TRAVEL'`, value: `{ link }` | Action button |

---

## 2. BANNED / DEPRECATED FIELDS & SYNTHETIC INPUTS

- **No Synthetic Lead Form IDs:** Never pass unverified `lead_form_id` or mock form strings.
- **No Invalid Instagram Actors:** Only pass `instagram_actor_id` if verified in Gate 14.
- **No Hardcoded Development Placeholders:** All destination URLs must point to real property listing endpoints.
- **No Unsupported CTA Types:** Only use Meta-approved CTA types (`BOOK_TRAVEL`, `LEARN_MORE`, `CONTACT_US`).

---

## 3. CREATIVE SANITIZATION ENGINE

Before submitting `object_story_spec.link_data.message`:
1. **Contact Information Masking:** Automatically redacts phone numbers, email addresses, WhatsApp links, and external URL leaks to maintain walled garden integrity.
2. **Special Category Compliance:** Ensures text contains no housing-discriminatory language (Housing Special Ad Category enforced).
