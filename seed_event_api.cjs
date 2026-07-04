const http = require('http');

const payload = JSON.stringify({
    title: 'Neon Lights Cyberpunk Tokyo Tour',
    description: 'Experience the futuristic aesthetics of Tokyo at night. Dive deep into Akihabara, Shibuya, and secret underground arcades. This is an immersive, high-energy tour through the cyberpunk heart of Japan.',
    destination: 'Tokyo, Japan',
    departure_location: 'Tokyo Narita Airport',
    start_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 17 * 24 * 60 * 60 * 1000).toISOString(),
    price: 1599,
    total_spots: 12,
    available_spots: 12,
    itinerary: [{day: 1, title: 'Arrival & Akihabara Night Walk', description: 'Check-in and dive into the electric town.'}, {day: 2, title: 'Shibuya Crossing & Robot Restaurant', description: 'Experience the busiest crossing and futuristic dining.'}],
    includes: ['Hotel Accommodation', 'Breakfast & Dinner', 'Local Transit Pass', 'English Speaking Cyber-Guide'],
    image_urls: ['https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'],
    status: 'draft',
    target_audience: 'all',
    places_to_visit: [{name: 'Akihabara', description: 'Electric Town', image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'}],
    included_stay: {title: 'Shinjuku Prince Hotel', location: 'Shinjuku', amenities: ['WiFi', 'City View'], image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800'},
    highlights: ['Cyberpunk Photography Walk', 'Underground Arcade Tournament'],
    things_to_carry: ['Comfortable walking shoes', 'Camera', 'Neon-friendly clothing'],
    important_notes: 'This trip involves a lot of walking in crowded areas.',
    video_urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    excludes: ['Flights', 'Personal Shopping', 'Alcohol'],
    start_time: '18:00',
    end_time: '23:00',
    language: 'English, Japanese (Basic)',
    cancellation_policy: 'Free cancellation 15 days prior. 50% refund within 7 days.',
    map_link: 'https://goo.gl/maps/shibuya'
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const token = JSON.parse(data).token;
    console.log('Got token');
    
    const req2 = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/experiences',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    }, (res2) => {
      let data2 = '';
      res2.on('data', d => data2 += d);
      res2.on('end', () => {
        console.log('Created experience:', data2);
      });
    });
    
    req2.write(payload);
    req2.end();
  });
});

req.write(JSON.stringify({email: 'ajithsabzz@gmail.com', password: 'password123'}));
req.end();
