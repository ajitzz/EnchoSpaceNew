/**
 * src/server/stays/staysCommerceRouter.ts
 *
 * Canonical Stays Commerce Express Router (Phase 3 Milestone 5, 8, 9 / Sprint 1).
 *
 * NON-NEGOTIABLE INVARIANTS:
 * 1. Zero Guest Fees Invariant: Guests pay exactly Room Rent + Statutory GST. Zero Encho booking commission, zero gateway fee.
 * 2. Immutable Quotes: Quotes are server-authoritative, stored in stays_quotes with 15-minute TTL.
 * 3. Atomic Holds: Milestone 4 inventory hold integration against inventory_days and stays_holds.
 * 4. Idempotency: Duplicate submissions with the same idempotency key return original order without double-charging.
 * 5. Cryptographic Signature Verification: HMAC-SHA256 verification on payment confirmation before booking row confirmed.
 */

import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type pg from 'pg';
import { z } from 'zod';
import { StaysCommerceEngine } from '../../lib/commerce/staysCommerceEngine.js';
import {
  acquireHold,
  signGuestSession,
  verifyGuestSession,
} from '../../services/inventoryHoldService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'encho_super_secure_jwt_secret_change_in_prod';

function parseCookies(req: Request): Record<string, string> {
  const list: Record<string, string> = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach((cookie: string) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

function resolvePrincipal(req: Request, res: Response): { userId: number | null; holderPrincipal: string; guestSessionId: string | null } {
  let userId: number | null = null;
  let holderPrincipal = '';
  let guestSessionId: string | null = null;

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded && (decoded.id || decoded.userId)) {
        userId = Number(decoded.id || decoded.userId);
        holderPrincipal = `user:${userId}`;
      }
    } catch (_err) {
      // invalid token -> proceed to guest cookie
    }
  }

  if (!holderPrincipal) {
    const cookies = parseCookies(req);
    const existingSignedCookie = cookies['encho_guest_session'];
    let verifiedSessionUuid = verifyGuestSession(existingSignedCookie);

    if (!verifiedSessionUuid) {
      verifiedSessionUuid = crypto.randomUUID();
      const signedToken = signGuestSession(verifiedSessionUuid);
      const isProduction = process.env.NODE_ENV === 'production';
      const cookieOptions = [
        `encho_guest_session=${signedToken}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=604800',
      ];
      if (isProduction) cookieOptions.push('Secure');
      res.setHeader('Set-Cookie', cookieOptions.join('; '));
    }

    guestSessionId = verifiedSessionUuid;
    holderPrincipal = `session:${verifiedSessionUuid}`;
  }

  return { userId, holderPrincipal, guestSessionId };
}

export function createStaysCommerceRouter(pool: pg.Pool, razorpayClient?: any): Router {
  const router = Router();
  const engine = new StaysCommerceEngine(pool, { tablePrefix: 'stays_' });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. POST /api/v2/stays/quote: Server-Authoritative Quote (Zero Guest Fees)
  // ──────────────────────────────────────────────────────────────────────────
  const quoteSchema = z.object({
    listingId: z.coerce.number().int().positive(),
    roomTypeId: z.coerce.number().int().optional().default(0),
    checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
    checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
    guestCount: z.coerce.number().int().positive().optional().default(1),
  });

  router.post('/quote', async (req: Request, res: Response) => {
    try {
      const parsed = quoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid quote parameters', details: parsed.error.format() });
      }

      const { listingId, roomTypeId, checkInDate, checkOutDate, guestCount } = parsed.data;

      // 1. Validate date logic
      const checkIn = new Date(checkInDate);
      const checkOut = new Date(checkOutDate);
      if (checkOut <= checkIn) {
        return res.status(400).json({ error: 'checkOutDate must be after checkInDate', code: 'INVALID_DATE_RANGE' });
      }

      // 2. Fetch server-authoritative nightly price
      let nightlyRateRupees = 0;
      if (roomTypeId && roomTypeId > 0) {
        const roomRes = await pool.query(
          'SELECT base_price FROM room_types WHERE id = $1 AND listing_id = $2',
          [roomTypeId, listingId]
        );
        if (roomRes.rows.length > 0) {
          nightlyRateRupees = Number(roomRes.rows[0].base_price);
        }
      }

      if (!nightlyRateRupees || nightlyRateRupees <= 0) {
        const listingRes = await pool.query(
          'SELECT price FROM listings WHERE id = $1',
          [listingId]
        );
        if (listingRes.rows.length === 0) {
          return res.status(404).json({ error: 'Listing not found', code: 'LISTING_NOT_FOUND' });
        }
        nightlyRateRupees = Number(listingRes.rows[0].price) || 5000;
      }

      const nightlyRatePaise = BigInt(Math.round(nightlyRateRupees * 100));

      // 3. Generate authoritative quote
      const quote = await engine.createQuote({
        listingId,
        roomTypeId,
        checkInDate,
        checkOutDate,
        nightlyRatePaise,
        guestCount,
      });

      return res.json({
        success: true,
        quote: {
          id: quote.id,
          listingId: quote.listingId,
          roomTypeId: quote.roomTypeId,
          checkInDate: quote.checkInDate,
          checkOutDate: quote.checkOutDate,
          nights: quote.nights,
          nightlyRate: nightlyRateRupees,
          basePriceRupees: Number(quote.basePricePaise) / 100,
          taxRupees: Number(quote.taxPaise) / 100,
          totalRupees: Number(quote.totalPaise) / 100,
          basePricePaise: quote.basePricePaise.toString(),
          taxPaise: quote.taxPaise.toString(),
          totalPaise: quote.totalPaise.toString(),
          currency: quote.currency,
          expiresAt: quote.expiresAt,
          guestCommissionRupees: 0, // Strict invariant: ₹0 guest fee
        },
      });
    } catch (err: any) {
      console.error('[STAYS QUOTE ERROR]', err);
      return res.status(500).json({ error: err.message || 'Failed to generate stay quote' });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. GET /api/v2/stays/quote/:id: Retrieve Quote
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/quote/:id', async (req: Request, res: Response) => {
    try {
      const quoteId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const quote = await engine.getQuote(quoteId);
      if (!quote) {
        return res.status(404).json({ error: 'Quote not found or expired', code: 'QUOTE_EXPIRED' });
      }
      return res.json({
        success: true,
        quote: {
          id: quote.id,
          listingId: quote.listingId,
          roomTypeId: quote.roomTypeId,
          checkInDate: quote.checkInDate,
          checkOutDate: quote.checkOutDate,
          nights: quote.nights,
          basePricePaise: quote.basePricePaise.toString(),
          taxPaise: quote.taxPaise.toString(),
          totalPaise: quote.totalPaise.toString(),
          basePriceRupees: Number(quote.basePricePaise) / 100,
          taxRupees: Number(quote.taxPaise) / 100,
          totalRupees: Number(quote.totalPaise) / 100,
          currency: quote.currency,
          expiresAt: quote.expiresAt,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. POST /api/v2/stays/hold: Acquire Atomic Reservation Hold
  // ──────────────────────────────────────────────────────────────────────────
  const holdSchema = z.object({
    quoteId: z.string().uuid(),
    idempotencyKey: z.string().min(8).optional().default(() => `hold_key_${crypto.randomUUID()}`),
  });

  router.post('/hold', async (req: Request, res: Response) => {
    try {
      const parsed = holdSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid hold parameters', details: parsed.error.format() });
      }

      const { quoteId, idempotencyKey } = parsed.data;
      const { userId, holderPrincipal, guestSessionId } = resolvePrincipal(req, res);

      const quote = await engine.getQuote(quoteId);
      if (!quote) {
        return res.status(404).json({ error: 'Quote not found or expired. Please request a fresh quote.', code: 'QUOTE_EXPIRED' });
      }

      // If roomTypeId is present, acquire inventory_days hold (Milestone 4)
      if (quote.roomTypeId && quote.roomTypeId > 0) {
        const holdResult = await acquireHold(pool, {
          roomTypeId: quote.roomTypeId,
          checkIn: quote.checkInDate,
          checkOut: quote.checkOutDate,
          quantity: 1,
          idempotencyKey,
          holderPrincipal,
          userId,
          guestSessionId,
        });

        if (!holdResult.success || !holdResult.hold) {
          return res.status(holdResult.statusCode).json({
            error: holdResult.error || 'Inventory hold acquisition conflict',
            code: holdResult.code || 'HOLD_CONFLICT',
            details: holdResult.conflictDetails,
          });
        }

        // Record in stays_holds
        const holdId = holdResult.hold.id;
        await pool.query(
          `INSERT INTO stays_holds (id, quote_id, user_id, guest_session_id, holder_principal, status, expires_at)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6)
           ON CONFLICT (id) DO NOTHING`,
          [holdId, quoteId, userId, guestSessionId, holderPrincipal, holdResult.hold.expiresAt]
        );

        return res.json({
          success: true,
          hold: {
            id: holdId,
            quoteId,
            status: 'ACTIVE',
            expiresAt: holdResult.hold.expiresAt,
          },
        });
      }

      // If listing-level booking without room_type_id: create standard 10-minute hold
      const standardHold = await engine.createHold({
        quoteId,
        userId: userId || 0,
        ttlSeconds: 600,
      });

      return res.json({
        success: true,
        hold: standardHold,
      });
    } catch (err: any) {
      console.error('[STAYS HOLD ERROR]', err);
      return res.status(500).json({ error: err.message || 'Failed to acquire reservation hold' });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. POST /api/v2/stays/order: Create Payment Gateway Order (Idempotent)
  // ──────────────────────────────────────────────────────────────────────────
  const orderSchema = z.object({
    quoteId: z.string().uuid(),
    holdId: z.string().uuid(),
    idempotencyKey: z.string().min(8),
    guestName: z.string().min(1).optional(),
    guestPhone: z.string().min(5).optional(),
    guestEmail: z.string().email().optional(),
  });

  router.post('/order', async (req: Request, res: Response) => {
    try {
      const parsed = orderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid order parameters', details: parsed.error.format() });
      }

      const { quoteId, holdId, idempotencyKey, guestName, guestPhone, guestEmail } = parsed.data;
      const { userId } = resolvePrincipal(req, res);

      const quote = await engine.getQuote(quoteId);
      if (!quote) {
        return res.status(404).json({ error: 'Quote expired. Please re-select your dates.', code: 'QUOTE_EXPIRED' });
      }

      const hold = await engine.getHold(holdId);
      if (!hold || hold.status !== 'ACTIVE') {
        return res.status(409).json({ error: 'Reservation hold expired. Please re-select your room.', code: 'HOLD_EXPIRED' });
      }

      const internalOrderId = crypto.randomUUID();

      // Idempotently create internal stays_orders row
      const receipt = await engine.createOrder({
        orderId: internalOrderId,
        holdId,
        userId: userId || 0,
        totalPaise: quote.totalPaise,
        idempotencyKey,
        quoteId,
        guestName,
        guestPhone,
        guestEmail,
      });

      const effectiveOrderId = receipt.orderId;
      const amountPaise = Number(quote.totalPaise);

      // Create or re-use Razorpay Order
      if (razorpayClient) {
        try {
          const rzpOrder = await razorpayClient.orders.create({
            amount: amountPaise,
            currency: 'INR',
            receipt: `rcpt_${effectiveOrderId.replace(/-/g, '').slice(0, 30)}`,
            notes: {
              internal_order_id: effectiveOrderId,
              quote_id: quoteId,
              hold_id: holdId,
              user_id: String(userId || 0),
            },
          });

          await pool.query(
            `UPDATE stays_orders SET razorpay_order_id = $1 WHERE id = $2`,
            [rzpOrder.id, effectiveOrderId]
          );

          return res.json({
            success: true,
            orderId: effectiveOrderId,
            razorpayOrderId: rzpOrder.id,
            amount: amountPaise,
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID,
            title: `Encho Stay Reservation`,
          });
        } catch (rzpErr: any) {
          console.error('[RAZORPAY ORDER GENERATION ERROR]', rzpErr);
          return res.status(502).json({ error: 'Payment gateway error: ' + rzpErr.message });
        }
      }

      // Simulated mode for environments without live Razorpay credentials
      const mockRzpOrderId = `order_sim_${crypto.randomUUID()}`;
      await pool.query(
        `UPDATE stays_orders SET razorpay_order_id = $1 WHERE id = $2`,
        [mockRzpOrderId, effectiveOrderId]
      );

      return res.json({
        success: true,
        orderId: effectiveOrderId,
        razorpayOrderId: mockRzpOrderId,
        amount: amountPaise,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_encho2026',
        title: `Encho Stay Reservation (Simulated)`,
        isSimulated: true,
      });
    } catch (err: any) {
      console.error('[STAYS ORDER CREATION ERROR]', err);
      return res.status(500).json({ error: err.message || 'Failed to create stay order' });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. POST /api/v2/stays/capture: Cryptographic Payment Verification & Confirmation
  // ──────────────────────────────────────────────────────────────────────────
  const captureSchema = z.object({
    orderId: z.string().uuid(),
    razorpayOrderId: z.string(),
    razorpayPaymentId: z.string(),
    razorpaySignature: z.string(),
  });

  router.post('/capture', async (req: Request, res: Response) => {
    try {
      const parsed = captureSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Missing required capture verification parameters', details: parsed.error.format() });
      }

      const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

      // 1. Verify HMAC SHA-256 signature if key secret is available
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      let isAuthentic = false;

      if (keySecret) {
        const bodyToSign = razorpayOrderId + '|' + razorpayPaymentId;
        const expectedSignature = crypto
          .createHmac('sha256', keySecret)
          .update(bodyToSign)
          .digest('hex');

        const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
        const actualBuf = Buffer.from(String(razorpaySignature), 'utf-8');

        if (expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)) {
          isAuthentic = true;
        }
      } else {
        // In local/test execution without secrets, accept simulation signatures
        if (
          String(razorpaySignature).startsWith('sim_sig_') ||
          String(razorpaySignature).startsWith('rzp_sig_') ||
          process.env.NODE_ENV === 'test'
        ) {
          isAuthentic = true;
        }
      }

      if (!isAuthentic) {
        console.error(`[STAYS SECURITY ALERT] Invalid HMAC signature for Order ${orderId}`);
        return res.status(400).json({ error: 'Cryptographic signature verification failed', code: 'INVALID_SIGNATURE' });
      }

      // 2. Atomically confirm order, consume hold, create booking, update inventory
      const result = await engine.captureOrderWithPayment({
        orderId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      });

      return res.json({
        success: true,
        orderId: result.orderId,
        bookingId: result.bookingId,
        status: result.status,
        message: 'Stay reservation confirmed successfully!',
      });
    } catch (err: any) {
      console.error('[STAYS CAPTURE ERROR]', err);
      return res.status(500).json({ error: err.message || 'Payment confirmation failed' });
    }
  });

  return router;
}
