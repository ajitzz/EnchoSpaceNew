const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = jwt.sign({ id: 1, role: 'host' }, process.env.JWT_SECRET || 'fallback_secret_key_12345');

async function run() {
  try {
    const res = await axios.post('http://localhost:3000/api/marketing/campaigns', {
      listing_id: 1,
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
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
  }
}
run();
