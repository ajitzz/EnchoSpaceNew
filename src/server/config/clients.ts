import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import Mux from '@mux/mux-node';
import Stripe from 'stripe';
import Razorpay from 'razorpay';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import { createMediaUploadS3Client } from '../../lib/immutableS3Upload.js';
import { checkIntegrationKeys } from '../../lib/integrationInspector.js';

dotenv.config();

// Ensure Meta Marketing & Graph API environment variable bridges
if (!process.env.META_ACCESS_TOKEN && process.env.META_API_TOKEN) {
  process.env.META_ACCESS_TOKEN = process.env.META_API_TOKEN;
}
if (!process.env.META_PAGE_ID && process.env.PHONE_NUMBER_ID) {
  process.env.META_PAGE_ID = process.env.PHONE_NUMBER_ID;
}
if (!process.env.META_AD_ACCOUNT_ID) {
  process.env.META_AD_ACCOUNT_ID = process.env.PHONE_NUMBER_ID ? `act_${process.env.PHONE_NUMBER_ID}` : 'act_982841698238647';
}
if (!process.env.META_INSTAGRAM_ACCOUNT_ID && process.env.PHONE_NUMBER_ID) {
  process.env.META_INSTAGRAM_ACCOUNT_ID = process.env.PHONE_NUMBER_ID;
}

export const META_API_TOKEN = process.env.META_API_TOKEN;
export const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "982841698238647";

export const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET
});

export let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'dummy_stripe_key') {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

export let razorpay: any = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  try {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('✅ Razorpay SDK initialized successfully for domestic UPI/Card routing');
  } catch (err: any) {
    console.error('❌ Failed to initialize Razorpay SDK client:', err.message);
  }
}

// Initialize Redis (Upstash) - only if real credentials provided
export const isRedisConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && !process.env.UPSTASH_REDIS_REST_URL.includes('dummy')
);

// Active inspection monitoring for Upstash Redis Integration Keys
checkIntegrationKeys(
  'Upstash Redis Cache',
  ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  'Upstash Redis Cache Initialization'
);

export const redis = isRedisConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// Initialize S3
export const s3 = createMediaUploadS3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export const PORT = process.env.NODE_ENV === 'test' ? 0 : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

const configuredJwtSecret = process.env.JWT_SECRET;
if ((process.env.NODE_ENV === 'production' || process.env.VERCEL) && (!configuredJwtSecret || configuredJwtSecret.length < 32)) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters before production startup.');
}
export const JWT_SECRET = configuredJwtSecret && configuredJwtSecret.length >= 32 ? configuredJwtSecret : crypto.randomBytes(48).toString('hex');

let globalIoInstance: any = null;

export function setGlobalIoInstance(io: any) {
  globalIoInstance = io;
}

export function getGlobalIoInstance() {
  return globalIoInstance;
}

export function broadcastDbEvent(req: any, type: string, targetUserIds?: (string | number | null | undefined)[]) {
  const io = (req && req.app && typeof req.app.get === 'function') ? req.app.get('io') : globalIoInstance;
  if (!io) return;
  if (!targetUserIds || targetUserIds.length === 0) {
    io.emit('db_changed', { type });
  } else {
    targetUserIds.forEach(id => {
      if (id) io.to(`user_${id}`).emit('db_changed', { type });
    });
    io.to('admin_room').emit('db_changed', { type });
  }
}

export function logGeminiWarning(context: string, err: any) {
  const errMsg = String(err?.message || err);
  if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota exceeded')) {
    console.warn(`[GEMINI API NOTICE] ${context}: Rate limit/quota reached (429). Using instant static fallbacks.`);
  } else {
    console.warn(`[GEMINI API NOTICE] ${context}: ${errMsg.substring(0, 150)}`);
  }
}

export async function sendWhatsAppMessage(toPhone: string, messageText: string): Promise<boolean> {
  try {
    if (!toPhone || !messageText) return false;

    const cleanedPhone = toPhone.replace(/[^0-9]/g, '');

    if (!META_API_TOKEN) {
      console.warn("[WHATSAPP] META_API_TOKEN is missing. Failing closed.");
      return false;
    }

    const response = await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanedPhone,
        type: "text",
        text: {
          preview_url: false,
          body: messageText
        }
      })
    });

    const data = response.headers.get('content-type')?.includes('json') ? await response.json().catch(() => ({})) : { error: 'Server returned non-JSON response: ' + (await response.text()).slice(0, 150) } as any;
    if (!response.ok) {
      console.warn('[WHATSAPP DELIVERY FAILED]', { status: response.status });
      return false;
    }
    return Boolean(data?.messages?.[0]?.id);
  } catch {
    console.warn('[WHATSAPP DELIVERY FAILED] Provider request failed');
    return false;
  }
}

export const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
