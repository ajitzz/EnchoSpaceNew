# HARVO — Express route map

M1 execution note: no public Express route was added or changed. Google provider method signatures remain internal; creation now requires the explicit Search input/configuration contract documented in [M1_VERIFICATION.md](M1_VERIFICATION.md). Live Google dispatch stays unconditionally contained; incomplete legacy requests no longer produce synthetic success.

Extracted from syntax trees without importing the server. Middleware lists show inline middleware only; presence or absence alone does not establish effective authorization. `app.get` setting lookups are excluded. Arrays and duplicate registrations are retained.

| Method | Route | Source | Inline middleware |
|---|---|---|---|
| GET | '/api/health/live' | [server.ts:940](../../server.ts#L940) |  |
| GET | '/privacy' | [server.ts:982](../../server.ts#L982) |  |
| GET | '/api/admin/integration-inspection' | [server.ts:1017](../../server.ts#L1017) |  |
| GET | '/api/admin/metrics' | [server.ts:1027](../../server.ts#L1027) | authenticateToken |
| GET | '/api/admin/alerts' | [server.ts:1035](../../server.ts#L1035) | authenticateToken |
| GET | '/api/health/ready' | [server.ts:1189](../../server.ts#L1189) |  |
| GET | '/api/encho/health' | [server.ts:1203](../../server.ts#L1203) |  |
| GET | '/api/config' | [server.ts:1256](../../server.ts#L1256) |  |
| GET | '/api/webhook/whatsapp' | [server.ts:1263](../../server.ts#L1263) |  |
| POST | '/api/webhook/whatsapp' | [server.ts:1335](../../server.ts#L1335) |  |
| GET | '/api' | [server.ts:3035](../../server.ts#L3035) |  |
| POST | '/api/auth/otp/send' | [server.ts:3059](../../server.ts#L3059) | otpLimiter |
| POST | '/api/auth/otp/verify' | [server.ts:3077](../../server.ts#L3077) |  |
| POST | '/api/auth/register' | [server.ts:3131](../../server.ts#L3131) | authLimiter |
| POST | '/api/auth/login' | [server.ts:3176](../../server.ts#L3176) | authLimiter |
| POST | '/api/auth/google' | [server.ts:3227](../../server.ts#L3227) |  |
| GET | '/api/auth/me' | [server.ts:3280](../../server.ts#L3280) | authenticateToken |
| GET | '/api/admin/settings/experience-hosts' | [server.ts:3306](../../server.ts#L3306) | authenticateToken |
| POST | '/api/admin/settings/experience-hosts' | [server.ts:3318](../../server.ts#L3318) | authenticateToken |
| GET | '/api/admin/reviews' | [server.ts:3330](../../server.ts#L3330) | authenticateToken |
| DELETE | '/api/admin/reviews/:id' | [server.ts:3352](../../server.ts#L3352) | authenticateToken |
| GET | '/api/admin/offers' | [server.ts:3375](../../server.ts#L3375) | authenticateToken |
| POST | '/api/admin/offers' | [server.ts:3386](../../server.ts#L3386) | authenticateToken |
| DELETE | '/api/admin/offers/:id' | [server.ts:3401](../../server.ts#L3401) | authenticateToken |
| GET | '/api/listings/:id/calendar' | [server.ts:3412](../../server.ts#L3412) |  |
| POST | '/api/listings/:id/calendar' | [server.ts:3429](../../server.ts#L3429) | authenticateToken |
| GET | '/api/listings/:id/room-calendar' | [server.ts:3466](../../server.ts#L3466) |  |
| POST | '/api/listings/:id/room-calendar/block' | [server.ts:3593](../../server.ts#L3593) | authenticateToken |
| DELETE | '/api/listings/:id/room-calendar/block/:blockId' | [server.ts:3693](../../server.ts#L3693) | authenticateToken |
| GET | '/api/admin/users' | [server.ts:3724](../../server.ts#L3724) | authenticateToken |
| DELETE | '/api/admin/users/:id' | [server.ts:3758](../../server.ts#L3758) | authenticateToken |
| GET | '/api/keep-alive' | [server.ts:3770](../../server.ts#L3770) |  |
| GET | '/api/seo' | [server.ts:3797](../../server.ts#L3797) |  |
| GET | '/api/health/db' | [server.ts:3899](../../server.ts#L3899) |  |
| POST | '/api/init-db' | [server.ts:3918](../../server.ts#L3918) |  |
| GET | '/api/image' | [server.ts:3937](../../server.ts#L3937) |  |
| POST | '/api/marketing/assets/resize' | [server.ts:4015](../../server.ts#L4015) | authenticateToken |
| PUT | '/api/mock-upload' | [server.ts:4049](../../server.ts#L4049) |  |
| PUT | '/api/upload-local' | [server.ts:4053](../../server.ts#L4053) | express.raw({ type: '*/*', limit: '50mb' }) |
| POST | '/api/upload-base64' | [server.ts:4072](../../server.ts#L4072) | authenticateToken, express.json({ limit: '50mb' }) |
| POST | '/api/upload-video-url' | [server.ts:4101](../../server.ts#L4101) | authenticateToken |
| GET | '/api/mux/upload/:uploadId' | [server.ts:4117](../../server.ts#L4117) | authenticateToken |
| POST | '/api/upload-url' | [server.ts:4134](../../server.ts#L4134) | authenticateToken |
| GET | '/api/admin/seo/:type/:id' | [server.ts:4172](../../server.ts#L4172) | authenticateToken |
| PUT | '/api/admin/seo/:type/:id' | [server.ts:4185](../../server.ts#L4185) | authenticateToken |
| PUT | '/api/listings/:id' | [server.ts:4204](../../server.ts#L4204) | authenticateToken |
| PATCH | '/api/admin/listings/:id/status' | [server.ts:4489](../../server.ts#L4489) | authenticateToken |
| PUT | '/api/listings/:id/rooms' | [server.ts:4530](../../server.ts#L4530) | authenticateToken |
| PATCH | '/api/admin/media-assets/:id/moderation' | [server.ts:4629](../../server.ts#L4629) | authenticateToken |
| POST | '/api/admin/backfill/room-media-authority' | [server.ts:4713](../../server.ts#L4713) | authenticateToken |
| PUT | '/api/listings/:id/mode' | [server.ts:4909](../../server.ts#L4909) | authenticateToken |
| GET | '/api/marketing/campaigns' | [server.ts:5255](../../server.ts#L5255) | authenticateToken |
| GET | '/api/marketing/analytics' | [server.ts:5289](../../server.ts#L5289) | authenticateToken |
| GET | '/api/marketing/campaigns/:id/control-center', '/api/marketing/campaigns/:id/telemetry' | [server.ts:5347](../../server.ts#L5347) | authenticateToken |
| GET | '/api/admin/marketing/campaigns/:id/control-center', '/api/admin/campaigns/:id/control-center' | [server.ts:5377](../../server.ts#L5377) | authenticateToken |
| GET | '/api/marketing/campaigns/:id/analytics' | [server.ts:5409](../../server.ts#L5409) | authenticateToken |
| GET | '/api/marketing/campaigns/:id/analytics/performance' | [server.ts:5478](../../server.ts#L5478) | authenticateToken |
| GET | '/api/marketing/campaigns/:id/analytics/funnel' | [server.ts:5505](../../server.ts#L5505) | authenticateToken |
| GET | '/api/marketing/campaigns/:id/analytics/anomalies' | [server.ts:5530](../../server.ts#L5530) | authenticateToken |
| GET | '/api/marketing/campaigns/:id/report/pdf' | [server.ts:5560](../../server.ts#L5560) | authenticateToken |
| GET | '/api/admin/marketing/analytics/portfolio' | [server.ts:5591](../../server.ts#L5591) | authenticateToken |
| POST | '/api/marketing/leads/webhook' | [server.ts:5619](../../server.ts#L5619) |  |
| GET | '/api/marketing/leads' | [server.ts:5657](../../server.ts#L5657) | authenticateToken |
| GET | '/api/marketing/leads/:id' | [server.ts:5682](../../server.ts#L5682) | authenticateToken |
| PATCH | '/api/marketing/leads/:id/status' | [server.ts:5707](../../server.ts#L5707) | authenticateToken |
| POST | '/api/marketing/leads/:id/message' | [server.ts:5736](../../server.ts#L5736) | authenticateToken |
| POST | '/api/admin/marketing/leads/notifications/process' | [server.ts:5802](../../server.ts#L5802) | authenticateToken |
| GET | '/api/admin/marketing/leads/health' | [server.ts:5819](../../server.ts#L5819) | authenticateToken |
| POST | '/api/marketing/pre-flight-check' | [server.ts:5835](../../server.ts#L5835) | authenticateToken |
| GET | '/api/marketing/campaigns/:id/preflight' | [server.ts:5891](../../server.ts#L5891) | authenticateToken |
| POST | '/api/marketing/copilot' | [server.ts:5948](../../server.ts#L5948) | authenticateToken |
| POST | '/api/marketing/campaigns' | [server.ts:6117](../../server.ts#L6117) | authenticateToken |
| POST | '/api/telemetry/pixel-event' | [server.ts:6184](../../server.ts#L6184) |  |
| POST | '/api/marketing/campaigns/:id/sync-pricing' | [server.ts:6213](../../server.ts#L6213) | authenticateToken |
| GET | '/api/marketing/campaigns/:id/pricing-history' | [server.ts:6226](../../server.ts#L6226) | authenticateToken |
| PUT | '/api/marketing/campaigns/:id' | [server.ts:6240](../../server.ts#L6240) | authenticateToken |
| DELETE | '/api/marketing/campaigns/:id' | [server.ts:6416](../../server.ts#L6416) | authenticateToken |
| GET | '/api/host/social-posts' | [server.ts:6445](../../server.ts#L6445) | authenticateToken |
| POST | '/api/host/social-posts/generate-caption' | [server.ts:6463](../../server.ts#L6463) | authenticateToken |
| POST | '/api/host/social-posts' | [server.ts:6601](../../server.ts#L6601) | authenticateToken |
| POST | '/api/host/social-posts/:id/boost' | [server.ts:6678](../../server.ts#L6678) | authenticateToken |
| DELETE | '/api/host/social-posts/:id' | [server.ts:6742](../../server.ts#L6742) | authenticateToken |
| GET | '/api/admin/social-posts' | [server.ts:6761](../../server.ts#L6761) | authenticateToken |
| POST | '/api/admin/social-posts/:id/approve' | [server.ts:6949](../../server.ts#L6949) | authenticateToken |
| POST | '/api/admin/social-posts/:id/reject' | [server.ts:7037](../../server.ts#L7037) | authenticateToken |
| GET | '/api/listings/:id/social-posts' | [server.ts:7083](../../server.ts#L7083) |  |
| POST | '/api/marketing/assets/upload' | [server.ts:7111](../../server.ts#L7111) | authenticateToken, upload.single('media') |
| POST | '/api/marketing/social/publish' | [server.ts:7131](../../server.ts#L7131) | authenticateToken, idempotencyMiddleware |
| POST | '/api/marketing/campaigns/:id/ai-check' | [server.ts:7168](../../server.ts#L7168) | authenticateToken, aiGatekeeperLimiter |
| POST | '/api/marketing/campaigns/:id/sync-meta' | [server.ts:7382](../../server.ts#L7382) | authenticateToken |
| GET | '/api/marketing/recommend-targeting' | [server.ts:7461](../../server.ts#L7461) | authenticateToken |
| POST | '/api/marketing/grade-targeting' | [server.ts:7548](../../server.ts#L7548) | authenticateToken, aiGatekeeperLimiter |
| POST | '/api/marketing/ai-generate-copy' | [server.ts:7639](../../server.ts#L7639) | authenticateToken, aiGatekeeperLimiter |
| GET | '/api/marketing/campaigns/:id/leads' | [server.ts:7836](../../server.ts#L7836) | authenticateToken |
| POST | '/api/marketing/leads/:leadId/convert-booking' | [server.ts:8058](../../server.ts#L8058) | authenticateToken |
| POST | '/api/marketing/leads/:leadId/message' | [server.ts:8157](../../server.ts#L8157) | authenticateToken |
| POST | '/api/payments/webhook' | [server.ts:11520](../../server.ts#L11520) |  |
| GET | '/api/webhooks/meta' | [server.ts:11712](../../server.ts#L11712) |  |
| POST | '/api/webhooks/meta' | [server.ts:11763](../../server.ts#L11763) | verifyMetaWebhook |
| POST | '/api/webhooks/ad-network' | [server.ts:11787](../../server.ts#L11787) | verifyMetaWebhook |
| POST | '/api/marketing/campaigns/:id/subscribe' | [server.ts:11955](../../server.ts#L11955) | authenticateToken |
| GET | '/api/marketing/campaigns/:id/invoice' | [server.ts:12269](../../server.ts#L12269) | authenticateToken |
| POST | '/api/marketing/campaigns/:id/pacing' | [server.ts:12346](../../server.ts#L12346) | authenticateToken |
| GET | '/api/admin/marketing/campaigns/:id/traces' | [server.ts:12413](../../server.ts#L12413) | authenticateToken |
| GET | '/api/admin/marketing/dashboard/stats' | [server.ts:12433](../../server.ts#L12433) | authenticateToken |
| GET | '/api/admin/marketing/dlq' | [server.ts:12499](../../server.ts#L12499) | authenticateToken |
| POST | '/api/admin/marketing/replay/:transactionId' | [server.ts:12520](../../server.ts#L12520) | authenticateToken |
| GET | '/api/admin/marketing/health' | [server.ts:12561](../../server.ts#L12561) | authenticateToken |
| POST | '/api/admin/marketing/kill-switch' | [server.ts:12614](../../server.ts#L12614) | authenticateToken |
| GET | '/api/admin/marketing/transactions/:id/traces' | [server.ts:12636](../../server.ts#L12636) | authenticateToken |
| POST | '/api/admin/marketing/dlq/resolve/:id' | [server.ts:12659](../../server.ts#L12659) | authenticateToken |
| POST | '/api/admin/marketing/rollback/:metaId' | [server.ts:12679](../../server.ts#L12679) | authenticateToken |
| GET | '/api/admin/marketing/transactions' | [server.ts:12705](../../server.ts#L12705) | authenticateToken |
| GET | '/api/admin/marketing/campaigns' | [server.ts:12726](../../server.ts#L12726) | authenticateToken |
| POST | '/api/admin/marketing/campaigns/:id/approve' | [server.ts:12761](../../server.ts#L12761) | authenticateToken |
| POST | '/api/admin/marketing/campaigns/:id/resync-meta' | [server.ts:12885](../../server.ts#L12885) | authenticateToken |
| POST | '/api/marketing/campaigns/:id/sync-telemetry' | [server.ts:12929](../../server.ts#L12929) | authenticateToken |
| POST | '/api/marketing/campaigns/:id/sync-engagement' | [server.ts:12953](../../server.ts#L12953) | authenticateToken |
| POST | '/api/admin/marketing/campaigns/:id/reject' | [server.ts:12977](../../server.ts#L12977) | authenticateToken |
| POST | '/api/marketing/campaigns/:id/action-preview', '/api/admin/marketing/campaigns/:id/action-preview', '/api/admin/campaigns/:id/action-preview' | [server.ts:13021](../../server.ts#L13021) | authenticateToken |
| POST | '/api/marketing/campaigns/:id/pause', '/api/admin/marketing/campaigns/:id/pause', '/api/admin/campaigns/:id/pause', '/api/admin/marketing/campaigns/:id/pause-meta' | [server.ts:13051](../../server.ts#L13051) | authenticateToken |
| POST | '/api/admin/marketing/campaigns/:id/emergency-pause', '/api/admin/campaigns/:id/emergency-pause' | [server.ts:13101](../../server.ts#L13101) | authenticateToken |
| POST | '/api/marketing/campaigns/:id/resume', '/api/admin/marketing/campaigns/:id/resume', '/api/admin/campaigns/:id/resume', '/api/admin/marketing/campaigns/:id/resume-meta' | [server.ts:13137](../../server.ts#L13137) | authenticateToken |
| POST | '/api/marketing/campaigns/:id/resync', '/api/admin/marketing/campaigns/:id/resync', '/api/admin/campaigns/:id/resync', '/api/admin/marketing/campaigns/:id/resync-meta' | [server.ts:13187](../../server.ts#L13187) | authenticateToken |
| POST | '/api/admin/marketing/campaigns/:id/reconcile', '/api/admin/campaigns/:id/reconcile' | [server.ts:13217](../../server.ts#L13217) | authenticateToken |
| POST | '/api/admin/marketing/campaigns/:id/objects/:objectType/:objectId/status', '/api/admin/campaigns/:id/objects/:objectType/:objectId/status' | [server.ts:13249](../../server.ts#L13249) | authenticateToken |
| POST | '/api/admin/marketing/campaigns/:id/kill-meta' | [server.ts:13299](../../server.ts#L13299) | authenticateToken |
| POST | '/api/marketing/campaigns/:id/cancel' | [server.ts:13356](../../server.ts#L13356) | authenticateToken |
| POST | '/api/admin/marketing/campaigns/:id/activate' | [server.ts:13399](../../server.ts#L13399) | authenticateToken |
| POST | '/api/marketing/campaigns/:id/activate' | [server.ts:13412](../../server.ts#L13412) | authenticateToken |
| GET | '/api/admin/audit-logs' | [server.ts:13428](../../server.ts#L13428) | authenticateToken |
| POST | '/api/marketing/threads/:id/score-intent' | [server.ts:13459](../../server.ts#L13459) | authenticateToken |
| GET | '/api/admin/outreach-leads' | [server.ts:13509](../../server.ts#L13509) | authenticateToken |
| POST | '/api/admin/outreach-leads' | [server.ts:13529](../../server.ts#L13529) | authenticateToken |
| PUT | '/api/admin/outreach-leads/:id' | [server.ts:13549](../../server.ts#L13549) | authenticateToken |
| DELETE | '/api/admin/outreach-leads/:id' | [server.ts:13588](../../server.ts#L13588) | authenticateToken |
| GET | '/api/listings/draft/:id' | [server.ts:13605](../../server.ts#L13605) | authenticateToken |
| POST | '/api/listings/draft' | [server.ts:13616](../../server.ts#L13616) | authenticateToken |
| POST | '/api/admin/listings/draft/:id/approve' | [server.ts:13641](../../server.ts#L13641) | authenticateToken |
| POST | '/api/listings' | [server.ts:13863](../../server.ts#L13863) | authenticateToken |
| GET | '/api/wishlist' | [server.ts:14023](../../server.ts#L14023) | authenticateToken |
| GET | '/api/wishlists' | [server.ts:14024](../../server.ts#L14024) | authenticateToken |
| POST | '/api/wishlists' | [server.ts:14071](../../server.ts#L14071) | authenticateToken |
| DELETE | '/api/wishlists/:listingId' | [server.ts:14096](../../server.ts#L14096) | authenticateToken |
| GET | '/api/experience-wishlists' | [server.ts:14120](../../server.ts#L14120) | authenticateToken |
| POST | '/api/experience-wishlists' | [server.ts:14137](../../server.ts#L14137) | authenticateToken |
| DELETE | '/api/experience-wishlists/:experienceId' | [server.ts:14162](../../server.ts#L14162) | authenticateToken |
| GET | '/api/listings/:id/can-review' | [server.ts:14181](../../server.ts#L14181) | authenticateToken |
| GET | '/api/listings/:id/reviews' | [server.ts:14202](../../server.ts#L14202) |  |
| POST | '/api/listings/:id/reviews' | [server.ts:14219](../../server.ts#L14219) | authenticateToken |
| GET | '/api/v2/stays/:propertySlug' | [server.ts:14246](../../server.ts#L14246) |  |
| POST | '/api/v2/stays/holds' | [server.ts:14381](../../server.ts#L14381) | holdsRateLimiter |
| POST | '/api/v2/stays/holds/:id/release' | [server.ts:14459](../../server.ts#L14459) |  |
| GET | '/api/v2/stays/holds/config' | [server.ts:14511](../../server.ts#L14511) |  |
| GET | '/listing/:id', '/listings/:id' | [server.ts:14520](../../server.ts#L14520) |  |
| GET | '/api/listings/:id' | [server.ts:14549](../../server.ts#L14549) |  |
| GET | '/api/listings' | [server.ts:14645](../../server.ts#L14645) |  |
| GET | '/api/host/reservations' | [server.ts:14948](../../server.ts#L14948) | authenticateToken |
| PUT | '/api/host/reservations/:id/status' | [server.ts:15032](../../server.ts#L15032) | authenticateToken |
| GET | '/api/threads' | [server.ts:15119](../../server.ts#L15119) | authenticateToken |
| POST | '/api/threads' | [server.ts:15188](../../server.ts#L15188) | authenticateToken |
| GET | '/api/threads/:id/messages' | [server.ts:15263](../../server.ts#L15263) | authenticateToken |
| POST | '/api/threads/:id/messages' | [server.ts:15296](../../server.ts#L15296) | authenticateToken, messageLimiter |
| GET | '/api/unread-counts' | [server.ts:15367](../../server.ts#L15367) | authenticateToken |
| GET | '/api/messages/:bookingId' | [server.ts:15388](../../server.ts#L15388) | authenticateToken |
| POST | '/api/messages' | [server.ts:15417](../../server.ts#L15417) | authenticateToken, messageLimiter |
| DELETE | '/api/listings/:id' | [server.ts:15481](../../server.ts#L15481) | authenticateToken |
| GET | '/api/admin/metrics' | [server.ts:15511](../../server.ts#L15511) | authenticateToken |
| GET | '/api/admin/threads' | [server.ts:15610](../../server.ts#L15610) | authenticateToken |
| DELETE | '/api/admin/messages/:id' | [server.ts:15648](../../server.ts#L15648) | authenticateToken |
| GET | '/api/admin/threads/:id/messages' | [server.ts:15659](../../server.ts#L15659) | authenticateToken |
| POST | '/api/ai/suggest-price' | [server.ts:15676](../../server.ts#L15676) | authenticateToken |
| POST | '/api/ai/suggest-reply' | [server.ts:15728](../../server.ts#L15728) | authenticateToken |
| POST | '/api/ai/suggest-listing' | [server.ts:15769](../../server.ts#L15769) | authenticateToken |
| POST | '/api/ai/curate-rules' | [server.ts:15819](../../server.ts#L15819) |  |
| POST | '/api/ai/radar-scan' | [server.ts:15867](../../server.ts#L15867) |  |
| POST | '/api/ai/suggest-sensory-tags' | [server.ts:16037](../../server.ts#L16037) |  |
| POST | '/api/ai/evaluate-listing' | [server.ts:16121](../../server.ts#L16121) | authenticateToken |
| POST | '/api/ai/nearby-pois' | [server.ts:16217](../../server.ts#L16217) | authenticateToken |
| POST | '/api/leads/soft-exit' | [server.ts:16264](../../server.ts#L16264) |  |
| GET | '/api/host/soft-leads' | [server.ts:16296](../../server.ts#L16296) | authenticateToken |
| PUT | '/api/user/profile' | [server.ts:16316](../../server.ts#L16316) | authenticateToken |
| GET | '/api/user/bookings' | [server.ts:16334](../../server.ts#L16334) | authenticateToken |
| PUT | '/api/user/bookings/:id/cancel' | [server.ts:16402](../../server.ts#L16402) | authenticateToken |
| POST | '/api/bookings' | [server.ts:16450](../../server.ts#L16450) | authenticateToken, bookingLimiter |
| GET | '/api/settings/whatsapp' | [server.ts:16753](../../server.ts#L16753) |  |
| POST | '/api/settings/whatsapp' | [server.ts:16770](../../server.ts#L16770) | authenticateToken |
| GET | '/api/settings/experiences_page' | [server.ts:16787](../../server.ts#L16787) |  |
| POST | '/api/settings/experiences_page' | [server.ts:16810](../../server.ts#L16810) | authenticateToken |
| GET | '/api/settings/call' | [server.ts:16831](../../server.ts#L16831) |  |
| POST | '/api/settings/call' | [server.ts:16848](../../server.ts#L16848) | authenticateToken |
| GET | '/api/settings/demo_properties' | [server.ts:16865](../../server.ts#L16865) |  |
| POST | '/api/settings/demo_properties' | [server.ts:16883](../../server.ts#L16883) | authenticateToken |
| GET | '/api/seed-ajith' | [server.ts:16995](../../server.ts#L16995) | authenticateToken |
| GET | '/api/experiences' | [server.ts:17050](../../server.ts#L17050) |  |
| GET | '/api/experiences/seed' | [server.ts:17104](../../server.ts#L17104) | authenticateToken |
| POST | '/api/experiences' | [server.ts:17192](../../server.ts#L17192) | authenticateToken |
| PUT | '/api/experiences/:id' | [server.ts:17223](../../server.ts#L17223) | authenticateToken |
| DELETE | '/api/experiences/:id' | [server.ts:17267](../../server.ts#L17267) | authenticateToken |
| GET | '/api/experiences/:id/reviews' | [server.ts:17300](../../server.ts#L17300) |  |
| GET | '/api/experiences/:id/reviews/eligible' | [server.ts:17323](../../server.ts#L17323) | authenticateToken |
| POST | '/api/experiences/:id/reviews' | [server.ts:17339](../../server.ts#L17339) | authenticateToken |
| GET | '/api/experiences/:id/videos' | [server.ts:17376](../../server.ts#L17376) |  |
| POST | '/api/experiences/:id/videos' | [server.ts:17395](../../server.ts#L17395) | authenticateToken |
| POST | '/api/experiences/videos/:id/like' | [server.ts:17421](../../server.ts#L17421) |  |
| GET | '/api/experiences/:id/lobby/participants' | [server.ts:17441](../../server.ts#L17441) | authenticateToken |
| GET | '/api/experiences/:id/lobby/messages' | [server.ts:17482](../../server.ts#L17482) | authenticateToken |
| POST | '/api/experiences/:id/lobby/messages' | [server.ts:17523](../../server.ts#L17523) | authenticateToken |
| POST | '/api/experience-bookings' | [server.ts:17574](../../server.ts#L17574) | authenticateToken, bookingLimiter |
| GET | '/api/experience-bookings' | [server.ts:17615](../../server.ts#L17615) | authenticateToken |
| PUT | '/api/user/experience-bookings/:id/cancel' | [server.ts:17632](../../server.ts#L17632) | authenticateToken |
| GET | '/api/admin/experience-bookings' | [server.ts:17673](../../server.ts#L17673) | authenticateToken |
| GET | '/api/settings/payment_rates' | [server.ts:17693](../../server.ts#L17693) |  |
| POST | '/api/settings/payment_rates' | [server.ts:17711](../../server.ts#L17711) | authenticateToken |
| POST | '/api/create-payment-intent' | [server.ts:17735](../../server.ts#L17735) | authenticateToken |
| GET | '/api/marketing/ledger' | [server.ts:17825](../../server.ts#L17825) | authenticateToken |
| GET | '/api/marketing/admin/ledgers' | [server.ts:17854](../../server.ts#L17854) | authenticateToken |
| GET | '/api/marketing/wallet' | [server.ts:17916](../../server.ts#L17916) | authenticateToken |
| POST | '/api/marketing/meta/webhooks', '/api/meta-webhooks' | [server.ts:17977](../../server.ts#L17977) | verifyMetaWebhook |
| POST | '/api/marketing/wallet/refuel' | [server.ts:18076](../../server.ts#L18076) | authenticateToken |
| POST | '/api/marketing/simulate-webhook' | [server.ts:18186](../../server.ts#L18186) | authenticateToken |
| POST | '/api/checkout/razorpay/order' | [server.ts:18237](../../server.ts#L18237) | optionalAuthenticateToken |
| POST | '/api/payments/razorpay/verify' | [server.ts:18401](../../server.ts#L18401) |  |
| GET | '/api/payments/geo-route/detect' | [server.ts:18599](../../server.ts#L18599) |  |
| POST | '/api/payments/geo-route/initiate' | [server.ts:18656](../../server.ts#L18656) |  |
| GET | '/api/admin/payments/overview' | [server.ts:18924](../../server.ts#L18924) |  |
| POST | '/api/admin/payments/escrow/release' | [server.ts:18978](../../server.ts#L18978) |  |
| POST | '/api/marketing/webhooks/meta-leads' | [server.ts:19188](../../server.ts#L19188) | verifyMetaWebhook |
| POST | '/api/marketing/track/view' | [server.ts:20555](../../server.ts#L20555) |  |
| POST | '/api/marketing/track/interaction' | [server.ts:20582](../../server.ts#L20582) |  |
| POST | '/api/marketing/pixel' | [server.ts:20594](../../server.ts#L20594) |  |
| GET | '/healthz' | [worker.ts:490](../../worker.ts#L490) |  |

## Duplicate registrations

- GET '/api/admin/metrics': server.ts:1027, server.ts:15511
- POST '/api/admin/marketing/campaigns/:id/resync-meta': server.ts:12885, server.ts:13187

## Current additive HARVO v2 contract (13 September 2026)

Base `/api/marketing/v2`; authenticated persisted role and row ownership on every request. `/workspace`, `/admin/workspace`, `/campaigns/:id`, `/events`, `/advice` are read projections; expired AI leases may be recovered with an audit event. `/admin/operations` exposes bounded queue/exception summaries. No raw payment/lead body, master token or another host's records are projected.

Mutations: POST `/campaigns` with an Idempotency-Key; PATCH `/campaigns/:id` with exact revision and new draft; POST actions `/evaluate`, `/submit`, `/quote`, `/fund`, `/review`, `/publish`, `/activate`, `/pause`, `/refresh` with the documented revision/key where applicable. `/refund` requires revision, decimal minor-unit amount, meaningful reason and Idempotency-Key; 202 REQUESTED is an obligation and job, not a completed refund. Admin-only `/admin/policy` edits prospective 3–5% markup using expectedVersion and reason. Unknown input fields are rejected at authority boundaries.

Dedicated raw-body signed ingress `/api/webhooks/marketing/v2/:provider` supports Stripe, Razorpay and Meta; Meta also supports GET subscription verification. The worker re-fetches authoritative provider state. Legacy dangerous paid routes return explicit retirement errors instead of bypassing v2. See the runbook for deployment prerequisites and unsupported live adapters.

`POST /campaigns/:id/cancel` requires revision, reason and Idempotency-Key. Only proof of no provider submission permits local reserve release; return value is the projected CANCELLED campaign. Existing gateway payment requests are not assumed void.
