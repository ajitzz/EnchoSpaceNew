/**
 * Stay Projection & Address Privacy Engine
 * Milestone: Phase 3 Milestone 2 (Published Projection, Canonical Routes & Address Privacy)
 *
 * Implements strict privacy boundary:
 * - Explicit SQL column allowlist used at DB layer.
 * - Coarsens geographical coordinates (2 decimal places ~1.1km area).
 * - Completely omits street address, house numbers, pin codes.
 * - Omits internal user_id, host contacts, access credentials, and raw database identifiers.
 * - Explicit typed mappers for nested objects (rooms, media, amenities, nearby, policies)
 *   stripping internal IDs, inventory counts, map URLs, contact info, access codes, and unknown fields.
 */

export interface PublicLocation {
  city: string;
  locality: string;
  approximateLatitude: number | null;
  approximateLongitude: number | null;
}

export interface PublicRoomTier {
  type: string;
  name: string;
  icon?: string;
  tag?: string;
  price: number;
  capacity: number;
  specs?: string;
  features?: string[];
  amenities?: string[];
  description?: string;
}

export interface PublicMediaAsset {
  url: string;
  category: string;
  tier: string;
  title?: string;
  description?: string;
  isHero?: boolean;
  isSleepingArea?: boolean;
  roomTier?: string;
}

export interface PublicNearbyAttraction {
  name: string;
  distance: string;
  type: string;
  description?: string;
}

export interface PublicStayPolicies {
  curatedGuidelines?: string[];
  checkInTime?: string;
  checkOutTime?: string;
}

export interface PublicStayProjection {
  id: string;
  slug: string;
  title: string;
  type: string;
  rental_mode: string;
  price: number;
  currency: string;
  location: PublicLocation;
  imageUrl: string;
  imageUrls: string[];
  photos: PublicMediaAsset[];
  rooms: PublicRoomTier[];
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  amenities: string[];
  amenity_clusters: Record<string, string[]>;
  child_safety_specs: string[];
  nearby: PublicNearbyAttraction[];
  description: string;
  hero_video_url?: string;
  hero_fallback_url?: string;
  dominant_color_hex?: string;
  curated_guidelines?: string[];
  policies: PublicStayPolicies;
  experience_tags: string[];
  concierge_privileges?: string;
  host_philosophy?: string;
  editorial_quote?: string;
  brand?: string;
  brand_font?: string;
  brand_color?: string;
  rating?: number;
  reviewCount?: number;
}

/**
 * Dedicated projection for public search listing cards and map pins.
 * Strictly limits fields to only what is genuinely required by public catalogue UI,
 * while executing recursive text sanitization and nested mappers.
 */
export interface PublicListingCardProjection {
  id: string;
  slug: string;
  title: string;
  type: string;
  rental_mode: string;
  price: number;
  currency: string;
  period?: string;
  city: string;
  imageUrl: string;
  imageUrls: string[];
  imageCount: number;
  rooms: PublicRoomTier[];
  lat: number | null;
  lng: number | null;
  isVerified: boolean;
  hasOffers: boolean;
  rating: number;
  reviewCount: number;
  amenities: string[];
  maxGuests?: number;
  bedrooms?: number;
  beds?: number;
  bathrooms?: number;
}

/**
 * SQL Column Allowlist for Stay Projection queries.
 * Statically prevents SELECT * from retrieving sensitive or private fields from Postgres.
 */
export const STAY_PUBLIC_SQL_COLUMNS = [
  'id',
  'title',
  'description',
  'price',
  'currency',
  'type',
  'city',
  'image_url',
  'image_urls',
  'max_guests',
  'bedrooms',
  'beds',
  'bathrooms',
  'amenities',
  'video_url',
  'rental_mode',
  'rooms',
  'created_at',
  'lat',
  'lng',
  'dynamic_pricing',
  'seo_title',
  'seo_description',
  'seo_keywords',
  'seo_image_url',
  'hero_video_url',
  'hero_fallback_url',
  'dominant_color_hex',
  'raw_rules',
  'curated_guidelines',
  'experience_tags',
  'photos',
  'amenity_clusters',
  'child_safety_specs',
  'nearby',
  'concierge_privileges',
  'host_philosophy',
  'brand',
  'brand_font',
  'brand_color',
  'slug',
  'publication_status'
];

export function generateListingSlug(title: string | null | undefined, id: number | string): string {
  const cleanTitle = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const base = cleanTitle || 'stay';
  return `${base}-${id}`;
}

export function coarsenCoordinate(coord: number | string | null | undefined, decimals = 2): number | null {
  if (coord === null || coord === undefined || coord === '') return null;
  const num = Number(coord);
  if (isNaN(num)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Sanitizes and strips sensitive patterns (addresses, phone numbers, emails, whatsapp,
 * coordinates, map links, door pins, access codes, wifi credentials) from public free-text fields.
 */
export function sanitizePublicText(input: unknown): string {
  if (input === null || input === undefined) return '';
  let text = String(input);

  // 1. Strip Email addresses
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[REDACTED]');

  // 2. Strip Phone numbers (international, domestic, spaced or dashed, min 7 digits)
  text = text.replace(/(\+?\d{1,4}[-.\s]?)?(\(?\d{2,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{3,5}/g, (match) => {
    // Keep short innocent numbers like '2026' or '10 PM' but redact phone sequences
    const digitsOnly = match.replace(/\D/g, '');
    if (digitsOnly.length >= 7) {
      return '[REDACTED]';
    }
    return match;
  });

  // 3. Strip WhatsApp links
  text = text.replace(/(wa\.me\/\S+|api\.whatsapp\.com\/\S+|whatsapp:\/\/\S+)/gi, '[REDACTED]');

  // 4. Strip URLs / Map links
  text = text.replace(/(https?:\/\/[^\s]+|maps\.google\.[^\s]+|goo\.gl\/\S+)/gi, '[REDACTED]');

  // 5. Strip Coordinates pattern (e.g. 11.52001, 76.13002 or lat=... lng=...)
  text = text.replace(/-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g, '[REDACTED]');

  // 6. Strip Access codes, PINs, Passwords, Door codes, Wi-Fi credentials
  text = text.replace(/(?:pin|passcode|code|password|wifi|wi-fi|access)(?:\s+(?:password|pin|passcode|code|is|to|:|:=|=)+)*\s*[:=]?\s*([a-zA-Z0-9_-]{3,30})/gi, (match, p1) => {
    return match.replace(p1, '[REDACTED]');
  });

  // 7. Strip physical street markers and Indian PIN codes (6-digit postal codes)
  text = text.replace(/\b(?:plot\s*\d+|house\s*no\.?|flat\s*no\.?|road|street|lane|nagar|colony|sector\s*\d+)\b[^\n,.]*/gi, '[REDACTED]');
  text = text.replace(/\b\d{6}\b/g, '[REDACTED]');

  return text.trim();
}

/**
 * Explicit mapper for Room Tiers.
 * Strips internal primary keys, host internal notes, inventory counts, and arbitrary unknown metadata.
 * Never derives public room type from rawRoom.id.
 */
export function mapPublicRoomTier(rawRoom: any): PublicRoomTier {
  if (!rawRoom || typeof rawRoom !== 'object') {
    return {
      type: 'standard',
      name: 'Room',
      price: 0,
      capacity: 1
    };
  }

  // Derive type strictly from approved public property or slugified name, NEVER from raw room id
  let resolvedType = 'standard';
  if (typeof rawRoom.type === 'string' && rawRoom.type.trim() && !rawRoom.type.toLowerCase().includes('internal') && !rawRoom.type.toLowerCase().includes('id')) {
    resolvedType = rawRoom.type.trim().toLowerCase();
  } else if (typeof rawRoom.name === 'string' && rawRoom.name.trim()) {
    resolvedType = rawRoom.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'standard';
  }

  const safeFeatures = Array.isArray(rawRoom.features)
    ? rawRoom.features
        .filter((f: any) => typeof f === 'string')
        .map((f: string) => sanitizePublicText(f))
        .filter((f: string) => f && !f.includes('[REDACTED]'))
    : [];

  const safeAmenities = Array.isArray(rawRoom.amenities)
    ? rawRoom.amenities
        .filter((a: any) => typeof a === 'string')
        .map((a: string) => sanitizePublicText(a))
        .filter((a: string) => a && !a.includes('[REDACTED]'))
    : [];

  const cleanedDescription = typeof rawRoom.description === 'string' ? sanitizePublicText(rawRoom.description) : undefined;
  const cleanedSpecs = typeof rawRoom.specs === 'string' ? sanitizePublicText(rawRoom.specs) : undefined;
  const cleanedName = typeof rawRoom.name === 'string' ? sanitizePublicText(rawRoom.name) : 'Room';

  return {
    type: resolvedType,
    name: cleanedName || 'Room',
    icon: typeof rawRoom.icon === 'string' ? rawRoom.icon : undefined,
    tag: typeof rawRoom.tag === 'string' ? sanitizePublicText(rawRoom.tag) : undefined,
    price: Number(rawRoom.price) || 0,
    capacity: Number(rawRoom.capacity) || 1,
    specs: cleanedSpecs,
    features: safeFeatures,
    amenities: safeAmenities,
    description: cleanedDescription
  };
}

/**
 * Explicit mapper for Media Assets / Photos.
 * Strips internal storage IDs, moderation metadata, upload timestamps, and unknown properties.
 */
export function mapPublicMediaAsset(rawMedia: any): PublicMediaAsset | null {
  if (!rawMedia || typeof rawMedia !== 'object') return null;
  // If moderation_status is present and not approved, exclude from public projection
  if (rawMedia.moderation_status && rawMedia.moderation_status !== 'approved') return null;
  const url = typeof rawMedia.url === 'string' ? rawMedia.url : (typeof rawMedia.previewUrl === 'string' ? rawMedia.previewUrl : '');
  if (!url) return null;

  return {
    url,
    category: typeof rawMedia.category === 'string' ? rawMedia.category : 'other',
    tier: typeof rawMedia.tier === 'string' ? rawMedia.tier : 'common',
    title: typeof rawMedia.title === 'string' ? sanitizePublicText(rawMedia.title) : undefined,
    description: typeof rawMedia.description === 'string' ? sanitizePublicText(rawMedia.description) : undefined,
    isHero: Boolean(rawMedia.isHero || rawMedia.is_hero),
    isSleepingArea: Boolean(rawMedia.is_sleeping_area || rawMedia.isSleepingArea),
    roomTier: typeof rawMedia.tier === 'string' ? rawMedia.tier : undefined
  };
}

/**
 * Explicit mapper for Nearby Attractions.
 * Strips internal POI IDs, exact coordinate boundaries, and contact/external URLs.
 */
export function mapPublicNearbyAttraction(rawPoi: any): PublicNearbyAttraction | null {
  if (!rawPoi || typeof rawPoi !== 'object') return null;
  const name = typeof rawPoi.name === 'string' ? sanitizePublicText(rawPoi.name) : '';
  if (!name || name.includes('[REDACTED]')) return null;

  return {
    name,
    distance: typeof rawPoi.distance === 'string' ? sanitizePublicText(rawPoi.distance) : 'Nearby',
    type: typeof rawPoi.type === 'string' ? rawPoi.type : 'attraction',
    description: typeof rawPoi.description === 'string' ? sanitizePublicText(rawPoi.description) : undefined
  };
}

/**
 * Explicit mapper for Policies and Guidelines.
 */
export function mapPublicPolicies(rawGuidelines: any): PublicStayPolicies {
  let guidelines: string[] = [];
  if (Array.isArray(rawGuidelines)) {
    guidelines = rawGuidelines.filter((g: any) => typeof g === 'string');
  } else if (typeof rawGuidelines === 'string') {
    guidelines = rawGuidelines.split('\n').map(s => s.trim()).filter(Boolean);
  }

  const sanitized = guidelines
    .map(g => sanitizePublicText(g))
    .filter(g => g.length > 0);

  return {
    curatedGuidelines: sanitized
  };
}

/**
 * Main Privacy Firewall Transformation.
 * Transforms raw DB query results into a sanitized, typed public projection.
 */
export function toPublicStayProjection(rawListing: any): PublicStayProjection {
  const idStr = String(rawListing.id);
  const slug = rawListing.slug || generateListingSlug(rawListing.title, idStr);
  const city = typeof rawListing.city === 'string' ? rawListing.city : 'India';
  const locality = typeof rawListing.locality === 'string' ? rawListing.locality : city;

  const approximateLatitude = coarsenCoordinate(rawListing.lat, 2);
  const approximateLongitude = coarsenCoordinate(rawListing.lng, 2);

  // Parse raw JSON if stringified
  const rawImageUrls = Array.isArray(rawListing.image_urls)
    ? rawListing.image_urls
    : (typeof rawListing.image_urls === 'string' ? JSON.parse(rawListing.image_urls || '[]') : []);

  const imageUrls: string[] = rawImageUrls
    .filter((u: any) => typeof u === 'string' && u.trim() !== '');

  const rawPhotos = Array.isArray(rawListing.photos)
    ? rawListing.photos
    : (typeof rawListing.photos === 'string' ? JSON.parse(rawListing.photos || '[]') : []);

  const photos: PublicMediaAsset[] = rawPhotos
    .map(mapPublicMediaAsset)
    .filter((p: any): p is PublicMediaAsset => p !== null);

  const rawRooms = Array.isArray(rawListing.rooms)
    ? rawListing.rooms
    : (typeof rawListing.rooms === 'string' ? JSON.parse(rawListing.rooms || '[]') : []);

  const rooms: PublicRoomTier[] = rawRooms.map(mapPublicRoomTier);

  const rawAmenities = Array.isArray(rawListing.amenities)
    ? rawListing.amenities
    : (typeof rawListing.amenities === 'string' ? JSON.parse(rawListing.amenities || '[]') : []);

  const amenities: string[] = rawAmenities.filter((a: any) => typeof a === 'string');

  const rawNearby = Array.isArray(rawListing.nearby)
    ? rawListing.nearby
    : (typeof rawListing.nearby === 'string' ? JSON.parse(rawListing.nearby || '[]') : []);

  const nearby: PublicNearbyAttraction[] = rawNearby
    .map(mapPublicNearbyAttraction)
    .filter((n: any): n is PublicNearbyAttraction => n !== null);

  const rawExperienceTags = Array.isArray(rawListing.experience_tags)
    ? rawListing.experience_tags
    : (typeof rawListing.experience_tags === 'string' ? JSON.parse(rawListing.experience_tags || '[]') : []);

  const experienceTags: string[] = rawExperienceTags.filter((t: any) => typeof t === 'string');

  const rawAmenityClusters = typeof rawListing.amenity_clusters === 'object' && rawListing.amenity_clusters !== null
    ? rawListing.amenity_clusters
    : (typeof rawListing.amenity_clusters === 'string' ? JSON.parse(rawListing.amenity_clusters || '{}') : {});

  const amenityClusters: Record<string, string[]> = {};
  for (const [clusterKey, val] of Object.entries(rawAmenityClusters)) {
    if (Array.isArray(val)) {
      amenityClusters[clusterKey] = val.filter((item: any) => typeof item === 'string');
    }
  }

  const rawChildSafety = Array.isArray(rawListing.child_safety_specs)
    ? rawListing.child_safety_specs
    : (typeof rawListing.child_safety_specs === 'string' ? JSON.parse(rawListing.child_safety_specs || '[]') : []);

  const childSafetySpecs: string[] = rawChildSafety.filter((s: any) => typeof s === 'string');

  const policies = mapPublicPolicies(rawListing.curated_guidelines);

  return {
    id: idStr,
    slug,
    title: String(rawListing.title || ''),
    type: String(rawListing.type || 'Stay'),
    rental_mode: String(rawListing.rental_mode || 'entire_place'),
    price: Number(rawListing.price) || 0,
    currency: String(rawListing.currency || 'INR'),
    location: {
      city,
      locality,
      approximateLatitude,
      approximateLongitude
    },
    imageUrl: typeof rawListing.image_url === 'string' && rawListing.image_url ? rawListing.image_url : (imageUrls[0] || ''),
    imageUrls,
    photos,
    rooms,
    maxGuests: rawListing.max_guests != null ? Number(rawListing.max_guests) : (rawListing.maxGuests != null ? Number(rawListing.maxGuests) : 1),
    bedrooms: rawListing.bedrooms != null ? Number(rawListing.bedrooms) : (rawListing.bedrooms != null ? Number(rawListing.bedrooms) : 0),
    beds: rawListing.beds != null ? Number(rawListing.beds) : 0,
    bathrooms: rawListing.bathrooms != null ? Number(rawListing.bathrooms) : 0,
    amenities,
    amenity_clusters: amenityClusters,
    child_safety_specs: childSafetySpecs,
    nearby,
    description: typeof rawListing.description === 'string' ? sanitizePublicText(rawListing.description) : '',
    hero_video_url: typeof rawListing.hero_video_url === 'string' ? rawListing.hero_video_url : undefined,
    hero_fallback_url: typeof rawListing.hero_fallback_url === 'string' ? rawListing.hero_fallback_url : undefined,
    dominant_color_hex: typeof rawListing.dominant_color_hex === 'string' ? rawListing.dominant_color_hex : undefined,
    curated_guidelines: policies.curatedGuidelines,
    policies,
    experience_tags: experienceTags,
    concierge_privileges: typeof rawListing.concierge_privileges === 'string' ? sanitizePublicText(rawListing.concierge_privileges) : undefined,
    host_philosophy: typeof rawListing.host_philosophy === 'string' ? sanitizePublicText(rawListing.host_philosophy) : undefined,
    editorial_quote: typeof rawListing.editorial_quote === 'string' ? sanitizePublicText(rawListing.editorial_quote) : undefined,
    brand: typeof rawListing.brand === 'string' ? rawListing.brand : undefined,
    brand_font: typeof rawListing.brand_font === 'string' ? rawListing.brand_font : undefined,
    brand_color: typeof rawListing.brand_color === 'string' ? rawListing.brand_color : undefined,
    rating: rawListing.rating != null ? Number(rawListing.rating) : undefined,
    reviewCount: rawListing.review_count != null ? Number(rawListing.review_count) : (rawListing.reviewCount != null ? Number(rawListing.reviewCount) : undefined)
  };
}

/**
 * Dedicated Public Listing Card Projection.
 * Transforms raw database rows into a strictly allowlisted, deeply sanitized listing card.
 * Strips address, user_id, host_id, raw coordinates, raw rules, access codes,
 * internal room IDs, inventory counts, map URLs, contact info, and unsanitized free text.
 */
export function toPublicListingCardProjection(rawListing: any): PublicListingCardProjection {
  const idStr = String(rawListing.id);
  const slug = rawListing.slug || generateListingSlug(rawListing.title, idStr);
  const city = typeof rawListing.city === 'string' ? sanitizePublicText(rawListing.city) : 'India';

  const lat = coarsenCoordinate(rawListing.lat, 2);
  const lng = coarsenCoordinate(rawListing.lng, 2);

  const rawImageUrls = Array.isArray(rawListing.image_urls)
    ? rawListing.image_urls
    : (typeof rawListing.image_urls === 'string' ? JSON.parse(rawListing.image_urls || '[]') : []);

  const imageUrls: string[] = rawImageUrls
    .filter((u: any) => typeof u === 'string' && u.trim() !== '');

  const rawRooms = Array.isArray(rawListing.rooms)
    ? rawListing.rooms
    : (typeof rawListing.rooms === 'string' ? JSON.parse(rawListing.rooms || '[]') : []);

  const rooms: PublicRoomTier[] = rawRooms.map(mapPublicRoomTier);

  const rawAmenities = Array.isArray(rawListing.amenities)
    ? rawListing.amenities
    : (typeof rawListing.amenities === 'string' ? JSON.parse(rawListing.amenities || '[]') : []);

  const amenities: string[] = rawAmenities
    .filter((a: any) => typeof a === 'string')
    .map((a: string) => sanitizePublicText(a))
    .filter((a: string) => a && !a.includes('[REDACTED]'));

  const imageUrl = typeof rawListing.image_url === 'string' && rawListing.image_url
    ? rawListing.image_url
    : (imageUrls[0] || '');

  return {
    id: idStr,
    slug,
    title: sanitizePublicText(rawListing.title || ''),
    type: sanitizePublicText(rawListing.type || 'Stay'),
    rental_mode: String(rawListing.rental_mode || 'entire_place'),
    price: Number(rawListing.price) || 0,
    currency: '₹',
    period: 'night',
    city,
    imageUrl,
    imageUrls,
    imageCount: (imageUrls.length > 0) ? imageUrls.length : (imageUrl ? 1 : 0),
    rooms,
    lat,
    lng,
    isVerified: false,
    hasOffers: Boolean(rawListing.has_offers || rawListing.hasOffers),
    rating: rawListing.rating != null ? Number(rawListing.rating) : 0,
    reviewCount: rawListing.review_count != null ? Number(rawListing.review_count) : (rawListing.reviewCount != null ? Number(rawListing.reviewCount) : 0),
    amenities: amenities,
    maxGuests: rawListing.max_guests != null ? Number(rawListing.max_guests) : (rawListing.maxGuests != null ? Number(rawListing.maxGuests) : undefined),
    bedrooms: rawListing.bedrooms != null ? Number(rawListing.bedrooms) : undefined,
    beds: rawListing.beds != null ? Number(rawListing.beds) : undefined,
    bathrooms: rawListing.bathrooms != null ? Number(rawListing.bathrooms) : undefined
  };
}

/**
 * Escapes strings for safe inclusion in HTML meta tags and titles.
 * Aggressively neutralizes quotes, angle brackets, ampersands, and script payloads.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
