const fetch = require('node-fetch');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const token = jwt.sign({ id: 1, role: 'host', email: 'test@example.com' }, process.env.JWT_SECRET || 'fallback_secret_key_12345');

async function main() {
  const payload = {
    title: 'Test Exp',
    description: 'Desc',
    destination: 'Dest',
    departure_location: 'Loc',
    start_date: '2025-01-01',
    end_date: '2025-01-02',
    price: "",
    total_spots: "",
    available_spots: "",
    itinerary: [],
    includes: ['a', 'b'],
    image_urls: ['url1', 'url2'],
    status: 'upcoming',
    target_audience: 'all',
    places_to_visit: [],
    included_stay: null,
    highlights: [],
    things_to_carry: [],
    important_notes: 'None',
    video_urls: ['vid1'],
    excludes: ['x'],
    start_time: '10:00',
    end_time: '12:00',
    language: 'English',
    cancellation_policy: 'Flexible',
    map_link: 'http://map'
  };

  const res = await fetch('http://localhost:3000/api/experiences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body:", text);
}

main();
