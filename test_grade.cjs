const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = jwt.sign({ id: 1, role: 'host' }, process.env.JWT_SECRET || 'fallback_secret_key_12345');

async function run() {
  try {
    const pool = require('pg').Pool;
    const { Pool } = require('pg');
    const p = new Pool({ connectionString: process.env.DATABASE_URL });
    
    // Insert a listing for user 1
    const resListing = await p.query("INSERT INTO listings (user_id, title, description, price, city, address, type) VALUES (1, 'Test Listing', 'A test listing', 100, 'Test City', '123 Test St', 'house') RETURNING id");
    const listingId = resListing.rows[0].id;

    const res = await axios.post('http://localhost:3000/api/marketing/grade-targeting', {
      listing_id: listingId,
      target_locations: "Mumbai"
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
