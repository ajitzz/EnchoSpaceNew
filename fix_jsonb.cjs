require('dotenv').config({ override: true });
const pkg = require('pg');
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fix() {
  try {
    const res = await pool.query("UPDATE host_social_posts SET media_urls = (media_urls#>>'{}')::jsonb WHERE jsonb_typeof(media_urls) = 'string'");
    console.log(`Updated ${res.rowCount} rows in host_social_posts.media_urls`);
    
    const res2 = await pool.query("UPDATE host_social_posts SET hashtags = (hashtags#>>'{}')::jsonb WHERE jsonb_typeof(hashtags) = 'string'");
    console.log(`Updated ${res2.rowCount} rows in host_social_posts.hashtags`);

    const res3 = await pool.query("UPDATE host_marketing_campaigns SET media_urls = (media_urls#>>'{}')::jsonb WHERE jsonb_typeof(media_urls) = 'string'");
    console.log(`Updated ${res3.rowCount} rows in host_marketing_campaigns.media_urls`);

    const res4 = await pool.query("UPDATE host_marketing_campaigns SET platforms = (platforms#>>'{}')::jsonb WHERE jsonb_typeof(platforms) = 'string'");
    console.log(`Updated ${res4.rowCount} rows in host_marketing_campaigns.platforms`);

    const res5 = await pool.query("UPDATE host_marketing_campaigns SET target_locations = (target_locations#>>'{}')::jsonb WHERE jsonb_typeof(target_locations) = 'string'");
    console.log(`Updated ${res5.rowCount} rows in host_marketing_campaigns.target_locations`);
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
fix();
