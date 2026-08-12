import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function init() {
  try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password_hash VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      google_id VARCHAR(255) UNIQUE,
      phone VARCHAR(255) UNIQUE,
      avatar TEXT,
      role VARCHAR(50) DEFAULT 'user',
      wallet_balance DECIMAL(10, 2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

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
      lat NUMERIC,
      lng NUMERIC,
      dynamic_pricing JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

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
      approved_at TIMESTAMP,
      target_locations TEXT,
      target_locations_json JSONB,
      target_radius_km INT DEFAULT 50,
      ad_format VARCHAR(50) DEFAULT 'post',
      feed_description TEXT,
      rejected_fields JSONB DEFAULT '{}'::jsonb,
      payment_status VARCHAR(50) DEFAULT 'unpaid',
      payment_gateway VARCHAR(50),
      payment_intent_id VARCHAR(255),
      admin_approved BOOLEAN DEFAULT false,
      meta_campaign_id VARCHAR(255),
      meta_adset_id VARCHAR(255),
      meta_ad_id VARCHAR(255),
      meta_creative_id VARCHAR(255),
      meta_dispatched_at TIMESTAMP,
      meta_pixel_id VARCHAR(255),
      meta_capi_token TEXT,
      meta_lead_form_id VARCHAR(255),
      google_conversion_id VARCHAR(255),
      google_conversion_label VARCHAR(255),
      pacing_mode VARCHAR(50) DEFAULT 'standard',
      accumulated_spent DECIMAL DEFAULT 0,
      spent DECIMAL DEFAULT 0,
      accumulated_impressions INT DEFAULT 0,
      accumulated_clicks INT DEFAULT 0,
      encho_absorbed_overspend DECIMAL DEFAULT 0,
      accumulated_conversions INT DEFAULT 0,
      escrow_status VARCHAR(50) DEFAULT 'released'
    );

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

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      sender_id INT REFERENCES users(id),
      receiver_id INT REFERENCES users(id),
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(50) UNIQUE NOT NULL,
      value JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS experiences (
      id SERIAL PRIMARY KEY,
      host_id INT REFERENCES users(id),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      city VARCHAR(100) NOT NULL,
      address VARCHAR(255),
      lat NUMERIC,
      lng NUMERIC,
      image_urls JSONB DEFAULT '[]'::jsonb,
      video_url TEXT,
      category VARCHAR(50) DEFAULT 'Adventure',
      duration_hours NUMERIC DEFAULT 2,
      max_group_size INT DEFAULT 10,
      amenities JSONB DEFAULT '[]'::jsonb,
      itinerary JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS experience_bookings (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      experience_id INT REFERENCES experiences(id) ON DELETE CASCADE,
      booking_date VARCHAR(50) NOT NULL,
      time_slot VARCHAR(50) NOT NULL,
      num_tickets INT DEFAULT 1,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      total_amount DECIMAL NOT NULL,
      status VARCHAR(50) DEFAULT 'Confirmed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS host_outreach_leads (
      id SERIAL PRIMARY KEY,
      campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE SET NULL,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      guest_name VARCHAR(255) NOT NULL,
      guest_email VARCHAR(255),
      guest_phone VARCHAR(50),
      status VARCHAR(50) DEFAULT 'New Lead',
      message_history JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log("DB created successfully");
  } catch (e) {
    console.error("DB creation error:", e);
  } finally {
    pool.end();
  }
}
init();
