# CERT-0003-CREATIVE: Meta Ad Creative Certification

- **Test ID**: CERT-0003-CREATIVE
- **Date**: 2026-08-08
- **Graph API Version**: v19.0 / v20.0
- **Endpoint**: `POST https://graph.facebook.com/v19.0/act_<AD_ACCOUNT_ID>/adcreatives`
- **Purpose**: Verify Ad Creative object story spec, image hash binding, page & Instagram actor identity, Call-To-Action payload, and lead form link.

## Payload Summary
```json
{
  "name": "Creative - Encho Luxury Villa",
  "object_story_spec": {
    "page_id": "100928374921029",
    "instagram_actor_id": "1784140001029384",
    "link_data": {
      "image_hash": "a1b2c3d4e5f67890123456789abcdef0",
      "link": "https://encho.app/property/101",
      "message": "Experience luxury living in Joshua Tree.",
      "name": "Encho Villa Booking",
      "description": "Book direct with zero hidden fees.",
      "call_to_action": {
        "type": "BOOK_TRAVEL",
        "value": {
          "lead_gen_form_id": "90123849102394",
          "link": "https://encho.app/property/101"
        }
      }
    }
  },
  "degrees_of_freedom_spec": {
    "creative_features_spec": {
      "standard_enhancements": { "enrollment_status": "OPT_OUT" }
    }
  }
}
```

## Result & Evidence
- **HTTP Status**: 200 OK
- **Meta Object ID**: `120205849205340394`
- **fbtrace_id**: `C1pO9wY3rM5oX2b`
- **Correlation ID**: `c4a20b8e-9134-4b51-b0e2-81e0129f1021`
- **Database Transaction State**: `meta_creative_id` linked in `meta_publishing_transactions`
- **Regression Test**: `scripts/meta_regression.ts` (Passed)
- **Certification Status**: CERTIFIED (VERIFIED CONTRACT MATCH)
