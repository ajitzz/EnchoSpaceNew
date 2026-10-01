import { Listing, Room, SpatialPhoto, NearbyPoint } from '../../types';

/**
 * 15 fictional investor concepts for demonstrating the Encho guest presentation.
 * Formatted strictly to match Encho's canonical domain model (Listing, Room, SpatialPhoto, NearbyPoint).
 * These are not inventory, verified hosts, real reviews, guaranteed services, or available rates. Use only on the isolated /investor-showcase route.
 */
export const DEMO_PROPERTIES: Listing[] = [
  // ---------------------------------------------------------------------------
  // 1. The Glasshouse Estate — Wayanad, Kerala
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-01',
    title: 'The Glasshouse Estate',
    type: 'Rainforest Glass Sanctuary',
    rental_mode: 'entire_place',
    price: 29500,
    currency: 'INR',
    city: 'Wayanad',
    address: 'Vythiri Rainforest Ridge, Wayanad, Kerala 673576',
    lat: 11.5387,
    lng: 76.0428,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 6,
    bedrooms: 3,
    beds: 4,
    bathrooms: 4,
    dominant_color_hex: '#0F3A2C',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 6,
    description: 'Suspended over the primordial rainforest canopy of Vythiri, The Glasshouse is an architectural masterpiece of steel, sustainably sourced teak, and triple-glazed panoramic glass. Wake up to swirling mist at eye level with hornbills, swim in the heated volcanic stone infinity pool jutting out over the gorge, and enjoy bespoke Kerala culinary heritage prepared by your private estate chef.',
    host_philosophy: 'We built this glasshouse to dissolve the boundary between architectural luxury and the raw, untamed breath of the Western Ghats.',
    editorial_quote: 'An architectural triumph where morning mist rolls straight across your private cantilevered terrace.',
    concierge_privileges: 'Private helicopter transfer coordination from Calicut (CCJ), guided twilight rainforest night-walks with our naturalist, and in-villa Ayurvedic therapies.',
    curated_guidelines: [
      'Zero single-use plastics across the entire 40-acre rainforest perimeter.',
      'Acoustic sanctuary hours: sound systems lowered after 10:00 PM to honor wildlife corridors.',
      'Complimentary organic estate coffee and seasonal mountain breakfast served at sunrise.'
    ],
    experience_tags: ['Rainforest Sanctuary', 'Architectural Marvel', 'High Seclusion', 'Wellness & Spa'],
    amenities: [
      'Private Heated Infinity Pool',
      '360° Panoramic Glass Walls',
      'Private Estate Butler & Chef',
      'In-Villa Ayurvedic Treatment Enclave',
      'High-Speed Starlink FTTP (350 Mbps)',
      'Underfloor Heating & Climate Control',
      'Bang & Olufsen Acoustic System',
      'Volcanic Stone Soaking Tub',
      'Farm-to-Table Kerala Breakfast Included',
      'EV Fast Charging Station',
      'Dedicated Naturalist Forest Hikes',
      'Fireplace with Mountain View'
    ],
    amenity_clusters: {
      vibe: ['Rainforest Canopy', 'Private Stargazing', 'Total Acoustic Seclusion', 'Architectural Glass Pavilion'],
      comfort: ['Heated Infinity Pool', 'Volcanic Stone Soaking Tub', 'Underfloor Heating', 'Frette 1000TC Linen'],
      work: ['High-Speed Starlink FTTP (350 Mbps)', 'Dedicated Herman Miller Aeron', 'Ergonomic Desk', 'Type-C Dual Displays'],
      culinary: ['Private Estate Chef', 'Farm-to-Table Kerala Cuisine', 'Smeg Espresso Bar', 'Curated Spice Cellar']
    },
    rooms: [
      {
        id: 'room-gh-01',
        name: 'Presidential Canopy Pavilion',
        type: 'presidential_canopy',
        icon: '👑',
        tag: 'Flagship Sanctuary',
        price: 45000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,650 sq.ft · Private Heated Plunge Pool · 360° Valley Glass Panorama',
        description: 'The master glass pavilion with an uninterrupted 360-degree vista over the Western Ghats, complete with an open-air stone soaking tub, suspended king bed, and private outdoor firepit.',
        features: ['Private Heated Plunge Pool', 'Outdoor Volcanic Tub', 'Walk-in Dressing Enclave', 'Bang & Olufsen Sound'],
        amenities: ['Private Pool', 'King Bed', 'Rainforest View', 'En-Suite Spa Bath', 'Firepit', 'Smart Bar'],
        photos: [
          {
            id: 'photo-gh-01-a',
            url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1600&q=85',
            tier: 'presidential_canopy',
            category: 'bedroom',
            title: 'The Master Glass Suite',
            description: 'Cantilevered glass bedroom hovering over the cloud canopy.'
          },
          {
            id: 'photo-gh-01-b',
            url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1600&q=85',
            tier: 'presidential_canopy',
            category: 'bathroom',
            title: 'Volcanic Stone Bath',
            description: 'Hand-carved basalt soaking tub overlooking private waterfall gorge.'
          }
        ]
      },
      {
        id: 'room-gh-02',
        name: 'Mist Valley Glass Suite',
        type: 'mist_valley',
        icon: '🛏️',
        tag: 'Most Popular',
        price: 29500,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '980 sq.ft · Wraparound Verandah · Forest Canopy Rain Shower',
        description: 'Positioned amidst towering wild rosewood trees, featuring floor-to-ceiling glass, direct access to the estate tea terraces, and a deep soaking rain shower.',
        features: ['Wraparound Forest Deck', 'Teak Wood Accents', 'Dyson Air Care', 'Artisan Coffee Bar'],
        amenities: ['King Bed', 'Mountain View', 'Forest Deck', 'Rain Shower', 'Espresso Machine'],
        photos: [
          {
            id: 'photo-gh-02-a',
            url: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1600&q=85',
            tier: 'mist_valley',
            category: 'bedroom',
            title: 'Mist Valley Suite Bedroom',
            description: 'Sunken lounge with unobstructed sunrise valley views.'
          }
        ]
      },
      {
        id: 'room-gh-03',
        name: 'Stream-side Studio Enclave',
        type: 'stream_studio',
        icon: '🌿',
        tag: 'Secluded Hideaway',
        price: 19000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '650 sq.ft · Mountain Stream Sounds · Private Yoga Terrace',
        description: 'Tucked at the lower valley boundary where a mountain stream flows year-round, ideal for acoustic peace, meditation, and remote deep work.',
        features: ['Stream-front Deck', 'Ergonomic Desk & Monitor', 'Acoustic Insulation', 'Outdoor Hammock'],
        amenities: ['Queen Bed', 'Stream Access', 'Yoga Deck', 'Ergonomic Workstation', 'High-Speed WiFi'],
        photos: [
          {
            id: 'photo-gh-03-a',
            url: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1600&q=85',
            tier: 'stream_studio',
            category: 'bedroom',
            title: 'Stream Studio Living & Bed',
            description: 'Wood and slate studio with natural ambient stream acoustics.'
          }
        ]
      }
    ],
    photos: [
      {
        id: 'photo-gh-hero',
        url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85',
        tier: 'common',
        category: 'exterior',
        title: 'Architectural Panorama',
        description: 'The Glasshouse suspended over the Western Ghats rainforest valley.',
        isHero: true
      },
      {
        id: 'photo-gh-pool',
        url: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1600&q=85',
        tier: 'common',
        category: 'pool',
        title: 'Volcanic Infinity Pool',
        description: 'Heated mountain infinity pool jutting out into the misty canyon.'
      }
    ],
    nearby: [
      { name: 'Chembra Peak Heart Lake', distance: '12 km · 25 min drive', type: 'nature', description: 'Highest peak in Wayanad with iconic heart-shaped mountain lake.' },
      { name: 'Banasura Sagar Dam', distance: '18 km · 35 min drive', type: 'landmark', description: 'Largest earthen dam in India with speedboats and floating islands.' },
      { name: 'Edakkal Caves', distance: '24 km · 45 min drive', type: 'culture', description: 'Neolithic petroglyphs and prehistoric rock carvings atop Ambukuthi Mala.' },
      { name: 'Vythiri Tea Terraces', distance: '3 km · 8 min drive', type: 'viewpoint', description: 'Historic tea plantation trails with panoramic sunset ridge overlooks.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 2. Palácio de Figueira — Assagao, North Goa
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-02',
    title: 'Palácio de Figueira',
    type: 'Indo-Portuguese Heritage Estate',
    rental_mode: 'entire_place',
    price: 48000,
    currency: 'INR',
    city: 'Goa',
    address: 'Boutique Lane, Badem, Assagao, Goa 403507',
    lat: 15.5898,
    lng: 73.7744,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 8,
    bedrooms: 4,
    beds: 5,
    bathrooms: 5,
    dominant_color_hex: '#881337',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 5,
    description: 'An exquisitely restored 180-year-old Indo-Portuguese stately home in the heritage culinary village of Assagao. Featuring high terracotta tile ceilings, Belgian crystal chandeliers, arched verandas opening into an emerald courtyard, and a 20-meter private courtyard swimming pool framed by ancient frangipani trees.',
    host_philosophy: 'A living testament to Goan architectural heritage where past centuries meet contemporary Michelin-trained private dining.',
    editorial_quote: 'The crown jewel of Assagao: antique grandeur, soaring archways, and total seclusion behind laterite walls.',
    concierge_privileges: 'Reserved VIP dining tables at Gunpowder, Bawri, and Jamun, plus private vintage open-top convertible rental.',
    curated_guidelines: [
      'Antique furnishings and 19th-century tilework preserved with museum-grade care.',
      'Private chef on-site: multi-course Goan-Portuguese tasting menus arranged daily.',
      'Saltwater swimming pool available 24 hours.'
    ],
    experience_tags: ['Heritage Palácio', 'Private Pool Villa', 'Culinary Epicenter', 'Architectural Royalty'],
    amenities: [
      '20m Private Saltwater Courtyard Pool',
      'Private Michelin-Trained Resident Chef',
      'Full Butler & Housekeeping Staff',
      '180-Year-Old Restored Terracotta Architecture',
      'Al-Fresco Frangipani Dining Courtyard',
      'Wine & Single-Malt Tasting Bar',
      'Central Climate Conditioning',
      'Sonos Architectural Multi-Room Audio',
      'EV Car Charging Station',
      'Complimentary Airport Chauffeur (GOX/GOI)'
    ],
    amenity_clusters: {
      vibe: ['Colonial Splendor', 'Lush Tropical Courtyard', 'Heritage Laterite Walls', 'Private Frangipani Oasis'],
      comfort: ['20m Saltwater Pool', 'Four-Poster King Beds', 'Italian Marble Baths', '24/7 Dedicated Butler'],
      work: ['High-Speed Fiber (400 Mbps)', 'Library Study Room', 'Antique Teak Writing Desk', 'Dual Monitors Available'],
      culinary: ['Private Resident Chef', 'Goan-Portuguese Degustation', 'Wine Tasting Cellar', 'Organic Herb Garden']
    },
    rooms: [
      {
        id: 'room-fig-01',
        name: "Governor's Grand Suite",
        type: 'governors_suite',
        icon: '👑',
        tag: 'Master Heritage Suite',
        price: 62000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,400 sq.ft · Four-Poster Teak King Bed · Direct Private Courtyard Access',
        description: 'The estate flagship suite with 20-foot high timber ceilings, authentic Portuguese Azulejo tiles, an antique clawfoot soaking tub, and double French doors to the pool courtyard.',
        features: ['Antique Clawfoot Tub', 'Private Verandah', 'Walk-in Dressing Room', 'Belgian Chandelier'],
        amenities: ['King Bed', 'Pool Access', 'Clawfoot Tub', 'Courtyard View', 'Espresso Bar'],
        photos: [
          {
            id: 'photo-fig-01',
            url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85',
            tier: 'governors_suite',
            category: 'bedroom',
            title: "Governor's Suite Bedroom",
            description: '19th century teakwood four-poster bed and private verandah.'
          }
        ]
      },
      {
        id: 'room-fig-02',
        name: 'Courtyard Verandah Suite',
        type: 'courtyard_suite',
        icon: '🌺',
        tag: 'Garden View',
        price: 44000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '950 sq.ft · Open-Air Rain Shower · Hand-Painted Tilework',
        description: 'Opening directly onto the central courtyard with fragrant jasmine and night-blooming frangipani blossoms.',
        features: ['Open-Air Rain Shower', 'Hand-Painted Tiles', 'Private Sun Loungers'],
        amenities: ['King Bed', 'Garden View', 'Outdoor Shower', 'Heritage Tiles'],
        photos: [
          {
            id: 'photo-fig-02',
            url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=85',
            tier: 'courtyard_suite',
            category: 'bedroom',
            title: 'Courtyard Suite Living & Bed',
            description: 'Airy archways and curated antique Portuguese accents.'
          }
        ]
      }
    ],
    photos: [
      {
        id: 'photo-fig-hero',
        url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=85',
        tier: 'common',
        category: 'exterior',
        title: 'Palácio de Figueira Exterior',
        description: 'Restored 1842 colonial facade and courtyard grounds.',
        isHero: true
      },
      {
        id: 'photo-fig-pool',
        url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=85',
        tier: 'common',
        category: 'pool',
        title: 'Courtyard Swimming Pool',
        description: '20m private pool surrounded by tropical frangipani and laterite walls.'
      }
    ],
    nearby: [
      { name: 'Gunpowder South Indian Dining', distance: '1.2 km · 4 min drive', type: 'fine_dining', description: 'Iconic heritage coastal restaurant celebrated for Malabar prawns and appams.' },
      { name: 'Vagator Sunset Bluffs & Beach', distance: '3.5 km · 10 min drive', type: 'beach', description: 'Dramatic red laterite cliffs with world-class beach club dining.' },
      { name: 'Chapora 17th-Century Fort', distance: '4.2 km · 12 min drive', type: 'culture', description: 'Historic Portuguese hilltop bastion commanding panoramic river and ocean views.' },
      { name: 'Assagao Design Boutiques', distance: '800 m · 10 min walk', type: 'landmark', description: 'Curated fashion ateliers, art galleries, and concept stores along boutique lane.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 3. The Arabica High-Estate — Madikeri, Coorg, Karnataka
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-03',
    title: 'The Arabica High-Estate',
    type: 'Coffee Plantation Manor',
    rental_mode: 'entire_place',
    price: 24000,
    currency: 'INR',
    city: 'Coorg',
    address: 'Brahmagiri Foot-Hills, Madikeri, Coorg, Karnataka 571201',
    lat: 12.4244,
    lng: 75.7382,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    dominant_color_hex: '#5F3714',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 4,
    description: 'A 250-acre private arabica and robusta coffee plantation manor perched high in the misty hills of Madikeri. Built using polished rosewood, local riverstone, and expansive glass verandas overlooking rolling hills. Experience private estate cupping sessions, bonfires under crystal-clear night skies, and traditional Kodava feast prepared by a heritage cook.',
    host_philosophy: 'Deep slow living amidst century-old coffee bushes, where time is measured by the aroma of freshly roasted beans.',
    editorial_quote: 'A haven of acoustic stillness where early morning mist blankets hundreds of acres of lush shade-grown coffee.',
    concierge_privileges: 'Private master roaster cupping experience, 4x4 off-road jungle expedition to Mandalpatti, and estate river trekking.',
    curated_guidelines: [
      'Fresh single-origin coffee roasted and brewed fresh every morning.',
      'Evening fireplace lounge with heritage Kodava culinary pairings.',
      'Guided private plantation walks led by our chief agronomist.'
    ],
    experience_tags: ['Coffee Plantation', 'Hill Country Retreat', 'Misty Highland', 'Kodava Gastronomy'],
    amenities: [
      'Infinity Edge Plunge Pool with Valley View',
      'Living Room Fireplace with Deodar Hearth',
      'Private 250-Acre Plantation Trails',
      'Kodava Culinary Estate Chef',
      'Artisan Coffee Roastery & Bar',
      'Starlink FTTP High-Speed Broadband',
      'Complimentary Off-Road 4x4 Excursion',
      'Heated Outdoor Dining Verandah'
    ],
    amenity_clusters: {
      vibe: ['Coffee Plantation Trails', 'Misty Mountain Panorama', 'Evening Bonfires', 'Acoustic Solitude'],
      comfort: ['Stone Fireplace Lounge', 'Heated Plunge Pool', 'Plush Goose-Down Bedding', 'Underfloor Bath Heating'],
      work: ['Starlink 300 Mbps', 'Teak Wood Study Nook', 'Floor-to-Ceiling Forest Views', 'Ergonomic Seating'],
      culinary: ['Estate Coffee Tasting', 'Authentic Kodava Pandi & Akki Roti', 'Farm-Grown Honey & Pepper', 'Wine Cellar']
    },
    rooms: [
      {
        id: 'room-coorg-01',
        name: "Planter's Flagship Suite",
        type: 'planters_suite',
        icon: '👑',
        tag: 'Estate Master',
        price: 34000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,200 sq.ft · Wood-Burning Fireplace · Valley View Terrace',
        description: 'Featuring a stone hearth, colonial wing chairs, polished teak flooring, and an elevated terrace overlooking the valley.',
        features: ['Stone Fireplace', 'Teak Wood Floors', 'Dyson Purifier', 'Private Verandah'],
        amenities: ['King Bed', 'Fireplace', 'Terrace', 'Rain Shower'],
        photos: [
          {
            id: 'photo-coorg-01',
            url: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1600&q=85',
            tier: 'planters_suite',
            category: 'bedroom',
            title: "Planter's Master Bedroom",
            description: 'Stone fireplace and panoramic plantation views.'
          }
        ]
      },
      {
        id: 'room-coorg-02',
        name: 'Estate Vista Cottage',
        type: 'estate_vista',
        icon: '☕',
        tag: 'Valley Vista',
        price: 22000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '800 sq.ft · Private Balcony Over Coffee Canopy',
        description: 'An independent stone cottage nestled right into the arabica grove, offering complete privacy and birdsong awakenings.',
        features: ['Private Balcony', 'Outdoor Daybed', 'French Press Bar'],
        amenities: ['King Bed', 'Balcony', 'Garden View', 'Espresso Bar'],
        photos: [
          {
            id: 'photo-coorg-02',
            url: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1600&q=85',
            tier: 'estate_vista',
            category: 'bedroom',
            title: 'Estate Vista Cottage Interior',
            description: 'Warm timber aesthetics and sunrise plantation outlook.'
          }
        ]
      }
    ],
    photos: [
      {
        id: 'photo-coorg-hero',
        url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=85',
        tier: 'common',
        category: 'exterior',
        title: 'Manor House & Hills',
        description: 'The Arabica High-Estate overlooking the rolling Coorg highlands.',
        isHero: true
      }
    ],
    nearby: [
      { name: 'Abbey Falls Gorge', distance: '7 km · 15 min drive', type: 'nature', description: 'Roaring waterfall nestled between private spice and coffee estates.' },
      { name: "Raja's Seat Sunset Viewpoint", distance: '4 km · 10 min drive', type: 'viewpoint', description: 'Historic commanding hilltop where Coorg kings watched the sun sink behind misty peaks.' },
      { name: 'Mandalpatti 4x4 Mountain Ridge', distance: '19 km · 45 min drive', type: 'nature', description: 'Dramatic windswept grassland crest accessible only by four-wheel drive.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 4. Rawla Mewar Palace — Lake Pichola, Udaipur, Rajasthan
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-04',
    title: 'Rawla Mewar Haveli',
    type: 'Lakeside Royal Palace',
    rental_mode: 'entire_place',
    price: 55000,
    currency: 'INR',
    city: 'Udaipur',
    address: 'Lal Ghat Waterfront, Lake Pichola, Udaipur, Rajasthan 313001',
    lat: 24.5764,
    lng: 73.6835,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 4,
    dominant_color_hex: '#78350F',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 4,
    description: 'An aristocratic private lakefront haveli with unobstructed, direct panoramic views of the Lake Palace and Jag Mandir. Hand-carved white marble jharokhas, antique gold-leaf frescos, private rooftop sunset champagne pavilion, and a private royal wooden boat for secluded evening lake cruises.',
    host_philosophy: 'A timeless sanctuary of Rajputana royalty where guests live as personal guests of Rajasthan heritage.',
    editorial_quote: 'Watching the twilight glow of Lake Pichola from the marble jharokha is an experience etched forever in memory.',
    concierge_privileges: 'Private sunset royal boat cruise with musician, VIP curator access to the City Palace crystal gallery, and royal horse riding.',
    curated_guidelines: [
      'Private royal boat departs directly from our private water jetty.',
      'Live classical sitar and santoor evening sessions on the lakefront terrace.',
      'Chef-curated royal Mewari banquet served under starlight.'
    ],
    experience_tags: ['Royal Palace', 'Lakefront Panoramas', 'Rajput Heritage', 'Private Boat Access'],
    amenities: [
      'Private Water Jetty & Royal Boat',
      'Marble Plunge Pool with Lake View',
      'Rooftop Sunset Champagne Terrace',
      'Private Royal Chef & Khansama Staff',
      'Hand-Carved Marble Jharokhas',
      'Live Evening Classical Sitar Sessions',
      'Antique Belgian Crystal Chandeliers',
      'Chauffeur Airport Transfer in Luxury Fleet'
    ],
    amenity_clusters: {
      vibe: ['Lakefront Royalty', 'Marble Jharokha Vistas', 'Evening Sitar Serenades', 'Sunset Water Terraces'],
      comfort: ['Silk-Upholstered King Beds', 'Marble Soaking Tubs', 'Full Royal Butler Service', 'Central AC'],
      work: ['Fiber 300 Mbps', 'Teak Bureau Desk', 'Lake-Facing Study Windows', 'Silent Library'],
      culinary: ['Royal Mewari Thali', 'Lake Sunset Wine & Champagne', 'Rooftop Candlelit Banquet', 'Heritage Recipes']
    },
    rooms: [
      {
        id: 'room-udaipur-01',
        name: 'Maharana Water Suite',
        type: 'maharana_suite',
        icon: '👑',
        tag: 'Royal Master',
        price: 75000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,500 sq.ft · Direct Lake Pichola View · Hand-Carved White Marble Balcony',
        description: 'The crown suite of Rawla Mewar featuring authentic antique gold foil inlay, an imperial king bed, and private marble balcony looking straight at the Taj Lake Palace.',
        features: ['Private Marble Balcony', 'Lake Palace View', 'Gold Leaf Ceiling', 'Royal Butler'],
        amenities: ['King Bed', 'Lake View', 'Marble Bath', 'Balcony', 'Champagne Bar'],
        photos: [
          {
            id: 'photo-udaipur-01',
            url: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1600&q=85',
            tier: 'maharana_suite',
            category: 'bedroom',
            title: 'Maharana Suite Royal Bedroom',
            description: 'Marble archways framing the waters of Lake Pichola.'
          }
        ]
      },
      {
        id: 'room-udaipur-02',
        name: 'Peacock Courtyard Suite',
        type: 'peacock_suite',
        icon: '🦚',
        tag: 'Heritage Courtyard',
        price: 52000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '980 sq.ft · Marble Fountain View · Stained Glass Windows',
        description: 'Overlooking the quiet interior courtyard where peacocks frequent the fountains, with jewel-toned Belgian stained glass and vintage Rajasthan tapestries.',
        features: ['Stained Glass Accents', 'Courtyard Fountain View', 'Carved Rosewood Bed'],
        amenities: ['King Bed', 'Courtyard View', 'Antique Bath', 'Smart Climate'],
        photos: [
          {
            id: 'photo-udaipur-02',
            url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=85',
            tier: 'peacock_suite',
            category: 'bedroom',
            title: 'Peacock Suite Interior',
            description: 'Heritage decor with rich gold and turquoise Mewari motifs.'
          }
        ]
      }
    ],
    photos: [
      {
        id: 'photo-udaipur-hero',
        url: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1600&q=85',
        tier: 'common',
        category: 'exterior',
        title: 'Haveli Waterfront Facade',
        description: 'Rawla Mewar Haveli illuminated along Lake Pichola.',
        isHero: true
      }
    ],
    nearby: [
      { name: 'City Palace Complex', distance: '600 m · 7 min walk', type: 'culture', description: 'Monumental royal fortress palace complex showcasing 400 years of Mewar history.' },
      { name: 'Jag Mandir Island Palace', distance: '1.2 km · 5 min private boat', type: 'landmark', description: '17th-century marble water palace surrounded by Pichola waters.' },
      { name: 'Bagore Ki Haveli', distance: '300 m · 4 min walk', type: 'culture', description: 'Famous for evening Dharohar folk dances and ancient royal turban museum.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 5. Ananda Nadisvara Sanctuary — Rishikesh, Uttarakhand
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-05',
    title: 'Ananda Nadisvara Sanctuary',
    type: 'Himalayan Riverfront Estate',
    rental_mode: 'entire_place',
    price: 32000,
    currency: 'INR',
    city: 'Rishikesh',
    address: 'Tapovan Cliff Crest, Rishikesh, Uttarakhand 249192',
    lat: 30.1332,
    lng: 78.3242,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 6,
    bedrooms: 3,
    beds: 4,
    bathrooms: 3,
    dominant_color_hex: '#134E4A',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 3,
    description: 'Hovering on a private pine ridge 200 feet above the turquoise waters of the upper Ganges. Built from deodar timber, natural slate, and expansive glass to capture both the Himalayan peaks and the sacred river below. Features a private yoga shala, cedar meditation decks, and bespoke Ayurvedic wellness therapy.',
    host_philosophy: 'A temple of tranquility where the Himalayan mountain breeze and sacred river rhythms restore vital prana.',
    editorial_quote: 'Unmatched spiritual serenity: watching the sunrise mist over the Ganges from your private cedar yoga pavilion.',
    concierge_privileges: 'Private Ganga Aarti ceremony at sunrise, master Hatha yoga instructors, and private helicopter charters to Badrinath/Kedarnath.',
    curated_guidelines: [
      'Sattvic gourmet organic dining curated fresh daily by Ayurvedic physicians.',
      'Acoustic peace sanctuary: no amplified audio on outdoor decks.',
      'Daily morning meditation sessions complimentary at our cliffside pavilion.'
    ],
    experience_tags: ['Himalayan Wellness', 'Ganges River Views', 'Ayurvedic Retreat', 'Yoga & Meditation'],
    amenities: [
      'Cliffside Saltwater Plunge Pool',
      'Private Cedar Yoga & Meditation Shala',
      'Panoramic Ganges River Gorge Views',
      'Ayurvedic Wellness Spa Suite',
      'Organic Sattvic Private Chef',
      'Underfloor Heating & Fireplace',
      'High-Speed Starlink Connectivity',
      'Sound Therapy Singing Bowls'
    ],
    amenity_clusters: {
      vibe: ['Sacred River Sounds', 'Himalayan Ridge Horizons', 'Pine Forest Scents', 'Zen Silence'],
      comfort: ['Cedar Hot Tub', 'Underfloor Heating', 'Organic Hemp Linens', 'Ayurvedic Steam Bath'],
      work: ['Starlink 350 Mbps', 'Quiet Reading Library', 'River View Work Terrace', 'Ergonomic Chair'],
      culinary: ['Ayurvedic Sattvic Cuisine', 'Mountain Herbal Teas', 'Organic Farm Produce', 'Fresh Cold-Pressed Juices']
    },
    rooms: [
      {
        id: 'room-rishi-01',
        name: 'Sacred Riverfront Villa',
        type: 'sacred_river',
        icon: '👑',
        tag: 'Ganges Panoramic',
        price: 48000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,300 sq.ft · Cantilevered River Deck · Outdoor Cedar Soaking Tub',
        description: 'Perched over the gorge with 180-degree vistas of the emerald Ganges, private hot tub, and glass-encased fireplace.',
        features: ['Cantilevered River Deck', 'Outdoor Cedar Tub', 'Fireplace', 'Ayurvedic Bath Menu'],
        amenities: ['King Bed', 'River View', 'Hot Tub', 'Fireplace'],
        photos: [
          {
            id: 'photo-rishi-01',
            url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1600&q=85',
            tier: 'sacred_river',
            category: 'bedroom',
            title: 'Sacred River Suite Bedroom',
            description: 'Minimalist luxury facing the sacred Ganges.'
          }
        ]
      }
    ],
    photos: [
      {
        id: 'photo-rishi-hero',
        url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=85',
        tier: 'common',
        category: 'exterior',
        title: 'Ganges Ridge Sanctuary',
        description: 'Overlooking the emerald bend of the sacred Ganges River.',
        isHero: true
      }
    ],
    nearby: [
      { name: 'Neer Garh Waterfalls', distance: '4 km · 12 min drive', type: 'nature', description: 'Tiered turquoise mountain cascade nestled in a pristine limestone canyon.' },
      { name: 'Parmarth Niketan Ganga Aarti', distance: '6 km · 20 min drive', type: 'culture', description: 'World-renowned sunset Ganga Aarti with Vedic chanting on the ghats.' },
      { name: 'The Beatles Ashram', distance: '7.5 km · 25 min drive', type: 'culture', description: 'Historic 1968 retreat with transcendental meditation domes covered in graffiti murals.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 6. The Monolith Cliff Villa — Varkala, Kerala
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-06',
    title: 'The Monolith Cliff Villa',
    type: 'Modernist Oceanfront Villa',
    rental_mode: 'entire_place',
    price: 35000,
    currency: 'INR',
    city: 'Varkala',
    address: 'North Cliff Edgewalk, Varkala, Kerala 695141',
    lat: 8.7379,
    lng: 76.7063,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    dominant_color_hex: '#1E3A8A',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 2,
    description: 'An uncompromising brutalist-modernist concrete and glass residence built 120 feet above the crashing waves of the Arabian Sea on Varkala’s dramatic red sandstone cliffs. Infinity pool that blends seamlessly into the ocean horizon, sunset cocktail lounge, and private beach path access.',
    host_philosophy: 'Pure architectural restraint designed to elevate the elemental majesty of the ocean and sun.',
    editorial_quote: 'Dramatic, sculptural, and undeniably chic: watch the crimson Arabian sun submerge directly into the horizon from your infinity daybed.',
    concierge_privileges: 'Private surf coaching sessions with pro instructors, sunset catamaran cruises, and Ayurvedic oceanfront massages.',
    curated_guidelines: [
      'Cliffside safety protocol: children must be accompanied near infinity edges.',
      'Sunset cocktail hour complimentary on the western terrace.',
      'Private beach trail open dawn to dusk.'
    ],
    experience_tags: ['Ocean Cliffside', 'Modernist Villa', 'Sunset Sanctuary', 'Private Infinity Pool'],
    amenities: [
      'Cantilevered Ocean Infinity Pool',
      '180° Arabian Sea Sunset Views',
      'Private Cliffside Beach Trail Access',
      'Private Coastal Chef',
      'Sonos Architectural Sound',
      'Ultra-Fast Fiber WiFi (500 Mbps)',
      'Floor-to-Ceiling Motorized Glass Walls'
    ],
    amenity_clusters: {
      vibe: ['Dramatic Ocean Edge', 'Unfiltered Sunsets', 'Modernist Concrete Architecture', 'Crashing Surf Acoustics'],
      comfort: ['Infinity Pool', 'Dyson Climate Conditioning', 'King Size Ocean Bed', 'Sunset Daybeds'],
      work: ['Fiber 500 Mbps', 'Ocean-Facing Work Desk', 'Type-C Monitor Setup', 'Silent Ocean Den'],
      culinary: ['Fresh Catch of the Day', 'Coconut Coastal Delicacies', 'Sunset Wine Cellar', 'Espresso Bar']
    },
    rooms: [
      {
        id: 'room-varkala-01',
        name: 'Ocean Horizon Penthouse',
        type: 'ocean_penthouse',
        icon: '👑',
        tag: 'Sunset Master',
        price: 52000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,350 sq.ft · 180° Arabian Sea Glass · Private Infinity Edge',
        description: 'Wake up to dolphins playing in the surf below with panoramic glass walls and an open-plan oceanfront rain shower.',
        features: ['180° Ocean View', 'Private Infinity Plunge', 'Motorized Blackout Shades'],
        amenities: ['King Bed', 'Ocean View', 'Infinity Edge', 'Balcony'],
        photos: []
      }
    ],
    photos: [],
    nearby: [
      { name: 'Varkala Red Sandstone Cliff Promenade', distance: '400 m · 5 min walk', type: 'beach', description: 'Famous geological monument lined with bohemian cafes and yoga schools.' },
      { name: 'Janardhana Swamy 2000-Yr Temple', distance: '2.5 km · 7 min drive', type: 'culture', description: 'Ancient coastal temple dedicated to Lord Vishnu and sacred water springs.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 7. The Karakoram Geodesic Stargazer — Nubra Valley, Ladakh
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-07',
    title: 'The Karakoram Stargazer Domes',
    type: 'High-Altitude Luxury Camp',
    rental_mode: 'entire_place',
    price: 26000,
    currency: 'INR',
    city: 'Ladakh',
    address: 'Hunder White Sand Dunes, Nubra Valley, Ladakh 194401',
    lat: 34.5772,
    lng: 77.4728,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    dominant_color_hex: '#312E81',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 2,
    description: 'Insulated, climate-controlled geodesic glass domes set amidst the surreal white dunes of Nubra Valley against the towering Karakoram mountains. Equipped with motorized celestial stargazing sunroofs, high-powered Meade astronomical telescopes, heated Mongolian wool carpets, and dedicated oxygen enrichment systems.',
    host_philosophy: 'A portal to the cosmos where the high Himalayas meet zero light pollution and billion-star night skies.',
    editorial_quote: 'Lying in a heated cashmere bed at 10,000 feet watching the Milky Way arc directly overhead through your dome glass.',
    concierge_privileges: 'Resident astrophysicist-guided stargazing sessions, double-humped Bactrian camel desert treks, and private oxygen concierge.',
    curated_guidelines: [
      'Continuous medical-grade oxygen enrichment active inside every dome.',
      'High-altitude hydration and altitude acclimatization briefing upon arrival.',
      'Night-time red light protocol to maximize astronomical visibility.'
    ],
    experience_tags: ['Stargazing Camp', 'High Ladakh Desert', 'Celestial Glamping', 'Karakoram Views'],
    amenities: [
      'Panoramic Transparent Geodesic Sunroof',
      'Professional 12" Computerized Telescope',
      'Integrated In-Room Oxygen Enrichment',
      'Heated Mongolian Wool Flooring',
      'Resident Astrophysicist Stargazing Tours',
      'Gourmet Himalayan Organic Dining',
      'Starlink Satellite Broadband',
      'Private Desert Bonfire Lounge'
    ],
    amenity_clusters: {
      vibe: ['Zero Light Pollution', 'Billion-Star Sky', 'Snow-Capped Karakoram', 'Desert Dune Stillness'],
      comfort: ['Heated Geodesic Dome', 'Oxygen Concentrator', 'Cashmere Bedding', 'Pellet Heating Stove'],
      work: ['Starlink 250 Mbps', 'Quiet Desert Desk', 'Panoramic Glass Outlook', 'USB-C Solar Power'],
      culinary: ['Tibetan-Ladakhi Gourmet', 'Yak Cheese & Apricot Tartlets', 'Warm Butter Tea', 'Single Malt Selection']
    },
    rooms: [
      {
        id: 'room-ladakh-01',
        name: 'Celestial Observatory Dome',
        type: 'celestial_dome',
        icon: '⭐',
        tag: 'Astronomer Suite',
        price: 38000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '680 sq.ft · 360° Transparent Dome Roof · Automated Meade Telescope',
        description: 'Featuring a glass observatory ceiling with motorized thermal blinds, heated king bed, and private viewing terrace.',
        features: ['Observatory Glass Roof', 'Meade Telescope', 'Oxygen Enriched', 'Pellet Stove'],
        amenities: ['King Bed', 'Stargazing Ceiling', 'Heating', 'Mountain View'],
        photos: []
      }
    ],
    photos: [],
    nearby: [
      { name: 'Diskit 14th-Century Monastery', distance: '12 km · 20 min drive', type: 'culture', description: 'Ancient fortress monastery crowned by the towering 106-foot golden Maitreya Buddha.' },
      { name: 'Hunder Cold Sand Dunes', distance: '1 km · 3 min drive', type: 'nature', description: 'Surreal white dunes populated by indigenous double-humped Bactrian camels.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 8. Cloud Valley Tea Bungalow — Munnar, Kerala
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-08',
    title: 'Cloud Valley Tea Bungalow',
    type: 'Colonial Tea Sanctuary',
    rental_mode: 'entire_place',
    price: 24000,
    currency: 'INR',
    city: 'Munnar',
    address: 'Kannan Devan High Range, Old Munnar, Kerala 685612',
    lat: 10.0889,
    lng: 77.0595,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 6,
    bedrooms: 3,
    beds: 4,
    bathrooms: 3,
    dominant_color_hex: '#14532D',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 1,
    description: 'A genuine 1920s Scottish colonial stone tea planter’s residence standing proudly at 6,200 feet above sea level. Featuring roaring stone fireplaces in every bedroom, antique rosewood four-poster beds, manicured rose gardens, and views of emerald tea carpet rolling infinitely down to the horizon.',
    host_philosophy: 'Preserving the nostalgic romance of high-altitude colonial tea culture with organic modern sensibilities.',
    editorial_quote: 'Afternoon high tea served on the misty garden lawn as clouds drift through the eucalyptus trees.',
    concierge_privileges: 'Private tea tasting with estate planter, trek to the Meesapulimala summit, and birdwatching with our resident ornithologist.',
    curated_guidelines: [
      'Firewood replenished daily for your private in-bedroom fireplaces.',
      'Traditional British-Kerala high tea served daily at 4:30 PM.',
      'Morning tea plucked fresh from our garden slopes.'
    ],
    experience_tags: ['Colonial Tea Estate', 'Stone Fireplace', 'High Altitude 6200ft', 'Heritage Living'],
    amenities: [
      'Wood-Burning Fireplace in Every Bedroom',
      'Manicured British English Rose Garden',
      'Tea Sommelier & Cupping Master On-Site',
      'Private Estate Butler & Chef',
      'Colonial Billiard Room & Library',
      'Fiber Broadband WiFi'
    ],
    amenity_clusters: {
      vibe: ['Rolling Tea Carpet', 'Crisp Highland Air', 'Log Fireplace Warmth', 'Historic Planter Elegance'],
      comfort: ['Stone Fireplaces', 'Feather Down Comforters', 'Clawfoot En-Suite Tubs', 'Hot Water Bottles'],
      work: ['High-Speed WiFi', 'Rosewood Library Desk', 'Garden Outlook', 'Quiet Retreat'],
      culinary: ['Single-Estate Tea Cupping', 'British Scones & Clotted Cream', 'Heritage Kerala Roast Curry', 'Irish Coffee']
    },
    rooms: [
      {
        id: 'room-munnar-01',
        name: "Resident Commissioner's Suite",
        type: 'commissioner_suite',
        icon: '👑',
        tag: 'Historic Flagship',
        price: 36000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,100 sq.ft · Stone Hearth Fireplace · 180° Tea Mountain Horizon',
        description: 'The master bedroom of the original 1922 plantation owner, featuring high ceilings, hand-carved rosewood bed, and hearth.',
        features: ['Stone Hearth Fireplace', 'Panoramic Tea Views', 'Deep Soaking Tub'],
        amenities: ['King Bed', 'Fireplace', 'Mountain View', 'Soaking Tub'],
        photos: []
      }
    ],
    photos: [],
    nearby: [
      { name: 'Eravikulam National Park', distance: '9 km · 20 min drive', type: 'nature', description: 'Sanctuary of the endangered Nilgiri Tahr and purple Kurinji blooms.' },
      { name: 'Mattupetty Lake & Dam', distance: '14 km · 30 min drive', type: 'landmark', description: 'Tranquil reservoir nestled in mountain valleys offering scenic boat rides.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 9. Villa Thalassa Minimalist Compound — Mandwa, Alibaug
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-09',
    title: 'Villa Thalassa Minimalist Compound',
    type: 'Coastal Minimalist Villa',
    rental_mode: 'entire_place',
    price: 60000,
    currency: 'INR',
    city: 'Alibaug',
    address: 'Mandwa Jetty Coastal Ridge, Alibaug, Maharashtra 402201',
    lat: 18.7842,
    lng: 72.8718,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 10,
    bedrooms: 5,
    beds: 6,
    bathrooms: 6,
    dominant_color_hex: '#0E7490',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 2,
    description: 'An expansive 1.5-acre minimalist white-concrete architectural compound just 10 minutes from Mandwa speedboat jetty. Features a 25-meter black granite lap pool, floor-to-ceiling glass pavilions, sunken outdoor firepits, and private butler service catering to Mumbai’s most discerning executives.',
    host_philosophy: 'A Mediterranean-inspired sanctuary designed for effortlessly chic weekend entertaining and pure coastal calm.',
    editorial_quote: 'The ultimate coastal retreat: step off your private speedboat in Mandwa and enter an oasis of minimalist calm within minutes.',
    concierge_privileges: 'Private speedboat charter coordination from Gateway of India (20 mins), private sommelier, and private DJ setup available.',
    curated_guidelines: [
      'Speedboat transfer luggage handling directly to your villa suite.',
      '25-meter lap pool heated on request.',
      'Events and celebrations require prior host approval.'
    ],
    experience_tags: ['Alibaug Luxury', 'Speedboat Accessible', '25m Lap Pool', 'Minimalist Architecture'],
    amenities: [
      '25m Black Granite Swimming Pool',
      '1.5-Acre Private Gated Tropical Grounds',
      'Private Chef & Full Service Butler Team',
      'Sunken Cocktail Firepit Lounge',
      'Sonos Architectural Sound Throughout',
      'EV Car Charging Points',
      'Ultra-Fast Gigabit Fiber Internet'
    ],
    amenity_clusters: {
      vibe: ['Clean Minimalist Lines', 'Sun-Drenched Pool Terrace', 'Private Coconut Grove', 'Effortless Chic'],
      comfort: ['25m Lap Pool', 'Italian Minimalist Baths', 'Ultra-Plush King Suites', 'Full House Staff'],
      work: ['Gigabit Fiber 1 Gbps', 'Executive Conference Den', 'Seamless Mesh WiFi', 'Dedicated Workspaces'],
      culinary: ['Private Seafood BBQ Chef', 'Cocktail Bar & Wine Fridge', 'Farm-to-Fork Organic Salads', 'Smeg Kitchen']
    },
    rooms: [
      {
        id: 'room-alibaug-01',
        name: 'Master Sea Pavilion',
        type: 'master_sea_pavilion',
        icon: '👑',
        tag: 'Master Wing',
        price: 82000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,800 sq.ft · Private Sunken Pool Terrace · Outdoor Rain Bath',
        description: 'Independent pavilion overlooking the 25m pool with private outdoor plunge, double rain showers, and motorized glass doors.',
        features: ['Private Plunge Pool', 'Double Rain Shower', 'Walk-in Wardrobe', 'Sonos Sound'],
        amenities: ['King Bed', 'Pool Access', 'Luxury Bath', 'Espresso Bar'],
        photos: []
      }
    ],
    photos: [],
    nearby: [
      { name: 'Mandwa Jetty & Beach Clubs', distance: '3.5 km · 8 min drive', type: 'beach', description: 'Arrival hub with chic waterfront bistros and speedboat terminals.' },
      { name: 'Awas Pine Forest Beach', distance: '2 km · 5 min drive', type: 'nature', description: 'Tranquil, uncrowded shoreline fringed by dense Australian pine trees.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 10. The Royal Ranthambhore Pavilion — Sawai Madhopur, Rajasthan
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-10',
    title: 'The Royal Ranthambhore Pavilion',
    type: 'Wild Safari Palace Tent',
    rental_mode: 'entire_place',
    price: 45000,
    currency: 'INR',
    city: 'Ranthambhore',
    address: 'Tiger Reserve Border Corridor, Sawai Madhopur, Rajasthan 322001',
    lat: 26.0173,
    lng: 76.5026,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    dominant_color_hex: '#713F12',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 1,
    description: 'Triple-canopy silk-lined bespoke safari pavilions set inside an ancient 20-acre guava and banyan orchard on the very boundary of Ranthambhore National Park. Teakwood flooring, standalone hand-hammered copper soaking tubs, and evening campfires with veteran tiger trackers.',
    host_philosophy: 'The golden age of safari travel reimagined with zero ecological footprint and supreme Rajput hospitality.',
    editorial_quote: 'Hearing the distant alarm call of a spotted deer across the orchard as you recline on your private canvas deck.',
    concierge_privileges: 'VIP customized open-top safari 4x4 gypsies with master naturalists, private birding walks, and lantern-lit bush dinners.',
    curated_guidelines: [
      'Safari departures coordinated directly from the pavilion gates.',
      'Organic Rajasthan barbecue around the central campfire every evening.',
      'Quiet reserve hours strictly maintained for wildlife tranquility.'
    ],
    experience_tags: ['Tiger Safari', 'Royal Safari Tent', 'Wildlife Sanctuary', 'Campfire Luxury'],
    amenities: [
      'Hand-Hammered Copper Soaking Tubs',
      'Private 4x4 Safari Coordination',
      'Private Heated Pool Overlooking Aravalli Hills',
      'Lantern-Lit Bush Dining by Private Chef',
      'Resident Wildlife Naturalists & Trackers',
      'Climate Control & Heat Pumps in All Tents'
    ],
    amenity_clusters: {
      vibe: ['Ancient Banyan Grove', 'Wilderness Starry Nights', 'Crackling Bonfires', 'Tiger Territory'],
      comfort: ['Silk-Lined Canvas Tents', 'Copper Soaking Tubs', 'Air Conditioning', 'Plush Safari Beds'],
      work: ['Satellite WiFi', 'Teak Writing Bureau', 'Verandah Outlook', 'Silent Natural Surroundings'],
      culinary: ['Royal Shikari Cuisine', 'Campfire Barbecue', 'Single Malt Safari Bar', 'Sunken Breakfast Pavilion']
    },
    rooms: [
      {
        id: 'room-ran-01',
        name: 'Maharaja Tiger Pavilion',
        type: 'maharaja_tent',
        icon: '🐅',
        tag: 'Royal Wilderness Tent',
        price: 58000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,400 sq.ft · Triple Canopy Silk Canvas · Private Heated Dipping Pool',
        description: 'Imperial safari suite with hand-embroidered Mughal tents, polished deodar floors, and a private pool looking at the Aravalli hills.',
        features: ['Hand-Hammered Copper Tub', 'Private Dipping Pool', 'Outdoor Canvas Lounge'],
        amenities: ['King Bed', 'Private Pool', 'Luxury Bath', 'Wilderness View'],
        photos: []
      }
    ],
    photos: [],
    nearby: [
      { name: 'Ranthambhore National Park Gate', distance: '2.5 km · 6 min drive', type: 'nature', description: 'Premier Royal Bengal Tiger sanctuary with historic 10th-century jungle ruins.' },
      { name: 'Ranthambhore 10th-Century Fortress', distance: '11 km · 25 min drive', type: 'culture', description: 'UNESCO World Heritage hilltop citadel inside the tiger reserve.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 11. The Cedar Pine Alpine Chalet — Solang Valley, Manali
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-11',
    title: 'The Cedar Pine Alpine Chalet',
    type: 'Alpine Stone Chalet',
    rental_mode: 'entire_place',
    price: 29000,
    currency: 'INR',
    city: 'Manali',
    address: 'Solang Valley Crest, Manali, Himachal Pradesh 175131',
    lat: 32.3168,
    lng: 77.1583,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 8,
    bedrooms: 4,
    beds: 4,
    bathrooms: 4,
    dominant_color_hex: '#3F2E21',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 1,
    description: 'A Swiss-architected handcrafted deodar timber and riverstone alpine chalet offering direct panoramic vistas of snow-capped Rohtang peaks. Features a private outdoor heated cedar hot tub overlooking snowdrifts, a grand double-height living room with slate fireplace, and private ski guide coordination.',
    host_philosophy: 'Authentic high-altitude alpine living with the warm comfort of roaring timber hearths and cedar fragrance.',
    editorial_quote: 'Soaking in steaming outdoor cedar waters while snow silently blankets the pine needles all around you.',
    concierge_privileges: 'Private heli-skiing coordination, backcountry snowmobile expeditions, and private mulled wine tasting.',
    curated_guidelines: [
      'Outdoor heated cedar hot tub maintained at 39°C continuously.',
      'Heated ski boot room and equipment storage on the ground level.',
      'Complimentary evening Himachali culinary experience by the hearth.'
    ],
    experience_tags: ['Alpine Snow Chalet', 'Cedar Hot Tub', 'Snow-Capped Peaks', 'Winter Wonderland'],
    amenities: [
      'Outdoor Heated Cedar Hot Tub (39°C)',
      'Double-Height Living Room with Stone Hearth',
      'Panoramic Snow Peak & Glacier Views',
      'Underfloor Heating Across All Floors',
      'Heated Ski Gear & Boot Room',
      'Private Alpine Chef & Fondue Service',
      'High-Speed Fiber Internet'
    ],
    amenity_clusters: {
      vibe: ['Snow-Covered Deodar Pines', 'Alpine Slopes', 'Cedar Wood Aroma', 'Cozy Hearthside Warmth'],
      comfort: ['Heated Cedar Hot Tub', 'Underfloor Heating', 'Goose Feather Quilts', 'Sauna Suite'],
      work: ['Fiber 300 Mbps', 'Alpine Loft Desk', 'Mountain Panorama', 'Silent Retreat'],
      culinary: ['Swiss Cheese Fondue', 'Himachali Dham Specialities', 'Mulled Wine & Cider', 'Warm Walnut Pastries']
    },
    rooms: [
      {
        id: 'room-manali-01',
        name: 'Snow Peak Alpine Master Suite',
        type: 'alpine_master',
        icon: '👑',
        tag: 'Glacier View Master',
        price: 44000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,250 sq.ft · Private Deodar Balcony · Stone Fireplace',
        description: 'Double-height cathedral ceiling with hand-cut deodar timber beams, private stone fireplace, and balcony facing Rohtang Pass.',
        features: ['Stone Fireplace', 'Deodar Wood Ceilings', 'Direct Hot Tub Access'],
        amenities: ['King Bed', 'Glacier View', 'Fireplace', 'Balcony'],
        photos: []
      }
    ],
    photos: [],
    nearby: [
      { name: 'Solang Valley Ski Slopes', distance: '2 km · 5 min drive', type: 'nature', description: 'Premier winter sports arena offering paragliding, skiing, and snowmobiling.' },
      { name: 'Atal Tunnel Rohtang Portal', distance: '8 km · 15 min drive', type: 'landmark', description: 'Engineering marvel granting instant year-round passage to Lahaul Valley.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 12. The Ayurvedic Seaside Pavilion — Kovalam, Kerala
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-12',
    title: 'The Ayurvedic Seaside Pavilion',
    type: 'Seaside Wellness Estate',
    rental_mode: 'entire_place',
    price: 27000,
    currency: 'INR',
    city: 'Kovalam',
    address: 'Light House Beach Cliff, Kovalam, Kerala 695521',
    lat: 8.3988,
    lng: 76.9820,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    dominant_color_hex: '#065F46',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 1,
    description: 'A cliffside coastal wellness retreat surrounded by coconut palms and direct beach steps. Boasts an authentic Ayurvedic therapy wing staffed by hereditary Vaidyas, saltwater restorative infinity pool, and open-air yoga shala where classes are timed to the ocean tide.',
    host_philosophy: 'Ancient healing sciences grounded in authentic panchakarma, ocean minerals, and therapeutic rest.',
    editorial_quote: 'The healing power of ocean waves paired with five-thousand-year-old Vedic wellness traditions.',
    concierge_privileges: 'Comprehensive body constitution (Prakriti) consultation by Ayurvedic physician, customized daily treatment plan, and herb farm visits.',
    curated_guidelines: [
      'Ayurvedic treatment schedule coordinated privately for each guest.',
      'Sattvic oceanfront meals prepared using zero refined sugars or oils.',
      'Private steps lead directly down to secluded beach cove.'
    ],
    experience_tags: ['Ayurvedic Sanctuary', 'Direct Beach Access', 'Oceanfront Wellness', 'Yoga Shala'],
    amenities: [
      'Saltwater Clifftop Restorative Pool',
      'Private Ayurvedic Panchakarma Spa',
      'Open-Air Oceanfront Yoga Deck',
      'Private Direct Beach Stairs',
      'Resident Ayurvedic Vaidya Consultations',
      'High-Speed Fiber Internet'
    ],
    amenity_clusters: {
      vibe: ['Ocean Wave Therapy', 'Coconut Palm Canopy', 'Therapeutic Calm', 'Salty Sea Breeze'],
      comfort: ['Saltwater Pool', 'Organic Cotton Linens', 'Ayurvedic Steam Cabin', 'Ocean Daybeds'],
      work: ['Fiber 300 Mbps', 'Open-Air Shaded Desk', 'Calm Ocean Horizon', 'Ergonomic Lounger'],
      culinary: ['Doctor-Prescribed Diet', 'Herbal Decocations', 'Fresh Coconut Water', 'Organic Kerala Spices']
    },
    rooms: [
      {
        id: 'room-kovalam-01',
        name: 'Ocean Sanctuary Pavilion',
        type: 'ocean_sanctuary',
        icon: '👑',
        tag: 'Oceanfront Master',
        price: 40000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,200 sq.ft · Direct Ocean Horizon · Private Shirodhara Treatment Room',
        description: 'Wake up to the sounds of the ocean with an in-suite treatment room, private sun deck, and teak four-poster bed.',
        features: ['In-Suite Treatment Room', 'Private Ocean Deck', 'Outdoor Herb Bath'],
        amenities: ['King Bed', 'Ocean View', 'Private Deck', 'Spa Access'],
        photos: []
      }
    ],
    photos: [],
    nearby: [
      { name: 'Kovalam Lighthouse Crest', distance: '1.2 km · 15 min walk', type: 'landmark', description: 'Iconic red-and-white striped lighthouse commanding sweeping 360-degree ocean views.' },
      { name: 'Hawa Beach Coastal Promenade', distance: '1.5 km · 5 min drive', type: 'beach', description: 'Scenic crescent cove known for morning fisherman katamarans.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 13. Maison de la Mer — White Town, Puducherry
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-13',
    title: 'Maison de la Mer',
    type: 'French Colonial Courtyard Mansion',
    rental_mode: 'entire_place',
    price: 21000,
    currency: 'INR',
    city: 'Puducherry',
    address: 'Rue Suffren, White Town, Puducherry 605001',
    lat: 11.9338,
    lng: 79.8335,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    dominant_color_hex: '#854D0E',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 1,
    description: 'An iconic sunburst-yellow French colonial maison with high ceilings, louvered teak shutters, and a bougainvillea-framed courtyard plunge pool in the heart of White Town. Step straight out onto cobblestone French quarters or enjoy fresh croissants and artisanal filter coffee in your private colonial atrium.',
    host_philosophy: 'Franco-Tamil architectural harmony: French neoclassical elegance meeting South Indian verandah warmth.',
    editorial_quote: 'Bask in colonial serenity while morning bakery aromas drift through the shuttered French windows.',
    concierge_privileges: 'Complimentary vintage bicycle fleet, private Auroville guided exploration, and reserved tables at Coromandel Cafe.',
    curated_guidelines: [
      'Vintage bicycles available at the entrance courtyard for exploring White Town.',
      'Fresh French viennoiserie delivered to your courtyard table every morning.',
      'Quiet heritage residential hours after 10 PM.'
    ],
    experience_tags: ['French Colonial', 'White Town Heritage', 'Courtyard Plunge Pool', 'Gourmet French Living'],
    amenities: [
      'Private Bougainvillea Courtyard Plunge Pool',
      'Complimentary Vintage Bicycle Fleet',
      'Daily French Bakery & Viennoiserie Breakfast',
      'Restored 1888 Colonial Architecture',
      'Private Chef & House Staff',
      'High-Speed Fiber Broadband'
    ],
    amenity_clusters: {
      vibe: ['Sunburst Yellow Facade', 'French White Town Streets', 'Bougainvillea Courtyard', 'Bohemian Colonial'],
      comfort: ['Courtyard Plunge Pool', 'Teak Louvered Shutters', 'Four-Poster Beds', 'Central AC'],
      work: ['Fiber 300 Mbps', 'Antique French Writing Bureau', 'Courtyard Garden View', 'Quiet Nook'],
      culinary: ['Fresh Croissants & Baguettes', 'French-Creole Cuisine', 'Artisanal Filter Coffee', 'French Wine Selection']
    },
    rooms: [
      {
        id: 'room-pondy-01',
        name: "French Governor's Suite",
        type: 'french_governor',
        icon: '👑',
        tag: 'Heritage Master',
        price: 32000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,150 sq.ft · 18ft Timber Ceilings · Private Balcony on Rue Suffren',
        description: 'Featuring hand-carved colonial furniture, Belgian crystal lights, and French doors looking out over heritage White Town.',
        features: ['Rue Suffren Balcony', 'High Ceilings', 'Clawfoot Soaking Tub'],
        amenities: ['King Bed', 'City View', 'Balcony', 'Heritage Bath'],
        photos: []
      }
    ],
    photos: [],
    nearby: [
      { name: 'Promenade Beach & Rock Beach', distance: '300 m · 3 min walk', type: 'beach', description: 'Scenic vehicle-free seaside boulevard lined with colonial statues and cafes.' },
      { name: 'Sri Aurobindo Ashram', distance: '600 m · 6 min walk', type: 'culture', description: 'World-renowned spiritual community sanctuary founded in 1926.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 14. The Cardamom Canopy Treehouse — Thekkady, Kerala
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-14',
    title: 'The Cardamom Canopy Treehouse',
    type: 'Spice Plantation Tree Sanctuary',
    rental_mode: 'entire_place',
    price: 23000,
    currency: 'INR',
    city: 'Thekkady',
    address: 'Periyar Reserve Valley, Kumily, Kerala 685509',
    lat: 9.6031,
    lng: 77.1685,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    dominant_color_hex: '#166534',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 1,
    description: 'Elevated luxury teakwood treehouse villas built 45 feet up in the canopy of living wild fig and mahogany trees across a 40-acre organic cardamom and pepper plantation. Private suspension rope bridge, outdoor cedar soaking tub overlooking the forest canopy, and authentic spice gastronomy.',
    host_philosophy: 'Living suspended in the green canopy without cutting a single branch or intruding on nature.',
    editorial_quote: 'Wake up to Malabar giant squirrels leaping between tree branches just feet from your open-air bedroom balcony.',
    concierge_privileges: 'Private Periyar Tiger Reserve bamboo rafting expedition, cardamom harvesting tour, and night jungle patrol with forest rangers.',
    curated_guidelines: [
      'Suspension rope bridge access requires comfortable flat footwear.',
      'Zero synthetic pesticides or chemicals across the entire 40-acre spice estate.',
      'Fresh organic cardamom tea served on the canopy deck throughout the day.'
    ],
    experience_tags: ['Canopy Treehouse', 'Cardamom Plantation', 'Wildlife Canopy', 'High Seclusion'],
    amenities: [
      'Suspended 45ft Treehouse Architecture',
      'Outdoor Forest Canopy Cedar Soaking Tub',
      'Private Suspension Rope Bridge Access',
      'Organic Cardamom & Spice Plantation Trails',
      'Private Spice Gastronomy Chef',
      'High-Speed Starlink Broadband'
    ],
    amenity_clusters: {
      vibe: ['45ft Canopy Height', 'Living Tree Trunks', 'Wild Cardamom Aroma', 'Exotic Birdsongs'],
      comfort: ['Cedar Canopy Tub', 'Teak Wood Interiors', 'Goose Down Bedding', 'Climate Control'],
      work: ['Starlink 250 Mbps', 'Canopy Desk Overlooking Forest', 'Nature Sounds', 'Deep Focus'],
      culinary: ['Estate Spice-Infused Dining', 'Cardamom & Clove Teas', 'Fresh Forest Honey', 'Organic Kerala Feasts']
    },
    rooms: [
      {
        id: 'room-thekkady-01',
        name: 'High Canopy Tree Villa',
        type: 'high_canopy',
        icon: '👑',
        tag: 'Canopy Master',
        price: 35000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '950 sq.ft · 45ft Above Forest Floor · Private Outdoor Cedar Tub',
        description: 'Built into two colossal wild fig trees with 360-degree views of the spice plantation canopy and private stargazing terrace.',
        features: ['Outdoor Cedar Tub', 'Rope Bridge Entry', 'Glass Balcony Railings'],
        amenities: ['King Bed', 'Forest View', 'Cedar Tub', 'Deck'],
        photos: []
      }
    ],
    photos: [],
    nearby: [
      { name: 'Periyar Tiger Reserve Boat Safari', distance: '4 km · 10 min drive', type: 'nature', description: 'Famous lake cruise where wild elephant herds and bison graze along the water banks.' },
      { name: 'Kadathanadan Kalari Centre', distance: '2.5 km · 7 min drive', type: 'culture', description: 'Authentic 3000-year-old Kerala martial arts (Kalaripayattu) performances.' }
    ]
  },

  // ---------------------------------------------------------------------------
  // 15. Vembanad Water Palace — Kumarakom, Kerala
  // ---------------------------------------------------------------------------
  {
    id: 'encho-prop-15',
    title: 'Vembanad Water Palace',
    type: 'Private Backwater Island Villa',
    rental_mode: 'entire_place',
    price: 38000,
    currency: 'INR',
    city: 'Kumarakom',
    address: 'Lake Vembanad Island, Muhamma, Kumarakom, Kerala 688525',
    lat: 9.6175,
    lng: 76.4300,
    isVerified: false,
    is_verified: false,
    is_superhost: false,
    rating: 0,
    reviewCount: 0,
    maxGuests: 8,
    bedrooms: 4,
    beds: 4,
    bathrooms: 4,
    dominant_color_hex: '#155E75',
    publication_status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1600&q=85',
    imageUrls: [
      'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1600&q=85'
    ],
    imageCount: 2,
    description: 'An exclusive private island water estate on Vembanad Lake, accessible strictly by traditional mahogany speedboat. Features an infinity pool that merges seamlessly with the backwaters, traditional carved teakwood architecture (Tharavadu), private houseboats on standby, and bespoke Karimeen Pollichathu culinary experiences.',
    host_philosophy: 'Surrendering to the eternal cadence of the Kerala backwaters on your own private lake island.',
    editorial_quote: 'Gliding silently onto your private island dock as lanterns flicker along the water’s edge.',
    concierge_privileges: 'Private sunset houseboat cruise on Vembanad Lake, fishing with local casting nets, and private Kathakali performance.',
    curated_guidelines: [
      'Arrival strictly via private estate speedboat from Muhamma boat jetty.',
      'Private luxury houseboat available for overnight lake charters upon request.',
      'Fresh catch backwater seafood caught and prepared fresh daily.'
    ],
    experience_tags: ['Private Island', 'Kerala Backwaters', 'Waterfront Infinity Pool', 'Tharavadu Architecture'],
    amenities: [
      'Private Island Water Estate Access',
      'Infinity Pool Blending into Vembanad Lake',
      'Private Mahogany Speedboat & Captain',
      'Traditional Tharavadu Carved Wood Interiors',
      'Private Backwaters Chef & Butler Team',
      'Complimentary Sunset Houseboat Cruise',
      'High-Speed Satellite Fiber Internet'
    ],
    amenity_clusters: {
      vibe: ['Private Island Exclusivity', 'Vast Water Horizons', 'Gentle Wave Rhythms', 'Lotus & Lily Canals'],
      comfort: ['Lakefront Infinity Pool', 'Teakwood Verandahs', 'Handcrafted Silk Beds', 'Outdoor Rain Showers'],
      work: ['Fiber 300 Mbps', 'Lakeside Pavilion Desk', 'Calm Water Horizon', 'Quiet Island Solitude'],
      culinary: ['Karimeen Pollichathu Specialities', 'Fresh Coconut Toddy & Prawns', 'Kerala Appams & Stew', 'Sunset Cocktails']
    },
    rooms: [
      {
        id: 'room-vembanad-01',
        name: 'Sovereign Lake Villa',
        type: 'sovereign_lake',
        icon: '👑',
        tag: 'Waterfront Master',
        price: 54000,
        capacity: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        specs: '1,550 sq.ft · Lake Vembanad Water Edge · Private Plunge Deck',
        description: 'Set directly on the water’s edge with 270-degree backwater views, private plunge deck, and antique timber woodwork.',
        features: ['Direct Water Deck', '270° Lake View', 'Outdoor Granite Tub'],
        amenities: ['King Bed', 'Lake View', 'Private Deck', 'Luxury Bath'],
        photos: []
      }
    ],
    photos: [],
    nearby: [
      { name: 'Kumarakom Bird Sanctuary', distance: '5 km · 15 min boat', type: 'nature', description: 'Famous 14-acre wetland home to migratory Siberian storks and herons.' },
      { name: 'Pathiramanal Island', distance: '3 km · 10 min private boat', type: 'nature', description: 'Enchanted uninhabited backwater island with dense mangrove forests.' }
    ]
  }
];
