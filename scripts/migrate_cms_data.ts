import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  console.log('Starting CMS Data Migration (Phase A)...');
  
  // 1. Ensure tables exist (simulate ensureListingsTable)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS room_types (
      id SERIAL PRIMARY KEY,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      base_price DECIMAL NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      max_occupancy INT DEFAULT 2,
      inventory_count INT DEFAULT 1,
      features JSONB DEFAULT '[]'::jsonb,
      amenities JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INT NOT NULL,
      url TEXT NOT NULL,
      category VARCHAR(50) NOT NULL,
      title VARCHAR(255),
      description TEXT,
      specs VARCHAR(255),
      lighting_time VARCHAR(255),
      is_hero BOOLEAN DEFAULT false,
      order_index INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('Created tables. Fetching listings...');

  const { rows: listings } = await pool.query('SELECT * FROM listings');
  console.log(`Found ${listings.length} listings. Migrating...`);

  let roomsMigrated = 0;
  let photosMigrated = 0;

  for (const listing of listings) {
    // Migrate Rooms
    if (listing.rooms && Array.isArray(listing.rooms)) {
      for (const room of listing.rooms) {
        try {
          await pool.query(`
            INSERT INTO room_types (listing_id, name, base_price, currency, max_occupancy, inventory_count, features, amenities)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            listing.id,
            room.name || 'Standard Room',
            room.price || listing.price, // Fallback to property price
            listing.currency || 'INR',
            room.capacity || 2,
            room.inventory_count || 1,
            JSON.stringify(room.features || []),
            JSON.stringify(room.amenities || [])
          ]);
          roomsMigrated++;
        } catch (e) {
          console.error(`Failed to migrate room for listing ${listing.id}:`, e);
        }
      }
    }

    // Migrate Photos
    if (listing.photos && Array.isArray(listing.photos)) {
      let orderIndex = 0;
      for (const photo of listing.photos) {
        try {
          await pool.query(`
            INSERT INTO media_assets (entity_type, entity_id, url, category, title, description, specs, lighting_time, is_hero, order_index)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            'listing',
            listing.id,
            photo.url,
            photo.category || 'other',
            photo.title || '',
            photo.description || '',
            photo.specs || '',
            photo.lightingTime || '',
            photo.isHero || false,
            orderIndex++
          ]);
          photosMigrated++;
        } catch (e) {
          console.error(`Failed to migrate photo for listing ${listing.id}:`, e);
        }
      }
    } else if (listing.image_urls && Array.isArray(listing.image_urls)) {
      // Fallback for old properties without SpatialPhotos
      let orderIndex = 0;
      for (const url of listing.image_urls) {
        try {
          await pool.query(`
            INSERT INTO media_assets (entity_type, entity_id, url, category, title, description, is_hero, order_index)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            'listing',
            listing.id,
            url,
            'other', // Generic fallback
            'Property Photo',
            '',
            orderIndex === 0, // Make first image hero
            orderIndex++
          ]);
          photosMigrated++;
        } catch (e) {
          console.error(`Failed to migrate image_url for listing ${listing.id}:`, e);
        }
      }
    }
  }

  console.log(`Migration Complete! Migrated ${roomsMigrated} room types and ${photosMigrated} media assets.`);
  process.exit(0);
}

migrate().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});
