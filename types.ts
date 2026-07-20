
export interface RoomTier {
  id: string;
  name: string; // e.g., "Standard", "Premium", "Room Only", "Breakfast + Cancel"
  price: number; // Tier price
  amenities: string[]; // Explicit amenities for this tier
}

export interface Room {
  id: string;
  name: string;
  price: number;
  capacity?: number;
  bedrooms?: number; // Added for deep search
  beds?: number; // Added for deep search
  hasAttachedBathroom?: boolean;
  hasAc?: boolean;
  amenities?: string[];
  imageUrls?: string[];
  video_url?: string;
  description?: string;
  inventory_count?: number; // Number of available units for this specific room type
  tiers?: RoomTier[]; // Pricing tiers
}

export interface Offer {
  id: number;
  title: string;
  discountPercentage: number;
}

export interface CalendarDay {
  id?: number;
  listing_id: string;
  date_string: string;
  price: number | null;
  offer_id: number | null;
  status: 'available' | 'blocked';
  offer?: Offer;
}

export interface NearbyPoint {
  name: string;
  type: 'TRANSPORT' | 'GROCERY' | 'PARK' | 'CAFE' | 'GYM';
  distance: string; // e.g., "5 min walk"
  minutes: number;
}

export interface Listing {
  created_at?: string;
  updated_at?: string;
  id: string;
  user_id?: number | string;
  host_id?: number | string;
  title: string;
  price: number;
  currency: string;
  period?: string;
  type: string;
  rental_mode?: 'entire_place' | 'private_rooms' | 'hybrid';
  rooms?: Room[];
  selectedConfigId?: string;
  displayTitle?: string;
  displayPrice?: number;
  imageUrl: string;
  imageUrls?: string[];
  video_url?: string;
  imageCount: number;
  provider?: string;
  isVerified: boolean;
  discount?: number; // percentage
  hasOffers?: boolean;
  isNew?: boolean;
  lat?: number; // For map simulation
  lng?: number; // For map simulation
  dynamicPricing?: {
    weekendMultiplier?: number;
    seasonalMultiplier?: number;
    customDates?: Record<string, number>;
  };
  originalId?: string;
  parentType?: string;
  parentTitle?: string;
  isChild?: boolean;
  rating?: number;
  reviewCount?: number;
  amenities?: string[];
  
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  seo_image_url?: string;
  
  // Detailed fields
  description?: string;
  address?: string;
  city?: string;
  size?: number; // sqft/sqm
  floor?: number;
  nearby?: NearbyPoint[];
  maxGuests?: number;
  bedrooms?: number;
  beds?: number;
  bathrooms?: number;
}

export interface SearchState {
  city: string;
  loading: boolean;
  results: Listing[];
}


export interface ItineraryItem {
  day?: number | string;
  title?: string;
  description?: string;
  [key: string]: any;
}

export interface PlaceToVisit {
  name?: string;
  description?: string;
  [key: string]: any;
}

export interface IncludedStay {
  name?: string;
  description?: string;
  [key: string]: any;
}

export interface Experience {
  id: number;
  title: string;
  description: string;
  destination: string;
  departure_location: string;
  start_date: string;
  end_date: string;
  price: number;
  total_spots: number;
  available_spots: number;
  itinerary: ItineraryItem[];
  includes: string[];
  image_urls: string[];
  target_audience?: 'all' | 'students' | 'women_only' | 'corporate' | 'couples';
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  seo_image_url?: string;
  
  host_id: number;
  status: 'upcoming' | 'sold_out' | 'completed';
  places_to_visit?: PlaceToVisit[];
  included_stay?: IncludedStay;
  highlights?: string[];
  things_to_carry?: string[];
  important_notes?: string;
  video_urls?: string[];
  excludes?: string[];
  start_time?: string;
  end_time?: string;
  language?: string;
  cancellation_policy?: string;
  map_link?: string;
  created_at?: string;
}

export interface ExperienceBooking {
  id: number;
  user_id: number;
  experience_id: number;
  num_tickets: number;
  total_price: number;
  status: string;
  payment_status: string;
  name: string;
  phone: string;
  created_at?: string;
  // joined fields
  title?: string;
  start_date?: string;
  destination?: string;
  image_urls?: string[];
  user_name?: string;
}

export interface MarketingCampaign {
  id: number;
  host_id: number;
  listing_id: number;
  title: string;
  description: string;
  video_url?: string;
  media_urls: string[];
  platforms: string[];
  budget: number;
  status: 'draft' | 'pending' | 'active' | 'rejected' | 'completed';
  admin_feedback?: string;
  created_at: string;
  approved_at?: string;
  subscription_active?: boolean;
  target_locations?: string;
  ad_format?: 'post' | 'reel' | 'carousel' | 'story';
  feed_description?: string;
  rejected_fields?: Record<string, string>;
  meta_pixel_id?: string;
  meta_capi_token?: string;
  google_conversion_id?: string;
  google_conversion_label?: string;
  pacing_mode?: 'conservative' | 'standard' | 'accelerated' | 'paused';
  accumulated_spent?: number;
  accumulated_impressions?: number;
  accumulated_clicks?: number;
  accumulated_conversions?: number;
  last_pacing_calc_at?: string;
  analytics?: {
    impressions: number;
    clicks: number;
    ctr: number;
    conversions: number;
    spent: number;
  };
  // joined fields
  listing_title?: string;
  listing_image?: string;
}

