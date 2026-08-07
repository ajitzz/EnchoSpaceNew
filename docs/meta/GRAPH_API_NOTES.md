# Meta Graph API Notes
- **Idempotency**: Always use `idempotency_key` header when creating AdSets or Campaigns to prevent double-spending.
- **Rate Limits**: Graph API is subject to Business Use Case rate limiting. Implement exponential backoff for 4-xx responses.
- **Version**: Encho standardizes on Graph API v19.0.
