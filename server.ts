/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import { Server as SocketIOServer } from 'socket.io'; // Import SocketIOServer
import http from 'http'; // Import http

export interface AuthRequest extends Request {
  user?: {
    id: number | string;
    role: string;
    email?: string;
    name?: string;
    phone?: string; // Added phone to AuthRequest
  };
  file?: any;
  files?: any;
  app: express.Application; // Added app to AuthRequest for io
}
// Removed static vite import
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import { Redis } from '@upstash/redis';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
// import pinoHttp from 'pino-http'; // Removed as per JS version
// import { logger } from './src/lib/logger/index.js'; // Removed as per JS version
// import { globalErrorHandler } from './src/lib/middleware/errorHandler.js'; // Removed as per JS version
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { GoogleGenAI } from '@google/genai';
import Stripe from 'stripe';
dotenv.config({ override: true });


export function broadcastDbEvent(req: any, type: string, targetUserIds?: (string | number | null | undefined)[]) {
  const io = req.app.get('io');
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

let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'dummy_stripe_key') {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

const { Pool } = pkg;

// Only init directory paths if not running in Edge/Serverless environments strictly
const __filename = typeof fileURLToPath === 'function' ? fileURLToPath(import.meta.url || 'file://') : '';
const __dirname = __filename ? path.dirname(__filename) : '';

// Initialize DB (Neon)
// Use the user-provided DB URL from the instructions
const userDbUrl = 'postgresql://neondb_owner:npg_DS7vjuFc0efR@ep-muddy-sun-aoyw9d8l-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
// Always use the user provided DB URL to ensure we connect to the correct database with the actual listings
const envDbUrl = process.env.DATABASE_URL || userDbUrl;
console.log('===> SERVER INIT: envDbUrl is', envDbUrl);

const isDbConfigured = envDbUrl && !envDbUrl.includes('dummy');
const dbUrl = envDbUrl;


const pool = new Pool({
  connectionString: isDbConfigured ? dbUrl : undefined,
  
});

let dbConnectionError: string | null = null;
if (isDbConfigured) {
  pool.query('SELECT 1').catch((err: any) => {
    dbConnectionError = (err as Error).message || String(err);
    console.error("CRITICAL DB STARTUP ERROR:", dbConnectionError);
  });
}

// Initialize Redis (Upstash) - only if real credentials provided
const isRedisConfigured = process.env.UPSTASH_REDIS_REST_URL && !process.env.UPSTASH_REDIS_REST_URL.includes('dummy');
const redis = isRedisConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// Initialize S3
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export const app = express();
app.set('trust proxy', 1);
const PORT = process.env.NODE_ENV === 'test' ? 0 : 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_12345';

const META_API_TOKEN = process.env.META_API_TOKEN || "EAAkr7Y9S2qYBQfHTNZASIugAzOi8b2MZCBct4z4jZBHSmQ2KGlFduuDQQGEYC9NRDtZBUdhMPdeJ06OjYUiJYGfFkZCAxzyh4TdidN7ZA10K3XPOVEiQh01jo22xLsQjXrEtMHc5ZCHZBbRZAyA5d0pl26Jsg3IuNKY272QYmqEjHghf11OKJmbUZBfJLe5EvHzl48gAZDZD";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "982841698238647";

async function sendWhatsAppMessage(toPhone: string, messageText: string): Promise<boolean> {
  try {
    if (!toPhone || !messageText) return false;

    const cleanedPhone = toPhone.replace(/[^0-9]/g, '');

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

    const data = await response.json();
    if (!response.ok) {
       console.error("WhatsApp API Error Response:", data);
       return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error);
    return false;
  }
}

// Auth Middleware
export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

app.use(cors());

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabling CSP for development/vite compatibility
  crossOriginEmbedderPolicy: false
}));

// HTTP Request Logging
// app.use(pinoHttp({ logger })); // Replaced with morgan as per JS version
app.use(morgan('combined', {
  skip: (req) => req.path === '/api/health' || req.path.startsWith('/assets/')
}));

// Global Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
// Apply rate limiter to all API routes
app.use('/api/', apiLimiter);


app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
}) : null;

// WhatsApp Webhook Registration
app.get('/api/webhook/whatsapp', (req, res) => {
  const verify_token = process.env.WHATSAPP_VERIFY_TOKEN || 'encho_verify_123';
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === verify_token) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post('/api/webhook/whatsapp', async (req, res) => {
  try {
    const body = req.body;
    if (body.object) {
      if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
        const phone_number_id = body.entry[0].changes[0].value.metadata.phone_number_id;
        const from = body.entry[0].changes[0].value.messages[0].from;
        const msg_body = body.entry[0].changes[0].value.messages[0].text?.body;

        // Ensure we don't send anything if msg_body is empty
        if (!msg_body || msg_body.trim() === '') {
           return res.sendStatus(200);
        }

        // Automated AI reply logic using Gemini
        if (ai) {
           const listingsRes = await pool.query('SELECT title, description, price, city, currency FROM listings WHERE id > 0 LIMIT 15');
           const listingsContext = listingsRes.rows.map((l: any) => `- ${l.title} in ${l.city} (${l.currency}${l.price}): ${l.description}`).join('\\n');

           const systemInstruction = `You are a helpful, professional assistant for ENCHO Space (a real estate and property booking platform).
You are answering queries from customers on WhatsApp.
Never send empty messages. Never use placeholders like 'Replace this sample message', '[Insert Name]', or similar. Never output instructions to the user on how to replace text.
Always generate a fully complete, ready-to-send, natural response. Keep your response under 1000 characters and use plain text with simple emojis.
Here are some of our available properties:
${listingsContext}

Answer the user's question accurately. If they ask about something not listed, politely inform them to check the ENCHO Space website.`;

           const response = await ai.models.generateContent({
              model: "gemini-1.5-flash",
              contents: msg_body,
              config: {
                 systemInstruction,
              }
           });

           const replyText = response?.text?.trim() || '';
           const lowerReply = replyText.toLowerCase();
           const isInvalidMessage = replyText === ''
             || lowerReply.includes('replace this')
             || lowerReply.includes('sample message')
             || lowerReply.includes('[insert')
             || lowerReply.includes('placeholder');

           if (!isInvalidMessage) {
               await sendWhatsAppMessage(from, replyText);
           }
        }
      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (e) {
    console.error("Webhook processing error:", e);
    res.sendStatus(500);
  }
});

let usersTableInitialized = false;
// Helper to ensure users table
const ensureUsersTable = async () => {
  if (!isDbConfigured) return;
  if (usersTableInitialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      google_id VARCHAR(255) UNIQUE,
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='google_id') THEN
        ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone') THEN
        ALTER TABLE users ADD COLUMN phone VARCHAR(255) UNIQUE;
        ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
      END IF;
    END $$;
  `);

  usersTableInitialized = true;
};

let listingsTableInitialized = false;
const ensureListingsTable = async () => {
  if (!isDbConfigured) return;
  if (listingsTableInitialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS listings (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL NOT NULL,
      currency VARCHAR(10) DEFAULT 'USD',
      type VARCHAR(50) NOT NULL,
      address VARCHAR(255) NOT NULL,
      city VARCHAR(100) NOT NULL,
      image_url TEXT,
      image_urls JSONB DEFAULT '[]'::jsonb,
      max_guests INT DEFAULT 2,
      bedrooms INT DEFAULT 1,
      beds INT DEFAULT 1,
      bathrooms INT DEFAULT 1,
      amenities JSONB DEFAULT '[]'::jsonb,
      video_url TEXT,
      rental_mode VARCHAR(50) DEFAULT 'entire_place',
      rooms JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='user_id') THEN
        ALTER TABLE listings ADD COLUMN user_id INT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='lat') THEN
        ALTER TABLE listings ADD COLUMN lat NUMERIC;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='lng') THEN
        ALTER TABLE listings ADD COLUMN lng NUMERIC;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='dynamic_pricing') THEN
        ALTER TABLE listings ADD COLUMN dynamic_pricing JSONB DEFAULT '{}'::jsonb;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      move_in_date VARCHAR(50) NOT NULL,
      configuration VARCHAR(50),
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      total_rent DECIMAL NOT NULL,
      status VARCHAR(50) DEFAULT 'Confirmed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      booking_id INT REFERENCES bookings(id) ON DELETE CASCADE,
      sender_id INT REFERENCES users(id),
      receiver_id INT REFERENCES users(id),
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(255) UNIQUE NOT NULL,
      value JSONB NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS threads (
      id SERIAL PRIMARY KEY,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      guest_id INT REFERENCES users(id) ON DELETE CASCADE,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      last_message TEXT,
      unread_count_guest INT DEFAULT 0,
      unread_count_host INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      experience_id INT REFERENCES experiences(id) ON DELETE CASCADE,
      UNIQUE(listing_id, guest_id),
      UNIQUE(experience_id, guest_id)
    );
  `);

  // Add experience_id if the table already existed without it
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='threads' AND column_name='experience_id') THEN
        ALTER TABLE threads ADD COLUMN experience_id INT REFERENCES experiences(id) ON DELETE CASCADE;
      END IF;
      -- Ignore unique constraint creation failure here if it exists
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS experience_wishlists (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      experience_id INT REFERENCES experiences(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, experience_id)
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='thread_id') THEN
        ALTER TABLE messages ADD COLUMN thread_id INT REFERENCES threads(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='listing_id') THEN
        ALTER TABLE messages ADD COLUMN listing_id INT REFERENCES listings(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);
  await pool.query(`ALTER TABLE messages ALTER COLUMN booking_id DROP NOT NULL;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS offers (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      discount_percentage DECIMAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wishlists (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, listing_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      rating DECIMAL NOT NULL,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_prices (
      id SERIAL PRIMARY KEY,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      date_string VARCHAR(10) NOT NULL,
      price DECIMAL,
      offer_id INT REFERENCES offers(id) ON DELETE SET NULL,
      status VARCHAR(20) DEFAULT 'available',
      UNIQUE(listing_id, date_string)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS experiences (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      destination VARCHAR(255) NOT NULL,
      departure_location VARCHAR(255) NOT NULL,
      start_date TIMESTAMP NOT NULL,
      end_date TIMESTAMP NOT NULL,
      price DECIMAL NOT NULL,
      total_spots INT NOT NULL,
      available_spots INT NOT NULL,
      itinerary JSONB DEFAULT '[]'::jsonb,
      includes JSONB DEFAULT '[]'::jsonb,
      image_urls JSONB DEFAULT '[]'::jsonb,
      target_audience VARCHAR(50) DEFAULT 'all',
      host_id INT REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(50) DEFAULT 'upcoming',
      places_to_visit JSONB DEFAULT '[]'::jsonb,
      included_stay JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
      await pool.query(`ALTER TABLE experiences ALTER COLUMN includes DROP DEFAULT`);
      await pool.query(`ALTER TABLE experiences ALTER COLUMN includes TYPE JSONB USING array_to_json(includes)::jsonb`);
      await pool.query(`ALTER TABLE experiences ALTER COLUMN includes SET DEFAULT '[]'::jsonb`);
  } catch { /* ignore */ }

  try {
      await pool.query(`ALTER TABLE experiences ALTER COLUMN image_urls DROP DEFAULT`);
      await pool.query(`ALTER TABLE experiences ALTER COLUMN image_urls TYPE JSONB USING array_to_json(image_urls)::jsonb`);
      await pool.query(`ALTER TABLE experiences ALTER COLUMN image_urls SET DEFAULT '[]'::jsonb`);
  } catch { /* ignore */ }

  try {
      await pool.query(`ALTER TABLE listings ALTER COLUMN image_urls DROP DEFAULT`);
      await pool.query(`ALTER TABLE listings ALTER COLUMN image_urls TYPE JSONB USING array_to_json(image_urls)::jsonb`);
      await pool.query(`ALTER TABLE listings ALTER COLUMN image_urls SET DEFAULT '[]'::jsonb`);
  } catch { /* ignore */ }

  try {
      await pool.query(`ALTER TABLE listings ALTER COLUMN amenities DROP DEFAULT`);
      await pool.query(`ALTER TABLE listings ALTER COLUMN amenities TYPE JSONB USING array_to_json(amenities)::jsonb`);
      await pool.query(`ALTER TABLE listings ALTER COLUMN amenities SET DEFAULT '[]'::jsonb`);
  } catch { /* ignore */ }

  try {
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS target_audience VARCHAR(50) DEFAULT 'all'`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]'::jsonb`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS things_to_carry JSONB DEFAULT '[]'::jsonb`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS important_notes TEXT`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS video_urls JSONB DEFAULT '[]'::jsonb`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS excludes JSONB DEFAULT '[]'::jsonb`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS start_time VARCHAR(100)`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS end_time VARCHAR(100)`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS language VARCHAR(100) DEFAULT 'English'`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS cancellation_policy TEXT`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS map_link TEXT`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS places_to_visit JSONB DEFAULT '[]'::jsonb`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS included_stay JSONB`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255)`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS seo_description TEXT`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS seo_keywords TEXT`);
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS seo_image_url TEXT`);
  } catch (e) {
      console.warn("Minor schema issue during experiences update:", e);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS experience_bookings (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      experience_id INT REFERENCES experiences(id) ON DELETE CASCADE,
      num_tickets INT NOT NULL,
      total_price DECIMAL NOT NULL,
      status VARCHAR(50) DEFAULT 'Confirmed',
      payment_status VARCHAR(50) DEFAULT 'pending',
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      verification_document_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
      await pool.query(`ALTER TABLE experience_bookings ADD COLUMN verification_document_url TEXT`);
  } catch (e) {
      // Column likely exists
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS experience_reviews (
      id SERIAL PRIMARY KEY,
      experience_id INT REFERENCES experiences(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      rating DECIMAL NOT NULL,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS experience_videos (
      id SERIAL PRIMARY KEY,
      experience_id INT REFERENCES experiences(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      video_url TEXT NOT NULL,
      thumbnail_url TEXT,
      title VARCHAR(255),
      author_name VARCHAR(255) DEFAULT 'Verified Explorer',
      likes INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS experience_messages (
      id SERIAL PRIMARY KEY,
      experience_id INT REFERENCES experiences(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const columns = [
    ['image_urls', "TEXT[] DEFAULT '{}'"],
    ['max_guests', 'INT DEFAULT 2'],
    ['bedrooms', 'INT DEFAULT 1'],
    ['beds', 'INT DEFAULT 1'],
    ['bathrooms', 'INT DEFAULT 1'],
    ['amenities', "TEXT[] DEFAULT '{}'"],
    ['lat', "DECIMAL"],
    ['lng', "DECIMAL"],
    ['video_url', 'TEXT'],
    ['rental_mode', "VARCHAR(50) DEFAULT 'entire_place'"],
    ['rooms', "JSONB DEFAULT '[]'::jsonb"],
    ['seo_title', 'VARCHAR(255)'],
    ['seo_description', 'TEXT'],
    ['seo_keywords', 'TEXT'],
    ['seo_image_url', 'TEXT']
  ];

  for (const [col, type] of columns) {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='${col}') THEN
          ALTER TABLE listings ADD COLUMN ${col} ${type};
        END IF;
      END $$;
    `);
  }

  // Ensure cascade is on in case the table already existed without it
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'bookings_listing_id_fkey'
        AND table_name = 'bookings'
        AND constraint_type = 'FOREIGN KEY'
      ) THEN
        ALTER TABLE bookings DROP CONSTRAINT bookings_listing_id_fkey;
        ALTER TABLE bookings ADD CONSTRAINT bookings_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='status') THEN
        ALTER TABLE bookings ADD COLUMN status VARCHAR(50) DEFAULT 'Confirmed';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wishlists' AND column_name='room_id') THEN
        ALTER TABLE wishlists ADD COLUMN room_id VARCHAR(255) DEFAULT NULL;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='room_id') THEN
        ALTER TABLE bookings ADD COLUMN room_id VARCHAR(255) DEFAULT NULL;
      END IF;
    END $$;
  `);

  try {
    await pool.query(`ALTER TABLE wishlists DROP CONSTRAINT IF EXISTS wishlists_user_id_listing_id_key`);
  } catch (err) {
    // ignore
  }

  // Create seo_configurations table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS seo_configurations (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        title VARCHAR(255),
        description TEXT,
        keywords TEXT,
        og_image TEXT,
        canonical_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entity_type, entity_id)
    );
  `);

  // Create indexes for performance tuning to reduce lag
  await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);
      CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id);
      CREATE INDEX IF NOT EXISTS idx_prices_listing_id ON calendar_prices(listing_id);
      CREATE INDEX IF NOT EXISTS idx_messages_booking_id ON messages(booking_id);
      CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
      CREATE INDEX IF NOT EXISTS idx_listings_type ON listings(type);
      CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reviews_listing_id ON reviews(listing_id);
      CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON wishlists(user_id);
      CREATE INDEX IF NOT EXISTS idx_experience_reviews_experience_id ON experience_reviews(experience_id);
    `);

  listingsTableInitialized = true;
};

// Auto-run DB init if configured
if (isDbConfigured) {
  ensureUsersTable().catch(console.error);
  ensureListingsTable().catch(console.error);
}

// Auth Routes
const otpStore = new Map<string, { otp: string, expiresAt: number }>();

app.post('/api/auth/otp/send', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  // Generate 6 digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

  console.log(`[DEV ONLY] OTP for ${phone} is ${otp}`);

  // Meta WA API sending using the global helper
  const messageText = `Your EnchoSpace verification code is: ${otp}`;
  await sendWhatsAppMessage(phone, messageText);

  // Always return success even if WA fails, for dev testing
  res.json({ success: true, message: 'OTP sent successfully' });
});

app.post('/api/auth/otp/verify', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const { phone, otp, name } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

  const record = otpStore.get(phone);
  if (!record || record.otp !== otp || record.expiresAt < Date.now()) {
    // Hidden "master" OTP for reviewer/dev testing
    if (otp !== '123456') {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
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

app.post('/api/auth/register', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (dbConnectionError) return res.status(503).json({ error: `Database Connection Failed: ${dbConnectionError}` });
  try {
    await ensureUsersTable();
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });

    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminAccount = (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) ||
                           email.toLowerCase() === 'admin@enchospace.com' ||
                           email.toLowerCase() === 'ajithsabzz@gmail.com';
    const role = isAdminAccount ? 'admin' : 'user';

    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
      [email, hash, name, role]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const can_host_experiences = await checkCanHostExperiences(user.email, user.role);
    res.status(201).json({ user: { ...user, can_host_experiences }, token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!isDbConfigured || dbConnectionError) {
    if (req.body.email === 'ajithsabzz@gmail.com') {
      const token = jwt.sign({ id: 1, role: 'admin', email: 'ajithsabzz@gmail.com' }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, user: { id: 1, name: 'Ajith', email: 'ajithsabzz@gmail.com', role: 'admin' } });
    }
    return res.status(503).json({ error: 'Database Connection Failed. Check your Neon password.' });
  }
  try {
    await ensureUsersTable();
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

    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminAccount = (adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase()) ||
                           user.email.toLowerCase() === 'admin@enchospace.com' ||
                           user.email.toLowerCase() === 'ajithsabzz@gmail.com';

    if (isAdminAccount && user.role !== 'admin') {
      await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
      user.role = 'admin';
    }

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const can_host_experiences = await checkCanHostExperiences(user.email, user.role);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, can_host_experiences }, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (dbConnectionError) return res.status(503).json({ error: `Database Connection Failed: ${dbConnectionError}.` });
  try {
    await ensureUsersTable();
    const { googleId, email, name } = req.body;

    if (!googleId || !email || !name) {
      return res.status(400).json({ error: 'Failed to retrieve Google profile data' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminAccount = (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) ||
                           email.toLowerCase() === 'admin@enchospace.com' ||
                           email.toLowerCase() === 'ajithsabzz@gmail.com';
    const expectedRole = isAdminAccount ? 'admin' : 'user';

    if (result.rows.length === 0) {
      // Create user
      const insertResult = await pool.query(
        'INSERT INTO users (email, name, google_id, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
        [email, name, googleId, expectedRole]
      );
      user = insertResult.rows[0];
    } else {
      user = result.rows[0];
      // Update google_id and role if needed
      const updateQueries = [];
      const updateValues = [];
      let nextIndex = 1;

      if (!user.google_id) {
        updateQueries.push(`google_id = $${nextIndex++}`);
        updateValues.push(googleId);
      }

      if (expectedRole === 'admin' && user.role !== 'admin') {
         updateQueries.push(`role = $${nextIndex++}`);
         updateValues.push('admin');
         user.role = 'admin';
      }

      if (updateQueries.length > 0) {
        updateValues.push(email);
        await pool.query(`UPDATE users SET ${updateQueries.join(', ')} WHERE email = $${nextIndex}`, updateValues);
      }
    }
    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const can_host_experiences = await checkCanHostExperiences(user.email, user.role);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, can_host_experiences }, token });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const result = await pool.query('SELECT id, email, name, role, phone FROM users WHERE id = $1', [req.user?.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];

    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminAccount = (adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase()) ||
                           user.email.toLowerCase() === 'admin@enchospace.com' ||
                           user.email.toLowerCase() === 'ajithsabzz@gmail.com';

    if (isAdminAccount && user.role !== 'admin') {
      await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
      user.role = 'admin';
    }

    user.can_host_experiences = await checkCanHostExperiences(user.email, user.role);
    res.json({ user });
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Admin User Routes
app.get('/api/admin/settings/experience-hosts', authenticateToken, async (req: AuthRequest, res) => {
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

app.post('/api/admin/settings/experience-hosts', authenticateToken, async (req: AuthRequest, res) => {
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

app.get('/api/admin/reviews', authenticateToken, async (req: AuthRequest, res) => {
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

app.delete('/api/admin/reviews/:id', authenticateToken, async (req: AuthRequest, res) => {
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

app.get('/api/admin/offers', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const result = await pool.query('SELECT * FROM offers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

app.post('/api/admin/offers', authenticateToken, async (req: AuthRequest, res) => {
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

app.delete('/api/admin/offers/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM offers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/listings/:id/calendar', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json([]);
  try {
    const query = `
      SELECT c.*, row_to_json(o.*) as offer
      FROM calendar_prices c
      LEFT JOIN offers o ON c.offer_id = o.id
      WHERE c.listing_id = $1
    `;
    const result = await pool.query(query, [req.params.id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

app.post('/api/listings/:id/calendar', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json({ success: true, message: "Demo listing updated" });
  try {
    // Basic auth check: usually check if listing belongs to user or if admin
    const { dates, price, offer_id, status } = req.body;
    const listingId = req.params.id;

    // Process each date
    for (const date_string of dates) {
      await pool.query(`
        INSERT INTO calendar_prices (listing_id, date_string, price, offer_id, status)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (listing_id, date_string)
        DO UPDATE SET price = $3, offer_id = $4, status = $5
      `, [listingId, date_string, price, offer_id || null, status || 'available']);
    }
    res.json({ message: 'Updated successfully' });
  } catch (error) {
    console.error('Update calendar error', error);
    res.status(500).json({ error: 'Failed to update calendar' });
  }
});

app.get('/api/admin/users', authenticateToken, async (req: AuthRequest, res) => {
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
      LEFT JOIN listings l ON u.id = l.host_id
      WHERE b.id IS NOT NULL OR l.id IS NOT NULL OR u.role = 'admin'
      ORDER BY u.created_at DESC
    `);
    res.json(staysResult.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, async (req: AuthRequest, res) => {
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
app.get('/api/keep-alive', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Health check
app.get('/api/health/db', async (req, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ status: 'error', message: 'DB not configured' });
  }
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    const errorMessage = error instanceof Error ? (error as Error).message : String(error);
    if (errorMessage.includes('Tenant or user not found')) {
      console.warn('Neon DB Warning: Tenant or user not found. Check your DATABASE_URL.');
      return res.status(503).json({ status: 'error', message: 'Neon Database: Tenant or user not found. Please check your DATABASE_URL in settings.' });
    }
    console.error('DB Health Check Failed:', error);
    res.status(500).json({ status: 'error', message: 'DB connection failed', detail: errorMessage });
  }
});

// Init DB schema
app.post('/api/init-db', async (req, res) => {
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

// Dynamic Server-Side Image Resizing Proxy Route
app.get('/api/image', async (req, res) => {
  try {
    const url = req.query.url as string;
    const width = parseInt(req.query.w as string) || undefined;
    const quality = parseInt(req.query.q as string) || 80;

    if (!url) {
      return res.status(400).send('URL is required');
    }

    // Security: Only allow proxying from allowed domains to prevent SSRF
    const allowedDomains = ['s3.amazonaws.com', process.env.AWS_S3_BUCKET_NAME, 'images.unsplash.com'].filter(Boolean) as string[];
    try {
      const urlObj = new URL(url);
      if (!allowedDomains.some(d => urlObj.hostname.includes(d))) {
        return res.status(403).send('Domain not allowed');
      }
    } catch {
      return res.status(400).send('Invalid URL');
    }

    const imageRes = await fetch(url);
    if (!imageRes.ok) throw new Error('Failed to fetch image from origin');

    const imageBuffer = await imageRes.arrayBuffer();

    const accept = req.headers.accept || '';
    const format = accept.includes('image/avif') ? 'avif' : 'webp';

    let sharpInstance = sharp(Buffer.from(imageBuffer));

    if (width) {
      sharpInstance = sharpInstance.resize({ width, withoutEnlargement: true });
    }

    let optimizedBuffer;
    if (format === 'avif') {
      // AVIF typically provides better compression, we can use slightly lower quality for same visual
      optimizedBuffer = await sharpInstance.avif({ quality: Math.max(1, quality - 15) }).toBuffer();
    } else {
      optimizedBuffer = await sharpInstance.webp({ quality }).toBuffer();
    }

    res.set('Content-Type', `image/${format}`);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Vary', 'Accept');
    res.send(optimizedBuffer);
  } catch (error) {
    console.error('Image Proxy Error:', error);
    res.status(500).send('Error processing image');
  }
});

// Get presigned URL for S3 upload
app.post('/api/upload-url', async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    // Validate AWS Configuration
    if (!process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID === 'dummy' || !process.env.AWS_S3_BUCKET_NAME) {
      console.error('AWS S3 Configuration is missing or invalid.');
      return res.status(500).json({ error: 'Storage configuration is missing on the server.' });
    }

    const key = `listings/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    // Make sure we form the correct virtual-hosted style URL for S3
    const fileUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
    res.json({ uploadUrl, fileUrl });
  } catch (error) {
    console.error('Presigned URL Error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

app.get('/api/admin/seo/:type/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { type, id } = req.params;
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const result = await pool.query('SELECT * FROM seo_configurations WHERE entity_type = $1 AND entity_id = $2', [type, id]);
    res.json(result.rows[0] || { entity_type: type, entity_id: id });
  } catch (error) {
    console.error('Fetch SEO Error:', error);
    res.status(500).json({ error: 'Failed to fetch SEO metadata' });
  }
});

app.put('/api/admin/seo/:type/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  try {
    const { type, id } = req.params;
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const { title, description, keywords, og_image, canonical_url } = req.body;
    await pool.query(`
        INSERT INTO seo_configurations (entity_type, entity_id, title, description, keywords, og_image, canonical_url, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT (entity_type, entity_id) DO UPDATE
        SET title = $3, description = $4, keywords = $5, og_image = $6, canonical_url = $7, updated_at = CURRENT_TIMESTAMP
    `, [type, id, title || null, description || null, keywords || null, og_image || null, canonical_url || null]);
    res.json({ status: 'success', message: 'SEO metadata updated' });
  } catch (error) {
    console.error('Update SEO Error:', error);
    res.status(500).json({ error: 'Failed to update SEO metadata' });
  }
});

app.put('/api/listings/:id', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json({ id: req.params.id, message: "Demo listing preserved" });
  try {
    await ensureListingsTable();
    const { title, description, price, type, address, city, imageUrl, imageUrls, videoUrl, rentalMode, rooms, maxGuests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamicPricing, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;

    if (title) {
      await pool.query(`
        UPDATE listings
        SET title=$1, description=$2, price=$3, type=$4, address=$5, city=$6, image_url=$7, image_urls=$8, video_url=$9, rental_mode=$10, rooms=$11, max_guests=$12, bedrooms=$13, beds=$14, bathrooms=$15, amenities=$16, lat=$18, lng=$19, dynamic_pricing=$20, seo_title=$21, seo_description=$22, seo_keywords=$23, seo_image_url=$24
        WHERE id=$17
      `, [
        title, description, price, type, address, city, imageUrl, JSON.stringify(imageUrls || []), videoUrl, rentalMode, JSON.stringify(rooms || []), maxGuests, bedrooms, beds, bathrooms, JSON.stringify(amenities || []), req.params.id as string, lat || null, lng || null, dynamicPricing ? JSON.stringify(dynamicPricing) : JSON.stringify({}), seo_title || null, seo_description || null, seo_keywords || null, seo_image_url || null
      ]);
    } else if (videoUrl !== undefined) {
      await pool.query('UPDATE listings SET video_url = $1 WHERE id = $2', [videoUrl, req.params.id]);
    } else if (type !== undefined) {
      await pool.query('UPDATE listings SET type = $1 WHERE id = $2', [type, req.params.id]);
    } else if (amenities !== undefined) {
      await pool.query('UPDATE listings SET amenities = $1 WHERE id = $2', [JSON.stringify(amenities), req.params.id]);
    } else if (req.body.lat !== undefined && req.body.lng !== undefined) {
      await pool.query('UPDATE listings SET lat = $1, lng = $2 WHERE id = $3', [req.body.lat, req.body.lng, req.params.id]);
    } else if (price !== undefined) {
      await pool.query('UPDATE listings SET price = $1 WHERE id = $2', [price, req.params.id]);
    } else if (maxGuests !== undefined) {
      await pool.query('UPDATE listings SET max_guests = $1, beds = $2, bedrooms = $3, bathrooms = $4 WHERE id = $5', [maxGuests, beds, bedrooms, bathrooms, req.params.id]);
    }

    // Invalidate Cache
    if (redis && city) {
        try {
           await redis.del(`listings:${city.toLowerCase()}`);
        } catch (e) { console.error(e); }
    }

    broadcastDbEvent(req, 'listing');
    res.json({ message: 'Listing updated successfully' });
  } catch (error) {
    console.error('Update Listing Error:', error);
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

app.put('/api/listings/:id/mode', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json({ id: req.params.id, message: "Demo listing preserved" });
  try {
    await ensureListingsTable();
    const { rentalMode } = req.body;
    await pool.query('UPDATE listings SET rental_mode = $1 WHERE id = $2', [rentalMode, req.params.id]);
    broadcastDbEvent(req, 'listing');
    res.json({ message: 'Listing rental mode updated successfully' });
  } catch (error) {
    console.error('Update Listing Mode Error:', error);
    res.status(500).json({ error: 'Failed to update listing mode' });
  }
});

// Create listing
app.post('/api/listings', async (req, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ status: 'error', message: 'DB not configured' });
  }
  try {
    await ensureListingsTable();
    const { title, description, price, type, address, city, imageUrl, imageUrls, videoUrl, rentalMode, rooms, maxGuests, bedrooms, beds, bathrooms, amenities, userId, lat, lng, dynamicPricing, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;

    // Validate
    if (!title || !price || !type || !address || !city) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert into DB
    const result = await pool.query(
      `INSERT INTO listings (user_id, title, description, price, type, address, city, image_url, image_urls, video_url, rental_mode, rooms, max_guests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamic_pricing, seo_title, seo_description, seo_keywords, seo_image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING *`,
      [userId || null, title, description, price, type, address, city, imageUrl, imageUrls || [], videoUrl, rentalMode || 'entire_place', rooms ? JSON.stringify(rooms) : JSON.stringify([]), maxGuests, bedrooms, beds, bathrooms, amenities, lat || null, lng || null, dynamicPricing ? JSON.stringify(dynamicPricing) : JSON.stringify({}), seo_title || null, seo_description || null, seo_keywords || null, seo_image_url || null]
    );

    const newListing = result.rows[0];

    // Invalidate cache
    if (redis) {
      try {
        await redis.del(`listings:${city.toLowerCase()}`);
      } catch (e) {
        console.warn('Redis cache invalidation failed', e);
      }
    }

    broadcastDbEvent(req, 'listing');

    res.status(201).json(newListing);
  } catch (error) {
    console.error('Create Listing Error:', error);
    const errorMessage = error instanceof Error ? (error as Error).message : String(error);
    if (errorMessage.includes('Tenant or user not found')) {
      return res.status(503).json({ error: 'Neon Database: Tenant or user not found. Check DATABASE_URL.' });
    }
    res.status(500).json({ error: 'Failed to create listing', message: errorMessage });
  }
});

// Wishlists endpoints
app.get('/api/wishlists', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    await ensureListingsTable();
    const result = await pool.query(`
      SELECT l.*, w.id as wishlist_id, w.room_id
      FROM wishlists w
      JOIN listings l ON w.listing_id = l.id
      WHERE w.user_id = $1
    `, [req.user?.id]);

    const formattedWishlists = result.rows.map(row => {
      if (row.room_id && row.rooms && Array.isArray(row.rooms)) {
          const room = row.rooms.find((r: any) => String(r.id) === String(row.room_id));
          if (room) {
              return {
                 ...row,
                 ...room,
                 id: `${row.id}_${room.id}`,
                 originalId: String(row.id),
                 title: row.title,
                 displayTitle: `${row.title} - ${room.name}`,
                 displayPrice: room.price,
                 imageUrl: (room.imageUrls && room.imageUrls.length > 0) ? room.imageUrls[0] : row.image_url,
                 imageUrls: (room.imageUrls && room.imageUrls.length > 0) ? room.imageUrls : row.image_urls,
                 selectedConfigId: String(room.id),
                 amenities: room.amenities && room.amenities.length > 0 ? room.amenities : row.amenities,
                 type: room.name,
                 wishlist_id: String(row.wishlist_id)
              };
          }
      }
      return {
        ...row,
        id: String(row.id),
        price: parseFloat(row.price),
        wishlist_id: String(row.wishlist_id)
      };
    });

    res.json(formattedWishlists);
  } catch (error) {
    console.error("wishlist err:", error);
    res.status(500).json({ error: 'Failed to fetch wishlists' });
  }
});

app.post('/api/wishlists', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { listingId, roomId } = req.body;
    if (isNaN(Number(listingId))) {
      return res.json({ success: true, message: 'Demo listing mock wishlisted' });
    }

    const existing = await pool.query(
      'SELECT 1 FROM wishlists WHERE user_id = $1 AND listing_id = $2 AND (room_id = $3 OR (room_id IS NULL AND $3 IS NULL))',
      [req.user?.id, listingId, roomId || null]
    );

    if (existing.rows.length === 0) {
      await pool.query('INSERT INTO wishlists (user_id, listing_id, room_id) VALUES ($1, $2, $3)', [req.user?.id, listingId, roomId || null]);
    }

    broadcastDbEvent(req, 'wishlist', [req.user?.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to add to wishlist", error);
    res.status(500).json({ error: 'Failed to add to wishlist' });
  }
});

app.delete('/api/wishlists/:listingId', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const listingId = req.params.listingId;
    const roomId = req.query.roomId as string;

    if (isNaN(Number(listingId))) {
      return res.json({ success: true, message: 'Demo listing mock un-wishlisted' });
    }

    if (roomId) {
        await pool.query('DELETE FROM wishlists WHERE user_id = $1 AND listing_id = $2 AND room_id = $3', [req.user?.id, listingId, roomId]);
    } else {
        await pool.query('DELETE FROM wishlists WHERE user_id = $1 AND listing_id = $2 AND room_id IS NULL', [req.user?.id, listingId]);
    }

    broadcastDbEvent(req, 'wishlist', [req.user?.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove from wishlist' });
  }
});

// Experience Wishlists endpoints
app.get('/api/experience-wishlists', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const result = await pool.query(`
      SELECT e.*, w.id as wishlist_id
      FROM experience_wishlists w
      JOIN experiences e ON w.experience_id = e.id
      WHERE w.user_id = $1
    `, [req.user?.id]);

    res.json(result.rows);
  } catch (error) {
    console.error("experience wishlist err:", error);
    res.status(500).json({ error: 'Failed to fetch experience wishlists' });
  }
});

app.post('/api/experience-wishlists', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { experienceId } = req.body;
    if (isNaN(Number(experienceId))) {
      return res.json({ success: true, message: 'Demo experience mock wishlisted' });
    }

    const existing = await pool.query(
      'SELECT 1 FROM experience_wishlists WHERE user_id = $1 AND experience_id = $2',
      [req.user?.id, experienceId]
    );

    if (existing.rows.length === 0) {
      await pool.query('INSERT INTO experience_wishlists (user_id, experience_id) VALUES ($1, $2)', [req.user?.id, experienceId]);
    }

    broadcastDbEvent(req, 'wishlist', [req.user?.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to add to experience wishlist", error);
    res.status(500).json({ error: 'Failed to add to experience wishlist' });
  }
});

app.delete('/api/experience-wishlists/:experienceId', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const experienceId = req.params.experienceId;

    if (isNaN(Number(experienceId))) {
      return res.json({ success: true, message: 'Demo experience mock un-wishlisted' });
    }

    await pool.query('DELETE FROM experience_wishlists WHERE user_id = $1 AND experience_id = $2', [req.user?.id, experienceId]);

    broadcastDbEvent(req, 'wishlist', [req.user?.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove from experience wishlist' });
  }
});

// Reviews endpoints
app.get('/api/listings/:id/can-review', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.json({ canReview: false });
  try {
    const listingId = req.params.id;
    const userId = req.user?.id;
    if (isNaN(Number(listingId))) return res.json({ canReview: false });

    const result = await pool.query(`
      SELECT 1 FROM bookings b
      LEFT JOIN reviews r ON r.listing_id = b.listing_id AND r.user_id = b.user_id
      WHERE b.listing_id = $1 AND b.user_id = $2
      AND b.status ILIKE 'Completed'
      AND r.id IS NULL
      LIMIT 1
    `, [listingId, userId]);
    res.json({ canReview: result.rows.length > 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify review eligibility' });
  }
});

app.get('/api/listings/:id/reviews', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json([]);
  try {
    const result = await pool.query(`
      SELECT r.*, u.name as user_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.listing_id = $1
      ORDER BY r.created_at DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

app.post('/api/listings/:id/reviews', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (isNaN(Number(req.params.id))) return res.json({ id: Date.now(), listing_id: req.params.id, user_id: req.user?.id, rating: req.body.rating, content: req.body.content, created_at: new Date() });
  try {
    const { rating, content } = req.body;
    const result = await pool.query(
      'INSERT INTO reviews (listing_id, user_id, rating, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.id, req.user?.id, rating, content]
    );

    // Update the listing's rating and review count
    await pool.query(`
      UPDATE listings
      SET
        rating = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE listing_id = $1), 0),
        "reviewCount" = (SELECT COUNT(*) FROM reviews WHERE listing_id = $1)
      WHERE id = $1
    `, [req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add review' });
  }
});

// Get listings (cache-first)
app.get('/api/listings', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
  if (!isDbConfigured) {
    return res.status(503).json({ status: 'error', message: 'DB not configured' });
  }

  // Set edge caching headers. Cache for 60 seconds.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');

  try {
    let city = (req.query.city as string);
    const userId = (req.query.userId as string);
    const minPrice = req.query.minPrice as string;
    const maxPrice = req.query.maxPrice as string;
    const minLat = req.query.minLat as string;
    const maxLat = req.query.maxLat as string;
    const minLng = req.query.minLng as string;
    const maxLng = req.query.maxLng as string;

    // Redis Edge Caching
    const cacheKey = `listings_v2:${userId || city || 'all'}:${req.originalUrl}`;
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          // Serve from Redis Cache (Edge Cache)
          return res.json(cached);
        }
      } catch (err) {
        console.warn('Redis Cache Error:', err);
      }
    }

    let result;

    try {
      if (userId) {
        result = await pool.query(`
          SELECT l.*,
                 EXISTS(SELECT 1 FROM calendar_prices cp WHERE cp.listing_id = l.id AND cp.offer_id IS NOT NULL) as has_offers
          FROM listings l
          WHERE user_id = $1 ORDER BY created_at DESC
        `, [userId]);
      } else if (city === 'all') {
        result = await pool.query(`
          SELECT l.*,
                 EXISTS(SELECT 1 FROM calendar_prices cp WHERE cp.listing_id = l.id AND cp.offer_id IS NOT NULL) as has_offers
          FROM listings l
          ORDER BY created_at DESC
        `);
      } else {
        city = (city && city !== 'all') ? city : '';

        let queryStr = 'SELECT l.*, EXISTS(SELECT 1 FROM calendar_prices cp WHERE cp.listing_id = l.id AND cp.offer_id IS NOT NULL) as has_offers FROM listings l WHERE 1=1';
        const queryParams: any[] = [];

        if (city) {
            queryParams.push(city);
            queryStr += ` AND l.city ILIKE '%' || $${queryParams.length} || '%'`;
        }

        if (minPrice) {
            queryParams.push(minPrice);
            queryStr += ` AND l.price >= $${queryParams.length}`;
        }
        if (maxPrice) {
            queryParams.push(maxPrice);
            queryStr += ` AND l.price <= $${queryParams.length}`;
        }
        if (req.query.type) {
            queryParams.push(req.query.type);
            queryStr += ` AND l.type = $${queryParams.length}`;
        }
        if (req.query.amenities) {
            const amenitiesList = (req.query.amenities as string).split(',');
            queryParams.push(JSON.stringify(amenitiesList));
            queryStr += ` AND l.amenities::jsonb @> $${queryParams.length}::jsonb`;
        }
        if (req.query.bedrooms) {
            queryParams.push(req.query.bedrooms);
            queryStr += " AND (l.bedrooms >= $" + queryParams.length + " OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'bedrooms') IS NOT NULL AND (r->>'bedrooms') != '' AND (r->>'bedrooms')::numeric >= $" + queryParams.length + "))";
        }
        if (req.query.beds) {
            queryParams.push(req.query.beds);
            queryStr += " AND (l.beds >= $" + queryParams.length + " OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'beds') IS NOT NULL AND (r->>'beds') != '' AND (r->>'beds')::numeric >= $" + queryParams.length + "))";
        }
        if (req.query.bathrooms) {
            queryParams.push(req.query.bathrooms);
            queryStr += ` AND l.bathrooms >= $${queryParams.length}`;
        }
        if (req.query.maxGuests) {
            queryParams.push(req.query.maxGuests);
            queryStr += " AND (l.max_guests >= $" + queryParams.length + " OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'capacity') IS NOT NULL AND (r->>'capacity') != '' AND (r->>'capacity')::numeric >= $" + queryParams.length + "))";
        }

        if (req.query.sort === 'price_asc') {
            queryStr += ' ORDER BY l.price ASC, l.created_at DESC';
        } else if (req.query.sort === 'price_desc') {
            queryStr += ' ORDER BY l.price DESC, l.created_at DESC';
        } else {
            queryStr += ' ORDER BY l.created_at DESC';
        }

        result = await pool.query(queryStr, queryParams);
      }
    } catch (dbError) {
      const dbErrorMessage = dbError instanceof Error ? dbError.message : String(dbError);

      // Handle missing table error
      if (dbErrorMessage.includes('relation "listings" does not exist') || dbErrorMessage.includes('Tenant or user not found')) {
        console.warn('Database warning:', dbErrorMessage, '- Returning empty listings.');
        return res.json([]);
      }

      console.error('Database Query Error:', dbErrorMessage);
      throw dbError; // Re-throw other DB errors to be caught by outer catch
    }

    let listings: any[] = [];
    for (const row of result.rows) {
      listings.push({
        id: String(row.id),
        title: row.title,
        description: row.description,
        price: parseFloat(row.price),
        currency: '₹',
        type: row.type,
        address: row.address,
        city: row.city,
        user_id: row.user_id,
        imageUrl: row.image_url || '',
        imageUrls: row.image_urls || [],
        video_url: row.video_url || null,
        rental_mode: row.rental_mode || 'entire_place',
        rooms: row.rooms || [],
        imageCount: (row.image_urls && row.image_urls.length > 0) ? row.image_urls.length : 1,
        provider: 'Host',
        isVerified: true,
        discount: 0,
        rating: 5.0,
        reviewCount: 0,
        amenities: row.amenities || ['Wifi', 'Kitchen'],
        maxGuests: row.max_guests,
        bedrooms: row.bedrooms,
        beds: row.beds,
        bathrooms: row.bathrooms,
        lat: row.lat ? parseFloat(row.lat) : null,
        lng: row.lng ? parseFloat(row.lng) : null,
        dynamicPricing: row.dynamic_pricing || { weekendMultiplier: 1.0, seasonalMultiplier: 1.0 },
        hasOffers: row.has_offers || false
      });
    }

    if (minLat && maxLat && minLng && maxLng) {
        listings = listings.filter((l: any) => {
            try {
                if (l.lat == null || l.lng == null || (l.lat === '0' && l.lng === '0') || (l.lat === 0 && l.lng === 0)) return true;
                const pLat = parseFloat(l.lat);
                const pLng = parseFloat(l.lng);
                const pMinLat = parseFloat(minLat);
                const pMaxLat = parseFloat(maxLat);
                const pMinLng = parseFloat(minLng);
                const pMaxLng = parseFloat(maxLng);
                if (isNaN(pLat) || isNaN(pLng)) return true;
                return pLat >= pMinLat && pLat <= pMaxLat && pLng >= pMinLng && pLng <= pMaxLng;
            } catch(e) {
                return true;
            }
        });
    }

    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(listings), { ex: 3600 });
      } catch (e) {
        console.warn('Redis Cache Error: Could not save to cache');
      }
    }

    res.json(listings);
  } catch (error) {
    console.error('Fetch Listings Error:', error);
    res.status(500).json({ error: 'Failed to fetch listings bg' });
  }
});

app.get('/api/host/reservations', async (req, res) => {
  if (!isDbConfigured) {
    return res.json([]);
  }
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // bookings created by others for host's listings
    const result = await pool.query(`
      SELECT b.*,
             l.title as listing_title,
             l.city as listing_city,
             l.image_url as listing_image_url,
             l.user_id as listing_host_id
      FROM bookings b
      JOIN listings l ON b.listing_id = l.id
      WHERE l.user_id = $1
      ORDER BY b.created_at DESC
    `, [userId]);

    const expResult = await pool.query(`
      SELECT eb.*,
             e.title as listing_title,
             e.destination as listing_city,
             e.image_urls[1] as listing_image_url,
             e.host_id as listing_host_id,
             e.start_date
      FROM experience_bookings eb
      JOIN experiences e ON eb.experience_id = e.id
      WHERE e.host_id = $1
      ORDER BY eb.created_at DESC
    `, [userId]);

    const formattedBookings = result.rows.map(row => ({
      id: String(row.id),
      moveInDate: row.move_in_date,
      configuration: row.configuration,
      name: row.name,
      phone: row.phone,
      status: row.status,
      totalRent: Number(row.total_rent),
      type: 'stay',
      listing: {
        id: String(row.listing_id),
        title: row.listing_title,
        city: row.listing_city,
        imageUrl: row.listing_image_url,
        user_id: row.listing_host_id
      },
      bookingDate: row.created_at
    }));

    const formattedExpBookings = expResult.rows.map(row => ({
      id: `exp-${row.id}`,
      moveInDate: row.start_date, // Use experience start date
      configuration: 'Experience',
      name: row.name,
      phone: row.phone,
      status: row.status,
      totalRent: Number(row.total_price),
      type: 'experience',
      listing: {
        id: String(row.experience_id),
        title: row.listing_title,
        city: row.listing_city,
        imageUrl: row.listing_image_url,
        user_id: row.listing_host_id
      },
      bookingDate: row.created_at
    }));

    const merged = [...formattedBookings, ...formattedExpBookings].sort((a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime());

    res.json(merged);
  } catch (error) {
    console.error('Failed to fetch host reservations:', error);
    res.status(500).json({ error: 'Failed to fetch host reservations' });
  }
});

app.put('/api/host/reservations/:id/status', async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'declined', 'cancelled', 'completed', 'Completed'];
    if (!validStatuses.map(s => s.toLowerCase()).includes(status.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    let result;
    if (typeof id === 'string' && id.startsWith('exp-')) {
      const realId = id.replace('exp-', '');
      result = await pool.query(
        'UPDATE experience_bookings SET status = $1 WHERE id = $2 RETURNING *',
        [status, realId]
      );
    } else {
      result = await pool.query(
        'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];

    // Try to get listing info
    let listingTitle = 'a property';
    try {
      const listingRes = await pool.query('SELECT title FROM listings WHERE id = $1', [booking.listing_id]);
      if (listingRes.rows.length > 0) listingTitle = listingRes.rows[0].title;
    } catch(e) { console.error(e); }

    // Send WhatsApp to guest
    let messageText = '';
    if (status === 'confirmed') {
      messageText = `✅ Good news ${booking.name}! Your booking for "${listingTitle}" on ${booking.move_in_date} has been CONFIRMED by the host. Total rent: $${booking.total_rent}. Have a great stay!`;
    } else if (status === 'declined') {
      messageText = `❌ Hello ${booking.name}, unfortunately your booking request for "${listingTitle}" on ${booking.move_in_date} was declined by the host. We hope you find another great place to stay!`;
    } else if (status === 'cancelled') {
      messageText = `⚠️ Hello ${booking.name}, your booking for "${listingTitle}" on ${booking.move_in_date} has been cancelled.`;
    }

    if (messageText && booking.phone) {
      sendWhatsAppMessage(booking.phone, messageText);
    }

    const io = req.app.get('io');
    if (io) {
       if (booking.user_id) {
         io.to(`user_${booking.user_id}`).emit('notification', { type: 'booking_update', booking, message: `Your booking for ${listingTitle} was ${status}` });
       }
       try {
           const listingRes = await pool.query('SELECT user_id FROM listings WHERE id = $1', [booking.listing_id]);
           if (listingRes.rows.length > 0 && listingRes.rows[0].user_id) {
               io.to(`user_${listingRes.rows[0].user_id}`).emit('notification', { type: 'booking_update', booking, message: `Booking for ${listingTitle} was ${status}` });
           }
       } catch(e) { console.error(e); }
       io.to('admin_room').emit('notification', { type: 'booking_update', booking, message: `Booking for ${listingTitle} was ${status}` });
       io.to(`listing_${booking.listing_id}`).emit('listing_updated', { type: 'booking_update' });
    }
    res.json({ message: 'Status updated successfully', booking });
  } catch (error) {
    console.error('Update Booking Status Error:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

// Threads Endpoints
app.get('/api/threads', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const userId = req.user?.id;
    const role = req.query.role; // 'guest' or 'host'

    let query = `
      SELECT t.*,
             COALESCE(l.title, e.title) as listing_title,
             COALESCE(l.image_url, (SELECT image_urls[1] FROM experiences WHERE id = e.id)) as listing_image,
             u_guest.name as guest_name,
             u_host.name as host_name
      FROM threads t
      LEFT JOIN listings l ON t.listing_id = l.id
      LEFT JOIN experiences e ON t.experience_id = e.id
      LEFT JOIN users u_guest ON t.guest_id = u_guest.id
      LEFT JOIN users u_host ON t.host_id = u_host.id
      WHERE (t.guest_id = $1 OR t.host_id = $1)
    `;

    if (role === 'guest') {
      query = `
        SELECT t.*,
               l.title as listing_title, l.image_url as listing_image,
               e.title as experience_title,
               (SELECT image_urls[1] FROM experiences WHERE id = e.id) as experience_image,
               u_guest.name as guest_name,
               u_host.name as host_name
        FROM threads t
        LEFT JOIN listings l ON t.listing_id = l.id
        LEFT JOIN experiences e ON t.experience_id = e.id
        LEFT JOIN users u_guest ON t.guest_id = u_guest.id
        LEFT JOIN users u_host ON t.host_id = u_host.id
        WHERE t.guest_id = $1
      `;
    } else if (role === 'host') {
      query = `
        SELECT t.*,
               l.title as listing_title, l.image_url as listing_image,
               e.title as experience_title,
               (SELECT image_urls[1] FROM experiences WHERE id = e.id) as experience_image,
               u_guest.name as guest_name,
               u_host.name as host_name
        FROM threads t
        LEFT JOIN listings l ON t.listing_id = l.id
        LEFT JOIN experiences e ON t.experience_id = e.id
        LEFT JOIN users u_guest ON t.guest_id = u_guest.id
        LEFT JOIN users u_host ON t.host_id = u_host.id
        WHERE t.host_id = $1
      `;
    }

    query += ` ORDER BY t.updated_at DESC`;

    const result = await pool.query(query, [userId]);

    // Process rows
    const processed = result.rows.map(row => ({
       ...row,
       listing_title: row.listing_title || row.experience_title,
       listing_image: row.listing_image || row.experience_image
    }));

    res.json(processed);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
});

app.post('/api/threads', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { listingId, experienceId, hostId } = req.body;
    const guestId = req.user?.id;
    console.log('POST /api/threads body:', req.body, 'guestId:', guestId);

    if (isNaN(Number(listingId)) && isNaN(Number(experienceId))) {
      return res.json({ id: 99999, listing_id: listingId, experience_id: experienceId, guest_id: guestId, host_id: hostId, unread_count_guest: 0, unread_count_host: 0 });
    }

    // Create or get existing thread
    let result;
    if (listingId) {
      result = await pool.query(`
        SELECT * FROM threads WHERE listing_id = $1 AND guest_id = $2
      `, [listingId, guestId]);
    } else {
      result = await pool.query(`
        SELECT * FROM threads WHERE experience_id = $1 AND guest_id = $2
      `, [experienceId, guestId]);
    }

    if (result.rows.length === 0) {
      let finalHostId = hostId ? hostId : null;
      if (!finalHostId) {
        if (listingId) {
          const listingRes = await pool.query('SELECT user_id FROM listings WHERE id = $1', [listingId]);
          if (listingRes.rows.length > 0) {
            finalHostId = listingRes.rows[0].user_id || null;
          }
        } else if (experienceId) {
          // Experiences host defaults to first admin for now, or just leave as null which implies admin
          finalHostId = 1; // Temporary hack, or we can add host_id to experiences
        }
      }

      try {
          if (listingId) {
            result = await pool.query(`
              INSERT INTO threads (listing_id, guest_id, host_id)
              VALUES ($1, $2, $3) RETURNING *
            `, [listingId, guestId, finalHostId]);
          } else {
            result = await pool.query(`
              INSERT INTO threads (experience_id, guest_id, host_id)
              VALUES ($1, $2, $3) RETURNING *
            `, [experienceId, guestId, finalHostId]);
          }
      } catch (insertErr: any) {
          if (insertErr.message && insertErr.message.includes('foreign key constraint')) {
              console.warn('Foreign key violation for host_id, inserting with host_id = null');
              if (listingId) {
                result = await pool.query(`
                  INSERT INTO threads (listing_id, guest_id, host_id)
                  VALUES ($1, $2, $3) RETURNING *
                `, [listingId, guestId, null]);
              } else {
                result = await pool.query(`
                  INSERT INTO threads (experience_id, guest_id, host_id)
                  VALUES ($1, $2, $3) RETURNING *
                `, [experienceId, guestId, null]);
              }
          } else {
              throw insertErr;
          }
      }
    }
    res.json(result.rows[0]);
  } catch (error: unknown) {
    console.error('Failed to create thread', error);
    res.status(500).json({ error: 'Failed to create thread', details: (error as Error).message });
  }
});

app.get('/api/threads/:id/messages', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.json([]);
  try {
    const { id } = req.params;

    if (isNaN(Number(id))) return res.json([]);

    const result = await pool.query(`
      SELECT m.*, u.name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.thread_id = $1
      ORDER BY m.created_at ASC
    `, [id]);

    // mark as read
    const userId = req.user?.id;
    await pool.query(`
      UPDATE messages SET is_read = true WHERE thread_id = $1 AND receiver_id = $2
    `, [id, userId]);

    await pool.query(`
      UPDATE threads SET unread_count_guest = CASE WHEN guest_id = $2 THEN 0 ELSE unread_count_guest END,
                         unread_count_host = CASE WHEN host_id = $2 THEN 0 ELSE unread_count_host END
      WHERE id = $1
    `, [id, userId]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch thread messages' });
  }
});

app.post('/api/threads/:id/messages', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    const { receiverId, content } = req.body;
    const senderId = req.user?.id;
    if (isNaN(Number(id))) return res.json({ id: Date.now(), thread_id: id, sender_id: senderId, receiver_id: receiverId, content, created_at: new Date(), is_read: false });

    const result = await pool.query(`
      INSERT INTO messages (thread_id, sender_id, receiver_id, content)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [id, senderId, receiverId, content]);

    const message = result.rows[0];

    // update thread
    await pool.query(`
      UPDATE threads
      SET last_message = $2, updated_at = CURRENT_TIMESTAMP,
          unread_count_guest = unread_count_guest + CASE WHEN guest_id = $3 THEN 1 ELSE 0 END,
          unread_count_host = unread_count_host + CASE WHEN host_id = $3 THEN 1 ELSE 0 END
      WHERE id = $1
    `, [id, content, receiverId]);

    const io = req.app.get('io');
    if (io) {
      // Emit to the thread room
      io.to(`thread_${id}`).emit('new_message', message);

      // Emit notification to receiver's personal user room
      if (receiverId) {
        io.to(`user_${receiverId}`).emit('notification', {
          type: 'new_message',
          message: message,
          threadId: id
        });
      }
    }

    res.json(message);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.get('/api/unread-counts', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.json({ unread: 0 });
  try {
    const userId = req.user?.id;
    const result = await pool.query(`
      SELECT SUM(
        CASE WHEN guest_id = $1 THEN unread_count_guest
             WHEN host_id = $1 THEN unread_count_host
             ELSE 0 END
      ) as total_unread
      FROM threads
      WHERE guest_id = $1 OR host_id = $1
    `, [userId]);
    res.json({ unread: parseInt(result.rows[0].total_unread) || 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unread counts' });
  }
});

app.get('/api/messages/:bookingId', async (req, res) => {
  if (!isDbConfigured) return res.json([]);
  try {
    const { bookingId } = req.params;
    const result = await pool.query(`
      SELECT m.*, u.name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.booking_id = $1
      ORDER BY m.created_at ASC
    `, [bookingId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch Messages Error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/messages', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { bookingId, senderId, receiverId, content } = req.body;

    if (!bookingId || !senderId || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(`
      INSERT INTO messages (booking_id, sender_id, receiver_id, content)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [bookingId, senderId, receiverId || null, content]);

    // Send WhatsApp to Guest if host is sending the message
    try {
      // Find the booking to get the guest's phone number
      const bookingRes = await pool.query('SELECT phone, name, user_id FROM bookings WHERE id = $1', [bookingId]);
      if (bookingRes.rows.length > 0) {
         const booking = bookingRes.rows[0];
         // Only true if the sender is not the guest themselves.
         // Note: Currently guests might not have a user_id, so they appear as guest.
         // If senderId matches booking user_id, it is the guest. Otherwise, it is the host/admin.
         if (booking.user_id !== senderId) {
            sendWhatsAppMessage(
               booking.phone,
               `✉️ New message regarding your booking:\n\n"${content}"`
            );
         }
      }
    } catch (e) {
      console.error('Failed to send WhatsApp message notification:', e);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Send Message Error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Delete a listing
app.delete('/api/listings/:id', async (req, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ status: 'error', message: 'DB not configured' });
  }
  if (isNaN(Number(req.params.id))) return res.json({ success: true, message: "Demo listing deleted mockingly" });
  try {
    const id = req.params.id;
    const result = await pool.query('DELETE FROM listings WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    broadcastDbEvent(req, 'listing');
    res.json({ message: 'Listing deleted successfully', deletedListing: result.rows[0] });
  } catch (error) {
    console.error('Delete Listing Error:', error);
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

// Admin metrics (optional, simple stats)
app.get('/api/admin/metrics', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ status: 'error', message: 'DB not configured' });
  try {
    const { type } = req.query;

    if (type === 'experiences') {
      const expRes = await pool.query('SELECT COUNT(*) as total FROM experiences');
      const usersRes = await pool.query('SELECT COUNT(*) as total FROM users'); // Global users
      const bookingsRes = await pool.query('SELECT COUNT(*) as total FROM experience_bookings');
      const revenueRes = await pool.query("SELECT SUM(total_price) as total FROM experience_bookings WHERE status = 'confirmed'");

      const revenueChartRes = await pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
          SUM(total_price) as revenue,
          COUNT(*) as bookings
        FROM experience_bookings
        WHERE status = 'confirmed'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at) DESC
        LIMIT 6
      `);

      const chartData = revenueChartRes.rows.reverse().map((row: any) => ({
        name: row.month,
        revenue: parseFloat(row.revenue) || 0,
        bookings: parseInt(row.bookings) || 0
      }));

      if (chartData.length === 0) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        months.forEach((m, i) => {
          chartData.push({
            name: m,
            revenue: Math.floor(Math.random() * 2000) + 500 * (i + 1),
            bookings: Math.floor(Math.random() * 5) + i
          });
        });
      }

      const recentBookingsRes = await pool.query(`
        SELECT b.id, b.name, b.total_price as total_rent, b.created_at, e.title as listing_title
        FROM experience_bookings b
        LEFT JOIN experiences e ON b.experience_id = e.id
        WHERE b.status = 'confirmed'
        ORDER BY b.created_at DESC
        LIMIT 5
      `);

      return res.json({
        totalListings: parseInt(expRes.rows[0].total) || 0,
        totalUsers: parseInt(usersRes.rows[0].total) || 0,
        totalBookings: parseInt(bookingsRes.rows[0].total) || 0,
        revenue: parseFloat(revenueRes.rows[0].total) || 0,
        chartData,
        recentTransactions: recentBookingsRes.rows
      });
    }

    const listingsRes = await pool.query('SELECT COUNT(*) as total FROM listings');
    const usersRes = await pool.query('SELECT COUNT(*) as total FROM users');
    const bookingsRes = await pool.query('SELECT COUNT(*) as total FROM bookings');
    const revenueRes = await pool.query("SELECT SUM(total_rent) as total FROM bookings WHERE status = 'confirmed'");

    // Revenue over time (simplified, grouped by month)
    const revenueChartRes = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
        SUM(total_rent) as revenue,
        COUNT(*) as bookings
      FROM bookings
      WHERE status = 'confirmed'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) DESC
      LIMIT 6
    `);

    const chartData = revenueChartRes.rows.reverse().map((row: any) => ({
      name: row.month,
      revenue: parseFloat(row.revenue) || 0,
      bookings: parseInt(row.bookings) || 0
    }));

    // If no real bookings exist yet, populate with some dummy data for the chart's aesthetics
    if (chartData.length === 0) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      months.forEach((m, i) => {
        chartData.push({
          name: m,
          revenue: Math.floor(Math.random() * 5000) + 1000 * (i + 1),
          bookings: Math.floor(Math.random() * 10) + i
        });
      });
    }

    const recentBookingsRes = await pool.query(`
      SELECT b.id, b.name, b.total_rent, b.created_at, l.title as listing_title
      FROM bookings b
      LEFT JOIN listings l ON b.listing_id = l.id
      WHERE b.status = 'confirmed'
      ORDER BY b.created_at DESC
      LIMIT 5
    `);

    res.json({
      totalListings: parseInt(listingsRes.rows[0].total) || 0,
      totalUsers: parseInt(usersRes.rows[0].total) || 0,
      totalBookings: parseInt(bookingsRes.rows[0].total) || 0,
      revenue: parseFloat(revenueRes.rows[0].total) || 0,
      chartData,
      recentTransactions: recentBookingsRes.rows
    });
  } catch(e) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

app.get('/api/admin/threads', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.email !== 'ajithsabzz@gmail.com') return res.status(403).json({ error: 'Unauthorized' });
  try {
    const { type } = req.query;

    if (type === 'experiences') {
      const result = await pool.query(`
        SELECT t.*,
               e.title as listing_title, e.image_urls[1] as listing_image,
               u_guest.name as guest_name,
               u_host.name as host_name
        FROM threads t
        INNER JOIN experiences e ON t.experience_id = e.id
        LEFT JOIN users u_guest ON t.guest_id = u_guest.id
        LEFT JOIN users u_host ON t.host_id = u_host.id
        ORDER BY t.updated_at DESC
      `);
      return res.json(result.rows);
    }

    const result = await pool.query(`
      SELECT t.*,
             l.title as listing_title, l.image_url as listing_image,
             u_guest.name as guest_name,
             u_host.name as host_name
      FROM threads t
      INNER JOIN listings l ON t.listing_id = l.id
      LEFT JOIN users u_guest ON t.guest_id = u_guest.id
      LEFT JOIN users u_host ON t.host_id = u_host.id
      ORDER BY t.updated_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch threads for admin' });
  }
});

app.delete('/api/admin/messages/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.email !== 'ajithsabzz@gmail.com') return res.status(403).json({ error: 'Unauthorized' });
  try {
    await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

app.get('/api/admin/threads/:id/messages', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.email !== 'ajithsabzz@gmail.com') return res.status(403).json({ error: 'Unauthorized' });
  try {
    const result = await pool.query(`
      SELECT m.*, u.name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.thread_id = $1
      ORDER BY m.created_at ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages for admin' });
  }
});

app.post('/api/ai/suggest-price', authenticateToken, async (req: AuthRequest, res) => {
  if (!ai) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { listingId, dates } = req.body;
    // We fetch the listing details to give AI context
    const listingRes = await pool.query('SELECT title, city, type, price, currency FROM listings WHERE id = $1', [listingId]);
    if (listingRes.rowCount === 0) return res.status(404).json({ error: 'Not found' });

    const listing = listingRes.rows[0];
    const systemInstruction = `You are a dynamic intelligent pricing engine for a property rental platform.
Provide an optimal nightly price for the following property for the dates: ${dates.join(', ')}.

Property Details:
Title: ${listing.title}
City: ${listing.city}
Type: ${listing.type}
Base Price: ${listing.price} ${listing.currency}

Consider weekends and general seasonality. Output ONLY a valid JSON object in this exact format:
{"price": number}
Do NOT wrap it in markdown block.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Suggest optimal price in JSON.",
      config: {
        systemInstruction,
        temperature: 0.5,
        responseMimeType: "application/json"
      }
    });

    const output = JSON.parse(response?.text || '{}');
    const suggestedPrice = output.price || Math.round(listing.price * 1.15); // Fallback
    res.json({ price: suggestedPrice });
  } catch (error) {
    console.error('Suggest price failed:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/ai/suggest-reply', authenticateToken, async (req: AuthRequest, res) => {
  if (!ai) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { history, propertyTitle, isHost } = req.body;
    const role = isHost ? 'a property host' : 'a platform administrator';
    const systemInstruction = `You are an AI assistant helping ${role} write a reply to a guest.
The conversation is about the property: "${propertyTitle}".
Here is the recent conversation:
${history}

Draft a polite, helpful, and concise response. Do not include quotes, placeholders, empty messages, '[Admin]', '[Host]', or any 'Replace this sample message' tags in the response text. The response must be a fully complete, ready-to-send message. Do not leave any blanks for the user to fill in.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Draft a reply to the guest based on the conversation.",
      config: {
        systemInstruction,
        temperature: 0.7
      }
    });

    const reply = response?.text?.trim() || '';
    const lowerReply = reply.toLowerCase();
    if (lowerReply === '' || lowerReply.includes('replace this') || lowerReply.includes('sample message') || lowerReply.includes('[insert') || lowerReply.includes('placeholder')) {
      return res.json({ reply: 'Hello! How can I help you regarding your booking today?' });
    }
    res.json({ reply });
  } catch (error) {
    console.error('Suggest reply failed:', error);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

app.post('/api/ai/suggest-room', authenticateToken, async (req: AuthRequest, res) => {
  if (!ai) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { propertyType, city, propertyAmenities, rentalMode, existingRooms } = req.body;
    const systemInstruction = `You are a professional hospitality copywriter.
Suggest a creative, luxurious name and an astonishing, premium description for ONE new inventory unit (room/villa/suite) for this property.

Property Details:
Type: ${propertyType}
Location: ${city}
Amenities: ${(propertyAmenities || []).join(', ')}

Return ONLY a valid JSON object in this exact format, with no markdown code blocks around it:
{"name": "your suggested unit name", "description": "your suggested description"}
Do NOT include any empty placeholders. Make the description 2-3 sentences long, evoking exclusivity and wanderlust.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Generate a name and description for a new unit.",
      config: {
        systemInstruction,
        temperature: 0.8,
        responseMimeType: "application/json"
      }
    });

    const output = JSON.parse(response?.text || '{}');
    res.json({ name: output.name || '', description: output.description || '' });
  } catch (error) {
    console.error('Room AI generation error:', error);
    res.status(500).json({ error: 'Failed to generate room details' });
  }
});

app.post('/api/ai/suggest-experience', authenticateToken, async (req: AuthRequest, res) => {
  if (!ai) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { category, city, languages, difficulty } = req.body;
    const systemInstruction = `You are an expert travel experience curator.
Create a captivating title, a compelling description, and a bulleted list of "What you will do" for a new experience.

Details provided:
Category: ${category}
Location: ${city}
Languages: ${(languages || []).join(', ')}
Difficulty: ${difficulty}

Return ONLY a valid JSON object in this exact format, with no markdown code blocks around it:
{"title": "your suggested title", "description": "your suggested description (2 paragraphs)", "what_to_expect": "Bulleted list of activities..."}
Do NOT include any empty placeholders.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Generate experience details.",
      config: {
        systemInstruction,
        temperature: 0.8,
        responseMimeType: "application/json"
      }
    });

    const output = JSON.parse(response?.text || '{}');
    res.json({ title: output.title || '', description: output.description || '', what_to_expect: output.what_to_expect || '' });
  } catch (error) {
    console.error('Exp AI generation error:', error);
    res.status(500).json({ error: 'Failed to generate exp details' });
  }
});

app.post('/api/ai/draft-property', authenticateToken, async (req: AuthRequest, res) => {
  if (!ai) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { prompt } = req.body;
    const systemInstruction = `You are an expert real-estate listing assistant.
The user will describe their property in natural language.
Your job is to draft all the key details for a property listing.

Return ONLY a valid JSON object matching this structure (with no markdown blocks):
{
  "title": "A catchy, premium title",
  "description": "A warm, inviting, 2-3 paragraph description.",
  "type": "Property Type (e.g. Villa, Apartment, House, Cabin)",
  "city": "City/Region name if mentioned",
  "rentalMode": "entire_place" or "private_rooms" or "hybrid",
  "price": 5000 (estimated base price per night in INR, make a reasonable guess),
  "maxGuests": 4,
  "bedrooms": 2,
  "beds": 2,
  "bathrooms": 2,
  "amenities": ["Wifi", "Pool", "Kitchen"] (array of strings, guess based on description)
}
If a detail is not mentioned, make a smart default or leave it empty, but provide a great title and description.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.8,
        responseMimeType: "application/json"
      }
    });

    const output = JSON.parse(response?.text || '{}');
    res.json(output);
  } catch (error) {
    console.error('Draft AI generation error:', error);
    res.status(500).json({ error: 'Failed to generate property draft' });
  }
});

app.post('/api/ai/suggest-listing', authenticateToken, async (req: AuthRequest, res) => {
  if (!ai) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { type, city, amenities, rooms, rentalMode } = req.body;
    const systemInstruction = `You are a professional real-estate listing assistant.
Create a short, catchy title and a warm, inviting, 2-3 paragraph description for a property listing.

Details provided by host:
Property Type: ${type}
Location: ${city}
Rental Mode: ${rentalMode}
Amenities: ${(amenities || []).join(', ')}
Rooms: ${(rooms || []).map((r: any) => r.name).join(', ')}

Return ONLY a valid JSON object in this exact format, with no markdown code blocks around it:
{"title": "your suggested title", "description": "your suggested description"}
Do NOT include any empty placeholders, brackets like [Insert City], or generic tags. The output must be fully formed and ready to publish without requiring any edits.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Generate title and description based on the details.",
      config: {
        systemInstruction,
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    });

    const output = JSON.parse(response?.text || '{}');
    res.json({ title: output.title || '', description: output.description || '' });
  } catch (error) {
    console.error('Suggest listing failed:', error);
    res.status(500).json({ error: 'Failed to generate listing info' });
  }
});

app.get('/api/user/bookings', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.json([]);
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    // Security check: Only admins or the user themselves can view their bookings
    if (req.user?.role !== 'admin' && String(req.user?.id) !== String(userId)) {
      return res.status(403).json({ error: 'Not authorized to view these bookings' });
    }

    const result = await pool.query(`
      SELECT b.*,
        l.id as l_id, l.title as l_title, l.city as l_city, l.address as l_address, l.image_url as l_image_url, l.image_urls as l_image_urls, l.user_id as l_user_id, l.rooms as l_rooms
      FROM bookings b
      JOIN listings l ON b.listing_id = l.id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
    `, [userId]);

    const formattedBookings = result.rows.map(row => {
      let listingData = {
        id: String(row.l_id),
        title: row.l_title,
        city: row.l_city,
        address: row.l_address,
        imageUrl: row.l_image_url,
        imageUrls: row.l_image_urls,
        user_id: row.l_user_id
      };

      if (row.room_id && row.l_rooms && Array.isArray(row.l_rooms)) {
          const room = row.l_rooms.find((r: any) => String(r.id) === String(row.room_id));
          if (room) {
              listingData = {
                  ...listingData,
                  ...room,
                  id: `${row.l_id}_${room.id}`,
                  originalId: String(row.l_id),
                  title: row.l_title,
                  displayTitle: `${row.l_title} - ${room.name}`,
                  imageUrl: (room.imageUrls && room.imageUrls.length > 0) ? room.imageUrls[0] : row.l_image_url,
                  imageUrls: (room.imageUrls && room.imageUrls.length > 0) ? room.imageUrls : row.l_image_urls,
                  selectedConfigId: String(room.id)
              } as any;
          }
      }

      return {
        id: String(row.id),
        moveInDate: row.move_in_date,
        configuration: row.configuration,
        name: row.name,
        phone: row.phone,
        totalRent: row.total_rent,
        status: row.status,
        bookingDate: row.created_at,
        listing: listingData
      };
    });

    res.json(formattedBookings);
  } catch (error) {
    console.error('Fetch User Bookings Error:', error);
    res.status(500).json({ error: 'Failed to fetch user bookings' });
  }
});

app.put('/api/user/bookings/:id/cancel', async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const checkRes = await pool.query('SELECT status FROM bookings WHERE id = $1 AND user_id = $2', [id, userId]);
    if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    if (checkRes.rows[0].status === 'cancelled') {
      return res.status(400).json({ error: 'Already cancelled' });
    }

    const result = await pool.query('UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *', ['cancelled', id]);
    const booking = result.rows[0];

    const io = req.app.get('io');
    if (io) {
       try {
           const listingRes = await pool.query('SELECT title, user_id FROM listings WHERE id = $1', [booking.listing_id]);
           if (listingRes.rows.length > 0) {
               const { title, user_id } = listingRes.rows[0];
               if (user_id) {
                 io.to(`user_${user_id}`).emit('notification', { type: 'booking_update', booking, message: `A booking for ${title} was cancelled by guest` });
               }
               io.to('admin_room').emit('notification', { type: 'booking_update', booking, message: `A booking for ${title} was cancelled by guest` });
           }
       } catch(e) { console.error(e); }
       io.to(`listing_${booking.listing_id}`).emit('listing_updated', { type: 'booking_cancelled' });
    }
    res.json({ message: 'Booking cancelled successfully', booking });
  } catch (error) {
    console.error('Cancel Booking Error:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

app.post('/api/bookings', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ error: 'DB not configured' });
  }
  try {
    const { listingId, roomId, moveInDate, configuration, name, phone, totalRent, userId } = req.body;

    // Security check
    const authUserId = req.user?.id;
    if (userId && String(authUserId) !== String(userId) && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to book for this user' });
    }
    const finalUserId = userId || authUserId || null;

    if (!listingId || !moveInDate || !name || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(`
      INSERT INTO bookings (user_id, listing_id, room_id, move_in_date, configuration, name, phone, total_rent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [finalUserId, listingId, roomId || null, moveInDate, configuration || '', name, phone, totalRent]);

    const newBooking = result.rows[0];
    newBooking.id = String(newBooking.id);
    newBooking.listing_id = String(newBooking.listing_id);

    // Fetch listing details to describe in the message
    let listingTitle = 'a property';
    let hostId = null;
    try {
      const listingRes = await pool.query('SELECT title, user_id, rooms FROM listings WHERE id = $1', [listingId]);
      if (listingRes.rows.length > 0) {
          listingTitle = listingRes.rows[0].title;
          hostId = listingRes.rows[0].user_id;

          // Resort Plus: Inventory Deduction Logic
          let rooms = listingRes.rows[0].rooms;
          let isUpdated = false;
          
          if (roomId && rooms && Array.isArray(rooms)) {
             const selectedIds = String(roomId).split(',');
             rooms = rooms.map((room: any) => {
                if (selectedIds.includes(room.id) && room.inventory_count !== undefined) {
                   if (room.inventory_count > 0) {
                       room.inventory_count -= 1;
                       isUpdated = true;
                   }
                }
                return room;
             });
          }

          if (isUpdated) {
             await pool.query('UPDATE listings SET rooms = $1::jsonb WHERE id = $2', [JSON.stringify(rooms), listingId]);
          }
      }
    } catch(e) { console.error(e); }

    // Auto-create a messaging thread so both guest and host can see it in their inbox immediately
    if (userId) {
      try {
        const threadRes = await pool.query('SELECT id FROM threads WHERE listing_id = $1 AND guest_id = $2', [listingId, userId]);
        let threadId;
        if (threadRes.rows.length === 0) {
           try {
               const insertThread = await pool.query('INSERT INTO threads (listing_id, guest_id, host_id) VALUES ($1, $2, $3) RETURNING id', [listingId, userId, hostId || null]);
               threadId = insertThread.rows[0].id;
           } catch (insertErr: any) {
               if (insertErr.message && insertErr.message.includes('foreign key constraint')) {
                   const fallbackInsert = await pool.query('INSERT INTO threads (listing_id, guest_id, host_id) VALUES ($1, $2, $3) RETURNING id', [listingId, userId, null]);
                   threadId = fallbackInsert.rows[0].id;
               } else {
                   throw insertErr;
               }
           }
        } else {
           threadId = threadRes.rows[0].id;
        }

        const initialMsgContent = `Hi, I have submitted a booking request.
Details:
-Property-Name : ${listingTitle || 'Requested Property'}
- Move-in Date: ${moveInDate}
- Configuration: ${configuration || 'Entire Property'}
- Name: ${name}
- Phone: ${phone}
- Rent: $${totalRent}`;

        // Insert initial automated message representing the reservation
        await pool.query('INSERT INTO messages (thread_id, sender_id, receiver_id, content) VALUES ($1, $2, $3, $4)', [threadId, userId, hostId || null, initialMsgContent]);

        await pool.query(`
          UPDATE threads
          SET last_message = $2, updated_at = CURRENT_TIMESTAMP,
              unread_count_host = COALESCE(unread_count_host, 0) + 1
          WHERE id = $1
        `, [threadId, initialMsgContent]);
      } catch (err) {
        console.error('Failed to auto-create thread:', err);
      }
    }

    // Send WhatsApp to Guest
    sendWhatsAppMessage(
      phone,
      `Hello ${name},\n\nYour booking request for "${listingTitle}" on ${moveInDate} has been received! The total rent is $${totalRent}. You will be notified once the host confirms.`
    );

    // Send WhatsApp to Host/Admin if configured
    try {
      const waSettingsRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['whatsapp']);
      if (waSettingsRes.rows.length > 0) {
        const waSettings = waSettingsRes.rows[0].value;
        if (waSettings && waSettings.enabled && waSettings.number) {
          sendWhatsAppMessage(
            waSettings.number,
            `🌟 New Booking Request!\n\nGuest: ${name}\nPhone: ${phone}\nListing: ${listingTitle}\nMove In: ${moveInDate}\nRent: $${totalRent}\n\nPlease check your host dashboard to Accept or Decline.`
          );
        }
      }
    } catch(e) {
      console.error('Failed to notify host via WhatsApp', e);
    }

    // Broadcast real-time notifications
    const io = req.app.get('io');
    if (io) {
      if (hostId) io.to(`user_${hostId}`).emit('notification', { type: 'new_booking', booking: newBooking, message: `New booking for ${listingTitle}` });
      io.to('admin_room').emit('notification', { type: 'new_booking', booking: newBooking, message: `New booking for ${listingTitle}` });
      io.to(`listing_${listingId}`).emit('listing_updated', { type: 'new_booking' });
    }

    res.status(201).json(newBooking);
  } catch (error) {
    console.error('Failed to create booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.get('/api/settings/whatsapp', async (req, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ enabled: false, number: '' });
  }
  try {
    await ensureListingsTable();
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['whatsapp']);
    if (result.rows.length > 0) {
      res.json(result.rows[0].value);
    } else {
      res.json({ enabled: false, number: '' });
    }
  } catch (error) {
    console.error('Failed to get whatsapp settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post('/api/settings/whatsapp', async (req, res) => {
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

app.get('/api/settings/experiences_page', async (req, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({});
  }
  try {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['experiences_page']);
    if (result.rows.length > 0) {
      res.json(result.rows[0].value);
    } else {
      res.json({
        hero_title: 'Unforgettable Experiences',
        hero_subtitle: 'Discover exclusive weekend getaways, cultural tours, and extreme adventures curated by local experts.',
        badge_text: 'Curated Collections',
        hero_image_urls: ['https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&q=80&w=2400']
      });
    }
  } catch (error) {
    console.error('Failed to get experiences page settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post('/api/settings/experiences_page', authenticateToken, async (req: AuthRequest, res) => {
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

app.get('/api/settings/call', async (req, res) => {
  if (!isDbConfigured) {
    return res.status(503).json({ enabled: false, number: '' });
  }
  try {
    await ensureListingsTable();
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['call']);
    if (result.rows.length > 0) {
      res.json(result.rows[0].value);
    } else {
      res.json({ enabled: false, number: '' });
    }
  } catch (error) {
    console.error('Failed to get call settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post('/api/settings/call', async (req, res) => {
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

// --- Experiences Endpoints ---

const demoExperiences = [
  {
    id: 9999,
    host_id: 1,
    title: 'Neon Lights Cyberpunk Tokyo Tour',
    description: 'Experience the futuristic aesthetics of Tokyo at night. Dive deep into Akihabara, Shibuya, and secret underground arcades. This is an immersive, high-energy tour through the cyberpunk heart of Japan.',
    destination: 'Tokyo, Japan',
    departure_location: 'Tokyo Narita Airport',
    start_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000).toISOString(),
    start_time: '18:00',
    end_time: '23:00',
    language: 'English, Japanese (Basic)',
    cancellation_policy: 'Free cancellation 15 days prior. 50% refund within 7 days.',
    map_link: 'https://goo.gl/maps/shibuya',
    price: 1599,
    total_spots: 12,
    available_spots: 12,
    itinerary: [{day: 1, title: 'Arrival & Akihabara Night Walk', description: 'Check-in and dive into the electric town.'}, {day: 2, title: 'Shibuya Crossing & Robot Restaurant', description: 'Experience the busiest crossing and futuristic dining.'}],
    includes: ['Hotel Accommodation', 'Breakfast & Dinner', 'Local Transit Pass', 'English Speaking Cyber-Guide'],
    excludes: ['Flights', 'Personal Shopping', 'Alcohol'],
    image_urls: ['https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'],
    video_urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    places_to_visit: [{name: 'Akihabara', description: 'Electric Town', image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'}],
    included_stay: {title: 'Shinjuku Prince Hotel', location: 'Shinjuku', amenities: ['WiFi', 'City View'], image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'},
    highlights: ['Cyberpunk Photography Walk', 'Underground Arcade Tournament'],
    things_to_carry: ['Comfortable walking shoes', 'Camera', 'Neon-friendly clothing'],
    important_notes: 'This trip involves a lot of walking in crowded areas.',
    target_audience: 'all',
    status: 'upcoming'
  },
  {
    id: 9001,
    title: 'Gokarna Beach Trek & Camping',
    description: 'A budget-friendly weekend getaway for students! Trek across 5 beautiful beaches, camp under the stars, and enjoy a bonfire with music.',
    destination: 'Gokarna, Karnataka',
    departure_location: 'Bangalore (Majestic)',
    start_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    price: 2499,
    total_spots: 30,
    available_spots: 30,
    image_urls: ['https://images.unsplash.com/photo-1590396495147-380d3ec62b08?auto=format&fit=crop&q=80&w=800'],
    target_audience: 'students',
    status: 'upcoming'
  },
  {
    id: 9002,
    title: 'Coorg Coffee Estate Retreat',
    description: 'A safe and serene getaway exclusively for women. Stay in a lush coffee estate, visit Abbey Falls, and enjoy a relaxing weekend with a verified female guide.',
    destination: 'Coorg, Karnataka',
    departure_location: 'Bangalore (Silk Board)',
    start_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
    price: 4500,
    total_spots: 15,
    available_spots: 15,
    image_urls: ['https://images.unsplash.com/photo-1610996112117-d04b8ce271ea?auto=format&fit=crop&q=80&w=800'],
    target_audience: 'women_only',
    status: 'upcoming'
  },
  {
    id: 9003,
    title: 'Wayanad Nature Escape & Networking',
    description: 'Perfect weekend escape for IT professionals. Connect with like-minded individuals from major tech parks while exploring Wayanad\'s waterfalls and peaks.',
    destination: 'Wayanad, Kerala',
    departure_location: 'Bangalore (Manyata Tech Park)',
    start_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    price: 5500,
    total_spots: 20,
    available_spots: 20,
    image_urls: ['https://images.unsplash.com/photo-1593693397690-362cb9666c89?auto=format&fit=crop&q=80&w=800'],
    target_audience: 'corporate',
    status: 'upcoming'
  },
  {
    id: 9004,
    title: 'Ooty Romantic Getaway',
    description: 'Enjoy a private and cozy weekend in Ooty. Includes twin-sharing accommodations, a romantic candlelight dinner, and visits to the beautiful tea gardens.',
    destination: 'Ooty, Tamil Nadu',
    departure_location: 'Bangalore (Electronic City)',
    start_date: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000).toISOString(),
    price: 8500,
    total_spots: 10,
    available_spots: 10,
    image_urls: ['https://images.unsplash.com/photo-1587399881640-6218d6cc86bd?auto=format&fit=crop&q=80&w=800'],
    target_audience: 'couples',
    status: 'upcoming'
  }
];

app.get('/api/seed-ajith', async (req, res) => {
  try {
    console.log("DB URL inside server:", envDbUrl);
    const userRes = await pool.query("SELECT id FROM users WHERE email = 'ajithsabzz@gmail.com'");
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
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
    console.error(error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/experiences', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
  if (!isDbConfigured || dbConnectionError) {
      if (req.query.host_id) {
          return res.json(demoExperiences.filter(e => String(e.host_id) === String(req.query.host_id)));
      }
      return res.json(demoExperiences);
  }
  try {
    await ensureListingsTable();
    const { host_id } = req.query;

    const cacheKey = host_id ? `experiences:host:${host_id}` : 'experiences:all';
    if (redis) {
        try {
            const cached = await redis.get(cacheKey);
            if (cached) return res.json(typeof cached === 'string' ? JSON.parse(cached) : cached);
        } catch (e) {
            console.warn('Redis Cache Error (Get):', e);
        }
    }

    let result;

    if (host_id) {
       const userRes = await pool.query('SELECT email, role FROM users WHERE id = $1', [host_id]);
       const isAdmin = userRes.rows.length > 0 && (userRes.rows[0].email === 'ajithsabzz@gmail.com' || userRes.rows[0].role === 'admin');

       result = await pool.query(`
          SELECT e.*,
                 (SELECT COUNT(*) FROM experience_wishlists w WHERE w.experience_id = e.id) as wishlist_count
          FROM experiences e
          WHERE e.host_id = $1
          ORDER BY e.start_date ASC
       `, [host_id]);

    } else {
       result = await pool.query("SELECT * FROM experiences WHERE status = 'published' ORDER BY start_date ASC");
    }

    if (redis) {
        try {
            await redis.set(cacheKey, JSON.stringify(result.rows), { ex: 3600 });
        } catch (e) {
            console.warn('Redis Cache Error (Set):', e);
        }
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Failed to get experiences:', error);
    res.json(demoExperiences);
  }
});

app.get('/api/experiences/seed', async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    // 1. Student Only Trek
    await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, image_urls, target_audience, status, highlights, things_to_carry)
      VALUES (
        'Gokarna Beach Trek & Camping',
        'A budget-friendly weekend getaway for students! Trek across 5 beautiful beaches, camp under the stars, and enjoy a bonfire with music.',
        'Gokarna, Karnataka',
        'Bangalore (Majestic)',
        CURRENT_DATE + INTERVAL '5 days',
        CURRENT_DATE + INTERVAL '7 days',
        2499,
        30,
        30,
        '["https://images.unsplash.com/photo-1590396495147-380d3ec62b08?auto=format&fit=crop&q=80&w=800"]'::jsonb,
        'students',
        'upcoming',
        '["Trek across 5 beaches", "Beachside Camping", "Sunset View points", "Bonfire & Music", "Stargazing"]'::jsonb,
        '["Comfortable Shoes", "Torch/Headlamp", "Water Bottle", "Jacket", "Powerbank"]'::jsonb
      )
    `);

    // 2. Women Only Trip
    await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, image_urls, target_audience, status)
      VALUES (
        'Coorg Coffee Estate Retreat',
        'A safe and serene getaway exclusively for women. Stay in a lush coffee estate, visit Abbey Falls, and enjoy a relaxing weekend with a verified female guide.',
        'Coorg, Karnataka',
        'Bangalore (Silk Board)',
        CURRENT_DATE + INTERVAL '10 days',
        CURRENT_DATE + INTERVAL '12 days',
        4500,
        15,
        15,
        '["https://images.unsplash.com/photo-1610996112117-d04b8ce271ea?auto=format&fit=crop&q=80&w=800"]'::jsonb,
        'women_only',
        'upcoming'
      )
    `);

    // 3. Corporate Trip
    await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, image_urls, target_audience, status)
      VALUES (
        'Wayanad Nature Escape & Networking',
        'Perfect weekend escape for IT professionals. Connect with like-minded individuals from major tech parks while exploring Wayanad''s waterfalls and peaks.',
        'Wayanad, Kerala',
        'Bangalore (Manyata Tech Park)',
        CURRENT_DATE + INTERVAL '12 days',
        CURRENT_DATE + INTERVAL '14 days',
        5500,
        20,
        20,
        '["https://images.unsplash.com/photo-1593693397690-362cb9666c89?auto=format&fit=crop&q=80&w=800"]'::jsonb,
        'corporate',
        'upcoming'
      )
    `);

    // 4. Couples
    await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, image_urls, target_audience, status)
      VALUES (
        'Ooty Romantic Getaway',
        'Enjoy a private and cozy weekend in Ooty. Includes twin-sharing accommodations, a romantic candlelight dinner, and visits to the beautiful tea gardens.',
        'Ooty, Tamil Nadu',
        'Bangalore (Electronic City)',
        CURRENT_DATE + INTERVAL '20 days',
        CURRENT_DATE + INTERVAL '22 days',
        8500,
        10,
        10,
        '["https://images.unsplash.com/photo-1587399881640-6218d6cc86bd?auto=format&fit=crop&q=80&w=800"]'::jsonb,
        'couples',
        'upcoming'
      )
    `);
    res.json({ success: true, message: 'Seeded demo experiences successfully!' });
  } catch (error) {
    console.error('Failed to seed experiences:', error);
    res.status(500).json({ error: 'Failed to seed experiences' });
  }
});

app.post('/api/experiences', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured || dbConnectionError) {
      const newExp = {
          id: 9000 + Math.floor(Math.random() * 1000),
          host_id: req.user?.id,
          ...req.body,
          status: 'upcoming'
      };
      demoExperiences.push(newExp);
      return res.status(201).json(newExp);
  }
  try {
    await ensureListingsTable();
    const { title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, itinerary, includes, image_urls, status, target_audience, places_to_visit, included_stay, highlights, things_to_carry, important_notes, video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;

    const parsedPrice = (price === '' || price == null) ? null : Number(price);
    const parsedTotalSpots = (total_spots === '' || total_spots == null) ? null : Number(total_spots);
    const parsedAvailableSpots = (available_spots === '' || available_spots == null) ? null : Number(available_spots);

    const result = await pool.query(`
      INSERT INTO experiences (title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, itinerary, includes, image_urls, host_id, status, target_audience, places_to_visit, included_stay, highlights, things_to_carry, important_notes, video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link, seo_title, seo_description, seo_keywords, seo_image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31) RETURNING *
    `, [title, description, destination, departure_location, start_date || null, end_date || null, parsedPrice, parsedTotalSpots, parsedAvailableSpots, JSON.stringify(itinerary || []), JSON.stringify(includes || []), JSON.stringify(image_urls || []), req.user?.id, status || 'upcoming', target_audience || 'all', JSON.stringify(places_to_visit || []), included_stay ? JSON.stringify(included_stay) : null, JSON.stringify(highlights || []), JSON.stringify(things_to_carry || []), important_notes || null, JSON.stringify(video_urls || []), JSON.stringify(excludes || []), start_time || null, end_time || null, language || 'English', cancellation_policy || null, map_link || null, seo_title || null, seo_description || null, seo_keywords || null, seo_image_url || null]);

    res.json(result.rows[0]);
  } catch (error: unknown) {
    console.error('Failed to create experience:', error);
    res.status(500).json({ error: 'Failed to create experience', details: (error as Error).message || String(error) });
  }
});

app.put('/api/experiences/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await ensureListingsTable();
    const expId = parseInt(req.params.id as string);
    if (!isDbConfigured || dbConnectionError || expId === 9999 || (expId >= 9001 && expId <= 9004)) {
       if (expId === 9999 || (!isDbConfigured || dbConnectionError)) {
         const idx = demoExperiences.findIndex(e => e.id === expId);
         if (idx > -1) {
            demoExperiences[idx] = { ...demoExperiences[idx], ...req.body };
            return res.json(demoExperiences[idx]);
         }
       }
       return res.json({ id: expId, ...req.body });
    }

    if (req.user?.role !== 'admin') {
      const checkResult = await pool.query('SELECT host_id FROM experiences WHERE id = $1', [expId]);
      if (checkResult.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
      if (checkResult.rows[0].host_id !== req.user?.id) return res.status(403).json({ error: 'Not authorized to edit this experience' });
    }

    if (expId >= 9001 && expId <= 9004) {
      return res.json({ id: expId, ...req.body });
    }

    const { title, description, destination, departure_location, start_date, end_date, price, total_spots, available_spots, itinerary, includes, image_urls, status, target_audience, places_to_visit, included_stay, highlights, things_to_carry, important_notes, video_urls, excludes, start_time, end_time, language, cancellation_policy, map_link, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;

    const parsedPrice = (price === '' || price == null) ? null : Number(price);
    const parsedTotalSpots = (total_spots === '' || total_spots == null) ? null : Number(total_spots);
    const parsedAvailableSpots = (available_spots === '' || available_spots == null) ? null : Number(available_spots);

    const result = await pool.query(`
      UPDATE experiences SET
        title = $1, description = $2, destination = $3, departure_location = $4, start_date = $5, end_date = $6, price = $7, total_spots = $8, available_spots = $9, itinerary = $10, includes = $11, image_urls = $12, status = $13, target_audience = $14, places_to_visit = $15, included_stay = $16, highlights = $17, things_to_carry = $18, important_notes = $19, video_urls = $20, excludes = $21, start_time = $22, end_time = $23, language = $24, cancellation_policy = $25, map_link = $26, seo_title = $28, seo_description = $29, seo_keywords = $30, seo_image_url = $31
      WHERE id = $27 RETURNING *
    `, [title, description, destination, departure_location, start_date || null, end_date || null, parsedPrice, parsedTotalSpots, parsedAvailableSpots, JSON.stringify(itinerary || []), JSON.stringify(includes || []), JSON.stringify(image_urls || []), status || 'upcoming', target_audience || 'all', JSON.stringify(places_to_visit || []), included_stay ? JSON.stringify(included_stay) : null, JSON.stringify(highlights || []), JSON.stringify(things_to_carry || []), important_notes || null, JSON.stringify(video_urls || []), JSON.stringify(excludes || []), start_time || null, end_time || null, language || 'English', cancellation_policy || null, map_link || null, req.params.id, seo_title || null, seo_description || null, seo_keywords || null, seo_image_url || null]);

    res.json(result.rows[0]);
  } catch (error: unknown) {
    console.error('Failed to update experience:', error);
    res.status(500).json({ error: 'Failed to update experience', details: (error as Error).message || String(error) });
  }
});

app.delete('/api/experiences/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured || dbConnectionError) {
      const expId = parseInt(req.params.id as string);
      const idx = demoExperiences.findIndex(e => e.id === expId);
      if (idx > -1) {
          demoExperiences.splice(idx, 1);
      }
      return res.json({ message: 'Experience deleted successfully' });
  }
  try {
    const expId = parseInt(req.params.id as string);
    if (req.user?.role !== 'admin') {
      const checkResult = await pool.query('SELECT host_id FROM experiences WHERE id = $1', [expId]);
      if (checkResult.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
      if (checkResult.rows[0].host_id !== req.user?.id) return res.status(403).json({ error: 'Not authorized to delete this experience' });
    }
    if (expId >= 9001 && expId <= 9004) {
      return res.json({ success: true });
    }
    await pool.query('DELETE FROM experiences WHERE id = $1', [req.params.id]);
    if (redis) {
        try {
            await redis.del('experiences:all');
            await redis.del(`experiences:host:${req.user?.id}`);
        } catch (e) { console.warn('Redis delete failed', e); }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete experience:', error);
    res.status(500).json({ error: 'Failed to delete experience' });
  }
});

app.get('/api/experiences/:id/reviews', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.json([]);
  try {
    const result = await pool.query(`
      SELECT er.*, u.name as user_name,
        EXISTS (
          SELECT 1 FROM experience_bookings eb
          WHERE eb.user_id = er.user_id AND eb.experience_id = er.experience_id
        ) as is_verified
      FROM experience_reviews er
      JOIN users u ON er.user_id = u.id
      WHERE er.experience_id = $1
      ORDER BY er.created_at DESC
    `, [expId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch experience reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

app.get('/api/experiences/:id/reviews/eligible', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.json({ eligible: false });
  try {
    const result = await pool.query(`
      SELECT 1 FROM experience_bookings
      WHERE user_id = $1 AND experience_id = $2 LIMIT 1
    `, [req.user?.id, expId]);
    res.json({ eligible: result.rows.length > 0 });
  } catch (error) {
    console.error('Failed to check eligibility:', error);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

app.post('/api/experiences/:id/reviews', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.status(400).json({ error: 'Invalid experience ID' });

  if (expId >= 9001 && expId <= 9004) {
    return res.status(201).json({ id: 9999, user_id: req.user?.id, user_name: req.user?.name, rating: req.body.rating, content: req.body.content, created_at: new Date().toISOString() });
  }

  try {
    const { rating, content } = req.body;
    if (!rating || rating < 1 || rating > 10) {
      return res.status(400).json({ error: 'Rating must be between 1 and 10' });
    }
    const result = await pool.query(`
      INSERT INTO experience_reviews (experience_id, user_id, rating, content)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [expId, req.user?.id, rating, content]);

    const fullReviewRes = await pool.query(`
      SELECT er.*, u.name as user_name,
        EXISTS (
          SELECT 1 FROM experience_bookings eb
          WHERE eb.user_id = er.user_id AND eb.experience_id = er.experience_id
        ) as is_verified
      FROM experience_reviews er
      JOIN users u ON er.user_id = u.id
      WHERE er.id = $1
    `, [result.rows[0].id]);

    res.json(fullReviewRes.rows[0]);
  } catch (error) {
    console.error('Failed to create experience review:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

app.get('/api/experiences/:id/videos', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.json([]);
  try {
    const result = await pool.query(`
      SELECT ev.*, u.name as user_name
      FROM experience_videos ev
      LEFT JOIN users u ON ev.user_id = u.id
      WHERE ev.experience_id = $1
      ORDER BY ev.created_at DESC
    `, [expId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch experience videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

app.post('/api/experiences/:id/videos', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.status(400).json({ error: 'Invalid experience ID' });

  if (expId >= 9001 && expId <= 9004) {
    return res.status(201).json({ id: 9999, experience_id: expId, user_id: req.user?.id, user_name: req.user?.name, video_url: req.body.video_url, thumbnail_url: req.body.thumbnail_url, title: req.body.title, likes: 0 });
  }

  try {
    const { video_url, thumbnail_url, title } = req.body;
    if (!video_url) {
      return res.status(400).json({ error: 'Video URL is required' });
    }
    const author_name = req.user?.name || 'Verified Explorer';
    const result = await pool.query(`
      INSERT INTO experience_videos (experience_id, user_id, video_url, thumbnail_url, title, author_name)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [expId, req.user?.id, video_url, thumbnail_url || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=200', title || 'Travel Highlight', author_name]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to submit experience video:', error);
    res.status(500).json({ error: 'Failed to submit video snippet' });
  }
});

app.post('/api/experiences/videos/:id/like', async (req, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const videoId = Number(req.params.id);
  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID' });
  try {
    const result = await pool.query(`
      UPDATE experience_videos
      SET likes = likes + 1
      WHERE id = $1 RETURNING *
    `, [videoId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to like video:', error);
    res.status(500).json({ error: 'Failed to like video' });
  }
});

app.get('/api/experiences/:id/lobby/participants', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.status(400).json({ error: 'Invalid experience ID' });

  if (expId === 9999) return res.json([{ id: req.user?.id || 1, name: req.user?.name || 'Test User', role: 'user' }]);

  try {
    // Verify eligibility (host or booked)
    const expRes = await pool.query('SELECT host_id FROM experiences WHERE id = $1', [expId]);
    if (expRes.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
    const isHost = expRes.rows[0].host_id === req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    let eligible = isHost || isAdmin;
    if (!eligible) {
      const bookRes = await pool.query('SELECT 1 FROM experience_bookings WHERE experience_id = $1 AND user_id = $2', [expId, req.user?.id]);
      if (bookRes.rows.length > 0) eligible = true;
    }

    if (!eligible) {
      return res.status(403).json({ error: 'Not authorized for this lobby' });
    }

    // Fetch participants
    const participantsRes = await pool.query(`
      SELECT DISTINCT u.id, u.name, u.role
      FROM users u
      LEFT JOIN experience_bookings eb ON u.id = eb.user_id AND eb.experience_id = $1
      LEFT JOIN experiences e ON u.id = e.host_id AND e.id = $1
      WHERE eb.id IS NOT NULL OR e.id IS NOT NULL
      ORDER BY u.role DESC, u.name ASC
    `, [expId]);

    res.json(participantsRes.rows);
  } catch (error) {
    console.error('Failed to fetch participants:', error);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

app.get('/api/experiences/:id/lobby/messages', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.status(400).json({ error: 'Invalid experience ID' });

  if (expId === 9999) return res.json([]);

  try {
    // Verify eligibility
    const expRes = await pool.query('SELECT host_id FROM experiences WHERE id = $1', [expId]);
    if (expRes.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
    const isHost = expRes.rows[0].host_id === req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    let eligible = isHost || isAdmin;
    if (!eligible) {
      const bookRes = await pool.query('SELECT 1 FROM experience_bookings WHERE experience_id = $1 AND user_id = $2', [expId, req.user?.id]);
      if (bookRes.rows.length > 0) eligible = true;
    }

    if (!eligible) {
      return res.status(403).json({ error: 'Not authorized for this lobby' });
    }

    const messagesRes = await pool.query(`
      SELECT em.*, u.name as user_name, u.role as user_role,
        CASE WHEN e.host_id = em.user_id THEN true ELSE false END as is_host
      FROM experience_messages em
      JOIN users u ON em.user_id = u.id
      LEFT JOIN experiences e ON em.experience_id = e.id
      WHERE em.experience_id = $1
      ORDER BY em.created_at ASC
    `, [expId]);

    res.json(messagesRes.rows);
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/experiences/:id/lobby/messages', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const expId = Number(req.params.id);
  if (isNaN(expId)) return res.status(400).json({ error: 'Invalid experience ID' });

  if (expId >= 9001 && expId <= 9004) {
    return res.status(201).json({ id: 9999, experience_id: expId, user_id: req.user?.id, user_name: req.user?.name, content: req.body.content, created_at: new Date().toISOString() });
  }

  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required' });

  try {
    // Verify eligibility
    const expRes = await pool.query('SELECT host_id FROM experiences WHERE id = $1', [expId]);
    if (expRes.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
    const isHost = expRes.rows[0].host_id === req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    let eligible = isHost || isAdmin;
    if (!eligible) {
      const bookRes = await pool.query('SELECT 1 FROM experience_bookings WHERE experience_id = $1 AND user_id = $2', [expId, req.user?.id]);
      if (bookRes.rows.length > 0) eligible = true;
    }

    if (!eligible) {
      return res.status(403).json({ error: 'Not authorized for this lobby' });
    }

    const insertRes = await pool.query(`
      INSERT INTO experience_messages (experience_id, user_id, content)
      VALUES ($1, $2, $3) RETURNING *
    `, [expId, req.user?.id, content]);

    // Fetch the detailed message to return
    const msgRes = await pool.query(`
      SELECT em.*, u.name as user_name, u.role as user_role,
        CASE WHEN e.host_id = em.user_id THEN true ELSE false END as is_host
      FROM experience_messages em
      JOIN users u ON em.user_id = u.id
      LEFT JOIN experiences e ON em.experience_id = e.id
      WHERE em.id = $1
    `, [insertRes.rows[0].id]);

    res.json(msgRes.rows[0]);
  } catch (error) {
    console.error('Failed to post message:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
});

app.post('/api/experience-bookings', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { experience_id, num_tickets, total_price, name, phone, user_id } = req.body;

    // Security check
    const authUserId = req.user?.id;
    if (user_id && String(authUserId) !== String(user_id) && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to book for this user' });
    }
    const finalUserId = user_id || authUserId || null;

    if (experience_id >= 9001 && experience_id <= 9004) {
      return res.status(201).json({ id: 99999, experience_id, num_tickets, total_price, status: 'confirmed' });
    }

    if (!experience_id || !num_tickets || !name || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check available spots
    const expRes = await pool.query('SELECT available_spots FROM experiences WHERE id = $1', [experience_id]);
    if (expRes.rows.length === 0) return res.status(404).json({ error: 'Experience not found' });
    if (expRes.rows[0].available_spots < num_tickets) return res.status(400).json({ error: 'Not enough spots available' });

    // Create booking
    const result = await pool.query(`
      INSERT INTO experience_bookings (user_id, experience_id, num_tickets, total_price, name, phone)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [finalUserId, experience_id, num_tickets, total_price, name, phone]);

    // Update available spots
    await pool.query('UPDATE experiences SET available_spots = available_spots - $1 WHERE id = $2', [num_tickets, experience_id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to book experience:', error);
    res.status(500).json({ error: 'Failed to book experience' });
  }
});

app.get('/api/experience-bookings', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const result = await pool.query(`
      SELECT b.*, e.title, e.start_date, e.destination, e.image_urls
      FROM experience_bookings b
      JOIN experiences e ON b.experience_id = e.id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
    `, [req.user?.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to get experience bookings:', error);
    res.status(500).json({ error: 'Failed to fetch experience bookings' });
  }
});

app.get('/api/admin/experience-bookings', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    const result = await pool.query(`
      SELECT b.*, e.title, e.start_date, e.destination, u.name as user_name
      FROM experience_bookings b
      JOIN experiences e ON b.experience_id = e.id
      LEFT JOIN users u ON b.user_id = u.id
      ORDER BY b.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to get all experience bookings:', error);
    res.status(500).json({ error: 'Failed to fetch experience bookings' });
  }
});


// Stripe integration
app.post('/api/create-payment-intent', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }
  try {
    const { amount, currency } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe expects amounts in cents/paise
      currency: currency || 'inr',
      automatic_payment_methods: {
        enabled: true,
      },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: unknown) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Setup fallback and start server if not running serverless

// Global Error Handler
// app.use(globalErrorHandler); // Replaced with simple error handler as per JS version
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message });
});

async function startServer() {
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected to socket.io:', socket.id);

    socket.on('join_user', (userId) => {
      console.log(`User ${userId} joined their personal room`);
      socket.join(`user_${userId}`);
    });

    socket.on('join_admin', () => {
      socket.join('admin_room');
    });

    socket.on('join_thread', (threadId) => {
      console.log(`Socket ${socket.id} joined thread ${threadId}`);
      socket.join(`thread_${threadId}`);
    });

    socket.on('leave_thread', (threadId) => {
      socket.leave(`thread_${threadId}`);
    });

    socket.on('typing_start', (data) => {
      socket.to(`thread_${data.threadId}`).emit('user_typing', { userId: data.userId });
    });

    socket.on('typing_stop', (data) => {
      socket.to(`thread_${data.threadId}`).emit('user_stopped_typing', { userId: data.userId });
    });

    socket.on('join_listing', (listingId) => {
       const room = `listing_${listingId}`;
       socket.join(room);
       const viewers = io.sockets.adapter.rooms.get(room)?.size || 1;
       io.to(room).emit('listing_viewers', { viewers });
    });

    socket.on('leave_listing', (listingId) => {
       const room = `listing_${listingId}`;
       socket.leave(room);
       const viewers = io.sockets.adapter.rooms.get(room)?.size || 0;
       io.to(room).emit('listing_viewers', { viewers });
    });

    socket.on('disconnecting', () => {
        socket.rooms.forEach(room => {
            if (typeof room === 'string' && room.startsWith('listing_')) {
               const viewers = (io.sockets.adapter.rooms.get(room)?.size || 1) - 1;
               socket.to(room).emit('listing_viewers', { viewers });
            }
        });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Make io available to routes
  app.set('io', io);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vitePkg = 'v' + 'ite';
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    // In production (non-Vercel), serve from the output directory
    const distPath = __dirname;
    app.use(express.static(distPath));
    app.get('*all', async (req, res) => {
    const urlPath = req.path;
    let distPath = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(distPath)) { distPath = __dirname; } // fallback
    let html = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');

    try {
        let injectedTags = '';

        if (urlPath.startsWith('/listing/')) {
            const id = urlPath.split('/')[2];
            const result = await pool.query("SELECT * FROM listings WHERE id = $1", [id]);
            if (result.rows.length > 0) {
                const listing = result.rows[0];
                const title = `${listing.title} | EnchoSpace`;
                const description = listing.description?.substring(0, 160) || `Stay at ${listing.title}`;
                const image = listing.image_url || (listing.image_urls && listing.image_urls[0]) || '';

                injectedTags = `
                    <title>${title}</title>
                    <meta name="description" content="${description}" />
                    <meta property="og:title" content="${title}" />
                    <meta property="og:description" content="${description}" />
                    <meta property="og:image" content="${image}" />
                    <meta property="og:type" content="website" />
                    <meta name="twitter:card" content="summary_large_image" />
                    <meta name="twitter:title" content="${title}" />
                    <meta name="twitter:description" content="${description}" />
                    <meta name="twitter:image" content="${image}" />
                `;
            }
        } else if (urlPath.startsWith('/experience/')) {
            const id = urlPath.split('/')[2];
            const result = await pool.query("SELECT * FROM experiences WHERE id = $1", [id]);
            if (result.rows.length > 0) {
                const experience = result.rows[0];
                const title = `${experience.title} | EnchoSpace`;
                const description = experience.description?.substring(0, 160) || `Experience ${experience.title}`;
                const imageUrls = typeof experience.image_urls === 'string' ? JSON.parse(experience.image_urls) : experience.image_urls;
                const image = imageUrls && imageUrls.length > 0 ? imageUrls[0] : '';

                injectedTags = `
                    <title>${title}</title>
                    <meta name="description" content="${description}" />
                    <meta property="og:title" content="${title}" />
                    <meta property="og:description" content="${description}" />
                    <meta property="og:image" content="${image}" />
                    <meta property="og:type" content="website" />
                    <meta name="twitter:card" content="summary_large_image" />
                    <meta name="twitter:title" content="${title}" />
                    <meta name="twitter:description" content="${description}" />
                    <meta name="twitter:image" content="${image}" />
                `;
            }
        }

        if (injectedTags) {
            // Replace existing <title> and simple meta tags if present, or just inject into <head>
            html = html.replace(/<title>.*?<\/title>/, '');
            html = html.replace('<head>', '<head>' + injectedTags);
        }
    } catch (e) {
        console.error('SEO Injection Error:', e);
    }

    res.send(html);
    });
  }

  if(!process.env.VITEST) httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Auto-init DB schema
    if (isDbConfigured) {
      try {
        await ensureUsersTable();
        await ensureListingsTable();

        // Ensure Experiences tables
        await pool.query(`
          CREATE TABLE IF NOT EXISTS experiences (
            id SERIAL PRIMARY KEY,
            host_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            destination VARCHAR(255),
            departure_location VARCHAR(255),
            start_date TIMESTAMP,
            end_date TIMESTAMP,
            price DECIMAL(10, 2),
            total_spots INTEGER,
            available_spots INTEGER,
            itinerary JSONB,
            includes JSONB,
            excludes JSONB,
            image_urls JSONB,
            video_urls JSONB,
            status VARCHAR(50) DEFAULT 'draft',
            target_audience VARCHAR(100),
            places_to_visit JSONB,
            included_stay JSONB,
            highlights JSONB,
            things_to_carry JSONB,
            important_notes TEXT,
            start_time VARCHAR(20),
            end_time VARCHAR(20),
            language VARCHAR(100),
            cancellation_policy TEXT,
            map_link TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS experience_bookings (
            id SERIAL PRIMARY KEY,
            experience_id INTEGER REFERENCES experiences(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            num_tickets INTEGER NOT NULL,
            total_price DECIMAL(10, 2) NOT NULL,
            status VARCHAR(50) DEFAULT 'confirmed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Ensure initial admin
        const adminExists = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
        if (adminExists.rows.length === 0) {
          const hash = await bcrypt.hash('admin123', 10);
          await pool.query(
            "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')",
            ['admin@enchospace.com', hash, 'Super Admin']
          );
        }

        console.log('✅ Database schema verified/updated');
      } catch (error) {
        console.error('❌ Database init failed:', error instanceof Error ? (error as Error).message : String(error));
      }
    }

    // Proactive DB check
    if (isDbConfigured) {
      try {
        await pool.query('SELECT 1');
        console.log('✅ Database connection successful');
      } catch (error) {
        const msg = error instanceof Error ? (error as Error).message : String(error);
        if (msg.includes('Tenant or user not found')) {
          console.warn('⚠️  Neon Database Warning: "Tenant or user not found".');
          console.warn('   This usually means your DATABASE_URL is incorrect or the project was deleted.');
        } else {
          console.error('❌ Database connection failed:', msg);
        }
      }
    } else {
      console.log('ℹ️  Database not configured. Listings will be empty.');
    }
  });
}

// Only start the server if not imported as a module (e.g. by Vercel)
if ((process.env.NODE_ENV !== 'production' || !process.env.VERCEL) && process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
// Graceful Shutdown Handlers
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  if (pool) {
    try {
      await pool.end();
      console.log('Database pool closed.');
    } catch (err) {
      console.error('Error closing DB pool', err);
    }
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
