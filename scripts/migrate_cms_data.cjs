const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  const { rows: listings } = await pool.query('SELECT * FROM listings');
  
  let roomsMigrated = 0;
  let photosMigrated = 0;

  for (const listing of listings) {
    if (listing.rooms && Array.isArray(listing.rooms) && listing.rooms.length > 0) {
      for (const room of listing.rooms) {
        try {
          await pool.query(`
            INSERT INTO room_types (listing_id, name, base_price, currency, max_occupancy, inventory_count, features, amenities)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            listing.id,
            room.name || 'Standard Room',
            room.price || listing.price,
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

    if (listing.photos && Array.isArray(listing.photos) && listing.photos.length > 0) {
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
            'other',
            'Property Photo',
            '',
            orderIndex === 0,
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
