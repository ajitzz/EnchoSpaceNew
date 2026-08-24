const { Pool } = require('pg');
require('dotenv').config();

const rawUrl = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_cF8derOS7aXT@ep-cool-salad-b3pdhiyg-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const cleanUrl = rawUrl.includes('?') ? rawUrl.split('?')[0] : rawUrl;

const pool = new Pool({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false }
});

const showcaseListings = [
  {
    title: 'Villa Satori • The Cliffside Glass Pavilion',
    description: 'Perched on the volcanic cliffs overlooking the Arabian Sea, Villa Satori is an architectural marvel of cantilevered monolithic concrete, acoustic glass pavilions, and infinity water mirrors. Designed by Pritzker-prize laureates, every room merges raw stone with panoramic sunset horizons.',
    price: 48000,
    currency: 'INR',
    type: 'Private Cliffside Sanctuary',
    address: 'Vagator Cliffside Sanctuary',
    city: 'Goa',
    state: 'Goa',
    country: 'India',
    max_guests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 4,
    rental_mode: 'entire_place',
    hero_video_url: 'https://assets.mixkit.co/videos/preview/mixkit-waves-coming-to-the-beach-5016-large.mp4',
    hero_fallback_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=85',
    dominant_color_hex: '#0e7490', // Ocean Cyan
    curated_guidelines: JSON.stringify([
      'Pure Atmospheric Harmony: Uninterrupted tranquility is preserved throughout the sanctuary grounds.',
      'Curated Climate Control: Intelligent smart climate maintains optimal botanical humidity and airflow.',
      'Bespoke Sanctuary Attire: We invite guests to honor the minimalist floors with our handcrafted linen slippers.'
    ]),
    raw_rules: 'No loud music after 10 PM. No outdoor shoes inside. Maintain AC at 24C.',
    experience_tags: JSON.stringify([
      'Ocean Waves',
      'Heated Infinity Pool',
      'Private Chef Available',
      '1 Gbps Fiber WiFi',
      'Panoramic Mountain View'
    ]),
    amenities: JSON.stringify([
      'Ocean View',
      'Private Infinity Pool',
      'Helipad Access',
      '24/7 Butler Service',
      'Acoustic Silence Glazing',
      'Wine Cellar',
      'Private Chef Kitchen',
      '1 Gbps Fiber WiFi'
    ]),
    image_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=85',
    image_urls: JSON.stringify([
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80'
    ]),
    seo_title: 'Villa Satori • The Cliffside Glass Pavilion | Encho Sanctuary',
    seo_description: 'Experience ultra-luxury living at Villa Satori in Goa. Private cliffside sanctuary with heated infinity pool, acoustic glass, and dedicated butler.',
    seo_keywords: 'Villa Satori, Goa luxury villa, luxury cliffside villa, Aman standard retreat',
    seo_image_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=85',
    lat: 15.5978,
    lng: 73.7389
  },
  {
    title: 'The Amber Pavilion • Royal Heritage Haveli',
    description: 'An 18th-century royal oasis restored with uncompromised Aman-level precision. Hand-carved sandstone arches, private reflection pools, and manicured bougainvillea courtyards invite discerning guests to immerse in imperial serenity.',
    price: 62000,
    currency: 'INR',
    type: 'Royal Heritage Sanctuary',
    address: 'Amber Fort Estate',
    city: 'Jaipur',
    state: 'Rajasthan',
    country: 'India',
    max_guests: 8,
    bedrooms: 4,
    beds: 4,
    bathrooms: 5,
    rental_mode: 'entire_place',
    hero_video_url: 'https://assets.mixkit.co/videos/preview/mixkit-fireplace-burning-in-a-dark-room-41974-large.mp4',
    hero_fallback_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=85',
    dominant_color_hex: '#d97706', // Royal Amber
    curated_guidelines: JSON.stringify([
      'Heritage Sanctity: The 200-year-old sandstone stonework is preserved with organic floral care.',
      'Aristocratic Silence: Sunset peacock hour is dedicated to acoustic tranquility.',
      'Private Culinary Protocols: Royal Thali dining is prepared exclusively on brass dinnerware.'
    ]),
    raw_rules: 'No smoking near heritage frescos. Respect quiet hours from 9 PM.',
    experience_tags: JSON.stringify([
      'Private Chef Available',
      'Wine Cellar',
      'Panoramic Mountain View',
      '1 Gbps Fiber WiFi',
      'Heated Infinity Pool'
    ]),
    amenities: JSON.stringify([
      'Manicured Courtyard',
      'Private Reflection Pool',
      'Royal Butler Service',
      'Sandstone Spa',
      'Fine Wine Cellar',
      'High Speed WiFi',
      'Valet Helipad Shuttle'
    ]),
    image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=85',
    image_urls: JSON.stringify([
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80'
    ]),
    seo_title: 'The Amber Pavilion • Royal Heritage Haveli | Encho Sanctuary',
    seo_description: 'Historic royalty meets modern luxury in Jaipur. Restored 18th-century sanctuary with private courtyards and dedicated royal service.',
    seo_keywords: 'Amber Pavilion, Jaipur luxury villa, royal heritage retreat, Jaipur 5 star',
    seo_image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=85',
    lat: 26.9855,
    lng: 75.8513
  },
  {
    title: 'Cloud Nine Estate • The Tea Mist Glasshouse',
    description: 'Suspended in the rolling emerald tea hills of the Western Ghats at 6,000 feet, Cloud Nine Estate offers floating glass living spaces above the morning mist. Private heated cedar plunge tubs and a dedicated naturalist team ensure complete restoration.',
    price: 38000,
    currency: 'INR',
    type: 'High-Altitude Forest Sanctuary',
    address: 'Anamudi Peak Ridge',
    city: 'Munnar',
    state: 'Kerala',
    country: 'India',
    max_guests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    rental_mode: 'entire_place',
    hero_video_url: 'https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4',
    hero_fallback_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85',
    dominant_color_hex: '#059669', // Emerald Green
    curated_guidelines: JSON.stringify([
      'Forest Immersion: Organic local tea infusions are harvested daily at sunrise for guests.',
      'Mist Aeration: Floor-to-ceiling sliding glass opens fully to embrace high-altitude mountain breezes.',
      'Eco-Architectural Harmony: Zero single-use plastics and natural mountain spring water filtration.'
    ]),
    raw_rules: 'No smoking on wooden decks. Please turn off exterior spotlights after 10 PM for wildlife protection.',
    experience_tags: JSON.stringify([
      'Panoramic Mountain View',
      'Heated Infinity Pool',
      'Private Chef Available',
      '1 Gbps Fiber WiFi',
      'Wine Cellar'
    ]),
    amenities: JSON.stringify([
      'Heated Cedar Hot Tub',
      'Panoramic Tea Valley View',
      'Private Naturalist Guide',
      'Organic Tea Tasting Bar',
      'Starlink Satellite WiFi',
      'Artisan Fireplace'
    ]),
    image_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85',
    image_urls: JSON.stringify([
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80'
    ]),
    seo_title: 'Cloud Nine Estate • The Tea Mist Glasshouse | Encho Sanctuary',
    seo_description: 'High-altitude luxury above the clouds in Munnar. Heated cedar plunge tubs, organic estate tea tasting, and 360 degree valley panoramas.',
    seo_keywords: 'Cloud Nine Munnar, Munnar luxury resort, tea estate villa, private glasshouse',
    seo_image_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85',
    lat: 10.0889,
    lng: 77.0595
  }
];

async function seed() {
  console.log('--- Seeding 10.0 Aman Showcase Sanctuaries ---');
  
  let hostRes = await pool.query("SELECT id FROM users WHERE email = 'thusharahomestay@gmail.com' LIMIT 1");
  let hostId = hostRes.rows[0]?.id;
  if (!hostId) {
    const userRes = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    hostId = userRes.rows[0]?.id || 1;
  }

  console.log(`Using Host ID: ${hostId}`);

  for (const item of showcaseListings) {
    const insertQuery = `
      INSERT INTO listings (
        user_id, title, description, price, currency, type, address, city, state, country,
        max_guests, bedrooms, beds, bathrooms, rental_mode,
        hero_video_url, hero_fallback_url, dominant_color_hex,
        curated_guidelines, raw_rules, experience_tags, amenities,
        image_url, image_urls,
        seo_title, seo_description, seo_keywords, seo_image_url,
        lat, lng
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24,
        $25, $26, $27, $28,
        $29, $30
      ) RETURNING id, title;
    `;

    const values = [
      hostId, item.title, item.description, item.price, item.currency, item.type, item.address, item.city, item.state, item.country,
      item.max_guests, item.bedrooms, item.beds, item.bathrooms, item.rental_mode,
      item.hero_video_url, item.hero_fallback_url, item.dominant_color_hex,
      item.curated_guidelines, item.raw_rules, item.experience_tags, item.amenities,
      item.image_url, item.image_urls,
      item.seo_title, item.seo_description, item.seo_keywords, item.seo_image_url,
      item.lat, item.lng
    ];

    const res = await pool.query(insertQuery, values);
    console.log(`✅ Created Sanctuary #${res.rows[0].id}: ${res.rows[0].title}`);
  }

  console.log('--- Seeding Completed Successfully ---');
  await pool.end();
}

seed().catch((err) => {
  console.error('❌ Seeding Failed:', err);
  process.exit(1);
});
