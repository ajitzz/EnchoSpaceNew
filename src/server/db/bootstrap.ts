import { pool, isDbConfigured } from './connection.js';
import { databaseReadiness } from '../deployment/databaseReadiness.js';

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
      wallet_balance DECIMAL(10, 2) DEFAULT 0,
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
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='avatar') THEN
        ALTER TABLE users ADD COLUMN avatar TEXT;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='editorial_quote') THEN
        ALTER TABLE users ADD COLUMN editorial_quote VARCHAR(255);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='email_verified') THEN
        ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;
      END IF;

    END $$;
  `);

  usersTableInitialized = true;
};

let listingsTableInitialized = false;
const ensureListingsTable = async () => {
  if (process.env.NODE_ENV === 'test') {
    listingsTableInitialized = true;
    return;
  }
  if (!isDbConfigured) return;
  if (listingsTableInitialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS listings (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
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

    CREATE TABLE IF NOT EXISTS listings_drafts (
      id SERIAL PRIMARY KEY,
      host_id INT REFERENCES users(id),
      published_listing_id INT REFERENCES listings(id) ON DELETE SET NULL,
      status VARCHAR(50) DEFAULT 'DRAFT',
      draft_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_calendar_blocks (
      id SERIAL PRIMARY KEY,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      room_tier_key VARCHAR(100) NOT NULL,
      room_name VARCHAR(255),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      block_source VARCHAR(50) DEFAULT 'manual',
      guest_name VARCHAR(255),
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='hero_video_url') THEN
        ALTER TABLE listings ADD COLUMN hero_video_url TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='hero_fallback_url') THEN
        ALTER TABLE listings ADD COLUMN hero_fallback_url TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='dominant_color_hex') THEN
        ALTER TABLE listings ADD COLUMN dominant_color_hex VARCHAR(20);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='raw_rules') THEN
        ALTER TABLE listings ADD COLUMN raw_rules TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='curated_guidelines') THEN
        ALTER TABLE listings ADD COLUMN curated_guidelines TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='experience_tags') THEN
        ALTER TABLE listings ADD COLUMN experience_tags JSONB DEFAULT '[]'::jsonb;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='concierge_privileges') THEN
        ALTER TABLE listings ADD COLUMN concierge_privileges TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='host_philosophy') THEN
        ALTER TABLE listings ADD COLUMN host_philosophy TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='photos') THEN
        ALTER TABLE listings ADD COLUMN photos JSONB DEFAULT '[]'::jsonb;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='amenity_clusters') THEN
        ALTER TABLE listings ADD COLUMN amenity_clusters JSONB DEFAULT '{}'::jsonb;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='child_safety_specs') THEN
        ALTER TABLE listings ADD COLUMN child_safety_specs JSONB DEFAULT '[]'::jsonb;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='nearby') THEN
        ALTER TABLE listings ADD COLUMN nearby JSONB DEFAULT '[]'::jsonb;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='seo_title') THEN
        ALTER TABLE listings ADD COLUMN seo_title TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='seo_description') THEN
        ALTER TABLE listings ADD COLUMN seo_description TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='seo_keywords') THEN
        ALTER TABLE listings ADD COLUMN seo_keywords TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='seo_image_url') THEN
        ALTER TABLE listings ADD COLUMN seo_image_url TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='brand') THEN
        ALTER TABLE listings ADD COLUMN brand VARCHAR(100);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='brand_font') THEN
        ALTER TABLE listings ADD COLUMN brand_font VARCHAR(100);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='brand_color') THEN
        ALTER TABLE listings ADD COLUMN brand_color VARCHAR(100);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='publication_status') THEN
        ALTER TABLE listings ADD COLUMN publication_status VARCHAR(50) DEFAULT 'draft';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='slug') THEN
        ALTER TABLE listings ADD COLUMN slug VARCHAR(255) UNIQUE;
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
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255);
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(50);
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_out_date VARCHAR(255);
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS adults_count INT DEFAULT 2;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS children_count INT DEFAULT 0;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS infants_count INT DEFAULT 0;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS special_requests TEXT;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS email VARCHAR(255);

    CREATE TABLE IF NOT EXISTS experience_bookings (
      id SERIAL PRIMARY KEY,
      user_id INT,
      experience_id INT,
      num_tickets INT,
      total_amount NUMERIC,
      name VARCHAR(255),
      phone VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      payment_intent_id VARCHAR(255),
      payment_gateway VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE experience_bookings ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255);
    ALTER TABLE experience_bookings ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(50);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stays_quotes (
      id UUID PRIMARY KEY,
      listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      room_type_id INT,
      check_in_date DATE NOT NULL,
      check_out_date DATE NOT NULL,
      nights INT NOT NULL,
      base_price_paise BIGINT NOT NULL,
      tax_paise BIGINT NOT NULL,
      total_paise BIGINT NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      guest_count INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stays_holds (
      id UUID PRIMARY KEY,
      quote_id UUID REFERENCES stays_quotes(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      guest_session_id VARCHAR(255),
      holder_principal VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      released_at TIMESTAMP WITH TIME ZONE,
      release_reason VARCHAR(100)
    );

    CREATE TABLE IF NOT EXISTS stays_orders (
      id UUID PRIMARY KEY,
      hold_id UUID REFERENCES stays_holds(id) ON DELETE SET NULL,
      quote_id UUID REFERENCES stays_quotes(id) ON DELETE SET NULL,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      total_paise BIGINT NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      status VARCHAR(50) NOT NULL DEFAULT 'PAYMENT_PENDING',
      sequence_version INT NOT NULL DEFAULT 1,
      idempotency_key VARCHAR(255) UNIQUE NOT NULL,
      razorpay_order_id VARCHAR(255),
      razorpay_payment_id VARCHAR(255),
      razorpay_signature VARCHAR(255),
      booking_id INT REFERENCES bookings(id) ON DELETE SET NULL,
      guest_name VARCHAR(255),
      guest_phone VARCHAR(50),
      guest_email VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stays_webhooks (
      event_id VARCHAR(255) PRIMARY KEY,
      order_id UUID REFERENCES stays_orders(id) ON DELETE SET NULL,
      event_type VARCHAR(100) NOT NULL,
      sequence_number INT NOT NULL,
      processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_days (
      id SERIAL PRIMARY KEY,
      listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      room_type_id INT NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
      calendar_date DATE NOT NULL,
      total_units INT NOT NULL DEFAULT 1,
      held_units INT NOT NULL DEFAULT 0,
      booked_units INT NOT NULL DEFAULT 0,
      blocked_units INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_inventory_days_room_date UNIQUE (room_type_id, calendar_date)
    );

    CREATE TABLE IF NOT EXISTS booking_holds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_type_id INT NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      guest_session_id VARCHAR(255),
      idempotency_key VARCHAR(255) NOT NULL,
      check_in_date DATE NOT NULL,
      check_out_date DATE NOT NULL,
      units_held INT NOT NULL DEFAULT 1,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      released_at TIMESTAMP WITH TIME ZONE,
      release_reason VARCHAR(100),
      CONSTRAINT uq_booking_holds_idempotency UNIQUE (idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS booking_hold_nights (
      id SERIAL PRIMARY KEY,
      hold_id UUID NOT NULL REFERENCES booking_holds(id) ON DELETE CASCADE,
      inventory_day_id INT NOT NULL REFERENCES inventory_days(id) ON DELETE CASCADE,
      stay_date DATE NOT NULL,
      units INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_booking_hold_nights UNIQUE (hold_id, inventory_day_id)
    );

    CREATE TABLE IF NOT EXISTS marketing_creative_packages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      host_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      room_type_id INT REFERENCES room_types(id) ON DELETE SET NULL,
      package_type VARCHAR(50) NOT NULL,
      title VARCHAR(200) NOT NULL,
      headline VARCHAR(120) NOT NULL,
      description TEXT NOT NULL,
      destination_url TEXT NOT NULL,
      ai_preflight_score DECIMAL(3, 1),
      ai_preflight_status VARCHAR(50) DEFAULT 'PENDING_SCAN',
      moderation_status VARCHAR(50) DEFAULT 'SUBMITTED',
      rejection_reasons JSONB DEFAULT '[]'::jsonb,
      rights_attestation_confirmed BOOLEAN DEFAULT false,
      rights_attestation_hash VARCHAR(64),
      version INT DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS marketing_creative_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      package_id UUID NOT NULL REFERENCES marketing_creative_packages(id) ON DELETE CASCADE,
      asset_role VARCHAR(50) NOT NULL,
      original_url TEXT NOT NULL,
      transcoded_url TEXT,
      aspect_ratio VARCHAR(20) NOT NULL,
      duration_seconds DECIMAL(5, 2),
      byte_size INT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      sha256_hash VARCHAR(64) NOT NULL,
      ocr_extracted_text TEXT,
      transcript_text TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
      await pool.query(`ALTER TABLE experiences ADD COLUMN IF NOT EXISTS host_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
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
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='is_sanitized') THEN
        ALTER TABLE messages ADD COLUMN is_sanitized BOOLEAN DEFAULT false;
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
      await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb`);
  } catch { /* ignore */ }

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
    ['seo_image_url', 'TEXT'],
    ['amenity_clusters', 'JSONB'],
    ['child_safety_specs', 'JSONB'],
    ['nearby', 'JSONB'],
    ['state', "VARCHAR(100) DEFAULT ''"],
    ['country', "VARCHAR(100) DEFAULT ''"]
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

  // Create host_marketing_campaigns table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS host_marketing_campaigns (
      id SERIAL PRIMARY KEY,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      video_url TEXT,
      media_urls JSONB DEFAULT '[]'::jsonb,
      platforms JSONB DEFAULT '[]'::jsonb,
      budget DECIMAL DEFAULT 2500,
      status VARCHAR(50) DEFAULT 'draft',
      admin_feedback TEXT,
      subscription_active BOOLEAN DEFAULT false,
      analytics JSONB DEFAULT '{"impressions": 0, "clicks": 0, "ctr": 0, "conversions": 0, "spent": 0}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMP
    );  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_inquiries (
      id SERIAL PRIMARY KEY,
      campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      lead_name VARCHAR(255),
      lead_source VARCHAR(50),
      lead_intent_score VARCHAR(20) DEFAULT 'COLD',
      masked_contact_info TEXT,
      raw_inquiry TEXT,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS soft_exit_leads (
      id SERIAL PRIMARY KEY,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'warm',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS marketing_daily_rollups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      rollup_date DATE NOT NULL,
      impressions INT NOT NULL DEFAULT 0,
      clicks INT NOT NULL DEFAULT 0,
      conversions INT NOT NULL DEFAULT 0,
      spend_paise BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (campaign_id, rollup_date)
    );

    CREATE TABLE IF NOT EXISTS circuit_breaker_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      trigger_reason VARCHAR(100) NOT NULL,
      occupancy_ratio DECIMAL(5, 4) DEFAULT 1.0000,
      target_date_start DATE,
      target_date_end DATE,
      previous_status VARCHAR(50) NOT NULL,
      new_status VARCHAR(50) NOT NULL DEFAULT 'CIRCUIT_BREAKER_PAUSED',
      provider_pause_receipt JSONB DEFAULT '{}'::jsonb,
      override_actor_id INT REFERENCES users(id),
      override_reason TEXT,
      version INT DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dead_letter_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_queue VARCHAR(100) NOT NULL,
      original_event_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      attempts INT NOT NULL,
      last_error TEXT NOT NULL,
      failed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      resolved BOOLEAN DEFAULT false,
      resolved_at TIMESTAMP WITH TIME ZONE,
      resolution_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS marketing_feeder_corridor_definitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      region_code VARCHAR(50) NOT NULL,
      corridor_name VARCHAR(150) NOT NULL,
      source_city VARCHAR(100) NOT NULL,
      center_lat DECIMAL(10, 7) NOT NULL,
      center_lng DECIMAL(10, 7) NOT NULL,
      radius_km DECIMAL(6, 2) NOT NULL DEFAULT 25.00,
      excluded_local_district VARCHAR(100) NOT NULL,
      tier_eligibility VARCHAR(50) NOT NULL DEFAULT 'ALL',
      expected_roas_benchmark DECIMAL(4, 2) DEFAULT 3.80,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaign_godmode_targeting (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id INT NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      housing_special_category BOOLEAN NOT NULL DEFAULT true,
      meta_placements JSONB NOT NULL DEFAULT '["INSTAGRAM_REELS", "INSTAGRAM_STORIES", "FACEBOOK_FEED"]'::jsonb,
      selected_corridor_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      custom_geo_radii JSONB NOT NULL DEFAULT '[]'::jsonb,
      excluded_districts JSONB NOT NULL DEFAULT '[]'::jsonb,
      bidding_strategy VARCHAR(50) NOT NULL DEFAULT 'TARGET_ROAS',
      target_roas_floor DECIMAL(4, 2) DEFAULT 3.00,
      cpc_ceiling_cents INT DEFAULT 150,
      target_cpa_cents INT DEFAULT 1200,
      google_search_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
      google_negative_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
      google_sitelinks JSONB NOT NULL DEFAULT '[]'::jsonb,
      ai_copilot_recommendation JSONB,
      configured_by_admin_id INT NOT NULL,
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (campaign_id)
    );
  `);

  // Run migrations for advanced ad capabilities (Scenario 1 support!)
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS target_locations TEXT;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS target_locations_json JSONB;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS target_radius_km INT DEFAULT 50;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS ad_format VARCHAR(50) DEFAULT 'post';`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS feed_description TEXT;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS rejected_fields JSONB DEFAULT '{}'::jsonb;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid';`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(50);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS external_status_verified_at TIMESTAMP WITH TIME ZONE;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS external_status_verification_source VARCHAR(100);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS insights_synced_at TIMESTAMP WITH TIME ZONE;`);
  // Migration 021 parity: absent observations remain NULL, never synthetic zero evidence.
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS telemetry_source_metadata JSONB;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS engagement_synced_at TIMESTAMP WITH TIME ZONE;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS engagement_source_metadata JSONB;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_status VARCHAR(50);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_effective_status VARCHAR(50);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_review_status VARCHAR(50);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN DEFAULT false;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_campaign_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_adset_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_creative_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_dispatched_at TIMESTAMP;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_pixel_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_capi_token TEXT;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_lead_form_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS google_conversion_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS google_conversion_label VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pacing_mode VARCHAR(50) DEFAULT 'standard';`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS accumulated_spent DECIMAL DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS spent DECIMAL DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS accumulated_impressions INT DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS accumulated_clicks INT DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS encho_absorbed_overspend DECIMAL DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS accumulated_conversions INT DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS escrow_status VARCHAR(50) DEFAULT 'released';`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS escrow_release_at TIMESTAMP;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS three_d_secure_verified BOOLEAN DEFAULT true;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS optimization_fee DECIMAL DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS ad_spend_pool DECIMAL DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS last_pacing_calc_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS target_audience_persona VARCHAR(50) DEFAULT 'everyone';`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS audience_interests JSONB DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS ai_generated_ad_copies JSONB DEFAULT '{}'::jsonb;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS ad_medias JSONB DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS adset_specifications JSONB DEFAULT '{}'::jsonb;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_specifications JSONB DEFAULT '{}'::jsonb;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_sync_logs JSONB DEFAULT '{}'::jsonb;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS approval_snapshot JSONB;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS approval_hash VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS reach INT DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS comments_count INT DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS reactions_count INT DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS shares_count INT;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS engagement_source_metadata JSONB DEFAULT '{}'::jsonb;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_source VARCHAR(50);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_reason TEXT;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_actor VARCHAR(50);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_actor_id VARCHAR(100);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMP WITH TIME ZONE;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS last_calendar_event_at TIMESTAMP WITH TIME ZONE;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      event_id VARCHAR(255) PRIMARY KEY,
      event_type VARCHAR(100),
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration for CRM Lead Intent Scorer & Audience Detection & Campaign/Host Linkage
  await pool.query(`
    CREATE TABLE IF NOT EXISTS host_outreach_leads (
      id SERIAL PRIMARY KEY,
      property_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS campaign_id INT;`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS host_id INT;`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS guest_name VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(50);`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS message_history JSONB DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS intent_score INT DEFAULT 50;`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS ai_intent_badge VARCHAR(50) DEFAULT 'WARM_INQUIRY';`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS detected_audience_persona VARCHAR(50) DEFAULT 'couples_family';`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS masked_contact BOOLEAN DEFAULT true;`);
  await pool.query(`ALTER TABLE host_outreach_leads ALTER COLUMN property_name DROP NOT NULL;`);

  // Ensure processed_payments table exists with full Geo-Router schema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_payments (
      id SERIAL PRIMARY KEY,
      razorpay_payment_id VARCHAR(255),
      razorpay_order_id VARCHAR(255),
      idempotency_key VARCHAR(255) UNIQUE,
      type VARCHAR(50),
      reference_id VARCHAR(255) UNIQUE,
      payment_gateway VARCHAR(50),
      amount DECIMAL DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'USD',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`ALTER TABLE processed_payments ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(50);`);
  await pool.query(`ALTER TABLE processed_payments ADD COLUMN IF NOT EXISTS amount DECIMAL DEFAULT 0;`);
  await pool.query(`ALTER TABLE processed_payments ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD';`);
  await pool.query(`ALTER TABLE processed_payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;`);

  // M2: Ingest-and-Ack Webhook Architecture - Unified Durable Ingestion Queue
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inbound_webhooks (
      webhook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(50) NOT NULL,
      event_type VARCHAR(255) NOT NULL,
      payload JSONB NOT NULL,
      signature_metadata JSONB,
      status VARCHAR(50) DEFAULT 'pending',
      attempts INT DEFAULT 0,
      next_retry_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP,
      error_state TEXT,
      correlation_id VARCHAR(255),
      idempotency_key VARCHAR(255) UNIQUE,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Create async_webhook_queue table before index setup (Legacy)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS async_webhook_queue (
      id SERIAL PRIMARY KEY,
      source VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE async_webhook_queue ADD COLUMN IF NOT EXISTS available_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE async_webhook_queue ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP;
    ALTER TABLE async_webhook_queue ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0;
    ALTER TABLE async_webhook_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);
  // M2: Webhook query optimization
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inbound_webhooks_pending ON inbound_webhooks(status, next_retry_at) WHERE status IN ('pending', 'processing');`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_async_webhook_status ON async_webhook_queue(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_async_webhook_queue_pending ON async_webhook_queue(status, available_at, created_at) WHERE status IN ('pending', 'processing');`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bookings_listing_id ON bookings(listing_id);`);


  // Create host_outreach_leads table for Host Acquisition tracking (Pillar Extension)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS host_outreach_leads (
      id SERIAL PRIMARY KEY,
      campaign_id INT,
      host_id INT,
      guest_name VARCHAR(255),
      guest_email VARCHAR(255),
      guest_phone VARCHAR(50),
      message_history JSONB DEFAULT '[]'::jsonb,
      property_name VARCHAR(255),
      instagram_username VARCHAR(100),
      facebook_url VARCHAR(255),
      owner_name VARCHAR(100),
      location VARCHAR(255),
      estimated_nightly_rate INT,
      status VARCHAR(50) DEFAULT 'discovered',
      notes TEXT,
      last_contacted_at TIMESTAMP,
      email VARCHAR(255),
      phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure new columns exist in case the table was created previously without them
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS property_name VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS instagram_username VARCHAR(100);`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS facebook_url VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS owner_name VARCHAR(100);`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS location VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS estimated_nightly_rate INT;`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'discovered';`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS notes TEXT;`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS email VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`);
  await pool.query(`ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP;`);
  
  // Seed default high-value outreach targets if table is completely empty
  const countRes = await pool.query('SELECT COUNT(*) FROM host_outreach_leads');
  if (parseInt(countRes.rows[0].count) === 0) {
    console.log('[OUTREACH SEED] Seeding premium target leads for Host Acquisition CRM...');
    await pool.query(`
      INSERT INTO host_outreach_leads (property_name, instagram_username, facebook_url, owner_name, location, estimated_nightly_rate, status, notes, email)
      VALUES
      ('The Glass Pavilion', 'glasspavilionjt', '', 'Arthur Dent', 'Joshua Tree, CA', 850, 'discovered', 'Stunning architectural mirror house with 45k IG followers. Only links to an expensive Airbnb listing. Prime target for direct-booking conversion.', 'arthur@glasspavilionjt.co'),
      ('Black A-Frame Cabin', 'blackaframecatskills', 'https://facebook.com/blackaframecatskills', 'Sarah Jenkins', 'Catskills, NY', 450, 'contacted', 'DMed on Instagram. Sarah is highly tired of Airbnb''s 15% booking fees. Intrigued by our Honest Ad Co-Pilot framework.', 'sarah@catskillsaframes.net'),
      ('The Dome Sanctuary', 'sedonadome', '', 'Michael Chang', 'Sedona, AZ', 620, 'negotiating', 'Expressed high interest in the Rahul-Proof Smart Targeter to attract Los Angeles & Phoenix tech-workers. Sending custom subscription contract.', 'michael@sedonadome.com'),
      ('Amalfi Cliffside Estate', 'amalficliffside', 'https://facebook.com/amalficliffside', 'Gianluca Rossi', 'Amalfi, Italy', 1250, 'discovered', 'Ultra-luxury estate. Currently spending €5k/month on OTA commissions. Direct booking engine would save them thousands.', 'gianluca@amalficliffside.it')
    `);
  }

  // ADR-006: AI gatekeeper score storage
  await pool.query(`ALTER TABLE listings_drafts ADD COLUMN IF NOT EXISTS ai_score DECIMAL`);
  await pool.query(`ALTER TABLE listings_drafts ADD COLUMN IF NOT EXISTS ai_evaluation JSONB`);
  // Note: room_types and media_assets schema managed exclusively via versioned migrations (003_canonical_room_and_media_authority.sql)

  listingsTableInitialized = true;
};

let marketingSchemaInitialized = false;
export const ensureMarketingSchema = async () => {
  if (!isDbConfigured || marketingSchemaInitialized) return;

  // 1. host_wallets table (The Fuel Tank + Gap 13 Double-Entry Ledger)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS host_wallets (
      id SERIAL PRIMARY KEY,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      balance DECIMAL DEFAULT 0,
      encho_credits DECIMAL DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'USD',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(host_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id SERIAL PRIMARY KEY,
      wallet_id INT REFERENCES host_wallets(id) ON DELETE CASCADE,
      amount DECIMAL NOT NULL,
      type VARCHAR(50) NOT NULL,
      reference_id VARCHAR(255) UNIQUE,
      status VARCHAR(50) DEFAULT 'completed',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`ALTER TABLE wallet_transactions ADD CONSTRAINT unique_reference_id UNIQUE (reference_id) EXCLUDE USING btree (reference_id WITH =) WHERE (reference_id IS NOT NULL)`).catch(()=>true); // ignore if exists

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions(status);`);
  // Blueprint Section 3: Double-Entry Ledger Chart of Accounts & Journal
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_accounts (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      account_type VARCHAR(50) NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      balance NUMERIC(15, 2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_ref VARCHAR(255) UNIQUE NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_lines (
      id SERIAL PRIMARY KEY,
      entry_id UUID REFERENCES ledger_entries(id) ON DELETE CASCADE,
      account_id INT REFERENCES wallet_accounts(id) ON DELETE CASCADE,
      entry_type VARCHAR(10) NOT NULL,
      amount NUMERIC(15, 2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Gap 18: Webhook Dead Letter Queue (DLQ)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_dlq (
      id SERIAL PRIMARY KEY,
      source VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL,
      error_message TEXT,
      retry_count INT DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      next_retry_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. campaign_metrics (Time-series Rollups for Gap 11)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_metrics (
      id SERIAL PRIMARY KEY,
      campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      impressions INT DEFAULT 0,
      clicks INT DEFAULT 0,
      leads INT DEFAULT 0,
      conversions INT DEFAULT 0,
      spent DECIMAL DEFAULT 0,
      platform VARCHAR(50) DEFAULT 'meta',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, date, platform)
    );

    CREATE TABLE IF NOT EXISTS campaign_raw_event_logs (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      impressions_delta INTEGER DEFAULT 0,
      clicks_delta INTEGER DEFAULT 0,
      conversions_delta INTEGER DEFAULT 0,
      spent_delta NUMERIC(10,2) DEFAULT 0,
      processed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaign_daily_rollups (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      spent_usd NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_raw_logs_processed ON campaign_raw_event_logs(processed);
    CREATE INDEX IF NOT EXISTS idx_daily_rollups_campaign_date ON campaign_daily_rollups(campaign_id, date);
  `);

  // 3. Update threads / messages for Ad-Attribution and Lead Intent (Gap 12)
  await pool.query(`ALTER TABLE threads ADD COLUMN IF NOT EXISTS lead_source VARCHAR(255) DEFAULT 'organic';`);
  await pool.query(`ALTER TABLE threads ADD COLUMN IF NOT EXISTS campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE SET NULL;`);
  await pool.query(`ALTER TABLE threads ADD COLUMN IF NOT EXISTS lead_intent_score VARCHAR(50) DEFAULT 'neutral';`);

  // For Walled Garden Data Masking, flag if message was sanitized (Gap 5)
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_sanitized BOOLEAN DEFAULT false;`);

  // Gap 14: Immutable Admin Audit Trail
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meta_publishing_transactions (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      idempotency_key VARCHAR(255) UNIQUE NOT NULL,
      correlation_id VARCHAR(255) NOT NULL,
      publish_status VARCHAR(50) DEFAULT 'PENDING',
      publish_attempt INTEGER DEFAULT 1,
      meta_campaign_id VARCHAR(255),
      meta_adset_id VARCHAR(255),
      meta_creative_id VARCHAR(255),
      meta_ad_id VARCHAR(255),
      failure_code VARCHAR(100),
      failure_category VARCHAR(100),
      failure_stage VARCHAR(100),
      rollback_status VARCHAR(50),
      error_details JSONB,
      reconciliation_lease_expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS reconciliation_lease_expires_at TIMESTAMP;
    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS reconciliation_attempt_count INT DEFAULT 0;
    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100);
    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(255);
    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_category VARCHAR(100);
    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_stage VARCHAR(100);
    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS rollback_status VARCHAR(50);
    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS error_details JSONB;

    CREATE TABLE IF NOT EXISTS meta_publishing_events (
      id SERIAL PRIMARY KEY,
      transaction_id INTEGER REFERENCES meta_publishing_transactions(id),
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      event_type VARCHAR(100) NOT NULL,
      from_state VARCHAR(50),
      to_state VARCHAR(50) NOT NULL,
      actor_type VARCHAR(50) DEFAULT 'system',
      actor_id VARCHAR(100),
      reason TEXT,
      correlation_id VARCHAR(255),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_category VARCHAR(100);
    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_stage VARCHAR(100);
    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS rollback_status VARCHAR(50);
    ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS error_details JSONB;

    CREATE TABLE IF NOT EXISTS meta_api_traces (
      id SERIAL PRIMARY KEY,
      correlation_id VARCHAR(255) NOT NULL,
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      host_id INTEGER REFERENCES users(id),
      step VARCHAR(255) NOT NULL,
      endpoint VARCHAR(1000),
      request_payload JSONB,
      response_payload JSONB,
      http_status INTEGER,
      fbtrace_id VARCHAR(255),
      meta_error_code INTEGER,
      meta_error_subcode INTEGER,
      meta_error_message TEXT,
      meta_error_type VARCHAR(255),
      meta_error_is_transient BOOLEAN,
      meta_error_user_title TEXT,
      meta_error_user_msg TEXT,
      latency_ms INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS host_id INTEGER REFERENCES users(id);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS step VARCHAR(255);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS endpoint VARCHAR(1000);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS request_payload JSONB;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS response_payload JSONB;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS http_status INTEGER;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS fbtrace_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_code INTEGER;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_subcode INTEGER;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_message TEXT;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_type VARCHAR(255);`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_is_transient BOOLEAN;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_user_title TEXT;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_user_msg TEXT;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS latency_ms INTEGER;`);
  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();`);

  await pool.query(`


    CREATE TABLE IF NOT EXISTS meta_publishing_dlq (
      id SERIAL PRIMARY KEY,
      transaction_id INTEGER REFERENCES meta_publishing_transactions(id),
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      correlation_id VARCHAR(255) NOT NULL,
      failure_stage VARCHAR(50) NOT NULL,
      failure_code VARCHAR(100),
      requires_human_action BOOLEAN DEFAULT true,
      error_payload JSONB,
      retry_count INTEGER DEFAULT 0,
      recommended_action TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    );

    ALTER TABLE meta_publishing_dlq ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100);
    ALTER TABLE meta_publishing_dlq ADD COLUMN IF NOT EXISTS requires_human_action BOOLEAN DEFAULT true;

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id SERIAL PRIMARY KEY,
      admin_id INT REFERENCES users(id) ON DELETE SET NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id INT NOT NULL,
      action VARCHAR(100) NOT NULL,
      previous_state JSONB,
      new_state JSONB,
      ip_address VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Pillar 6: host_social_posts table (Direct Social Publishing & Boost Engine)
  await pool.query(`

    CREATE TABLE IF NOT EXISTS campaign_financial_contracts (
      id SERIAL PRIMARY KEY,
      campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE UNIQUE,
      gross_host_charge BIGINT NOT NULL,
      encho_fee_amount BIGINT NOT NULL,
      meta_authorized_spend BIGINT NOT NULL,
      meta_configured_max_spend BIGINT NOT NULL DEFAULT 0,
      meta_actual_spend BIGINT NOT NULL DEFAULT 0,
      meta_remaining_authorization BIGINT NOT NULL,
      currency VARCHAR(10) NOT NULL,
      CONSTRAINT chk_gross_math CHECK (gross_host_charge = encho_fee_amount + meta_authorized_spend),
      CONSTRAINT chk_config_max CHECK (meta_configured_max_spend <= meta_authorized_spend),
      CONSTRAINT chk_actual_max CHECK (meta_actual_spend <= meta_authorized_spend)
    );


    CREATE TABLE IF NOT EXISTS operation_idempotency_keys (
      id SERIAL PRIMARY KEY,
      campaign_id INT NOT NULL,
      operation_type VARCHAR(100) NOT NULL,
      idempotency_key VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, operation_type, idempotency_key)
    );


    CREATE TABLE IF NOT EXISTS meta_external_truth (
      id SERIAL PRIMARY KEY,
      campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE UNIQUE,
      object_exists BOOLEAN DEFAULT false,
      object_owned_by_master_account BOOLEAN DEFAULT false,
      object_verified BOOLEAN DEFAULT false,
      meta_status VARCHAR(50),
      meta_effective_status VARCHAR(50),
      meta_review_status VARCHAR(50),
      external_status_verified_at TIMESTAMP,
      external_status_verification_source VARCHAR(100)
    );

    CREATE TABLE IF NOT EXISTS host_social_posts (
      id SERIAL PRIMARY KEY,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      media_type VARCHAR(50) DEFAULT 'post', -- 'post', 'reel', 'story', 'carousel'
      media_urls JSONB DEFAULT '[]'::jsonb,
      hero_index INT DEFAULT 0,
      caption TEXT,
      hashtags JSONB DEFAULT '[]'::jsonb,
      status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'pending_approval', 'approved', 'rejected'
      admin_feedback TEXT,
      scheduled_at TIMESTAMP,
      published_at TIMESTAMP,
      is_boosted BOOLEAN DEFAULT false,
      boosted_campaign_id INT, -- links to host_marketing_campaigns
      likes INT DEFAULT 0,
      comments INT DEFAULT 0,
      shares INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS hero_index INT DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS hashtags JSONB DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS external_media_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS provider_creation_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS publish_attempt_count INT DEFAULT 0;`);
  await pool.query(`ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_posts_host_id ON host_social_posts(host_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_posts_listing_id ON host_social_posts(listing_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_posts_status ON host_social_posts(status);`);

  // Phase 1B: Immutable Meta Ownership & Tenant Identity Binding
  await pool.query(`
    CREATE TABLE IF NOT EXISTS host_meta_identities (
      id SERIAL PRIMARY KEY,
      host_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meta_ad_account_id VARCHAR(255),
      meta_page_id VARCHAR(255),
      meta_ig_account_id VARCHAR(255),
      connection_status VARCHAR(50) DEFAULT 'unlinked',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS owner_meta_ad_account_id VARCHAR(255);`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS policy_cleared BOOLEAN DEFAULT false;`);
  await pool.query(`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS policy_cleared_at TIMESTAMP;`);


  // Gap 17 & Sprint 5: Strict Multi-Role Row-Level Security (RLS) & FORCE ROW LEVEL SECURITY
  try {
    await pool.query(`
      -- Helper functions for session context extraction
      CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS integer AS $$
        SELECT NULLIF(current_setting('app.current_user_id', true), '')::integer;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION is_admin_or_rls_bypassed() RETURNS boolean AS $$
        SELECT current_setting('app.bypass_rls', true) = 'true' 
            OR current_setting('app.marketing_admin', true) = 'true';
      $$ LANGUAGE sql STABLE;

      -- 1. host_outreach_leads
      ALTER TABLE host_outreach_leads ENABLE ROW LEVEL SECURITY;
      ALTER TABLE host_outreach_leads FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS host_leads_policy ON host_outreach_leads;
      DROP POLICY IF EXISTS host_leads_tenant_policy ON host_outreach_leads;
      CREATE POLICY host_leads_tenant_policy ON host_outreach_leads
        FOR ALL
        USING (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed())
        WITH CHECK (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed());

      -- 2. host_wallets
      ALTER TABLE host_wallets ENABLE ROW LEVEL SECURITY;
      ALTER TABLE host_wallets FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS host_wallets_policy ON host_wallets;
      DROP POLICY IF EXISTS host_wallets_tenant_policy ON host_wallets;
      CREATE POLICY host_wallets_tenant_policy ON host_wallets
        FOR ALL
        USING (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed())
        WITH CHECK (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed());

      -- 3. host_marketing_campaigns
      ALTER TABLE host_marketing_campaigns ENABLE ROW LEVEL SECURITY;
      ALTER TABLE host_marketing_campaigns FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS host_campaigns_policy ON host_marketing_campaigns;
      DROP POLICY IF EXISTS host_campaigns_tenant_policy ON host_marketing_campaigns;
      CREATE POLICY host_campaigns_tenant_policy ON host_marketing_campaigns
        FOR ALL
        USING (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed())
        WITH CHECK (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed());

      -- 4. wallet_transactions
      ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE wallet_transactions FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS host_wallet_transactions_policy ON wallet_transactions;
      DROP POLICY IF EXISTS wallet_transactions_tenant_policy ON wallet_transactions;
      CREATE POLICY wallet_transactions_tenant_policy ON wallet_transactions
        FOR ALL
        USING (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM host_wallets w
            WHERE w.id = wallet_transactions.wallet_id
              AND w.host_id::text = current_setting('app.current_user_id', true)
          )
        )
        WITH CHECK (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM host_wallets w
            WHERE w.id = wallet_transactions.wallet_id
              AND w.host_id::text = current_setting('app.current_user_id', true)
          )
        );

      -- 5. campaign_godmode_targeting
      ALTER TABLE campaign_godmode_targeting ENABLE ROW LEVEL SECURITY;
      ALTER TABLE campaign_godmode_targeting FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS campaign_godmode_targeting_policy ON campaign_godmode_targeting;
      CREATE POLICY campaign_godmode_targeting_policy ON campaign_godmode_targeting
        FOR ALL
        USING (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM host_marketing_campaigns c
            WHERE c.id = campaign_godmode_targeting.campaign_id
              AND c.host_id::text = current_setting('app.current_user_id', true)
          )
        )
        WITH CHECK (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM host_marketing_campaigns c
            WHERE c.id = campaign_godmode_targeting.campaign_id
              AND c.host_id::text = current_setting('app.current_user_id', true)
          )
        );

      -- 6. marketing_creative_packages
      ALTER TABLE marketing_creative_packages ENABLE ROW LEVEL SECURITY;
      ALTER TABLE marketing_creative_packages FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS marketing_creative_packages_policy ON marketing_creative_packages;
      CREATE POLICY marketing_creative_packages_policy ON marketing_creative_packages
        FOR ALL
        USING (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed())
        WITH CHECK (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed());

      -- 7. marketing_creative_assets
      ALTER TABLE marketing_creative_assets ENABLE ROW LEVEL SECURITY;
      ALTER TABLE marketing_creative_assets FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS marketing_creative_assets_policy ON marketing_creative_assets;
      CREATE POLICY marketing_creative_assets_policy ON marketing_creative_assets
        FOR ALL
        USING (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM marketing_creative_packages p
            WHERE p.id = marketing_creative_assets.package_id
              AND p.host_id::text = current_setting('app.current_user_id', true)
          )
        )
        WITH CHECK (
          is_admin_or_rls_bypassed()
          OR EXISTS (
            SELECT 1 FROM marketing_creative_packages p
            WHERE p.id = marketing_creative_assets.package_id
              AND p.host_id::text = current_setting('app.current_user_id', true)
          )
        );

      -- 8. lead_inquiries
      ALTER TABLE lead_inquiries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE lead_inquiries FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS lead_inquiries_tenant_policy ON lead_inquiries;
      CREATE POLICY lead_inquiries_tenant_policy ON lead_inquiries
        FOR ALL
        USING (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed())
        WITH CHECK (host_id::text = current_setting('app.current_user_id', true) OR is_admin_or_rls_bypassed());

      -- 9. stays_holds
      ALTER TABLE stays_holds ENABLE ROW LEVEL SECURITY;
      ALTER TABLE stays_holds FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS stays_holds_session_policy ON stays_holds;
      CREATE POLICY stays_holds_session_policy ON stays_holds
        FOR ALL
        USING (
          is_admin_or_rls_bypassed()
          OR (session_token IS NOT NULL AND session_token = current_setting('app.session_token', true))
          OR (user_id IS NOT NULL AND user_id::text = current_setting('app.current_user_id', true))
        )
        WITH CHECK (
          is_admin_or_rls_bypassed()
          OR (session_token IS NOT NULL AND session_token = current_setting('app.session_token', true))
          OR (user_id IS NOT NULL AND user_id::text = current_setting('app.current_user_id', true))
        );

      -- 10. stays_orders
      ALTER TABLE stays_orders ENABLE ROW LEVEL SECURITY;
      ALTER TABLE stays_orders FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS stays_orders_participant_policy ON stays_orders;
      CREATE POLICY stays_orders_participant_policy ON stays_orders
        FOR ALL
        USING (
          is_admin_or_rls_bypassed()
          OR guest_id::text = current_setting('app.current_user_id', true)
          OR EXISTS (
            SELECT 1 FROM listings l
            WHERE l.id = stays_orders.listing_id
              AND l.user_id::text = current_setting('app.current_user_id', true)
          )
        )
        WITH CHECK (
          is_admin_or_rls_bypassed()
          OR guest_id::text = current_setting('app.current_user_id', true)
          OR EXISTS (
            SELECT 1 FROM listings l
            WHERE l.id = stays_orders.listing_id
              AND l.user_id::text = current_setting('app.current_user_id', true)
          )
        );

      -- 11. threads
      ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
      ALTER TABLE threads FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS threads_policy ON threads;
      CREATE POLICY threads_policy ON threads
        FOR ALL
        USING (guest_id = current_app_user_id() OR host_id = current_app_user_id() OR is_admin_or_rls_bypassed())
        WITH CHECK (guest_id = current_app_user_id() OR host_id = current_app_user_id() OR is_admin_or_rls_bypassed());

      -- 12. messages
      ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
      ALTER TABLE messages FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS messages_policy ON messages;
      CREATE POLICY messages_policy ON messages
        FOR ALL
        USING (thread_id IN (SELECT id FROM threads WHERE guest_id = current_app_user_id() OR host_id = current_app_user_id()) OR is_admin_or_rls_bypassed())
        WITH CHECK (thread_id IN (SELECT id FROM threads WHERE guest_id = current_app_user_id() OR host_id = current_app_user_id()) OR is_admin_or_rls_bypassed());

      -- 13. bookings
      ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS bookings_policy ON bookings;
      CREATE POLICY bookings_policy ON bookings
        FOR ALL
        USING (user_id = current_app_user_id() OR listing_id IN (SELECT id FROM listings WHERE user_id = current_app_user_id()) OR is_admin_or_rls_bypassed())
        WITH CHECK (user_id = current_app_user_id() OR listing_id IN (SELECT id FROM listings WHERE user_id = current_app_user_id()) OR is_admin_or_rls_bypassed());

      -- 14. experience_bookings
      ALTER TABLE experience_bookings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE experience_bookings FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS experience_bookings_policy ON experience_bookings;
      CREATE POLICY experience_bookings_policy ON experience_bookings
        FOR ALL
        USING (user_id = current_app_user_id() OR experience_id IN (SELECT id FROM experiences WHERE host_id = current_app_user_id()) OR is_admin_or_rls_bypassed())
        WITH CHECK (user_id = current_app_user_id() OR experience_id IN (SELECT id FROM experiences WHERE host_id = current_app_user_id()) OR is_admin_or_rls_bypassed());

      -- 15. host_social_posts
      ALTER TABLE host_social_posts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE host_social_posts FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS host_social_posts_policy ON host_social_posts;
      CREATE POLICY host_social_posts_policy ON host_social_posts
        FOR ALL
        USING (host_id = current_app_user_id() OR is_admin_or_rls_bypassed())
        WITH CHECK (host_id = current_app_user_id() OR is_admin_or_rls_bypassed());
    `);
    console.log('✅ Sprint 5: Strict Multi-Role Row-Level Security (RLS) & FORCE ROW LEVEL SECURITY policies enforced on Neon Postgres.');

  } catch (rlsErr) {
    console.error('[RLS SETUP ERROR]', rlsErr);
  }

  // Sprint 6 (Domain 7): Canary Execution Registry, Platform Audit Log & Readback Verifications (CANARY-01 Gate)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_audit_log (
        id VARCHAR(100) PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        aggregate_id VARCHAR(100) NOT NULL,
        actor_id VARCHAR(100) NOT NULL,
        payload JSONB DEFAULT '{}'::jsonb,
        status VARCHAR(50) NOT NULL DEFAULT 'COMMITTED',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS canary_execution_registry (
        id VARCHAR(100) PRIMARY KEY,
        listing_id VARCHAR(100) NOT NULL,
        provider VARCHAR(50) NOT NULL CHECK (provider IN ('META_ADS', 'GOOGLE_ADS')),
        remote_campaign_id VARCHAR(100) NOT NULL,
        campaign_status VARCHAR(50) NOT NULL DEFAULT 'PAUSED' CHECK (campaign_status = 'PAUSED'),
        daily_budget_paise BIGINT NOT NULL DEFAULT 0 CHECK (daily_budget_paise = 0),
        operator_id VARCHAR(100) NOT NULL,
        idempotency_key VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'READBACK_VERIFIED', 'AUDITED', 'FAILED')),
        verification_receipt JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS canary_readback_verifications (
        id VARCHAR(100) PRIMARY KEY,
        canary_id VARCHAR(100) NOT NULL REFERENCES canary_execution_registry(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        remote_campaign_id VARCHAR(100) NOT NULL,
        remote_status VARCHAR(50) NOT NULL,
        remote_daily_budget_paise BIGINT NOT NULL,
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        exact_match BOOLEAN NOT NULL DEFAULT FALSE,
        raw_provider_response JSONB DEFAULT '{}'::jsonb,
        verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
      ALTER TABLE platform_audit_log FORCE ROW LEVEL SECURITY;
      ALTER TABLE canary_execution_registry ENABLE ROW LEVEL SECURITY;
      ALTER TABLE canary_execution_registry FORCE ROW LEVEL SECURITY;
      ALTER TABLE canary_readback_verifications ENABLE ROW LEVEL SECURITY;
      ALTER TABLE canary_readback_verifications FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS platform_audit_log_admin_policy ON platform_audit_log;
      CREATE POLICY platform_audit_log_admin_policy ON platform_audit_log FOR ALL
        USING (is_admin_or_rls_bypassed())
        WITH CHECK (is_admin_or_rls_bypassed());

      DROP POLICY IF EXISTS canary_execution_registry_admin_policy ON canary_execution_registry;
      CREATE POLICY canary_execution_registry_admin_policy ON canary_execution_registry FOR ALL
        USING (is_admin_or_rls_bypassed())
        WITH CHECK (is_admin_or_rls_bypassed());

      DROP POLICY IF EXISTS canary_readback_verifications_admin_policy ON canary_readback_verifications;
      CREATE POLICY canary_readback_verifications_admin_policy ON canary_readback_verifications FOR ALL
        USING (is_admin_or_rls_bypassed())
        WITH CHECK (is_admin_or_rls_bypassed());
    `);
    console.log('✅ Sprint 6: Canary Execution Registry, Platform Audit Log & Readback Verifications DDL enforced on Neon Postgres.');
  } catch (canaryErr) {
    console.error('[CANARY DDL SETUP ERROR]', canaryErr);
  }

  // Phase 2.6 Milestone 2 Step 1: DCO Persistence Model
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_creative_variants (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        meta_creative_id VARCHAR(255),
        meta_ad_id VARCHAR(255),
        asset_sha256 VARCHAR(64),
        media_url TEXT,
        media_type VARCHAR(50),
        status VARCHAR(50) DEFAULT 'ACTIVE',
        is_published BOOLEAN DEFAULT FALSE,
        variant_activated_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS variant_activated_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';
      ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(255);
      ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

      -- Immutability trigger for campaign_creative_variants
      CREATE OR REPLACE FUNCTION enforce_variant_immutability()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.is_published = TRUE THEN
          IF NEW.meta_creative_id IS DISTINCT FROM OLD.meta_creative_id THEN
            RAISE EXCEPTION 'Cannot modify meta_creative_id of a published variant';
          END IF;
          IF NEW.meta_ad_id IS DISTINCT FROM OLD.meta_ad_id THEN
            RAISE EXCEPTION 'Cannot modify meta_ad_id of a published variant';
          END IF;
          IF NEW.asset_sha256 IS DISTINCT FROM OLD.asset_sha256 THEN
            RAISE EXCEPTION 'Cannot modify asset_sha256 of a published variant';
          END IF;
          IF NEW.media_url IS DISTINCT FROM OLD.media_url THEN
            RAISE EXCEPTION 'Cannot modify media_url of a published variant';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_enforce_variant_immutability ON campaign_creative_variants;
      CREATE TRIGGER trg_enforce_variant_immutability
      BEFORE UPDATE ON campaign_creative_variants
      FOR EACH ROW
      EXECUTE FUNCTION enforce_variant_immutability();

      CREATE TABLE IF NOT EXISTS variant_meta_snapshots (
        id SERIAL PRIMARY KEY,
        variant_id INTEGER NOT NULL REFERENCES campaign_creative_variants(id) ON DELETE CASCADE,
        last_meta_impressions BIGINT DEFAULT 0,
        last_meta_clicks BIGINT DEFAULT 0,
        last_meta_conversions BIGINT DEFAULT 0,
        last_meta_spend NUMERIC(12,4) DEFAULT 0.0000,
        last_meta_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        snapshot_version INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(variant_id)
      );

      ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS last_meta_impressions BIGINT DEFAULT 0;
      ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS last_meta_clicks BIGINT DEFAULT 0;
      ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS last_meta_conversions BIGINT DEFAULT 0;
      ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS last_meta_spend NUMERIC(12,4) DEFAULT 0.0000;
      ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS last_meta_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS snapshot_version INTEGER DEFAULT 1;
      CREATE TABLE IF NOT EXISTS dco_evaluation_transactions (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        evaluation_epoch VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'EVALUATING',
        lease_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        winner_variant_id INTEGER REFERENCES campaign_creative_variants(id) ON DELETE SET NULL,
        loser_variant_id INTEGER REFERENCES campaign_creative_variants(id) ON DELETE SET NULL,
        winner_metric_value NUMERIC(12,4),
        loser_metric_value NUMERIC(12,4),
        relative_advantage NUMERIC(8,4),
        decision VARCHAR(50),
        optimization_metric VARCHAR(50) DEFAULT 'CPC',
        evaluation_window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        evaluation_window_end TIMESTAMP WITH TIME ZONE,
        metrics_snapshot JSONB DEFAULT '{}',
        decision_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(campaign_id, evaluation_epoch)
      );

      ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS loser_variant_id INTEGER REFERENCES campaign_creative_variants(id) ON DELETE SET NULL;
      ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS winner_metric_value NUMERIC(12,4);
      ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS loser_metric_value NUMERIC(12,4);
      ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS relative_advantage NUMERIC(8,4);
      ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS decision VARCHAR(50);
      ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS optimization_metric VARCHAR(50) DEFAULT 'CPC';
      ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS evaluation_window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS evaluation_window_end TIMESTAMP WITH TIME ZONE;
      ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS metrics_snapshot JSONB DEFAULT '{}';

      CREATE TABLE IF NOT EXISTS dco_external_actions (
        id SERIAL PRIMARY KEY,
        action_key VARCHAR(255) NOT NULL UNIQUE,
        campaign_id INTEGER NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        evaluation_id INTEGER REFERENCES dco_evaluation_transactions(id) ON DELETE SET NULL,
        variant_id INTEGER REFERENCES campaign_creative_variants(id) ON DELETE CASCADE,
        meta_ad_id VARCHAR(255),
        action_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'REQUESTED',
        error_details TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE dco_external_actions ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(255);

      CREATE TABLE IF NOT EXISTS variant_raw_event_logs (
        id SERIAL PRIMARY KEY,
        variant_id INTEGER NOT NULL REFERENCES campaign_creative_variants(id) ON DELETE CASCADE,
        meta_ad_id VARCHAR(255),
        snapshot_before_version INTEGER NOT NULL DEFAULT 0,
        snapshot_after_version INTEGER NOT NULL DEFAULT 1,
        impressions_delta BIGINT DEFAULT 0,
        clicks_delta BIGINT DEFAULT 0,
        conversions_delta BIGINT DEFAULT 0,
        spend_delta NUMERIC(12,4) DEFAULT 0.0000,
        is_correction BOOLEAN NOT NULL DEFAULT false,
        observed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        source_snapshot_reference VARCHAR(255),
        CONSTRAINT unique_variant_version_transition UNIQUE (variant_id, snapshot_before_version, snapshot_after_version)
      );

      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(255);
      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS snapshot_before_version INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS snapshot_after_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS impressions_delta BIGINT DEFAULT 0;
      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS clicks_delta BIGINT DEFAULT 0;
      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS conversions_delta BIGINT DEFAULT 0;
      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS spend_delta NUMERIC(12,4) DEFAULT 0.0000;
      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS is_correction BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS observed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE;
      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS source_snapshot_reference VARCHAR(255);

      CREATE TABLE IF NOT EXISTS variant_daily_rollups (
        id SERIAL PRIMARY KEY,
        variant_id INTEGER NOT NULL REFERENCES campaign_creative_variants(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        impressions BIGINT DEFAULT 0,
        clicks BIGINT DEFAULT 0,
        conversions BIGINT DEFAULT 0,
        spend_usd NUMERIC(12,4) DEFAULT 0.0000,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(variant_id, date)
      );

      ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS dco_status VARCHAR(50) DEFAULT 'PENDING_DATA';
      ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS objective VARCHAR(50) DEFAULT 'TRAFFIC';
      ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS optimization_metric VARCHAR(50) DEFAULT 'CPC';
    `);
    console.log('✅ Phase 2.6 Milestone 2 Step 1: DCO Persistence Model updated with authoritative UTC snapshots, provenance, and negative corrections.');
  } catch (dcoErr) {
    console.error('[DCO SCHEMA ERROR]', dcoErr);
  }

  // Phase 3.6: Hot Lead Alerting, Walled Garden CRM & Outbox Queue Schemas
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_lifecycle_events (
        id SERIAL PRIMARY KEY,
        lead_id INT REFERENCES host_outreach_leads(id) ON DELETE CASCADE,
        campaign_id INT,
        host_id INT,
        event_type VARCHAR(100) NOT NULL,
        from_state VARCHAR(50),
        to_state VARCHAR(50),
        actor_type VARCHAR(50) NOT NULL,
        actor_id VARCHAR(100),
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id ON lead_lifecycle_events(lead_id);
      CREATE INDEX IF NOT EXISTS idx_lead_events_host_id ON lead_lifecycle_events(host_id);
      CREATE INDEX IF NOT EXISTS idx_lead_events_campaign_id ON lead_lifecycle_events(campaign_id);

      CREATE TABLE IF NOT EXISTS lead_notification_intents (
        id SERIAL PRIMARY KEY,
        lead_id INT REFERENCES host_outreach_leads(id) ON DELETE CASCADE,
        campaign_id INT,
        host_id INT NOT NULL,
        channel VARCHAR(50) NOT NULL,
        recipient VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        metadata JSONB,
        status VARCHAR(50) DEFAULT 'PENDING',
        attempt_count INT DEFAULT 0,
        max_attempts INT DEFAULT 3,
        lease_expires_at TIMESTAMP WITH TIME ZONE,
        next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_lead_notif_pending ON lead_notification_intents(status, next_retry_at) WHERE status IN ('PENDING', 'PROCESSING');
      CREATE INDEX IF NOT EXISTS idx_lead_notif_lead_id ON lead_notification_intents(lead_id);
      CREATE INDEX IF NOT EXISTS idx_lead_notif_host_id ON lead_notification_intents(host_id);

      CREATE TABLE IF NOT EXISTS lead_security_audit_logs (
        id SERIAL PRIMARY KEY,
        lead_id INT,
        campaign_id INT,
        attempted_host_id INT,
        actual_host_id INT,
        action VARCHAR(100) NOT NULL,
        severity VARCHAR(50) DEFAULT 'WARNING',
        reason TEXT NOT NULL,
        client_ip VARCHAR(100),
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_lead_sec_campaign ON lead_security_audit_logs(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_lead_sec_host ON lead_security_audit_logs(attempted_host_id);

      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS source VARCHAR(255) DEFAULT 'Meta Advertising Webhook';
      ALTER TABLE host_outreach_leads ALTER COLUMN guest_email TYPE TEXT;
      ALTER TABLE host_outreach_leads ALTER COLUMN guest_phone TYPE TEXT;
      ALTER TABLE host_outreach_leads ALTER COLUMN guest_name TYPE TEXT;
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS listing_id INT;
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'META';
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS external_lead_id VARCHAR(255);
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS form_id VARCHAR(255);
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS ad_id VARCHAR(255);
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS scoring_inputs JSONB;
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS scored_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS lost_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS thread_id INT;
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(255);
      ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_host_outreach_leads_dedup ON host_outreach_leads(dedup_key) WHERE dedup_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_host_outreach_leads_campaign_status ON host_outreach_leads(campaign_id, status);
      CREATE INDEX IF NOT EXISTS idx_host_outreach_leads_host_status ON host_outreach_leads(host_id, status);
    `);
    console.log('✅ Phase 3.6: Hot Lead Alerting, Walled Garden CRM & Outbox Queue Schemas verified.');
  } catch (leadSchemaErr) {
    console.error('[LEAD SCHEMA ERROR]', leadSchemaErr);
  }

  // Phase 3.7B: Provider-Neutral Entities & Transactions Tables
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_entities (
        id SERIAL PRIMARY KEY,
        campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        external_id VARCHAR(255) NOT NULL,
        parent_entity_id VARCHAR(255),
        account_id VARCHAR(255),
        configured_status VARCHAR(50) DEFAULT 'ACTIVE',
        effective_status VARCHAR(50) DEFAULT 'ACTIVE',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_provider_entity_external_id UNIQUE (provider, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_provider_entities_campaign ON provider_entities(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_provider_entities_provider ON provider_entities(provider);
      CREATE INDEX IF NOT EXISTS idx_provider_entities_type ON provider_entities(entity_type);

      CREATE TABLE IF NOT EXISTS provider_publishing_transactions (
        id SERIAL PRIMARY KEY,
        campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        operation_type VARCHAR(100) NOT NULL,
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        correlation_id VARCHAR(255),
        publish_status VARCHAR(50) DEFAULT 'REQUESTED',
        external_campaign_id VARCHAR(255),
        external_container_id VARCHAR(255),
        external_ad_id VARCHAR(255),
        external_creative_id VARCHAR(255),
        payload JSONB,
        response JSONB,
        error_details TEXT,
        attempt_count INT DEFAULT 1,
        lease_expires_at TIMESTAMP WITH TIME ZONE,
        is_unknown_outcome BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_provider_tx_campaign ON provider_publishing_transactions(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_provider_tx_status ON provider_publishing_transactions(publish_status);
    `);
    console.log('✅ Phase 3.7B: Provider-Neutral Entities & Publishing Transactions Schemas verified.');
  } catch (providerSchemaErr) {
    console.error('[PROVIDER SCHEMA ERROR]', providerSchemaErr);
  }

    await pool.query(`
      ALTER TABLE webhook_dlq ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP;
      ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP;
      ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS publish_attempt_count INT DEFAULT 0;
      ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS dco_last_evaluated_at TIMESTAMP;
    `).catch(() => true);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_host_id ON host_marketing_campaigns(host_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_listing_id ON host_marketing_campaigns(listing_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON host_marketing_campaigns(status);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_webhook_dlq_retry ON webhook_dlq(retry_count, next_retry_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_webhook_dlq_active ON webhook_dlq(next_retry_at, retry_count) WHERE status = 'pending';`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_posts_due ON host_social_posts(status, scheduled_at) WHERE status IN ('approved', 'publishing');`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_dco_eval ON host_marketing_campaigns(status, meta_dispatched_at, dco_last_evaluated_at) WHERE status = 'active';`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_meta_tx_recovery ON meta_publishing_transactions(publish_status, updated_at, reconciliation_lease_expires_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON admin_audit_logs(entity_type, entity_id);`);

  marketingSchemaInitialized = true;
};

let initPromise: Promise<void> | null = null;
const ensureDbInitialized = async () => {
  if (!isDbConfigured) return;
  if (process.env.NODE_ENV === 'production') {
    if (marketingSchemaInitialized && usersTableInitialized && listingsTableInitialized) return;
    const ready = await databaseReadiness(pool);
    if (!ready.ready) throw new Error('DATABASE_MIGRATIONS_OR_ROLE_NOT_READY');
    marketingSchemaInitialized = usersTableInitialized = listingsTableInitialized = true;
    return;
  }
  if (marketingSchemaInitialized && usersTableInitialized && listingsTableInitialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        // FAANG Fast-Path: Bypass massive DDL locks in Vercel Serverless if schema is up-to-date
        try {

          const fastCheck = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='host_philosophy' LIMIT 1`);
          if (fastCheck.rowCount && fastCheck.rowCount > 0) {
             marketingSchemaInitialized = true;
             usersTableInitialized = true;
             listingsTableInitialized = true;
             return;
          }
        } catch (e) {
          // ignore check failure, proceed to full init
        }
        await ensureUsersTable();
        await ensureListingsTable();

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
            currency VARCHAR(10) DEFAULT 'USD',
            max_participants INTEGER DEFAULT 10,
            available_spots INTEGER DEFAULT 10,
            image_urls JSONB DEFAULT '[]',
            video_url TEXT,
            itinerary JSONB DEFAULT '[]',
            included JSONB DEFAULT '[]',
            not_included JSONB DEFAULT '[]',
            status VARCHAR(50) DEFAULT 'draft',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS experience_bookings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            experience_id INTEGER REFERENCES experiences(id) ON DELETE CASCADE,
            num_tickets INTEGER DEFAULT 1,
            total_price DECIMAL(10, 2) NOT NULL,
            currency VARCHAR(10) DEFAULT 'USD',
            status VARCHAR(50) DEFAULT 'confirmed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await ensureMarketingSchema();
        console.log("DB Initialization Complete on Request!");
      } catch (e) {
        console.error("DB Initialization Error:", e);
        initPromise = null;
        throw e;
      }
    })();
  }
  try {
    await initPromise;
  } catch (_e) {
    initPromise = null;
  }
};


export {
  ensureUsersTable,
  ensureListingsTable,
  ensureDbInitialized
};
