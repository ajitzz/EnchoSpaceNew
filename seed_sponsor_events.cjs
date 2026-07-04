require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const sponsorEvents = [
  {
    host_id: 1,
    title: 'Ultimate Swiss Alps Glacier Expedition',
    description: 'An unparalleled, ultra-luxury high-altitude expedition across the pristine glaciers of the Swiss Alps. Engineered for thrill-seekers and nature enthusiasts, this 5-day journey combines world-class mountaineering with 5-star alpine hospitality. Traverse crevasse fields under the guidance of UIAGM-certified guides, ice-climb vertical seracs, and retire to a privately catered geodesic dome perched at 3,000 meters. The expedition utilizes state-of-the-art sustainability practices, ensuring a zero-carbon footprint while offering maximum comfort. Every detail, from the helicopter insertion to the Michelin-starred farewell dinner in Zermatt, is meticulously orchestrated.',
    destination: 'Zermatt, Switzerland',
    departure_location: 'Geneva International Airport (Helipad B)',
    start_date: '2026-08-15T08:00:00Z',
    end_date: '2026-08-20T18:00:00Z',
    price: 12500.00,
    total_spots: 8,
    available_spots: 8,
    status: 'published',
    target_audience: 'couples',
    language: 'English, German, French',
    start_time: '08:00 AM',
    end_time: '06:00 PM',
    map_link: 'https://maps.google.com/?q=Zermatt,Switzerland',
    cancellation_policy: 'Strict: 50% refund up to 30 days before departure. No refunds within 30 days due to the complex logistics of helicopter charter and high-altitude permitting.',
    important_notes: 'Participants must submit a medical clearance form prior to arrival. Comprehensive alpine insurance (including helicopter rescue) is included in the package. High-altitude acclimatization protocols will be strictly enforced by the medical team.',
    image_urls: [
      'https://images.unsplash.com/photo-1531366935537-f1488c4083a2?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1469796466635-455ede028aca?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?w=800&auto=format&fit=crop'
    ],
    video_urls: [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    ],
    includes: [
      'Private VIP Helicopter Transfer from Geneva',
      'UIAGM-certified Alpine Guides (1:2 ratio)',
      'All technical ice climbing & glacier gear (Petzl/Black Diamond)',
      'Gourmet meals prepared by private expedition chef',
      'Premium Geodesic Dome accommodation (heated)',
      'Comprehensive Alpine Rescue Insurance',
      'Professional Expedition Photography package'
    ],
    excludes: [
      'International airfare to Geneva',
      'Personal base layering clothing',
      'Gratuities for guide team (optional)',
      'Alcoholic beverages outside of scheduled dinners'
    ],
    highlights: [
      'Helicopter insertion directly onto the Gorner Glacier',
      'Private ice-climbing masterclass on a 40m vertical serac',
      'Overnight stay in a heated, transparent geodesic dome with Matterhorn views',
      'Gourmet 5-course dinner at 3,000m altitude',
      'Zero-carbon footprint expedition model'
    ],
    things_to_carry: [
      'High-quality UV polarized glacier glasses (Category 4)',
      'Gore-Tex Pro shell jacket and pants',
      'Merino wool base layers (2 sets)',
      'Mountaineering boots (B3 rated compatible with step-in crampons)',
      'Personal toiletries and medications',
      'Camera with extra batteries (batteries drain fast in cold)'
    ],
    places_to_visit: [
      {
        title: 'Gorner Glacier',
        location: 'Zermatt Alps',
        description: 'The second largest glacial system in the Alps.',
        details: 'Features stunning blue ice caves, deep crevasses, and panoramic views of the Monte Rosa massif. We will conduct our primary ice training here.'
      },
      {
        title: 'Matterhorn Base Camp',
        location: 'Hörnli Ridge',
        description: 'Historic staging ground for Matterhorn ascents.',
        details: 'An iconic location at 3,260m. We will visit the historic Hörnlihutte and review the geology of the iconic pyramidal peak.'
      }
    ],
    included_stay: {
      name: 'Eco-Luxury Geodesic Domes',
      type: 'Luxury Camp',
      nights: 4,
      amenities: ['Heated flooring', 'En-suite eco-toilets', 'Panoramic skylights', 'Premium down bedding']
    },
    itinerary: [
      {
        day: 1,
        title: 'Arrival & Helicopter Insertion',
        description: 'Meet at Geneva airport for gear check, followed by a scenic helicopter flight directly to the glacier base camp.',
        name: 'Gorner Glacier Base Camp',
        elevation: '2,900m',
        lat: '45.9765° N',
        lng: '7.7770° E',
        landmark: 'Near Monte Rosa Hut',
        distance: '120km flight'
      },
      {
        day: 2,
        title: 'Ice Climbing & Serac Navigation',
        description: 'Full day of technical training. Learn to navigate crevasses safely and climb vertical ice walls.',
        name: 'Breithorn Plateau',
        elevation: '3,800m',
        lat: '45.9392° N',
        lng: '7.7497° E',
        landmark: 'Breithorn summit ridge approach',
        distance: '4km hike'
      }
    ]
  },
  {
    host_id: 1,
    title: 'Deep Amazon Rainforest Survival & Research',
    description: 'Immerse yourself in the lungs of the Earth with this 7-day scientific and survival expedition deep in the Brazilian Amazon. Designed for eco-tourists and citizen scientists, you will operate out of a remote biological research station accessible only by a 6-hour riverboat journey from Manaus. Work alongside indigenous guides and leading botanists to catalog rare flora, track jaguar populations using camera traps, and learn ancient jungle survival techniques. Sleep in suspended canopy tents, navigate flooded forests by kayak, and participate in a genuine conservation effort. This is not just a tour; it is a contribution to preserving the world\'s most vital ecosystem.',
    destination: 'Amazon Basin, Brazil',
    departure_location: 'Manaus River Port',
    start_date: '2026-09-10T07:00:00Z',
    end_date: '2026-09-17T15:00:00Z',
    price: 4800.00,
    total_spots: 12,
    available_spots: 10,
    status: 'published',
    target_audience: 'solo',
    language: 'English, Portuguese',
    start_time: '07:00 AM',
    end_time: '03:00 PM',
    map_link: 'https://maps.google.com/?q=Manaus,Brazil',
    cancellation_policy: 'Moderate: Full refund if canceled 45 days prior. 50% refund within 45 days. Weather delays will result in rescheduled dates or full credit.',
    important_notes: 'Yellow fever and Malaria prophylaxis are strictly required. The environment is extremely humid (95%+). All participants must pass a swimming proficiency test prior to kayaking the Igapó.',
    image_urls: [
      'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1542157585-ef20bbcce178?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1615598502598-a006834b6b63?w=800&auto=format&fit=crop'
    ],
    video_urls: [],
    includes: [
      'Round-trip riverboat transfer from Manaus',
      'Accommodation in suspended canopy tents',
      'All meals (focus on local, sustainable Amazonian ingredients)',
      'Expert indigenous trackers and PhD biologists',
      'Use of scientific equipment (camera traps, night vision)',
      'Survival skills workshop'
    ],
    excludes: [
      'International flights to Manaus',
      'Required vaccinations and medications',
      'Travel insurance (mandatory evacuation cover required)'
    ],
    highlights: [
      'Sleep 40 feet above the jungle floor in suspended canopy tents',
      'Contribute to a real jaguar tracking database',
      'Learn fire-making and water purification from indigenous experts',
      'Night-time caiman spotting by kayak',
      'Swim with pink river dolphins'
    ],
    things_to_carry: [
      'Lightweight, long-sleeved quick-dry clothing',
      'High-DEET insect repellent (100% recommended)',
      'Waterproof dry bags for electronics',
      'Headlamp with red-light mode (to preserve night vision)',
      'Sturdy jungle boots (jungle panamas or rubber boots)',
      'Binoculars (8x42 recommended for bird watching)'
    ],
    places_to_visit: [
      {
        title: 'Mamirauá Sustainable Development Reserve',
        location: 'Middle Solimões region',
        description: 'The largest flooded forest reserve in the world.',
        details: 'Home to the endemic Uakari monkey. We will spend 3 days navigating its flooded waterways (Igapó) and studying aquatic biodiversity.'
      },
      {
        title: 'Meeting of Waters',
        location: 'Confluence of Rio Negro and Amazon River',
        description: 'Where the dark Rio Negro meets the sandy Amazon.',
        details: 'A stunning natural phenomenon where two distinct rivers run side-by-side without mixing for over 6 kilometers due to differences in temperature, speed, and density.'
      }
    ],
    included_stay: {
      name: 'Canopy Research Station',
      type: 'Suspended Tents / Lodge',
      nights: 6,
      amenities: ['Solar-powered charging stations', 'Mosquito-netted sleeping quarters', 'Communal dining hall', 'Jungle showers']
    },
    itinerary: [
      {
        day: 1,
        title: 'Riverboat Journey & Orientation',
        description: 'Depart Manaus on a private riverboat. Safety briefing, introduction to the Amazon ecosystem, and arrival at the research station.',
        name: 'Research Station Alpha',
        elevation: '20m',
        lat: '3.1190° S',
        lng: '60.0217° W',
        landmark: 'Rio Negro confluence',
        distance: '150km by boat'
      },
      {
        day: 2,
        title: 'Jaguar Tracking & Canopy Ecology',
        description: 'Set up camera traps in high-traffic predator zones. Afternoon ascent into the canopy to study epiphytes and arboreal species.',
        name: 'Deep Jungle Transect B',
        elevation: '25m',
        lat: '3.1250° S',
        lng: '60.0300° W',
        landmark: 'Giant Kapok Tree',
        distance: '5km hike'
      }
    ]
  },
  {
    host_id: 1,
    title: 'Sahara Desert Astronomy Safari',
    description: 'Journey into the heart of the Moroccan Sahara for an unparalleled astrophotography and cultural safari. Far from any light pollution, the Erg Chebbi dunes offer some of the darkest skies on the planet. This 4-day premium excursion includes transportation in luxury 4x4 vehicles, guided camel treks at sunset, and accommodation in a lavish private desert camp. Spend your nights with professional astronomers, utilizing high-powered telescopes to observe deep-space objects, nebulae, and the Milky Way core. During the day, engage with nomadic Berber communities, experience traditional Gnawa music, and sandboard down 150-meter dunes.',
    destination: 'Merzouga, Morocco',
    departure_location: 'Marrakech (Hotel Pickup)',
    start_date: '2026-10-05T09:00:00Z',
    end_date: '2026-10-08T18:00:00Z',
    price: 3200.00,
    total_spots: 10,
    available_spots: 4,
    status: 'published',
    target_audience: 'family',
    language: 'English, Arabic, French',
    start_time: '09:00 AM',
    end_time: '06:00 PM',
    map_link: 'https://maps.google.com/?q=Merzouga,Morocco',
    cancellation_policy: 'Flexible: Full refund up to 14 days before departure.',
    important_notes: 'Desert temperatures drop significantly at night (down to 5°C / 40°F in October). Please pack accordingly. Sandstorms are rare but possible; protective eyewear is advised.',
    image_urls: [
      'https://images.unsplash.com/photo-1542401886-65d6c61de115?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1504958183181-70659613ed87?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1544208465-1dcb2c6fb33d?w=800&auto=format&fit=crop'
    ],
    video_urls: [],
    includes: [
      'Luxury 4x4 transportation from Marrakech',
      'VIP Desert Camp accommodation (private bathroom, hot water)',
      'All meals (authentic Moroccan cuisine)',
      'Professional astronomer guide and telescope access',
      'Camel trekking and sandboarding gear',
      'Traditional Berber music performance'
    ],
    excludes: [
      'Flights to Morocco',
      'Tips for drivers and camp staff',
      'Souvenirs and personal expenses'
    ],
    highlights: [
      'Guided deep-space observation with 14-inch Dobsonian telescopes',
      'Sunset camel trek across the towering Erg Chebbi dunes',
      'Luxury glamping experience with traditional Moroccan hospitality',
      'Astrophotography workshop: learn to capture the Milky Way',
      'Crossing the dramatic High Atlas Mountains via the Tizi n\'Tichka pass'
    ],
    things_to_carry: [
      'DSLR or Mirrorless camera with wide-angle lens (f/2.8 or faster) and tripod',
      'Warm clothing for freezing night temperatures (down jacket, thermals)',
      'Scarf or turban for dust protection',
      'Sunscreen (SPF 50+) and wide-brimmed hat',
      'Power banks (camp has power, but charging can be limited)'
    ],
    places_to_visit: [
      {
        title: 'Erg Chebbi Dunes',
        location: 'Merzouga',
        description: 'Massive wind-blown sand dunes reaching up to 150 meters high.',
        details: 'The core of our experience. The dunes change color constantly from dawn to dusk, glowing a fierce orange at sunset. The camp is nestled deep within these dunes.'
      },
      {
        title: 'Aït Benhaddou',
        location: 'Ouarzazate Province',
        description: 'A historic fortified village (ksar) along the former caravan route.',
        details: 'A UNESCO World Heritage site and famous filming location (Gladiator, Game of Thrones). We will stop here for a guided tour and lunch during our journey from Marrakech.'
      }
    ],
    included_stay: {
      name: 'Royal Orion Desert Camp',
      type: 'Luxury Glamping',
      nights: 3,
      amenities: ['King-size beds', 'En-suite bathrooms with hot showers', 'Traditional Moroccan rugs', 'Gourmet dining tent']
    },
    itinerary: [
      {
        day: 1,
        title: 'Atlas Mountains to the Sahara',
        description: 'Depart Marrakech, cross the High Atlas Mountains, visit Aït Benhaddou, and arrive at the desert edge in Merzouga.',
        name: 'Aït Benhaddou Kasbah',
        elevation: '1,300m',
        lat: '31.0470° N',
        lng: '7.1319° W',
        landmark: 'Ounila River',
        distance: '400km drive'
      },
      {
        day: 2,
        title: 'Dunes Exploration & Deep Sky Observation',
        description: 'Morning 4x4 tour of the dunes, afternoon camel trek to our deep desert camp. After a traditional dinner, the astronomy session begins.',
        name: 'Erg Chebbi Camp',
        elevation: '750m',
        lat: '31.1408° N',
        lng: '3.9877° W',
        landmark: 'Grand Dune',
        distance: '30km off-road'
      }
    ]
  }
];

async function seedSponsorEvents() {
  try {
    for (const event of sponsorEvents) {
      console.log(`Inserting event: ${event.title}`);
      await pool.query(`
        INSERT INTO experiences (
          title, description, destination, departure_location, start_date, end_date, price, 
          total_spots, available_spots, itinerary, includes, image_urls, host_id, status, 
          target_audience, places_to_visit, included_stay, highlights, things_to_carry, 
          important_notes, video_urls, excludes, start_time, end_time, language, 
          cancellation_policy, map_link
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 
          $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
        )
      `, [
        event.title, event.description, event.destination, event.departure_location, 
        event.start_date, event.end_date, event.price, event.total_spots, event.available_spots, 
        JSON.stringify(event.itinerary), JSON.stringify(event.includes), JSON.stringify(event.image_urls), 
        event.host_id, event.status, event.target_audience, JSON.stringify(event.places_to_visit), 
        JSON.stringify(event.included_stay), JSON.stringify(event.highlights), JSON.stringify(event.things_to_carry), 
        event.important_notes, JSON.stringify(event.video_urls), JSON.stringify(event.excludes), 
        event.start_time, event.end_time, event.language, event.cancellation_policy, event.map_link
      ]);
    }
    console.log("Successfully seeded sponsor events!");
  } catch (err) {
    console.error("Error seeding:", err);
  } finally {
    pool.end();
  }
}

seedSponsorEvents();
