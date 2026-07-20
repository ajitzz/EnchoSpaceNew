const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = jwt.sign({ id: 1, role: 'host' }, process.env.JWT_SECRET || 'fallback_secret_key_12345');

async function run() {
  try {
    const pool = require('pg').Pool;
    const { Pool } = require('pg');
    const p = new Pool({ connectionString: process.env.DATABASE_URL });
    
    // Check if user 1 exists, create if not
    await p.query("INSERT INTO users (id, email, password_hash, name, role) VALUES (1, 'test@test.com', 'pass', 'Test User', 'host') ON CONFLICT (id) DO NOTHING");
    // Insert a listing for user 1
    const resListing = await p.query("INSERT INTO listings (user_id, title, description, price, city, address) VALUES (1, 'Test Listing', 'A test listing', 100, 'Test City', '123 Test St') RETURNING id");
    const listingId = resListing.rows[0].id;
    console.log("Created listing:", listingId);

    const res = await axios.post('http://localhost:3000/api/marketing/campaigns', {
      listing_id: listingId,
      title: "Test Campaign",
      description: "Test description that is long enough",
      budget: 1000,
      platforms: ["meta"]
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log("Success:", res.data);
    await p.end();
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
  }
}
run();
