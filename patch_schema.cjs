const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

// 1. Add columns to listings table
const listingsMigration = `
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
`;

content = content.replace(/IF NOT EXISTS \(SELECT 1 FROM information_schema\.columns WHERE table_name='listings' AND column_name='dynamic_pricing'\) THEN[\s\S]*?END IF;/g, match => match + '\n' + listingsMigration);

// 2. Add columns to users table
const usersMigration = `
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='editorial_quote') THEN
        ALTER TABLE users ADD COLUMN editorial_quote VARCHAR(255);
      END IF;
`;

content = content.replace(/IF NOT EXISTS \(SELECT 1 FROM information_schema\.columns WHERE table_name='users' AND column_name='avatar'\) THEN[\s\S]*?END IF;/g, match => match + '\n' + usersMigration);

// 3. Add soft_exit_leads table to the DB initialization.
// We can add it inside ensureDbInitialized function, maybe near lead_inquiries
const leadsTable = `
    CREATE TABLE IF NOT EXISTS soft_exit_leads (
      id SERIAL PRIMARY KEY,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'warm',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`;

content = content.replace(/CREATE TABLE IF NOT EXISTS lead_inquiries \([\s\S]*?\);/g, match => match + '\n' + leadsTable);

fs.writeFileSync('server.ts', content);
console.log('Schema patch applied.');
