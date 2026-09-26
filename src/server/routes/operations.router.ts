import nodeCrypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import xss from 'xss';
import { pool, isDbConfigured, dbConnectionError, setDbConnectionError } from '../db/connection.js';
import {
  ai,
  JWT_SECRET,
  broadcastDbEvent,
  sendWhatsAppMessage,
  logGeminiWarning,
  getGlobalIoInstance
} from '../config/clients.js';
import {
  authenticateToken,
  requireAdmin,
  requireExplicitDevelopmentFixture,
  AuthRequest,
  authLimiter,
  otpLimiter
} from '../middleware/auth.js';
import {
  ensureUsersTable,
  ensureListingsTable,
  ensureMarketingSchema,
  ensureDbInitialized
} from '../db/bootstrap.js';
import { StructuredLogger } from '../../lib/observability/structuredLogger.js';
import { MetricsRegistry } from '../../lib/observability/metricsRegistry.js';
import { AlertService } from '../../lib/observability/alertService.js';
import { runFullIntegrationAudit } from '../../lib/integrationInspector.js';
import { verifyGoogleIdentity } from '../../lib/marketing/authentication.js';
import { resolvePersistedSession } from '../../lib/marketing/legacyAuthorization.js';
import { MarketingError } from '../../lib/marketing/domain.js';
import { RetargetingPixelService } from '../../lib/retargetingPixelService.js';
import { databaseReadiness } from '../deployment/databaseReadiness.js';

let serverDraining = false;
export function setServerDraining(val: boolean) {
  serverDraining = val;
}

function sendPublicLegalPage(fileName: string, res: Response) {
  const candidates = [
    path.join(process.cwd(), 'dist', fileName),
    path.join(process.cwd(), 'public', fileName)
  ];
  const filePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!filePath) return res.status(503).type('text/plain').send('Legal page is temporarily unavailable.');
  return res.sendFile(filePath);
}

export function createOperationsLegacyRouter(): Router {
  const router = Router();

// Process Liveness Probe — Instant 200 OK, Zero DB/Network/Worker Dependencies
router.get('/api/health/live', (_req, res) => {
  res.status(serverDraining ? 503 : 200).json({ status: serverDraining ? 'draining' : 'alive', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

router.get('/privacy', (_req, res) => sendPublicLegalPage('privacy.html', res));
router.get('/terms-of-service', (_req, res) => sendPublicLegalPage('terms-of-service.html', res));

router.get('/api/admin/integration-inspection', authenticateToken, requireAdmin, (_req: Request, res: Response) => {
  const auditReport = runFullIntegrationAudit();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    auditReport
  });
});

// Admin Observability & Telemetry Snapshot Endpoint
router.get('/api/admin/metrics', authenticateToken, (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  return res.json(MetricsRegistry.getSnapshot());
});

// Admin Operational Alerts History Endpoint
router.get('/api/admin/alerts', authenticateToken, (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  return res.json({ alerts: AlertService.getRecentAlerts(limit) });
});



const readinessHandler = async (_req: Request, res: Response) => {
  if (serverDraining || !isDbConfigured) return res.status(503).json({ status: 'not_ready', scope: 'database_structure', reason: serverDraining ? 'draining' : 'database_not_configured' });
  try {
    const check = await databaseReadiness(pool);
    return res.status(check.ready ? 200 : 503).json({ status: check.ready ? 'ready' : 'not_ready', scope: 'database_structure', ...check });
  } catch {
    return res.status(503).json({ status: 'not_ready', scope: 'database_structure', reason: 'database_probe_failed' });
  }
};
router.get('/api/health/ready', readinessHandler);
router.get('/api/encho/health', readinessHandler);
router.get('/api/config', (req, res) => {
  res.json({
    googleClientId: process.env.VITE_GOOGLE_CLIENT_ID || '977982063830-0eq4c0i2oassrdmj71aevnktr17hasa7.apps.googleusercontent.com'
  });
});


router.get('/api', (_req, res) => {
  res.json({
    name: 'Encho Backend API',
    status: 'operational',
    dbConfigured: isDbConfigured,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Auto-run DB init if configured in background
if (isDbConfigured) {
  (async () => {
    try {
      await ensureDbInitialized();
    } catch (err) {
      console.error("Auto DB Initialization failed:", err);
    }
  })();
}

// Auth Routes
const otpStore = new Map<string, { otp: string, expiresAt: number }>();

router.post('/api/auth/otp/send', otpLimiter, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  // Generate 6 digit OTP
  const otp = nodeCrypto.randomInt(100000, 1000000).toString();
  otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });


  // Meta WA API sending using the global helper
  const messageText = `Your EnchoSpace verification code is: ${otp}`;
  const delivered = await sendWhatsAppMessage(phone, messageText);
  if (!delivered) { otpStore.delete(phone); return res.status(503).json({ error: 'Verification code could not be sent. Try again later.' }); }
  res.json({ success: true, message: 'Verification code sent' });
});

router.post('/api/auth/otp/verify', otpLimiter, async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const { phone, otp, name } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

  const record = otpStore.get(phone);
  if (!record || record.otp !== otp || record.expiresAt < Date.now()) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  otpStore.delete(phone);

  try {
    await ensureUsersTable();

    // Check if user exists
    const existing = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    let user;

    if (existing.rows.length > 0) {
      user = existing.rows[0];
    } else {
      const generatedEmail = `${phone.replace(/[^0-9]/g, '')}@enchospace.local`;
      const displayName = name || 'New User';

      const insertResult = await pool.query(
        'INSERT INTO users (phone, email, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, phone',
        [phone, generatedEmail, displayName, 'user']
      );
      user = insertResult.rows[0];
    }
    const token = jwt.sign({ id: user.id, role: user.role, email: user.email, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  } catch (error) {
    console.error('OTP verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

async function checkCanHostExperiences(email: string, role: string) {
  if (role === 'admin') return true;
  try {
    const settingsResult = await pool.query('SELECT value FROM settings WHERE key = $1', ['authorized_experience_hosts']);
    if (settingsResult.rows.length > 0) {
      const allowedEmails = settingsResult.rows[0].value || [];
      return allowedEmails.map((e: string) => e.toLowerCase()).includes(email.toLowerCase());
    }
  } catch (e) { console.error('Error checking experience host permissions:', e); }
  return false;
}

router.post('/api/auth/register', authLimiter, async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    await ensureUsersTable();
    setDbConnectionError(null);
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });

    // Security: Password length and complexity validation
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long for security.' });
    }

    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const role = 'user'; // Public registration never grants administrative privileges.

    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
      [email, hash, name, role]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const can_host_experiences = await checkCanHostExperiences(user.email, user.role);
    res.status(201).json({ user: { ...user, can_host_experiences }, token });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('Register error:', msg);
    if (msg.includes('exceeded the compute time quota')) {
      return res.status(503).json({ error: 'Database Quota Exceeded: Your Neon database has exceeded its compute time quota. Please check your Neon project/account.' });
    }
    if (msg.includes('password authentication failed')) {
      return res.status(503).json({ error: 'Database Authentication Failed: Check DATABASE_URL password in Vercel settings.' });
    }
    res.status(500).json({ error: msg || 'Registration failed' });
  }
});

router.post('/api/auth/login', authLimiter, async (req, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ error: 'Database not configured.' });
  }
  try {
    await ensureUsersTable();
    setDbConnectionError(null);
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'All fields required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(400).json({ error: 'Account created with Google. Use Google to sign in.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });


    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const can_host_experiences = await checkCanHostExperiences(user.email, user.role);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, can_host_experiences }, token });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('Login error:', msg);
    if (msg.includes('exceeded the compute time quota')) {
      return res.status(503).json({ error: 'Database Quota Exceeded: Your Neon database has exceeded its compute time quota. Please check your Neon project/account.' });
    }
    if (msg.includes('password authentication failed')) {
      return res.status(503).json({ error: 'Database Authentication Failed: Check DATABASE_URL password in Vercel settings.' });
    }
    res.status(500).json({ error: msg || 'Login failed' });
  }
});

router.post('/api/auth/google', authLimiter, async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    await ensureUsersTable();
    setDbConnectionError(null);
    const identity = await verifyGoogleIdentity(req.body.credential, process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID);
    const { googleId, email, name } = identity;
    const result = await pool.query('SELECT * FROM users WHERE google_id=$1 OR lower(email)=lower($2)', [googleId,email]);
    let user;
    if (result.rows.length > 1) return res.status(409).json({ error: 'Account linking needs support review.' });
    if (result.rows.length === 0) {
      user=(await pool.query('INSERT INTO users(email,name,google_id,role) VALUES($1,$2,$3,$4) RETURNING id,email,name,role',[email,name,googleId,'user'])).rows[0];
    } else {
      user=result.rows[0];
      if (user.google_id && user.google_id !== googleId) return res.status(401).json({ error: 'Google account does not match this account.' });
      if (!user.google_id) {
        if (!identity.authoritativeEmail || user.role === 'admin') return res.status(409).json({ error: 'Sign in with your existing method before linking Google.' });
        await pool.query('UPDATE users SET google_id=$1 WHERE id=$2',[googleId,user.id]);
      }
    }

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const can_host_experiences = await checkCanHostExperiences(user.email, user.role);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, can_host_experiences }, token });
  } catch (error: any) {
    if (error instanceof MarketingError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    const msg = error?.message || String(error);
    console.error('Google auth error:', msg);
    if (msg.includes('exceeded the compute time quota')) {
      return res.status(503).json({ error: 'Database Quota Exceeded: Your Neon database has exceeded its compute time quota. Please check your Neon project/account.' });
    }
    if (msg.includes('password authentication failed')) {
      return res.status(503).json({ error: 'Database Authentication Failed: Check DATABASE_URL password in Vercel settings.' });
    }
    res.status(500).json({ error: msg || 'Google auth failed' });
  }
});

router.get('/api/auth/me', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const result = await pool.query('SELECT id, email, name, role, phone FROM users WHERE id = $1', [req.user?.id]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found, token invalid' });
    const user = result.rows[0];


    user.can_host_experiences = await checkCanHostExperiences(user.email, user.role);
    res.json({ user });
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Admin User Routes
router.get('/api/admin/settings/experience-hosts', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['authorized_experience_hosts']);
    const hosts = result.rows.length > 0 ? result.rows[0].value : [];
    res.json(hosts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.post('/api/admin/settings/experience-hosts', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const { emails } = req.body;
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['authorized_experience_hosts', JSON.stringify(emails)]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/api/admin/reviews', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const { type } = req.query;
    if (type === 'experiences') {
      return res.json([]); // Not implemented yet
    }

    const result = await pool.query(`
      SELECT r.*, u.name as user_name, l.title as listing_title
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN listings l ON r.listing_id = l.id
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

router.delete('/api/admin/reviews/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const reviewId = req.params.id;
    const ref = await pool.query('SELECT listing_id FROM reviews WHERE id = $1', [reviewId]);
    if (ref.rows.length === 0) return res.status(404).json({ error: 'Review not found' });

    await pool.query('DELETE FROM reviews WHERE id = $1', [reviewId]);

    await pool.query(`
      UPDATE listings
      SET
        rating = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE listing_id = $1), 0),
        "reviewCount" = (SELECT COUNT(*) FROM reviews WHERE listing_id = $1)
      WHERE id = $1
    `, [ref.rows[0].listing_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

router.get('/api/admin/offers', authenticateToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const result = await pool.query('SELECT * FROM offers ORDER BY created_at DESC LIMIT 200');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

router.post('/api/admin/offers', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { title, discountPercentage } = req.body;
    const result = await pool.query(
      'INSERT INTO offers (title, discount_percentage) VALUES ($1, $2) RETURNING *',
      [title, discountPercentage]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create offer' });
  }
});

router.delete('/api/admin/offers/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM offers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});


router.get('/api/admin/users', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { type } = req.query;

    if (type === 'experiences') {
      const result = await pool.query(`
        SELECT DISTINCT u.id, u.email, u.name, u.role, u.created_at
        FROM users u
        LEFT JOIN experience_bookings b ON u.id = b.user_id
        LEFT JOIN experiences e ON u.id = e.host_id
        WHERE b.id IS NOT NULL OR e.id IS NOT NULL OR u.role = 'admin'
        ORDER BY u.created_at DESC
      `);
      return res.json(result.rows);
    }

    // Otherwise global or stays
    const staysResult = await pool.query(`
      SELECT DISTINCT u.id, u.email, u.name, u.role, u.created_at
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      LEFT JOIN listings l ON u.id = l.user_id
      WHERE b.id IS NOT NULL OR l.id IS NOT NULL OR u.role = 'admin'
      ORDER BY u.created_at DESC
    `);
    res.json(staysResult.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.delete('/api/admin/users/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Keep-alive endpoint to prevent server from sleeping
router.get('/api/keep-alive', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

router.get('/api/health/db', async (req, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ status: 'error', message: 'DB not configured' });
  }
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('DB Health Check Failed');
    res.status(500).json({ status: 'error', message: 'DB connection failed' });
  }
});

// Legacy development-only schema initializer. Production schema authority is the
// ordered migration runner; this route is disabled unless a developer opts in.
router.post('/api/init-db', authenticateToken, requireAdmin, async (_req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.ENCHO_ALLOW_RUNTIME_DDL !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!isDbConfigured) {
    return res.status(503).json({ status: 'error', message: 'DB not configured' });
  }
  try {
    await ensureUsersTable();
    await ensureListingsTable();
    res.json({ status: 'ok', message: 'DB initialized' });
  } catch (error) {
    console.error('DB Init Failed:', error);
    const errorMessage = error instanceof Error ? (error as Error).message : String(error);
    if (errorMessage.includes('Tenant or user not found')) {
      return res.status(503).json({ status: 'error', message: 'Neon Database: Tenant or user not found. Check DATABASE_URL.' });
    }
    res.status(500).json({ status: 'error', error: errorMessage });
  }
});

// Dynamic Server-Side Image Resizing Proxy Route & Multi-Channel Edge Crop Pipeline

router.patch('/api/admin/media-assets/:id/moderation', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }

  const assetId = req.params.id;
  const { moderation_status, is_sleeping_area, room_type_id } = req.body;

  // Validate allowed moderation statuses
  const ALLOWED_STATUSES = ['pending_review', 'approved', 'rejected'];
  if (moderation_status !== undefined && !ALLOWED_STATUSES.includes(moderation_status)) {
    return res.status(400).json({
      error: `Invalid moderation_status: '${moderation_status}'. Allowed values are: ${ALLOWED_STATUSES.join(', ')}`
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock media asset row with SELECT ... FOR UPDATE
    const assetRes = await client.query(
      'SELECT id, entity_type, entity_id, room_type_id, moderation_status FROM media_assets WHERE id = $1 FOR UPDATE',
      [assetId]
    );
    if (assetRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Media asset not found' });
    }
    const asset = assetRes.rows[0];

    // 2. If room_type_id is provided, lock room_types row with SELECT ... FOR UPDATE and validate same-property ownership
    if (room_type_id !== undefined && room_type_id !== null) {
      const roomRes = await client.query(
        'SELECT id, listing_id FROM room_types WHERE id = $1 FOR UPDATE',
        [Number(room_type_id)]
      );
      if (roomRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'Referenced room type does not exist' });
      }
      if (asset.entity_type === 'listing' && Number(asset.entity_id) !== Number(roomRes.rows[0].listing_id)) {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'Cross-property room assignment rejected: media asset and room type belong to different listings' });
      }
    }

    // 3. Build updates dynamically inside the transaction
    const updates: string[] = [];
    const values: any[] = [];

    if (moderation_status !== undefined) {
      values.push(moderation_status);
      updates.push(`moderation_status = $${values.length}`);
    }
    if (is_sleeping_area !== undefined) {
      values.push(Boolean(is_sleeping_area));
      updates.push(`is_sleeping_area = $${values.length}`);
    }
    if (room_type_id !== undefined) {
      values.push(room_type_id === null ? null : Number(room_type_id));
      updates.push(`room_type_id = $${values.length}`);
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(assetId);
    await client.query(`UPDATE media_assets SET ${updates.join(', ')} WHERE id = $${values.length}`, values);

    await client.query('COMMIT');
    return res.json({ success: true, assetId });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ error: err?.message || 'Failed to update asset moderation' });
  } finally {
    client.release();
  }
});

// M3: Idempotent Backfill Service Endpoint (POST /api/admin/backfill/room-media-authority)
router.post('/api/admin/backfill/room-media-authority', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    const client = await pool.connect();
    let backfilledRooms = 0;
    let backfilledMedia = 0;
    let conflictsCount = 0;
    const conflictIds: number[] = [];

    try {
      await client.query('BEGIN');

      // Find all listings with JSON rooms or photos
      const listingsRes = await client.query('SELECT id, rooms, photos, price FROM listings ORDER BY id ASC');

      for (const listing of listingsRes.rows) {
        const listingId = listing.id;

        // 1. Backfill rooms
        const rawRooms = typeof listing.rooms === 'string'
          ? JSON.parse(listing.rooms || '[]')
          : (Array.isArray(listing.rooms) ? listing.rooms : []);

        const existingRoomsRes = await client.query('SELECT id, name, type FROM room_types WHERE listing_id = $1', [listingId]);
        const existingRooms = existingRoomsRes.rows;
        const roomTypeMap = new Map<string, number>();

        existingRooms.forEach((er: any) => {
          if (er.type) roomTypeMap.set(er.type, er.id);
          if (er.name) roomTypeMap.set(er.name, er.id);
        });

        for (const r of rawRooms) {
          const roomName = r.name || 'Sanctuary Room';
          const roomType = r.type || 'suites';

          // Validate room data integrity; if ambiguous or missing vital fields, record conflict for review
          if (!r.name && !r.type) {
            const existingConflict = await client.query(`
              SELECT id FROM backfill_conflict_records
              WHERE listing_id = $1 AND source_type = 'room' AND source_item_id = $2
            `, [listingId, r.id ? String(r.id) : null]);
            if (existingConflict.rows.length === 0) {
              const confRes = await client.query(`
                INSERT INTO backfill_conflict_records (listing_id, source_type, source_item_id, reason, diagnostic_metadata)
                VALUES ($1, 'room', $2, 'Room record missing both name and type classification', $3)
                RETURNING id
              `, [listingId, r.id ? String(r.id) : null, JSON.stringify(r)]);
              conflictIds.push(confRes.rows[0].id);
              conflictsCount++;
            }
            continue;
          }

          if (!roomTypeMap.has(roomType) && !roomTypeMap.has(roomName)) {
            const inserted = await client.query(`
              INSERT INTO room_types (listing_id, name, type, icon, tag, base_price, currency, max_occupancy, inventory_count, description, specs, features, amenities)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
              RETURNING id
            `, [
              listingId,
              roomName,
              roomType,
              r.icon || '🛏️',
              r.tag || '',
              Number(r.price) || Number(listing.price) || 0,
              'INR',
              Number(r.capacity) || 2,
              Number(r.inventory_count) || 1,
              r.description || '',
              r.specs || '',
              JSON.stringify(r.features || []),
              JSON.stringify(r.amenities || [])
            ]);
            const newRtId = inserted.rows[0].id;
            roomTypeMap.set(roomType, newRtId);
            roomTypeMap.set(roomName, newRtId);
            backfilledRooms++;
          }
        }

        // 2. Backfill media
        const rawPhotos = typeof listing.photos === 'string'
          ? JSON.parse(listing.photos || '[]')
          : (Array.isArray(listing.photos) ? listing.photos : []);

        const existingMediaRes = await client.query(
          "SELECT id, url FROM media_assets WHERE entity_id = $1 AND entity_type = 'listing'",
          [listingId]
        );
        const existingUrls = new Set(existingMediaRes.rows.map((em: any) => em.url));

        let orderIdx = 0;
        for (const p of rawPhotos) {
          const url = p.url || p.previewUrl;
          const photoItemId = p.id ? String(p.id) : null;
          if (!url) {
            const existingConflict = await client.query(`
              SELECT id FROM backfill_conflict_records
              WHERE listing_id = $1 AND source_type = 'media' AND source_item_id = $2
            `, [listingId, photoItemId]);
            if (existingConflict.rows.length === 0) {
              const confRes = await client.query(`
                INSERT INTO backfill_conflict_records (listing_id, source_type, source_item_id, reason, diagnostic_metadata)
                VALUES ($1, 'media', $2, 'Photo record has missing or empty URL', $3)
                RETURNING id
              `, [listingId, photoItemId, JSON.stringify(p)]);
              conflictIds.push(confRes.rows[0].id);
              conflictsCount++;
            }
            continue;
          }

          // Ambiguous tier mapping check:
          // If media claims a non-common tier that cannot be matched unambiguously to exactly one room type,
          // do NOT insert it as common/unassigned. Record it in backfill_conflict_records.
          if (p.tier && p.tier !== 'common' && !roomTypeMap.has(p.tier)) {
            const existingConflict = await client.query(`
              SELECT id FROM backfill_conflict_records
              WHERE listing_id = $1 AND source_type = 'media' AND source_item_id = $2
            `, [listingId, photoItemId || url]);
            if (existingConflict.rows.length === 0) {
              const confRes = await client.query(`
                INSERT INTO backfill_conflict_records (listing_id, source_type, source_item_id, reason, diagnostic_metadata)
                VALUES ($1, 'media', $2, 'Ambiguous tier mapping: non-common tier cannot be matched to a known room type', $3)
                RETURNING id
              `, [listingId, photoItemId || url, JSON.stringify({ tier: p.tier, url })]);
              conflictIds.push(confRes.rows[0].id);
              conflictsCount++;
            }
            continue;
          }

          if (existingUrls.has(url)) continue;

          let linkedRoomTypeId: number | null = null;
          if (p.room_type_id && !isNaN(Number(p.room_type_id))) {
            linkedRoomTypeId = Number(p.room_type_id);
          } else if (p.tier && p.tier !== 'common' && roomTypeMap.has(p.tier)) {
            linkedRoomTypeId = roomTypeMap.get(p.tier) || null;
          }

          // Strict sleeping area flag: require explicit is_sleeping_area = true (never infer from category === 'bedroom')
          const isSleepingArea = Boolean(p.is_sleeping_area || p.isSleepingArea);
          // Legacy backfilled media must unconditionally default to pending_review.
          // Never inherit moderation_status from listings.photos JSON (including 'approved').
          const modStatus = 'pending_review';

          await client.query(`
            INSERT INTO media_assets (entity_type, entity_id, url, tier, category, title, description, specs, is_hero, order_index, is_sleeping_area, room_type_id, moderation_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [
            'listing',
            listingId,
            url,
            p.tier || 'common',
            p.category || 'other',
            p.title || '',
            p.description || '',
            p.specs || '',
            Boolean(p.isHero),
            orderIdx++,
            isSleepingArea,
            linkedRoomTypeId,
            modStatus
          ]);
          existingUrls.add(url);
          backfilledMedia++;
        }
      }

      await client.query('COMMIT');
      return res.json({
        success: true,
        message: `Backfill completed successfully. Backfilled ${backfilledRooms} room types and ${backfilledMedia} media assets with ${conflictsCount} conflict(s).`,
        backfilledRooms,
        backfilledMedia,
        conflictsCount,
        conflictIds
      });
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[BACKFILL ERROR]', err);
    return res.status(500).json({ error: err?.message || 'Backfill failed' });
  }
});

router.post('/api/telemetry/pixel-event', async (req, res) => {
  try {
    const { event_name, user_data, custom_data, event_source_url } = req.body;
    if (!event_name) {
      return res.status(400).json({ error: 'event_name is required' });
    }

    const outcome = await RetargetingPixelService.trackServerEvent(
      {
        event_name,
        user_data: {
          ...user_data,
          client_ip_address: req.ip || req.socket?.remoteAddress,
          client_user_agent: req.headers['user-agent']
        },
        custom_data,
        event_source_url
      },
      pool
    );

    res.status(200).json({ status: 'success', ...outcome });
  } catch (error) {
    console.error('[PIXEL EVENT ERROR]', error);
    res.status(500).json({ error: 'Failed to process pixel event' });
  }
});

// Gap 16: Manual Force Price Sync Endpoint for Host Command Center

router.get('/api/admin/audit-logs', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const { entity_type, entity_id } = req.query;

    let query = 'SELECT a.*, u.name as admin_name, u.email as admin_email FROM admin_audit_logs a LEFT JOIN users u ON a.admin_id = u.id';
    const params: any[] = [];

    if (entity_type && entity_id) {
      query += ' WHERE a.entity_type = $1 AND a.entity_id = $2';
      params.push(entity_type, entity_id);
    } else if (entity_type) {
      query += ' WHERE a.entity_type = $1';
      params.push(entity_type);
    }

    query += ' ORDER BY a.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching admin audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Host Outreach CRM endpoints (Pillar Extension)


// Gap 12: AI Lead Intent Scoring (Visual Badging)

router.put('/api/user/profile', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const userId = req.user?.id;
    const { name, avatar, editorial_quote } = req.body;
    const result = await pool.query(
      'UPDATE users SET name = COALESCE($1, name), avatar = COALESCE($2, avatar), editorial_quote = COALESCE($3, editorial_quote) WHERE id = $4 RETURNING id, name, email, avatar, editorial_quote, role',
      [name || null, avatar || null, editorial_quote || null, userId]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});




router.get('/api/settings/whatsapp', async (req, res) => {
  if (!isDbConfigured) {
    return res.json({ enabled: false, number: '' });
  }
  try {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['whatsapp']);
    if (result.rows.length > 0 && result.rows[0].value) {
      res.json(result.rows[0].value);
    } else {
      res.json({ enabled: false, number: '' });
    }
  } catch (error) {
    console.warn('[SETTINGS WHATSAPP FALLBACK] Error fetching whatsapp settings:', error);
    res.json({ enabled: false, number: '' });
  }
});

router.post('/api/settings/whatsapp', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    await ensureListingsTable();
    const { enabled, number } = req.body;
    await pool.query(`
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, ['whatsapp', JSON.stringify({ enabled, number })]);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update whatsapp settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/api/settings/experiences_page', async (req, res) => {
  const defaultExperiencesPage = {
    hero_title: 'Unforgettable Experiences',
    hero_subtitle: 'Discover exclusive weekend getaways, cultural tours, and extreme adventures curated by local experts.',
    badge_text: 'Curated Collections',
    hero_image_urls: ['https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&q=80&w=2400']
  };
  if (!isDbConfigured) {
    return res.json(defaultExperiencesPage);
  }
  try {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['experiences_page']);
    if (result.rows.length > 0 && result.rows[0].value) {
      res.json(result.rows[0].value);
    } else {
      res.json(defaultExperiencesPage);
    }
  } catch (error) {
    console.warn('[SETTINGS EXPERIENCES_PAGE FALLBACK] Error fetching experiences page settings:', error);
    res.json(defaultExperiencesPage);
  }
});

router.post('/api/settings/experiences_page', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ error: 'DB not configured' });
  }
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    await pool.query(`
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, ['experiences_page', JSON.stringify(req.body)]);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update experiences page settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/api/settings/call', async (req, res) => {
  if (!isDbConfigured) {
    return res.json({ enabled: false, number: '' });
  }
  try {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['call']);
    if (result.rows.length > 0 && result.rows[0].value) {
      res.json(result.rows[0].value);
    } else {
      res.json({ enabled: false, number: '' });
    }
  } catch (error) {
    console.warn('[SETTINGS CALL FALLBACK] Error fetching call settings:', error);
    res.json({ enabled: false, number: '' });
  }
});

router.post('/api/settings/call', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    await ensureListingsTable();
    const { enabled, number } = req.body;
    await pool.query(`
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, ['call', JSON.stringify({ enabled, number })]);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update call settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/api/settings/demo_properties', async (req, res) => {
  if (!isDbConfigured) {
    return res.json({ enabled: false });
  }
  try {
    await ensureListingsTable();
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['demo_properties']);
    if (result.rows.length > 0 && result.rows[0].value) {
      res.json(result.rows[0].value);
    } else {
      res.json({ enabled: false });
    }
  } catch (error) {
    console.warn('[SETTINGS DEMO_PROPERTIES FALLBACK] Error fetching demo properties settings:', error);
    res.json({ enabled: false });
  }
});

router.post('/api/settings/demo_properties', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    await ensureListingsTable();
    const { enabled } = req.body;
    await pool.query(`
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, ['demo_properties', JSON.stringify({ enabled })]);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update demo properties settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});


router.get('/api/seed-ajith', authenticateToken, requireAdmin, requireExplicitDevelopmentFixture, async (req: AuthRequest, res) => {
  try {
    console.log("DB connection configured for seed-ajith");
    const userRes = await pool.query("SELECT id FROM users WHERE id=$1 AND role='admin'", [req.user!.id]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'User not found, token invalid' });
    }
    const userId = userRes.rows[0].id;

    const result = await pool.query(`
      INSERT INTO experiences (
        title, description, destination, departure_location, start_date, end_date,
        price, total_spots, available_spots, itinerary, includes, image_urls, host_id, status, target_audience,
        places_to_visit, included_stay, highlights, things_to_carry, important_notes,
        video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      RETURNING *
    `, [
      'Neon Lights Cyberpunk Tokyo Tour',
      'Experience the futuristic aesthetics of Tokyo at night. Dive deep into Akihabara, Shibuya, and secret underground arcades. This is an immersive, high-energy tour through the cyberpunk heart of Japan.',
      'Tokyo, Japan',
      'Tokyo Narita Airport',
      new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 17 * 24 * 60 * 60 * 1000).toISOString(),
      1599,
      12,
      12,
      JSON.stringify([{day: 1, title: 'Arrival & Akihabara Night Walk', description: 'Check-in and dive into the electric town.'}, {day: 2, title: 'Shibuya Crossing & Robot Restaurant', description: 'Experience the busiest crossing and futuristic dining.'}]),
      JSON.stringify(['Hotel Accommodation', 'Breakfast & Dinner', 'Local Transit Pass', 'English Speaking Cyber-Guide']),
      JSON.stringify(['https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800']),
      userId,
      'upcoming',
      'all',
      JSON.stringify([{name: 'Akihabara', description: 'Electric Town', image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'}]),
      JSON.stringify({title: 'Shinjuku Prince Hotel', location: 'Shinjuku', amenities: ['WiFi', 'City View'], image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'}),
      JSON.stringify(['Cyberpunk Photography Walk', 'Underground Arcade Tournament']),
      JSON.stringify(['Comfortable walking shoes', 'Camera', 'Neon-friendly clothing']),
      'This trip involves a lot of walking in crowded areas.',
      JSON.stringify(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']),
      JSON.stringify(['Flights', 'Personal Shopping', 'Alcohol']),
      '18:00',
      '23:00',
      'English, Japanese (Basic)',
      'Free cancellation 15 days prior. 50% refund within 7 days.',
      'https://goo.gl/maps/shibuya'
    ]);
    res.json(result.rows[0]);
  } catch (error: unknown) {
    console.error("API ERROR:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});


router.get('/api/settings/payment_rates', async (req, res) => {
  const defaultRates = { commission_rate: 10, tax_rate: 18, system_fee: 150 };
  if (!isDbConfigured) {
    return res.json(defaultRates);
  }
  try {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['payment_rates']);
    if (result.rows.length > 0 && result.rows[0].value) {
      res.json(result.rows[0].value);
    } else {
      res.json(defaultRates);
    }
  } catch (error) {
    console.warn('[SETTINGS PAYMENT_RATES FALLBACK] Error fetching payment settings:', error);
    res.json(defaultRates);
  }
});

router.post('/api/settings/payment_rates', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ error: 'DB not configured' });
  }
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { commission_rate, tax_rate, system_fee } = req.body;
    await pool.query(`
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, ['payment_rates', JSON.stringify({ commission_rate: Number(commission_rate), tax_rate: Number(tax_rate), system_fee: Number(system_fee) })]);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update payment settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

  return router;
}

export const operationsLegacyRouter = createOperationsLegacyRouter();
