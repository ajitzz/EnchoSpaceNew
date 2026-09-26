import http from 'http';
import path from 'path';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import hpp from 'hpp';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';

import { pool, readPool, rlsStorage, isDbConfigured, installPoolIsolation } from './src/server/db/connection.js';
import { PORT, JWT_SECRET, setGlobalIoInstance, razorpay } from './src/server/config/clients.js';
import { ensureDbInitialized } from './src/server/db/bootstrap.js';
import { authenticateToken, requireAdmin, apiLimiter, AuthRequest } from './src/server/middleware/auth.js';
import { startLegacyBackgroundWorkers } from './src/server/services/legacyMarketingEngine.js';

import { createStaysCommerceRouter } from './src/server/stays/staysCommerceRouter.js';
import { createCreativePackageRouter } from './src/server/marketing/creativePackageRouter.js';
import { createCircuitBreakerRouter } from './src/server/marketing/circuitBreakerRouter.js';
import { createFeederCorridorRouter } from './src/server/marketing/feederCorridorRouter.js';
import { createDatabaseSecurityRouter } from './src/server/marketing/databaseSecurityRouter.js';
import { createCanaryCertificationRouter } from './src/server/marketing/canaryCertificationRouter.js';
import { createMarketingRouter, marketingErrorHandler } from './src/server/marketing/router.js';
import { createMeasurementRouter } from './src/server/marketing/measurementRouter.js';
import { createParticipantServiceRouter, createStaffServiceRouter } from './src/server/conversations/serviceRouter.js';
import { createWorkforceSessionRouter } from './src/server/operations/sessionRouter.js';
import { createWorkforceSessionRuntime } from './src/server/operations/sessionRuntime.js';
import { createOperationsRouter } from './src/server/operations/router.js';
import { createOperationsRuntime, workforceOrigin } from './src/server/operations/runtime.js';
import { createAdminWorkforceRouter } from './src/server/admin/workforceRouter.js';
import { registerCalendarRoutes } from './src/server/calendar.js';
import { registerSecureRealtime } from './src/server/realtime.js';
import { createDeployedMarketingRuntime } from './src/server/marketing/runtime.js';
import { legacyMarketingBoundary } from './src/server/marketing/legacyBoundary.js';
import { createServiceCaseRuntime } from './src/server/conversations/serviceRuntime.js';
import { createShutdown, drainHttpServer, isProcessEntry } from './src/server/deployment/lifecycle.js';
import { createPublicAssetsMiddleware } from './src/server/deployment/staticAssets.js';
import { databaseReadiness } from './src/server/deployment/databaseReadiness.js';
import { originAllowed } from './src/server/deployment/origins.js';
import { resolvePersistedSession } from './src/lib/marketing/legacyAuthorization.js';
import { startConversationNotifications } from './src/server/conversation/notificationRuntime.js';
import { createHttpExecutionContextMiddleware } from './src/server/observability/httpExecutionContext.js';
import { StructuredLogger } from './src/lib/observability/structuredLogger.js';
import { MetricsRegistry } from './src/lib/observability/metricsRegistry.js';
import { idempotencyMiddleware } from './src/lib/idempotency.js';
import { integrationInspectionMiddleware, printStartupIntegrationReport } from './src/lib/integrationInspector.js';

import { crmRouter } from './src/server/routes/crm.router.js';
import { webhooksRouter } from './src/server/routes/webhooks.router.js';
import { listingsRouter } from './src/server/routes/listings.router.js';
import { operationsLegacyRouter } from './src/server/routes/operations.router.js';
import { legacyMarketingRouter } from './src/server/routes/legacyMarketing.router.js';

const app = express();
app.set('trust proxy', 1);

const helmetCommon = {
  defaultSrc: ["'self'"],
  mediaSrc: ["'self'", "https:", "blob:", "data:"],
  connectSrc: ["'self'", "https://api.razorpay.com", "https://api.stripe.com", "https://maps.googleapis.com", "https://*.googleapis.com", "https://*.google.com", "https://*.gstatic.com", "https://va.vercel-scripts.com", "https://*.vercel.live", "https://*.neon.tech", "https://generativelanguage.googleapis.com", "wss:", "ws:"],
  scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", "https://checkout.razorpay.com", "https://js.stripe.com", "https://maps.googleapis.com", "https://*.googleapis.com", "https://accounts.google.com", "https://va.vercel-scripts.com", "https://unpkg.com", "https://*.vercel.live", "https://www.gstatic.com", "https://*.gstatic.com"],
  workerSrc: ["'self'", "blob:", "data:"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com", "https://js.stripe.com", "https://hooks.stripe.com"],
  frameAncestors: ["'self'"]
};
const productionHelmet = helmet({
  contentSecurityPolicy: { directives: helmetCommon },
  frameguard: { action: 'sameorigin' as const },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
});
const devHelmet = helmet({
  contentSecurityPolicy: { directives: { ...helmetCommon, defaultSrc: ["'self'", "*"], connectSrc: ["'self'", "*", "https:", "http:", "wss:", "ws:", "blob:", "data:"], frameAncestors: ["*"] } },
  frameguard: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" }
});

app.use((req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  return (isProd || process.env.ENABLE_PREVIEW_EMBED !== 'true') ? productionHelmet(req, res, next) : devHelmet(req, res, next);
});

app.use(cors({ origin: (origin, callback) => callback(originAllowed(origin) ? null : new Error('Blocked by CORS policy: origin is not permitted'), originAllowed(origin)), credentials: true }));
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err && typeof err.message === 'string' && err.message.startsWith('Blocked by CORS policy')) return res.status(403).json({ error: err.message });
  next(err);
});

app.use(morgan('combined', { skip: (req) => req.path === '/api/health' || req.path.startsWith('/assets/') }));
app.use(createHttpExecutionContextMiddleware({
  onFinish: ({ request, response, context, durationMs }) => {
    MetricsRegistry.recordApiRequest(request.method, request.route?.path || request.path, response.statusCode, durationMs);
    if (response.statusCode >= 500) {
      StructuredLogger.error(`[API 5XX] ${request.method} ${request.path} -> ${response.statusCode} in ${durationMs}ms`, {
        correlationId: context.correlationId, requestId: context.operationId, ...(context.causationId ? { causationId: context.causationId } : {}),
        durationMs, outcome: 'FAILED', errorCode: `HTTP_${response.statusCode}`, tenantId: (request as any).user?.id || null
      });
    }
  }
}));
app.use(integrationInspectionMiddleware);
app.use(compression({ filter: (req, res) => req.headers['x-no-compression'] ? false : compression.filter(req, res), threshold: 1024 }));
app.use(hpp());
app.use(express.json({ limit: '20mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use('/api/', apiLimiter);
app.use('/api/', (req, res, next) => { rlsStorage.run({ userId: null, isRequest: true, bypassRls: false }, () => next()); });
app.use('/api', idempotencyMiddleware);

app.get('/api/health/live', (_req, res) => res.status(serverDraining ? 503 : 200).json({ status: serverDraining ? 'draining' : 'alive', uptime: process.uptime(), timestamp: new Date().toISOString() }));
const readinessHandler = async (_req: Request, res: Response) => {
  if (serverDraining || !isDbConfigured) return res.status(503).json({ status: 'not_ready', scope: 'database_structure', reason: serverDraining ? 'draining' : 'database_not_configured' });
  try {
    const check = await databaseReadiness(pool);
    return res.status(check.ready ? 200 : 503).json({ status: check.ready ? 'ready' : 'not_ready', scope: 'database_structure', ...check });
  } catch { return res.status(503).json({ status: 'not_ready', scope: 'database_structure', reason: 'database_probe_failed' }); }
};
app.get('/api/health/ready', readinessHandler);
app.get('/api/encho/health', readinessHandler);

function sendPublicLegalPage(fileName: string, res: Response) {
  const candidates = [path.join(process.cwd(), 'dist', fileName), path.join(process.cwd(), 'public', fileName)];
  const filePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!filePath) return res.status(503).type('text/plain').send('Legal page is temporarily unavailable.');
  return res.sendFile(filePath);
}
app.get('/privacy', (_req, res) => sendPublicLegalPage('privacy.html', res));
app.get('/terms-of-service', (_req, res) => sendPublicLegalPage('terms-of-service.html', res));

const harvoMarketing = createDeployedMarketingRuntime(pool);
const serviceCasesRuntime = createServiceCaseRuntime(process.env, pool, () => {
  StructuredLogger.error('[SERVICE_CASE] Scoped runtime unavailable', { errorCode: 'SERVICE_CASE_UNAVAILABLE' });
});

app.use('/api/conversations/v1', createParticipantServiceRouter(serviceCasesRuntime?.participant ?? null, { authenticate: authenticateToken, accountId: req => Number((req as AuthRequest).user?.id) }));
app.use('/api/operations/v1/service', createStaffServiceRouter(serviceCasesRuntime?.staff ?? null, workforceOrigin(process.env)));
app.use('/api/operations/v1/session', createWorkforceSessionRouter(createWorkforceSessionRuntime(process.env, () => {
  StructuredLogger.error('[WORKFORCE] Isolated identity runtime unavailable', { errorCode: 'IDENTITY_UNAVAILABLE' });
}), workforceOrigin(process.env)));
app.use('/api/operations/v1', createOperationsRouter(createOperationsRuntime(process.env, () => {
  StructuredLogger.error('[WORKFORCE] Restricted operations runtime unavailable', { errorCode: 'WORKFORCE_UNAVAILABLE' });
}), { origin: workforceOrigin(process.env) }));
app.use('/api/admin/workforce', authenticateToken, requireAdmin, createAdminWorkforceRouter(pool));

app.get('/api/stays/:slug/spatial-story', rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }), async (req: Request, res: Response, next: NextFunction) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await harvoMarketing.stories.publicStory(String(req.params.slug))); } catch (error) { next(error); }
}, marketingErrorHandler);
app.get('/api/explore/:destination', rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }), async (req: Request, res: Response, next: NextFunction) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await harvoMarketing.pools.collection(String(req.params.destination))); } catch (error) { next(error); }
}, marketingErrorHandler);

app.use('/api/marketing/measurement', createMeasurementRouter(harvoMarketing.config.origin, harvoMarketing.touchpoints), marketingErrorHandler);
app.use('/api/v2/stays', createStaysCommerceRouter(pool, razorpay));
app.use('/api/marketing/v2/creatives/packages', authenticateToken, createCreativePackageRouter(pool));
app.use('/api/marketing/v2/circuit-breaker', authenticateToken, createCircuitBreakerRouter(pool));
app.use('/api/marketing/v2/feeder-corridors', authenticateToken, createFeederCorridorRouter(pool));
app.use('/api/operations/v1/security', authenticateToken, createDatabaseSecurityRouter(pool));
app.use('/api/marketing/v2/canary', createCanaryCertificationRouter(pool));
app.use('/api/marketing/v2', createMarketingRouter(pool, harvoMarketing.workflow, harvoMarketing.finance, authenticateToken, harvoMarketing.targeting, {
  corridorInference: harvoMarketing.corridorInference, outcomes: harvoMarketing.outcomes, stories: harvoMarketing.stories, pools: harvoMarketing.pools,
  preflight: harvoMarketing.preflight, settlement: harvoMarketing.settlement, conversions: harvoMarketing.conversions, guidance: harvoMarketing.guidance,
  creative: harvoMarketing.creative, pauseRecovery: harvoMarketing.pauseRecovery, facts: harvoMarketing.facts, keywordResearch: harvoMarketing.keywordResearch, portfolio: harvoMarketing.portfolio
}));

app.get('/api/webhooks/marketing/v2/meta', (req: Request, res: Response, next: NextFunction) => {
  try { res.type('text/plain').send(harvoMarketing.metaEvents.challenge(req.query['hub.mode'], req.query['hub.verify_token'], req.query['hub.challenge'])); } catch (error) { next(error); }
}, marketingErrorHandler);
app.post('/api/webhooks/marketing/v2/:provider', async (req: any, res: Response, next: NextFunction) => {
  try {
    const provider = String(req.params.provider).toUpperCase();
    if (provider === 'META') {
      if (!Buffer.isBuffer(req.rawBody)) return res.status(400).json({ error: 'Original webhook body required' });
      return res.status(200).json(await harvoMarketing.metaEvents.ingest(req.rawBody, req.get('x-hub-signature-256') || ''));
    }
    if (!['STRIPE', 'RAZORPAY'].includes(provider)) return res.status(404).json({ error: 'Webhook provider not found' });
    if (!Buffer.isBuffer(req.rawBody)) return res.status(400).json({ error: 'Original webhook body required' });
    const signature = provider === 'STRIPE' ? req.get('stripe-signature') : req.get('x-razorpay-signature');
    res.status(200).json(await harvoMarketing.payments.ingest(provider as 'STRIPE' | 'RAZORPAY', req.rawBody, signature || '', req.get('x-razorpay-event-id')));
  } catch (error) { next(error); }
}, marketingErrorHandler);

app.use(legacyMarketingBoundary);
app.all(['/api/webhooks/meta', '/api/webhooks/ad-network'], (_req, res) => res.status(410).json({
  code: 'HARVO_V2_REQUIRED', error: 'This legacy provider webhook is retired. Use the provider-specific marketing v2 ingress.',
}));

registerCalendarRoutes(app, pool, authenticateToken, () => isDbConfigured);
app.use(crmRouter);
app.use(listingsRouter);
app.use(operationsLegacyRouter);
app.use(webhooksRouter);
app.use(legacyMarketingRouter);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[GLOBAL EXPRESS ERROR HANDLER]', err);
  if (res.headersSent) return next(err);
  const statusCode = err.status || err.statusCode || (err.message && err.message.includes('DATABASE_NOT_CONFIGURED') ? 503 : 500);
  res.status(statusCode).json({ error: err.message || 'Internal Server Error', statusCode, path: req.path, timestamp: new Date().toISOString() });
});

let managedHttpServer: http.Server | undefined;
let globalIoInstance: SocketIOServer | undefined;
let conversationNotifications: any = null;
let serverDraining = false;

async function startServer() {
  const httpServer = http.createServer(app);
  managedHttpServer = httpServer;
  const io = new SocketIOServer(httpServer, {
    cors: { origin: (origin, callback) => callback(originAllowed(origin) ? null : new Error('Blocked by CORS policy: origin is not permitted'), originAllowed(origin)), methods: ['GET', 'POST'], credentials: true },
    allowRequest: (request, callback) => callback(null, originAllowed(request.headers.origin)),
    maxHttpBufferSize: 16384
  });
  registerSecureRealtime(io, {
    authenticate: async token => {
      const claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      if (typeof claims === 'string' || typeof claims.exp !== 'number') throw new Error('Session expiry required');
      const principal = await resolvePersistedSession(pool, claims);
      return { ...principal, expiresAt: claims.exp * 1000 };
    },
    canAccessThread: (principal, threadId) => rlsStorage.run({ userId: principal.id, isRequest: true, bypassRls: false }, async () =>
      (await pool.query('SELECT id FROM threads WHERE id=$1 AND (guest_id=$2 OR host_id=$2)', [threadId, principal.id])).rows.length === 1),
    isPublishedListing: async listingId => (await pool.query("SELECT id FROM listings WHERE id=$1 AND publication_status='published'", [listingId])).rows.length === 1
  });
  app.set('io', io);
  setGlobalIoInstance(io);
  globalIoInstance = io;
  conversationNotifications = startConversationNotifications(process.env, {
    async dispatch({ recipientId, payload }, signal) {
      if (signal.aborted) throw new Error('NOTIFICATION_DISPATCH_ABORTED');
      io.to(`user_${recipientId}`).emit('notification', payload);
      return { outcome: 'SOCKET_HINT_DISPATCHED' };
    }
  }, event => console.info('[CR1_NOTIFICATION_RUNTIME]', event));

  const distPath = path.join(process.cwd(), 'dist');
  if (!process.env.VERCEL && fs.existsSync(path.join(distPath, 'index.html'))) {
    app.use(createPublicAssetsMiddleware(distPath));
    app.get('*', async (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  if (!process.env.VITEST && !process.env.VERCEL) {
    httpServer.listen(PORT, '0.0.0.0', async () => {
      console.log(`Server running on http://localhost:${PORT}`);
      printStartupIntegrationReport();
      if (isDbConfigured && process.env.NODE_ENV !== 'production') {
        try { await ensureDbInitialized(); } catch (e) { console.error('[DB BOOTSTRAP ERROR]', e); }
      }
      startLegacyBackgroundWorkers();
    });
  }
}

const shutdown = createShutdown({
  markDraining: () => { serverDraining = true; },
  drain: async () => { await conversationNotifications?.stop(); globalIoInstance?.disconnectSockets(true); await drainHttpServer(managedHttpServer); globalIoInstance?.close(); },
  closeResources: async () => { await Promise.all([pool.end(), ...(readPool !== pool ? [readPool.end()] : [])]); },
  exit: code => process.exit(code),
  log: event => console.log(JSON.stringify({ event })),
});

if (isProcessEntry(import.meta.url) && !process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
  process.on('uncaughtException', () => { console.error('WEB_UNCAUGHT_EXCEPTION'); void shutdown(1); });
  process.on('unhandledRejection', () => { console.error('WEB_UNHANDLED_REJECTION'); void shutdown(1); });
  startServer().catch(() => { console.error('WEB_STARTUP_FAILED'); void shutdown(1); });
}

export default app; export { app, startServer, managedHttpServer as server };
export { pool, readPool, rlsStorage, queryAnalyticsRead, isDbConfigured, shouldRunBackgroundWorkers, dbUrl, installPoolIsolation } from './src/server/db/connection.js';
export { broadcastDbEvent, logGeminiWarning, sendWhatsAppMessage, setGlobalIoInstance, getGlobalIoInstance, PORT, JWT_SECRET, stripe, razorpay, redis, s3, mux, ai } from './src/server/config/clients.js';
export type { AuthRequest } from './src/server/middleware/auth.js';
export { authenticateToken, optionalAuthenticateToken, requireAdmin, authLimiter, otpLimiter, apiLimiter, aiGatekeeperLimiter, bookingLimiter, messageLimiter, cacheControl } from './src/server/middleware/auth.js';
export { ensureUsersTable, ensureListingsTable, ensureMarketingSchema, ensureDbInitialized } from './src/server/db/bootstrap.js'; export { processWhatsAppWebhookPayload, verifyMetaWebhook } from './src/server/routes/webhooks.router.js';
export type { CampaignState, CampaignFinancialContract, MetaErrorClassification } from './src/server/services/legacyMarketingEngine.js';
export {
  transitionCampaignState, validatePropertyPublication, dispatchGoogleAdsCampaign, executeCampaignStateMachine,
  computeCampaignApprovalHash, getOrEstablishFinancialContract, classifyMetaError,
  recordMetaErrorSignature, executeMetaRollback, dispatchMetaCampaign, activateMetaCampaign, ingestVariantInsights,
  processUnprocessedVariantRawEvents, evaluateCampaignDCO, executeDCOOptimization, reconcileDCOExternalActionsWorker, handleVerifiedPayment,
  processAsyncWebhookQueue, processLeadNotificationQueue, logAdminAudit, processEscrowAutoRelease, processDynamicCreativeOptimization,
  runAnalyticsRollup, processScheduledSocialPosts, processWebhookDLQ, verifyMetaExternalObjectDetailed, processMetaReconciliation,
  recoverOrphanedMetaTransactions, publishToInstagram, syncDynamicPricingToMeta, evaluateMetaPreflightDiagnostics, processAtomicRefund,
  startLegacyBackgroundWorkers
} from './src/server/services/legacyMarketingEngine.js';
export { maskContactInfo } from './src/lib/maskUtils.js';
export { StructuredLogger } from './src/lib/observability/structuredLogger.js'; export { MetricsRegistry } from './src/lib/observability/metricsRegistry.js'; export { AlertService } from './src/lib/observability/alertService.js'; export { ProviderDriftDetector } from './src/lib/providers/schemas.js';
