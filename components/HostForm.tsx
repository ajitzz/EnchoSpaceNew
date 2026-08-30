import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Listing, Room, SpatialPhoto } from '../types';
import { PhotoUpload, PhotoData } from './PhotoUpload';
import { AmenitiesPicker } from './AmenitiesPicker';
import { LocationPicker } from './LocationPicker';
import { SensoryTagPicker } from './SensoryTagPicker';
import { ListingDetailsNew } from './ListingDetailsNew';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useCurrency } from './CurrencyContext';
import { motion, AnimatePresence } from 'framer-motion';
import { queueCustomMutation } from '../lib/syncService';
import { 
  Building2, Home, Trees, Tractor, Coffee, Ship, Tent, Caravan, Castle, Mountain, Box, Circle, Leaf,
  X, Sparkles, Check, Bed, Users, Trash2, Crown, Star, DoorOpen, Bath, 
  ChevronDown, ChevronUp, ChevronLeft, Globe, MapPin, Loader2, Plus, Minus,
  Eye, DollarSign, Layers, Shield, ArrowRight, Wand2, ShieldCheck,
  Monitor, Tablet, Smartphone, Maximize2, Images, Columns, LayoutDashboard
} from 'lucide-react';

interface HostFormProps {
  onBack: () => void;
  onSuccess: () => void;
  existingListing?: Listing;
}

const STEPS = [
  { id: 1, name: 'Identity',   label: 'Property Identity',       desc: 'Title, category & narrative', icon: Building2 },
  { id: 2, name: 'Location',   label: 'Location & Map',           desc: 'Address, map & nearby POIs', icon: MapPin },
  { id: 3, name: 'Rooms',      label: 'Room Types Builder',       desc: 'Accommodations & pricing', icon: Bed },
  { id: 4, name: 'Media',      label: 'Property Media',           desc: 'Photos, video & brand color', icon: Layers },
  { id: 5, name: 'Amenities',  label: 'Amenities & Safety',       desc: 'Features & structural safety', icon: Shield },
  { id: 6, name: 'Policies',   label: 'Policies & Pricing',       desc: 'Rules, pricing & stays', icon: DollarSign },
  { id: 7, name: 'SEO',        label: 'SEO & Discovery',          desc: 'Search metadata & cards', icon: Globe },
  { id: 8, name: 'Launch',     label: 'AI Pre-Flight & Launch',   desc: 'AI quality scan & publish', icon: Sparkles },
];

const PROPERTY_TYPES = [
  { id: 'Resort', label: 'Luxury Resort', desc: 'Expansive private sanctuary & estate grounds', icon: Trees, tag: 'Signature' },
  { id: 'Villa', label: 'Private Villa', desc: 'Exclusive standalone residence with private pool', icon: Home, tag: 'Popular' },
  { id: 'Apartment', label: 'Penthouse & Flat', desc: 'High-altitude panoramic urban sanctuary', icon: Building2, tag: 'City' },
  { id: 'House', label: 'Estate Manor', desc: 'Architectural compound with curated gardens', icon: Home, tag: 'Estate' },
  { id: 'Boutique', label: 'Boutique Hotel', desc: 'Curated artisanal stay with concierge service', icon: Star, tag: 'Bespoke' },
  { id: 'Cabin', label: 'Highland Cabin', desc: 'Secluded nature retreat with scenic decks', icon: Tent, tag: 'Nature' },
  { id: 'Castle', label: 'Heritage Castle', desc: 'Historic aristocratic palace & grand halls', icon: Castle, tag: 'Heritage' },
  { id: 'Dome', label: 'Geodesic Dome', desc: 'Stargazing glamping pod with luxury bedding', icon: Circle, tag: 'Unique' },
  { id: 'Earth home', label: 'Earth Home', desc: 'Subterranean eco-architecture built into nature', icon: Leaf, tag: 'Eco' },
  { id: 'Boat', label: 'Luxury Yacht', desc: 'Floating sanctuary on pristine waters', icon: Ship, tag: 'Waterfront' },
  { id: 'Campervan', label: 'Airstream & Van', desc: 'Nomadic luxury glamping experience', icon: Caravan, tag: 'Nomad' },
  { id: 'Bed & breakfast', label: 'Artisanal B&B', desc: 'Intimate hospitality with farm-to-table breakfast', icon: Coffee, tag: 'Intimate' },
  { id: 'Barn', label: 'Converted Barn', desc: 'Rustic timber cathedral with modern amenities', icon: Tractor, tag: 'Rustic' },
  { id: 'Cave', label: 'Living Cave', desc: 'Carved stone sanctuary with natural acoustics', icon: Mountain, tag: 'Ancient' },
  { id: 'Container', label: 'Modular Concept', desc: 'Modern industrial minimalist villa', icon: Box, tag: 'Modern' },
  { id: 'Hotel', label: 'Grand Hotel', desc: 'Full-service luxury hospitality institution', icon: Building2, tag: 'Grand' }
];

export const ROOM_CLASSIFICATIONS: { id: string; name: string; label: string; tier: string; icon: string; defaultSpecs: string; defaultTag: string }[] = [
  { id: 'presidential-suite',  name: 'Presidential Suite',        label: 'Presidential Suite',        tier: 'suites',    icon: '👑', defaultSpecs: 'Panoramic views · King Platform Bed · Private Jacuzzi', defaultTag: 'Most Exclusive' },
  { id: 'deluxe-double',       name: 'Deluxe Double Room',        label: 'Deluxe Double Room',        tier: 'deluxe',    icon: '🛏️', defaultSpecs: 'Garden View · Queen Bed · Spa Bath',                  defaultTag: 'Best Value'     },
  { id: 'executive-single',    name: 'Executive Single Room',     label: 'Executive Single Room',     tier: 'executive', icon: '💼', defaultSpecs: 'Valley View · Single Bed · Work Station',             defaultTag: 'Work-Friendly'  },
  { id: 'penthouse-suite',     name: 'Penthouse Suite',           label: 'Penthouse Suite',           tier: 'penthouse', icon: '🌆', defaultSpecs: 'City View · Super King Bed · Private Terrace',        defaultTag: 'Ultra-Luxury'   },
  { id: 'honeymoon-suite',     name: 'Honeymoon Suite',           label: 'Honeymoon Suite',           tier: 'honeymoon', icon: '🌺', defaultSpecs: 'Romantic Decor · King Bed · Rose Petal Setup',        defaultTag: 'Most Romantic'  },
  { id: 'family-villa',        name: 'Family Villa',              label: 'Family Villa',              tier: 'villa',     icon: '🏡', defaultSpecs: '3 Bedrooms · Private Pool · Play Area',               defaultTag: 'Family Choice'  },
  { id: 'garden-cottage',      name: 'Garden Cottage',            label: 'Garden Cottage',            tier: 'cottage',   icon: '🌿', defaultSpecs: 'Garden Access · King Bed · Open Shower',             defaultTag: 'Nature Immersed'},
  { id: 'beachfront-cabana',   name: 'Beachfront Cabana',         label: 'Beachfront Cabana',         tier: 'cabana',    icon: '🏖️', defaultSpecs: 'Direct Beach Access · King Bed · Ocean View',        defaultTag: 'Sea-front'      },
  { id: 'mountain-lodge',      name: 'Mountain Lodge',            label: 'Mountain Lodge',            tier: 'lodge',     icon: '🏔️', defaultSpecs: 'Mountain Views · Fireplace · Wooden Deck',           defaultTag: 'Highland Escape' },
  { id: 'wellness-retreat',    name: 'Wellness Retreat Room',     label: 'Wellness Retreat Room',     tier: 'wellness',  icon: '🧘', defaultSpecs: 'In-Room Yoga Space · Rain Shower · Meditation Kit',  defaultTag: 'Wellness Focus' },
  { id: 'pool-villa',          name: 'Private Pool Villa',        label: 'Private Pool Villa',        tier: 'pool-villa',icon: '🏊', defaultSpecs: 'Private Infinity Pool · King Bed · Lounge Deck',     defaultTag: 'Pool Access'    },
];

const GUIDELINE_PRESETS = [
  "Heritage Sanctity: The 200-year-old sandstone stonework is preserved with organic floral care.",
  "Aristocratic Silence: Sunset peacock hour is dedicated to acoustic tranquility.",
  "Private Culinary Protocols: Royal Thali dining is prepared exclusively on brass dinnerware.",
  "Twilight Serenity: Acoustic stillness and minimal ambient lighting observed after 10:00 PM.",
  "Footwear Sanctity: Footwear is respectfully removed prior to stepping onto living pavilion teak floors.",
  "Drone & Media Protocol: Professional aerial photography requires prior host clearance to protect discretion."
];

const CONCIERGE_PRESETS = [
  "👑 Dedicated Estate Butler & Guest Ambassador",
  "🍷 Private Sommelier & Wine Cellar Curation",
  "🚁 Helicopter & Luxury Airport Chauffeur",
  "🍽️ In-Villa Michelin-Starred Chef & Royal Thali",
  "🧘 Tailored Ayurvedic & Tibetan Sound Healing",
  "⛵ Sunset Catamaran & Private Lake Excursion"
];

export const HostForm: React.FC<HostFormProps> = ({ onBack, onSuccess, existingListing }) => {
  const { user, token } = useAuth();
  const { addToast } = useToast();
  const { currency, formatPrice } = useCurrency();

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const authToken = token || localStorage.getItem('token') || '';
    return {
      'Content-Type': 'application/json',
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
    };
  }, [token]);

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [newGuidelineInput, setNewGuidelineInput] = useState('');

  // Split Screen Live Preview State
  const [isSplitView, setIsSplitView] = useState(true);
  const [splitDevice, setSplitDevice] = useState<'mobile' | 'laptop' | 'desktop'>('laptop');
  const [splitGalleryOpen, setSplitGalleryOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: existingListing?.title || '',
    description: existingListing?.description || '',
    type: existingListing?.type || 'Resort',
    tagline: '',
    rentalMode: (existingListing as any)?.rentalMode || 'entire_place',
    address: existingListing?.address || '',
    city: existingListing?.city || '',
    lat: existingListing?.lat || 11.6854,
    lng: existingListing?.lng || 76.1320,
    nearby: existingListing?.nearby || [] as any[],
    rooms: (existingListing?.rooms && existingListing.rooms.length > 0)
      ? existingListing.rooms.map((r: any) => ({ ...r, photos: (r.photos || []) }))
      : [
          { 
            id: `room-${Date.now()}-1`, 
            name: 'Presidential Suite', 
            type: 'suites', 
            icon: '👑', 
            tag: 'Most Exclusive', 
            price: 18500, 
            capacity: 2, 
            inventory_count: 2, 
            description: 'Grand master suite featuring floor-to-ceiling glass, wraparound panoramic terrace, and private infinity jacuzzi.', 
            specs: '1,200 sq.ft · 270° Valley View · Heated Jacuzzi', 
            features: ['Private Jacuzzi', 'Valley View', 'Teak King Platform Bed', 'Rain Shower', 'Automated Curtains'], 
            amenities: ['Jacuzzi', 'WiFi', 'Mini Bar', 'Espresso Machine'], 
            photos: [] 
          },
          { 
            id: `room-${Date.now()}-2`, 
            name: 'Deluxe Double Room', 
            type: 'deluxe', 
            icon: '🛏️', 
            tag: 'Best Value', 
            price: 11500, 
            capacity: 2, 
            inventory_count: 4, 
            description: 'Spacious serene sanctuary with direct courtyard garden access and bespoke open-air stone bath.', 
            specs: '650 sq.ft · Garden Verandah · Twin Plush Beds', 
            features: ['Garden Access', 'Outdoor Stone Bath', 'Handcrafted Lounge', 'Bose Sound System'], 
            amenities: ['Garden View', 'WiFi', 'Deep Soaking Tub'], 
            photos: [] 
          }
        ],
    maxGuests: existingListing?.maxGuests || 4,
    bedrooms: existingListing?.bedrooms || 2,
    beds: existingListing?.beds || 3,
    bathrooms: existingListing?.bathrooms || 2,
    amenities: existingListing?.amenities || [
      'High-Speed Wi-Fi (1 Gbps)',
      'Temperature-Controlled Pool',
      'Private Chef Available',
      'Spa & Wellness Center',
      'Air Conditioning',
      'Dedicated EV Charger'
    ] as string[],
    amenity_clusters: existingListing?.amenity_clusters || { vibe: [], comfort: [], work: [], culinary: [] },
    child_safety_specs: existingListing?.child_safety_specs || [] as string[],
    videoUrl: existingListing?.video_url || '',
    hero_video_url: existingListing?.hero_video_url || '',
    hero_fallback_url: existingListing?.hero_fallback_url || '',
    dominant_color_hex: existingListing?.dominant_color_hex || '#0284C7',
    experience_tags: existingListing?.experience_tags || ['Ocean Waves', 'Heated Infinity Pool', 'Private Chef Available', '1 Gbps Fiber WiFi', 'Panoramic Mountain View'] as string[],
    concierge_privileges: (existingListing as any)?.concierge_privileges || 'All guests at this Encho Sanctuary receive direct access to our Walled Garden Host Concierge. Private dining experiences, sommelier cellar curation, private driver transfers, and customized wellness sessions can be coordinated seamlessly inside your Encho guest inbox.',
    host_philosophy: (existingListing as any)?.host_philosophy || 'Our design philosophy is to allow natural sunlight and acoustic stillness to heal the modern soul. Every detail here is intentional.',
    price: existingListing?.price?.toString() || '18500',
    dynamicPricing: existingListing?.dynamicPricing || { weekendMultiplier: 1.15, seasonalMultiplier: 1.25 },
    raw_rules: existingListing?.raw_rules || 'Quiet hours observed after 10 PM. No indoor smoking. Curated wellness atmosphere.',
    curated_guidelines: (() => {
      if (Array.isArray(existingListing?.curated_guidelines)) return existingListing.curated_guidelines;
      if (typeof existingListing?.curated_guidelines === 'string' && existingListing.curated_guidelines.trim()) {
        try {
          const parsed = JSON.parse(existingListing.curated_guidelines);
          if (Array.isArray(parsed)) return parsed;
        } catch {}
        return [existingListing.curated_guidelines];
      }
      return [
        "Heritage Sanctity: The 200-year-old sandstone stonework is preserved with organic floral care.",
        "Aristocratic Silence: Sunset peacock hour is dedicated to acoustic tranquility.",
        "Private Culinary Protocols: Royal Thali dining is prepared exclusively on brass dinnerware."
      ];
    })(),
    seo_title: existingListing?.seo_title || '',
    seo_description: existingListing?.seo_description || '',
    seo_keywords: existingListing?.seo_keywords || '',
    seo_image_url: existingListing?.seo_image_url || '',
  });

  // Photos State
  const [photos, setPhotos] = useState<PhotoData[]>(() => {
    const urls = existingListing?.imageUrls?.length 
      ? existingListing.imageUrls 
      : (existingListing?.imageUrl ? [existingListing.imageUrl] : []);
    
    if (urls.length > 0) {
      return urls.map((url: string, index: number) => ({
        id: `prop-photo-${index}`,
        previewUrl: url,
        tier: 'common',
        category: (index === 0 ? 'exterior' : 'pool') as any,
        title: index === 0 ? 'Sanctuary Architectural Facade' : 'Main Estate Horizon',
        description: 'Property-wide grounds & shared luxury facilities.'
      }));
    }
    return [];
  });

  const [isCuratingRules, setIsCuratingRules] = useState(false);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSuggestingPOIs, setIsSuggestingPOIs] = useState(false);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(formData.rooms[0]?.id || null);
  const [newFeatureText, setNewFeatureText] = useState<{ [roomId: string]: string }>({});
  
  // Full-screen Modal Simulator State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewInitialGallery, setPreviewInitialGallery] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'laptop' | 'tablet' | 'mobile'>('desktop');

  const openGuestPreview = useCallback((openGallery = false) => {
    setPreviewInitialGallery(openGallery);
    setIsPreviewOpen(true);
  }, []);

  // Real-time Guest View Data Compiler
  const previewListing: Listing = useMemo(() => {
    const spatialPhotos: SpatialPhoto[] = [
      ...photos.map(p => ({
        id: p.id,
        url: p.previewUrl,
        tier: p.tier || 'common',
        category: (p.category as any) || 'exterior',
        categoryLabel: (p as any).categoryLabel || '',
        title: p.title || '',
        description: p.description || '',
        specs: p.specs || '',
        isHero: (p as any).isHero || false,
      })),
      ...formData.rooms.flatMap((r: any) =>
        (r.photos || []).map((rp: any) => ({
          id: rp.id,
          url: rp.previewUrl || rp.url,
          tier: r.type || 'suites',
          category: (rp.category as any) || 'bedroom',
          categoryLabel: (rp as any).categoryLabel || '',
          title: rp.title || r.name || '',
          description: rp.description || '',
          specs: rp.specs || '',
          isHero: (rp as any).isHero || false,
        }))
      ),
    ];

    const fallbackPhotos: SpatialPhoto[] = spatialPhotos.length > 0 ? spatialPhotos : [
      {
        id: 'fallback-1',
        url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1600&q=80',
        tier: 'suites',
        category: 'exterior',
        title: 'Main Sanctuary Vista',
        description: 'Architectural facade overlooking private infinity terraces.',
        isHero: true
      },
      {
        id: 'fallback-2',
        url: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80',
        tier: 'suites',
        category: 'pool',
        title: 'Heated Infinity Horizon',
        description: 'Temperature-controlled lap pool with panoramic mountain views.'
      },
      {
        id: 'fallback-3',
        url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
        tier: 'deluxe',
        category: 'living_room',
        title: 'Minimalist Pavilions',
        description: 'Sunken living spaces finished with teakwood and brushed stone.'
      },
      {
        id: 'fallback-4',
        url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
        tier: 'deluxe',
        category: 'bedroom',
        title: 'Presidential Master Suite',
        description: 'Custom king platform bed with floor-to-ceiling panoramic glass.'
      },
      {
        id: 'fallback-5',
        url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80',
        tier: 'executive',
        category: 'exterior',
        title: 'Courtyard & Grounds',
        description: 'Manicured tropical gardens and reflective water features.'
      }
    ];

    const allImageUrls = fallbackPhotos.map(p => p.url);

    const compiledRooms: Room[] = formData.rooms.map((r: any, idx: number) => {
      const roomTier = r.type || (idx === 0 ? 'suites' : idx === 1 ? 'deluxe' : 'executive');
      const roomPhotos = (r.photos && r.photos.length > 0)
        ? r.photos.map((rp: any) => rp.previewUrl || rp.url)
        : allImageUrls.slice(0, 3);

      return {
        id: r.id || `room-${idx}`,
        name: r.name || `Luxury Suite #${idx + 1}`,
        type: roomTier,
        icon: r.icon || '👑',
        tag: r.tag || (idx === 0 ? 'Most Popular' : 'Recommended'),
        price: Number(r.price) || (idx === 0 ? 18500 : 11500),
        capacity: Number(r.capacity) || 2,
        inventory_count: Number(r.inventory_count) || 1,
        description: r.description || 'Curated luxury accommodations with expansive views and bespoke private services.',
        specs: r.specs || '1,200 sq.ft · 270° Valley View · Heated Jacuzzi',
        features: Array.isArray(r.features) && r.features.length > 0 ? r.features : ['Private Terrace', 'Soaking Tub', 'Dedicated Butler'],
        amenities: Array.isArray(r.amenities) && r.amenities.length > 0 ? r.amenities : ['WiFi', 'Air Conditioning', 'Espresso Machine'],
        photos: (r.photos || []).map((rp: any) => ({
          id: rp.id,
          url: rp.previewUrl || rp.url,
          tier: roomTier,
          category: (rp.category as any) || 'bedroom',
          categoryLabel: (rp as any).categoryLabel || '',
          title: rp.title || r.name,
          description: rp.description || '',
          specs: rp.specs || '',
          isHero: (rp as any).isHero || false
        })),
        imageUrls: roomPhotos
      };
    });

    const basePrice = compiledRooms.length > 0 ? compiledRooms[0].price : (Number(formData.price) || 18500);

    return {
      id: existingListing?.id || 'live-preview-sanctuary',
      title: formData.title.trim() || 'Aman Sanctuary Estate · Sovereign Highland Retreat',
      description: formData.description.trim() || 'Perched above pristine mist-laden valleys, this architectural masterpiece represents the absolute pinnacle of contemporary stillness. Designed with intentional spatial acoustics, floor-to-ceiling panoramic glass, and private heated infinity pavilions.',
      type: formData.type || 'Resort',
      address: formData.address.trim() || 'Ridge Horizon Estate, Valley Road',
      city: formData.city.trim() || 'Wayanad, Kerala',
      lat: formData.lat || 11.6854,
      lng: formData.lng || 76.1320,
      price: basePrice,
      currency: (currency as any) || 'INR',
      rating: 4.98,
      reviewsCount: 48,
      provider: user?.name || 'Encho Verified Host',
      imageUrl: allImageUrls[0],
      imageUrls: allImageUrls,
      photos: fallbackPhotos,
      imageCount: fallbackPhotos.length,
      isVerified: true,
      rooms: compiledRooms,
      rental_mode: (formData.rentalMode as any) || 'entire_place',
      maxGuests: formData.maxGuests || 4,
      bedrooms: formData.bedrooms || 2,
      beds: formData.beds || 3,
      bathrooms: formData.bathrooms || 2,
      amenities: formData.amenities.length > 0 ? formData.amenities : ['Heated Pool', 'Private Chef', '1 Gbps WiFi', 'Air Conditioning', 'Free Parking', 'Spa'],
      experience_tags: formData.experience_tags.length > 0 ? formData.experience_tags : ['Ocean Waves', 'Heated Infinity Pool', 'Private Chef Available', '1 Gbps Fiber WiFi', 'Panoramic Mountain View'],
      concierge_privileges: formData.concierge_privileges || 'All guests receive dedicated access to our 24/7 Host Concierge for private cellar tastings, driver transfers, and in-villa wellness treatments.',
      host_philosophy: formData.host_philosophy || 'Our design philosophy is to allow natural sunlight and acoustic stillness to heal the modern soul. Every detail here is intentional.',
      raw_rules: formData.raw_rules || 'Quiet hours after twilight. No smoking indoors.',
      curated_guidelines: formData.curated_guidelines || 'We invite guests to embrace the tranquil atmosphere of the estate, observing quiet serenity after twilight.',
      child_safety_specs: formData.child_safety_specs || [],
      dominant_color_hex: formData.dominant_color_hex || '#0284C7',
      hero_video_url: formData.hero_video_url || formData.videoUrl || '',
      hero_fallback_url: formData.hero_fallback_url || allImageUrls[0],
      video_url: formData.videoUrl || '',
      nearby: formData.nearby && formData.nearby.length > 0 ? formData.nearby : [
        { name: 'Chembra Sovereign Peak', distance: '2.4 km', type: 'nature', description: 'Highest mountain peak with heart-shaped natural lake' },
        { name: 'Meenmutty Cascades', distance: '5.1 km', type: 'nature', description: 'Three-tiered pristine waterfalls' },
        { name: 'Banasura Sagar Dam', distance: '8.7 km', type: 'attraction', description: 'Largest earthen dam in India with island vistas' }
      ],
      dynamicPricing: formData.dynamicPricing || { weekendMultiplier: 1.15, seasonalMultiplier: 1.25 },
      seo_title: formData.seo_title || formData.title,
      seo_description: formData.seo_description || formData.description,
      seo_keywords: formData.seo_keywords || 'luxury villa, private sanctuary, infinity pool, wellness estate',
      seo_image_url: formData.seo_image_url || allImageUrls[0]
    };
  }, [formData, photos, user, currency, existingListing]);

  // Upload helpers with hardened Auth headers and non-blocking base64 resilience
  const uploadPhotoFile = async (file: File): Promise<string> => {
    const headers = getAuthHeaders();
    try {
      const res = await fetch('/api/upload-url', {
        method: 'POST',
        headers,
        body: JSON.stringify({ filename: file.name, contentType: file.type })
      });
      if (res.ok) {
        const data = await res.json();
        const uploadUrl = data.uploadUrl;
        const publicUrl = data.publicUrl || data.fileUrl;
        if (uploadUrl && publicUrl) {
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file
          });
          if (uploadRes.ok) return publicUrl;
        }
      }
    } catch (s3Err) {
      console.warn('[PHOTO UPLOAD] S3 presigned route unavailable, trying server base64 fallback:', s3Err);
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    try {
      const res2 = await fetch('/api/upload-base64', {
        method: 'POST',
        headers,
        body: JSON.stringify({ base64, base64Data: base64, filename: file.name, contentType: file.type })
      });
      if (res2.ok) {
        const data = await res2.json();
        if (data.url || data.publicUrl) return data.url || data.publicUrl;
      }
    } catch (b64Err) {
      console.warn('[PHOTO UPLOAD] Base64 upload route unavailable, using inline base64 URI:', b64Err);
    }

    // Always return the valid base64 URI so unauthenticated or transient upload failures never break publishing
    return base64;
  };

  const resolveAndUploadPhoto = async (photo: PhotoData): Promise<string> => {
    if (photo.file) return await uploadPhotoFile(photo.file);
    return photo.previewUrl;
  };

  // AI Curate Rules
  const handleCurateRules = async () => {
    setIsCuratingRules(true);
    try {
      const res = await fetch('/api/ai/curate-rules', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ raw_rules: formData.raw_rules || 'Quiet hours at night. No smoking indoors. Pool safety.', property_type: formData.type })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.curated_guidelines) {
          const lines = Array.isArray(data.curated_guidelines) 
            ? data.curated_guidelines 
            : (typeof data.curated_guidelines === 'string' ? data.curated_guidelines.split('\n').filter(Boolean) : []);
          if (lines.length > 0) {
            setFormData(prev => ({ ...prev, curated_guidelines: lines }));
            addToast('Rules Curated (10/10)', 'Point-by-point Aristocratic Hospitality Guidelines crafted!', 'success');
            return;
          }
        }
      }
    } catch {}

    setFormData(prev => ({
      ...prev,
      curated_guidelines: [
        "Heritage Sanctity: The sandstone stonework and artisan woodwork are preserved with natural organic care.",
        "Aristocratic Silence: Sunset and twilight hours are dedicated to acoustic tranquility across all pavilions.",
        "Private Culinary Protocols: Gourmet dining and private cellar service prepared exclusively to host specifications."
      ]
    }));
    addToast('Guidelines Formatted', 'Populated point-by-point Aristocratic Hospitality Guidelines.', 'success');
    setIsCuratingRules(false);
  };

  const addGuidelinePoint = (text?: string) => {
    const toAdd = (text || newGuidelineInput).trim();
    if (!toAdd) return;
    setFormData(prev => {
      const current = Array.isArray(prev.curated_guidelines) ? prev.curated_guidelines : [prev.curated_guidelines];
      return { ...prev, curated_guidelines: [...current, toAdd] };
    });
    setNewGuidelineInput('');
    addToast('Point Added', 'Added new Aristocratic Guideline.', 'success');
  };

  const removeGuidelinePoint = (idx: number) => {
    setFormData(prev => {
      const current = Array.isArray(prev.curated_guidelines) ? prev.curated_guidelines : [prev.curated_guidelines];
      return { ...prev, curated_guidelines: current.filter((_, i) => i !== idx) };
    });
  };

  const updateGuidelinePoint = (idx: number, val: string) => {
    setFormData(prev => {
      const current = Array.isArray(prev.curated_guidelines) ? [...prev.curated_guidelines] : [prev.curated_guidelines];
      current[idx] = val;
      return { ...prev, curated_guidelines: current };
    });
  };

  const appendConciergeService = (service: string) => {
    setFormData(prev => {
      const cleanService = service.replace(/^[^\w\s]+/, '').trim();
      const existing = prev.concierge_privileges || '';
      if (existing.toLowerCase().includes(cleanService.toLowerCase())) return prev;
      const separator = existing.trim() ? ' ' : '';
      return {
        ...prev,
        concierge_privileges: `${existing.trim()}${separator}Guests enjoy complimentary access to ${cleanService}.`
      };
    });
    addToast('Privilege Added', `Included: ${service}`, 'success');
  };

  // AI Suggest POIs
  const suggestNearbyPOIs = async () => {
    if (!formData.city) {
      addToast('City Required', 'Please set the property city in Step 2 first.', 'info');
      return;
    }
    setIsSuggestingPOIs(true);
    try {
      const res = await fetch('/api/ai/nearby-pois', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          lat: formData.lat,
          lng: formData.lng,
          city: formData.city,
          propertyType: formData.type
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pois && data.pois.length > 0) {
          setFormData(prev => ({
            ...prev,
            nearby: [...prev.nearby, ...data.pois]
          }));
          addToast('Nearby POIs Generated', `Added ${data.pois.length} high-intent attraction points!`, 'success');
          return;
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsSuggestingPOIs(false);
    }

    setFormData(prev => ({
      ...prev,
      nearby: [
        ...prev.nearby,
        { name: `${prev.city} Mountain Crest & Viewpoint`, distance: '3.2 km', type: 'nature', description: 'Scenic vantage point overlooking mist valleys.' },
        { name: 'The Artisanal Cellar & Dining', distance: '1.8 km', type: 'dining', description: 'Organic farm-to-table culinary pavilion.' }
      ]
    }));
    addToast('POIs Added', 'Populated recommended destination highlights.', 'success');
  };

  // Run AI Pre-Flight Scan
  const runAiPreFlightCheck = async () => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/ai/evaluate-listing', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          photos: previewListing.photos,
          rooms: formData.rooms,
          amenities: formData.amenities,
          price: formData.rooms[0]?.price || formData.price,
          city: formData.city
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiScore(data.score);
        setAiResult(data);
        if (data.cleared) {
          addToast('AI Gatekeeper: Cleared (10/10)', data.headline || 'Listing verified for paid ad engines and guest booking!', 'success');
        } else {
          addToast('AI Gatekeeper: Needs Polish', data.headline || 'Please review required optimizations.', 'info');
        }
        return;
      }
    } catch {
      // Fallback
    } finally {
      setIsScanning(false);
    }

    const hasPhotos = (photos.length + formData.rooms.reduce((acc, r) => acc + (r.photos?.length || 0), 0)) >= 3;
    const hasRooms = formData.rooms.length > 0 && formData.rooms.every((r: any) => r.name && r.price > 0);
    const hasTitle = formData.title.length >= 15;
    const calculatedScore = (hasPhotos && hasRooms && hasTitle) ? 9.4 : 7.2;

    setAiScore(calculatedScore);
    setAiResult({
      score: calculatedScore,
      cleared: calculatedScore >= 8.0,
      headline: calculatedScore >= 8.0 ? 'Exceeds Aman Luxury Standards — Ready for Global Guests' : 'Listing needs additional photography and specs before ad launch',
      strengths: ['Curated Room Subunits', 'Aman Sensory Atmosphere Deck', 'Verified Spatial Categorization'],
      issues: calculatedScore < 8.0 ? ['Upload at least 3 high-resolution spatial photos', 'Provide detailed room descriptions'] : []
    });
  };

  // Step Validation
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1: return formData.title.trim().length >= 10 && formData.type.length > 0;
      case 2: return formData.city.trim().length > 0;
      case 3: return formData.rooms.some((r: any) => r.name.trim().length > 0 && r.price > 0);
      case 4: return true;
      case 5: return true;
      case 6: return true;
      case 7: return true;
      case 8: return true;
      default: return true;
    }
  };

  const handleNextStep = () => {
    if (!validateStep(currentStep)) {
      if (currentStep === 1) addToast('Missing Details', 'Please provide a descriptive title (min 10 characters) and property type.', 'error');
      if (currentStep === 2) addToast('Location Required', 'Please set the property city/destination.', 'error');
      if (currentStep === 3) addToast('Rooms Required', 'Please ensure at least one room classification has a valid nightly rate.', 'error');
      return;
    }
    if (currentStep < 8) setCurrentStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const uploadedPhotos: SpatialPhoto[] = [];
      const uploadedImageUrls: string[] = [];

      for (const p of photos) {
        const url = await resolveAndUploadPhoto(p);
        uploadedPhotos.push({
          id: p.id,
          url,
          tier: 'common',
          category: (p.category as any) || 'exterior',
          title: p.title || 'Sanctuary Common Grounds',
          description: p.description || '',
          specs: p.specs || '',
          isHero: (p as any).isHero || false
        });
        uploadedImageUrls.push(url);
      }

      const processedRooms: any[] = [];
      for (const room of formData.rooms) {
        const roomUploadedPhotos: SpatialPhoto[] = [];
        const roomImageUrls: string[] = [];

        for (const rp of (room.photos || [])) {
          const url = await resolveAndUploadPhoto(rp);
          const spPhoto: SpatialPhoto = {
            id: rp.id,
            url,
            tier: room.type || 'suites',
            category: (rp.category as any) || 'bedroom',
            title: rp.title || room.name,
            description: rp.description || '',
            specs: rp.specs || '',
            isHero: (rp as any).isHero || false
          };
          roomUploadedPhotos.push(spPhoto);
          uploadedPhotos.push(spPhoto);
          roomImageUrls.push(url);
          uploadedImageUrls.push(url);
        }

        processedRooms.push({
          id: room.id,
          name: room.name,
          type: room.type,
          icon: room.icon || '🛏️',
          tag: room.tag || '',
          price: Number(room.price) || 0,
          capacity: Number(room.capacity) || 2,
          inventory_count: Number(room.inventory_count) || 1,
          description: room.description || '',
          specs: room.specs || '',
          features: room.features || [],
          amenities: room.amenities || [],
          photos: roomUploadedPhotos,
          imageUrls: roomImageUrls
        });
      }

      const primaryImageUrl = uploadedImageUrls[0] || 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1600&q=80';
      const basePrice = processedRooms.length > 0 ? processedRooms[0].price : parseFloat(formData.price);

      const payload = {
        title: formData.title,
        description: formData.description,
        price: basePrice,
        type: formData.type,
        address: formData.address,
        city: formData.city,
        imageUrl: primaryImageUrl,
        imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : [primaryImageUrl],
        photos: uploadedPhotos,
        videoUrl: formData.videoUrl,
        rentalMode: formData.rentalMode,
        rooms: processedRooms,
        maxGuests: Number(formData.maxGuests),
        bedrooms: Number(formData.bedrooms),
        beds: Number(formData.beds),
        bathrooms: Number(formData.bathrooms),
        amenities: formData.amenities,
        lat: formData.lat,
        lng: formData.lng,
        dynamicPricing: formData.dynamicPricing,
        amenity_clusters: formData.amenity_clusters,
        child_safety_specs: formData.child_safety_specs,
        nearby: formData.nearby,
        hero_video_url: formData.hero_video_url,
        hero_fallback_url: formData.hero_fallback_url || primaryImageUrl,
        dominant_color_hex: formData.dominant_color_hex,
        raw_rules: formData.raw_rules,
        curated_guidelines: Array.isArray(formData.curated_guidelines) ? JSON.stringify(formData.curated_guidelines) : formData.curated_guidelines,
        experience_tags: formData.experience_tags,
        concierge_privileges: formData.concierge_privileges,
        host_philosophy: formData.host_philosophy,
        seo_title: formData.seo_title || formData.title,
        seo_description: formData.seo_description || formData.description,
        seo_keywords: formData.seo_keywords,
        seo_image_url: formData.seo_image_url || primaryImageUrl,
        draftId: existingListing?.id,
        published_listing_id: existingListing?.id
      };

      let responseListingId: number | string | undefined = existingListing?.id;

      if (existingListing?.id) {
        // Update existing listing live
        const res = await fetch(`/api/listings/${existingListing.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `Listing update failed (status ${res.status})`);
        }
        // Background sync to drafts table
        fetch('/api/listings/draft', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ...payload, status: 'PUBLISHED', published_listing_id: existingListing.id })
        }).catch(() => {});
      } else {
        // Publish new listing directly to live listings catalogue
        const res = await fetch('/api/listings', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `Listing publication failed (status ${res.status})`);
        }
        const createdListing = await res.json();
        responseListingId = createdListing.id;
        // Background sync to drafts table
        fetch('/api/listings/draft', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ...payload, status: 'PUBLISHED', published_listing_id: createdListing.id })
        }).catch(() => {});
      }

      queueCustomMutation('CREATE_OR_UPDATE_LISTING', { ...payload, id: responseListingId });
      setSubmitted(true);
      addToast('Listing Published Live (10/10)', 'Your architectural sanctuary is now immediately live for global guests on Encho!', 'success');
      setTimeout(() => onSuccess(), 1600);
    } catch (err: any) {
      addToast('Submission Error', err.message || 'Failed to publish listing', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Room Helpers
  const addRoom = () => {
    const defaultClassification = ROOM_CLASSIFICATIONS[formData.rooms.length % ROOM_CLASSIFICATIONS.length];
    const newRoom = {
      id: `room-${Date.now()}`,
      name: defaultClassification.name,
      type: defaultClassification.tier,
      icon: defaultClassification.icon,
      tag: defaultClassification.defaultTag,
      price: 15000,
      capacity: 2,
      inventory_count: 1,
      description: '',
      specs: defaultClassification.defaultSpecs,
      features: ['Panoramic View', 'King Platform Bed', 'Rain Shower'],
      amenities: ['WiFi', 'Air Conditioning'],
      photos: []
    };
    setFormData(prev => ({ ...prev, rooms: [...prev.rooms, newRoom] }));
    setExpandedRoomId(newRoom.id);
  };

  const removeRoom = (id: string) => {
    if (formData.rooms.length <= 1) {
      addToast('Action Disallowed', 'A luxury property must maintain at least one room classification.', 'info');
      return;
    }
    setFormData(prev => ({ ...prev, rooms: prev.rooms.filter((r: any) => r.id !== id) }));
  };

  const updateRoom = (id: string, key: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      rooms: prev.rooms.map((r: any) => r.id === id ? { ...r, [key]: value } : r)
    }));
  };

  const addRoomFeature = (roomId: string) => {
    const text = newFeatureText[roomId]?.trim();
    if (!text) return;
    setFormData(prev => ({
      ...prev,
      rooms: prev.rooms.map((r: any) => r.id === roomId ? {
        ...r,
        features: [...(r.features || []), text]
      } : r)
    }));
    setNewFeatureText(prev => ({ ...prev, [roomId]: '' }));
  };

  const removeRoomFeature = (roomId: string, featIdx: number) => {
    setFormData(prev => ({
      ...prev,
      rooms: prev.rooms.map((r: any) => r.id === roomId ? {
        ...r,
        features: (r.features || []).filter((_: any, i: number) => i !== featIdx)
      } : r)
    }));
  };

  // Step Content Renderer
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-8 animate-in fade-in duration-300 w-full min-w-0">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Step 01 · Foundational Identity
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight font-display">Define Your Architectural Sanctuary</h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-1.5 leading-relaxed">Establish the luxury narrative, architectural classification, and hospitality signature of your estate.</p>
            </div>

            {/* Listing Headline & Title */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">Listing Headline & Title *</label>
                <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${
                  formData.title.length < 20 
                    ? 'text-amber-300 bg-amber-950/40 border-amber-500/30' 
                    : 'text-emerald-300 bg-emerald-950/40 border-emerald-500/30'
                }`}>
                  {formData.title.length}/100 chars {formData.title.length >= 20 ? '✓ Optimal' : '(min 20)'}
                </span>
              </div>
              <input 
                type="text" 
                maxLength={100}
                className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7] transition-all text-sm sm:text-base font-semibold shadow-inner min-w-0"
                value={formData.title} 
                onChange={e => setFormData({...formData, title: e.target.value})} 
                placeholder="e.g. Cloud Valley Sovereign Estate & Spa Sanctuary" 
              />
              <p className="text-xs text-slate-500">Live preview updates instantaneously as you type.</p>
            </div>

            {/* Architectural Category Grid */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-200">Architectural Category *</label>
                  <p className="text-xs text-slate-500 mt-0.5">Select the primary structural and spatial typology.</p>
                </div>
                <span className="text-[11px] font-mono font-bold text-sky-400 bg-sky-950/60 border border-sky-500/30 px-2.5 py-1 rounded-full">
                  Selected: {formData.type}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 w-full min-w-0">
                {PROPERTY_TYPES.map(pt => {
                  const isSelected = formData.type === pt.id;
                  const IconComponent = pt.icon;
                  return (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() => setFormData({...formData, type: pt.id})}
                      className={`relative p-3.5 sm:p-4 rounded-2xl border text-left flex flex-col justify-between gap-2.5 transition-all cursor-pointer group min-w-0 ${
                        isSelected 
                          ? 'border-[#0284C7] bg-gradient-to-b from-[#0284C7]/25 via-[#0F172A] to-[#0A0F1D] text-white ring-2 ring-[#0284C7]/50 shadow-[0_0_20px_rgba(2,132,199,0.3)] scale-[1.01]' 
                          : 'border-slate-800/80 bg-[#121927]/80 hover:bg-[#182235] hover:border-slate-600 text-slate-300 hover:text-white shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                          isSelected 
                            ? 'bg-[#0284C7] text-white shadow-md shadow-sky-900/60' 
                            : 'bg-slate-800/70 border border-slate-700/60 text-slate-400 group-hover:text-sky-400 group-hover:border-sky-500/40 group-hover:bg-sky-500/10'
                        }`}>
                          <IconComponent className="w-4 h-4" />
                        </div>
                        {isSelected ? (
                          <span className="w-4 h-4 rounded-full bg-[#0284C7] text-white flex items-center justify-center text-[9px] font-black">✓</span>
                        ) : (
                          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">{pt.tag}</span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <span className="text-xs sm:text-sm font-bold tracking-tight block text-white truncate">{pt.label}</span>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5 line-clamp-1">{pt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rental Structure Mode */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">Rental Structure Mode</label>
                <p className="text-xs text-slate-500 mt-0.5">Determine how guests book accommodations across your estate.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full min-w-0">
                {[
                  { 
                    id: 'entire_place', 
                    label: 'Entire Place Buyout', 
                    desc: 'Guests reserve the whole property & grounds exclusively with 100% privacy.',
                    icon: Building2,
                    tag: 'Exclusive'
                  },
                  { 
                    id: 'private_rooms', 
                    label: 'Private Subunit Suites', 
                    desc: 'Guests book individual room types with access to shared grounds & amenities.',
                    icon: DoorOpen,
                    tag: 'Per Room'
                  },
                  { 
                    id: 'hybrid', 
                    label: 'Hybrid Sovereign Estate', 
                    desc: 'Flexibly supports both complete estate buyouts and individual suite reservations.',
                    icon: Crown,
                    tag: 'Most Flexible'
                  }
                ].map(mode => {
                  const isSelected = formData.rentalMode === mode.id;
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setFormData({...formData, rentalMode: mode.id as any})}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 min-w-0 ${
                        isSelected
                          ? 'border-[#0284C7] bg-[#0284C7]/15 text-white ring-2 ring-[#0284C7]/40 shadow-lg shadow-[#0284C7]/20'
                          : 'border-slate-800/80 bg-[#121927]/80 hover:bg-[#182235] hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isSelected ? 'bg-[#0284C7] text-white' : 'bg-slate-800 text-slate-400'}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${isSelected ? 'bg-sky-500/30 text-sky-200 border border-sky-400/40' : 'bg-slate-800 text-slate-400'}`}>
                          {mode.tag}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs sm:text-sm text-white truncate">{mode.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{mode.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* About The Sanctuary (Primary Narrative) */}
            <div className="space-y-2.5 pt-1">
              <div className="flex justify-between items-center">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-200">About The Sanctuary (Narrative) *</label>
                  <p className="text-xs text-slate-500">Paint a vivid sensory description of this estate's architectural and natural setting.</p>
                </div>
                <span className="text-xs text-slate-400 font-mono font-bold">{formData.description.length} chars</span>
              </div>
              <textarea 
                className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl p-4 sm:p-5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7] transition-all text-xs sm:text-sm leading-relaxed h-32 font-normal resize-none shadow-inner min-w-0"
                value={formData.description} 
                onChange={e => setFormData({...formData, description: e.target.value})} 
                placeholder="Perched on a dramatic ridgeline overlooking misty tea valleys, this architectural sanctuary merges minimalist stone pavilions with lush indigenous flora..."
              />
            </div>

            {/* Host Philosophy & Signature Message */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-200">Host Philosophy & Signature Message</label>
                  <p className="text-xs text-slate-500">This quote appears in the verified Host section on your listing.</p>
                </div>
                <span className="text-xs text-slate-400 font-mono font-bold">{formData.host_philosophy.length} chars</span>
              </div>
              <textarea 
                className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl p-4 sm:p-5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7] transition-all text-xs sm:text-sm leading-relaxed h-24 font-medium italic resize-none shadow-inner min-w-0"
                value={formData.host_philosophy} 
                onChange={e => setFormData({...formData, host_philosophy: e.target.value})} 
                placeholder="e.g. Our design philosophy is to allow natural sunlight and acoustic stillness to heal the modern soul. Every detail here is intentional."
              />
            </div>

            {/* Sensory Atmosphere Deck (Tags) */}
            <SensoryTagPicker
              selectedTags={formData.experience_tags}
              onChange={(tags) => setFormData({ ...formData, experience_tags: tags })}
              listingTitle={formData.title}
              listingDescription={formData.description}
              listingType={formData.type}
              listingLocation={formData.city}
            />
          </div>
        );

      case 2:
        return (
          <div className="space-y-8 animate-in fade-in duration-300 w-full min-w-0">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <MapPin className="w-3.5 h-3.5" />
                Step 02 · Spatial Coordinates & Radar
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight font-display">Location & Surroundings</h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-1.5 leading-relaxed">Pinpoint the exact spatial coordinates and curate high-intent neighborhood attractions.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full min-w-0">
              <div className="space-y-2 min-w-0">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">Street / Estate Address</label>
                <input 
                  type="text" 
                  className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl px-4 py-3.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7] text-xs sm:text-sm font-medium min-w-0"
                  value={formData.address} 
                  onChange={e => setFormData({...formData, address: e.target.value})} 
                  placeholder="e.g. Ridge Road, Valley Sanctuary Estate"
                />
              </div>
              <div className="space-y-2 min-w-0">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">City / Destination *</label>
                <input 
                  type="text" 
                  className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl px-4 py-3.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7] text-xs sm:text-sm font-medium min-w-0"
                  value={formData.city} 
                  onChange={e => setFormData({...formData, city: e.target.value})} 
                  placeholder="e.g. Wayanad, Kerala"
                />
              </div>
            </div>

            <div className="space-y-3 w-full min-w-0">
              <label className="text-xs font-black uppercase tracking-wider text-slate-200">Interactive Map Pin Location</label>
              <div className="rounded-3xl overflow-hidden border border-slate-800/80 bg-[#101726] p-2 shadow-2xl w-full">
                <LocationPicker 
                  address={formData.address}
                  city={formData.city}
                  onChange={(updates) => setFormData(prev => ({ 
                    ...prev, 
                    address: updates.address || prev.address,
                    city: updates.city || prev.city,
                    lat: updates.lat !== undefined ? updates.lat : prev.lat,
                    lng: updates.lng !== undefined ? updates.lng : prev.lng
                  }))} 
                />
              </div>
              <div className="flex gap-4 text-xs font-mono text-slate-400 bg-slate-900/60 border border-slate-800 px-4 py-2 rounded-xl">
                <span>LAT: <strong className="text-sky-400 font-bold">{formData.lat.toFixed(4)}</strong></span>
                <span>LNG: <strong className="text-sky-400 font-bold">{formData.lng.toFixed(4)}</strong></span>
              </div>
            </div>

            <div className="space-y-4 pt-3 border-t border-slate-800 w-full min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-200">Curated Neighborhood Highlights</label>
                  <p className="text-xs text-slate-500 mt-0.5">Points of interest shown to prospective guests on the spatial radar map.</p>
                </div>
                <button 
                  type="button" 
                  disabled={isSuggestingPOIs}
                  onClick={suggestNearbyPOIs} 
                  className="px-4 py-2 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/40 hover:bg-purple-600/30 text-purple-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-purple-950/40 shrink-0"
                >
                  {isSuggestingPOIs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
                  <span>{isSuggestingPOIs ? 'Generating Radar...' : 'AI Suggest POIs'}</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {formData.nearby.map((poi: any, i: number) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center bg-[#101726]/90 p-3 rounded-2xl border border-slate-800/80 shadow-sm min-w-0">
                    <span className="text-xl shrink-0 self-center">📍</span>
                    <input 
                      type="text" 
                      className="bg-[#090D16] border border-slate-700/80 rounded-xl px-3.5 py-2 text-white text-xs font-semibold flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                      value={poi.name || ''} 
                      placeholder="Attraction Name (e.g. Chembra Peak)"
                      onChange={e => {
                        const newNearby = [...formData.nearby];
                        newNearby[i] = { ...poi, name: e.target.value };
                        setFormData({...formData, nearby: newNearby});
                      }} 
                    />
                    <input 
                      type="text" 
                      className="bg-[#090D16] border border-slate-700/80 rounded-xl px-3.5 py-2 text-white text-xs font-medium w-full sm:w-32 min-w-0 focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                      value={poi.distance || ''} 
                      placeholder="Distance (e.g. 3.2 km)"
                      onChange={e => {
                        const newNearby = [...formData.nearby];
                        newNearby[i] = { ...poi, distance: e.target.value };
                        setFormData({...formData, nearby: newNearby});
                      }} 
                    />
                    <button 
                      type="button" 
                      onClick={() => setFormData({...formData, nearby: formData.nearby.filter((_, idx) => idx !== i)})}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors self-center cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                ))}

                <button 
                  type="button" 
                  onClick={() => setFormData({...formData, nearby: [...formData.nearby, { name: '', distance: '', type: 'attraction' }]})}
                  className="w-full py-3.5 border-2 border-dashed border-slate-800 hover:border-[#0284C7] bg-[#101726]/40 hover:bg-[#101726] rounded-2xl text-slate-400 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4"/> Add Neighborhood Point of Interest
                </button>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-8 animate-in fade-in duration-300 w-full min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                  <Bed className="w-3.5 h-3.5" />
                  Step 03 · Accommodations & Subunits
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight font-display">Room Classification Builder</h2>
                <p className="text-slate-400 text-xs sm:text-sm mt-1.5 leading-relaxed">Select from Encho's curated room classifications, set individual rates, and upload per-room spatial media.</p>
              </div>
              <button
                type="button"
                onClick={() => openGuestPreview(true)}
                className="shrink-0 px-3.5 py-2 bg-gradient-to-r from-sky-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 border border-sky-500/40 text-sky-200 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-sky-950/40"
              >
                <Images className="w-3.5 h-3.5 text-sky-400" />
                <span>Spatial Gallery</span>
              </button>
            </div>

            <div className="space-y-4">
              {formData.rooms.map((room: any, rIdx: number) => {
                const isExpanded = expandedRoomId === room.id;
                return (
                  <div key={room.id} className="border border-slate-800/90 rounded-3xl bg-[#101726]/90 overflow-hidden shadow-xl w-full min-w-0">
                    <div 
                      className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-[#182235] transition-colors select-none min-w-0"
                      onClick={() => setExpandedRoomId(isExpanded ? null : room.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-xl shrink-0">
                          {room.icon || '🛏️'}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-extrabold text-sm sm:text-base text-white font-display truncate">{room.name || `Room Type #${rIdx + 1}`}</h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {room.type && (
                              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#0284C7] bg-[#0284C7]/15 px-2 py-0.5 rounded-full border border-[#0284C7]/30">
                                {room.type}
                              </span>
                            )}
                            <span className="text-xs text-slate-400 font-mono font-semibold truncate">
                              {formatPrice(room.price || 0, 'INR')}/night · {room.capacity || 2} guests
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        {formData.rooms.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeRoom(room.id); }}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                            title="Delete Room"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <div className="w-7 h-7 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-white"/> : <ChevronDown className="w-3.5 h-3.5"/>}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 sm:p-6 border-t border-slate-800 bg-[#090D16]/90 space-y-5 animate-in fade-in duration-200 w-full min-w-0">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-200">Select Fixed Room Classification *</label>
                            <span className="text-[10px] text-sky-400 font-mono font-bold bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded-full">
                              🔒 Aman Standard
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full min-w-0">
                            {ROOM_CLASSIFICATIONS.map(cls => {
                              const isSelected = room.name === cls.name;
                              return (
                                <button
                                  key={cls.id}
                                  type="button"
                                  onClick={() => {
                                    updateRoom(room.id, 'name', cls.name);
                                    updateRoom(room.id, 'type', cls.tier);
                                    updateRoom(room.id, 'icon', cls.icon);
                                    if (!room.tag) updateRoom(room.id, 'tag', cls.defaultTag);
                                    if (!room.specs) updateRoom(room.id, 'specs', cls.defaultSpecs);
                                  }}
                                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer min-w-0 ${
                                    isSelected
                                      ? 'border-[#0284C7] bg-[#0284C7]/15 ring-2 ring-[#0284C7]/40 shadow-sm'
                                      : 'border-slate-800 bg-[#101726] hover:border-slate-600 hover:bg-[#182235]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-sm">{cls.icon}</span>
                                    <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>{cls.label}</span>
                                    {isSelected && <span className="ml-auto text-[#0284C7] text-xs font-black">✓</span>}
                                  </div>
                                  <p className="text-[10px] text-slate-500 leading-tight line-clamp-1">{cls.defaultSpecs}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full min-w-0">
                          <div className="space-y-1.5 min-w-0">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-200">Nightly Rate (₹) *</label>
                            <input 
                              type="number" 
                              className="w-full bg-[#101726] border border-slate-700/80 rounded-xl px-3 py-2.5 text-white font-bold text-xs sm:text-sm min-w-0 focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.price || ''} 
                              onChange={e => updateRoom(room.id, 'price', parseFloat(e.target.value) || 0)} 
                              placeholder="18500"
                            />
                          </div>
                          <div className="space-y-1.5 min-w-0">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-200">Max Capacity</label>
                            <input 
                              type="number" 
                              min={1}
                              className="w-full bg-[#101726] border border-slate-700/80 rounded-xl px-3 py-2.5 text-white font-bold text-xs sm:text-sm min-w-0 focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.capacity || 2} 
                              onChange={e => updateRoom(room.id, 'capacity', parseInt(e.target.value) || 2)} 
                            />
                          </div>
                          <div className="space-y-1.5 min-w-0">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-200">Units Available</label>
                            <input 
                              type="number" 
                              min={1}
                              className="w-full bg-[#101726] border border-slate-700/80 rounded-xl px-3 py-2.5 text-white font-bold text-xs sm:text-sm min-w-0 focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.inventory_count || 1} 
                              onChange={e => updateRoom(room.id, 'inventory_count', parseInt(e.target.value) || 1)} 
                            />
                          </div>
                          <div className="space-y-1.5 min-w-0">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-200">Marketing Tag</label>
                            <input 
                              type="text" 
                              className="w-full bg-[#101726] border border-slate-700/80 rounded-xl px-3 py-2.5 text-white text-xs font-semibold min-w-0 focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.tag || ''} 
                              onChange={e => updateRoom(room.id, 'tag', e.target.value)} 
                              placeholder="e.g. Most Popular"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5 min-w-0">
                          <label className="text-xs font-black uppercase tracking-wider text-slate-200">Key Specs Line</label>
                          <input 
                            type="text" 
                            className="w-full bg-[#101726] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white placeholder:text-slate-500 text-xs sm:text-sm min-w-0 focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                            value={room.specs || ''} 
                            onChange={e => updateRoom(room.id, 'specs', e.target.value)} 
                            placeholder="e.g. 1,200 sq.ft · 270° Valley View · Heated Jacuzzi"
                          />
                        </div>

                        <div className="space-y-1.5 min-w-0">
                          <label className="text-xs font-black uppercase tracking-wider text-slate-200">Subunit Description</label>
                          <textarea 
                            className="w-full bg-[#101726] border border-slate-700/80 rounded-xl p-3 text-white placeholder:text-slate-500 text-xs sm:text-sm h-20 min-w-0 focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none" 
                            value={room.description || ''} 
                            onChange={e => updateRoom(room.id, 'description', e.target.value)} 
                            placeholder="Describe the architectural nuances and amenities of this specific room..."
                          />
                        </div>

                        <div className="space-y-2.5 min-w-0">
                          <label className="text-xs font-black uppercase tracking-wider text-slate-200">Features & Highlights</label>
                          <div className="flex flex-wrap gap-1.5">
                            {(room.features || []).map((feat: string, fIdx: number) => (
                              <span key={fIdx} className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#101726] border border-slate-700 rounded-full text-xs text-white font-medium">
                                <span>{feat}</span>
                                <button type="button" onClick={() => removeRoomFeature(room.id, fIdx)} className="text-slate-400 hover:text-red-400">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={newFeatureText[room.id] || ''} 
                              onChange={e => setNewFeatureText(prev => ({ ...prev, [room.id]: e.target.value }))} 
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRoomFeature(room.id); }}}
                              className="bg-[#101726] border border-slate-700/80 rounded-xl px-3.5 py-2 text-white text-xs flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              placeholder="Type a feature and press Enter (e.g. Rainforest Shower)"
                            />
                            <button 
                              type="button" 
                              onClick={() => addRoomFeature(room.id)} 
                              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        </div>

                        <div className="space-y-3 pt-3 border-t border-slate-800 w-full min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                            <div>
                              <label className="text-xs font-black uppercase tracking-wider text-slate-200">Room Photos & Spatial Sub-Classification</label>
                              <p className="text-xs text-slate-500 mt-0.5">Upload photos for <strong className="text-slate-300">{room.name || 'this room'}</strong>.</p>
                            </div>
                            <span className="shrink-0 text-[10px] font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                              🔒 Scoped: {room.name || 'Room'}
                            </span>
                          </div>
                          <PhotoUpload 
                            photos={room.photos || []} 
                            setPhotos={(newPhotos) => updateRoom(room.id, 'photos', typeof newPhotos === 'function' ? newPhotos(room.photos || []) : newPhotos)} 
                            lockedTier={room.type} 
                            lockedTierLabel={room.name || 'Room'}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <button 
                type="button" 
                onClick={addRoom} 
                className="w-full py-3.5 border-2 border-dashed border-slate-800 hover:border-[#0284C7] bg-[#101726]/40 hover:bg-[#101726] rounded-2xl text-slate-300 hover:text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4"/> Add Another Room Type
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-8 animate-in fade-in duration-300 w-full min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                  <Layers className="w-3.5 h-3.5" />
                  Step 04 · Media & Visual Identity
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight font-display">Property-Wide Media</h2>
                <p className="text-slate-400 text-xs sm:text-sm mt-1.5 leading-relaxed">Upload shared grounds, facade, pool, wellness, and restaurant photography for the main gallery.</p>
              </div>
              <button
                type="button"
                onClick={() => openGuestPreview(true)}
                className="shrink-0 px-3.5 py-2 bg-gradient-to-r from-sky-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 border border-sky-500/40 text-sky-200 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-sky-950/40"
              >
                <Images className="w-3.5 h-3.5 text-sky-400" />
                <span>Spatial Gallery</span>
              </button>
            </div>

            <div className="space-y-3 w-full min-w-0">
              <label className="text-xs font-black uppercase tracking-wider text-slate-200">Property Grounds & Common Photography</label>
              <PhotoUpload 
                photos={photos} 
                setPhotos={setPhotos} 
                lockedTier="common" 
                lockedTierLabel="Property & Amenities"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 border-t border-slate-800 w-full min-w-0">
              <div className="space-y-1.5 min-w-0">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">Hero Video (YouTube / MP4)</label>
                <input 
                  type="text" 
                  className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-xl px-3.5 py-2.5 text-white placeholder:text-slate-500 text-xs sm:text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7] min-w-0" 
                  value={formData.hero_video_url} 
                  onChange={e => setFormData({...formData, hero_video_url: e.target.value})} 
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
              <div className="space-y-1.5 min-w-0">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">Brand Color Accent</label>
                <div className="flex gap-3 items-center bg-[#101726]/90 border border-slate-700/80 p-2 rounded-xl">
                  <input 
                    type="color" 
                    className="border-0 rounded-lg h-8 w-12 bg-transparent cursor-pointer" 
                    value={formData.dominant_color_hex} 
                    onChange={e => setFormData({...formData, dominant_color_hex: e.target.value})} 
                  />
                  <span className="font-mono text-xs font-bold text-slate-200">{formData.dominant_color_hex}</span>
                  <div className="ml-auto w-5 h-5 rounded-full border border-white/20" style={{ backgroundColor: formData.dominant_color_hex }} />
                </div>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-8 animate-in fade-in duration-300 w-full min-w-0">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <Shield className="w-3.5 h-3.5" />
                Step 05 · Amenities & Structural Safety
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight font-display">Amenities & Guest Capacity</h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-1.5 leading-relaxed">Select all features, luxury services, and structural guest safety guarantees.</p>
            </div>

            <div className="space-y-3 w-full min-w-0">
              <label className="text-xs font-black uppercase tracking-wider text-slate-200">Full Amenities & Privileges Deck</label>
              <AmenitiesPicker
                selected={formData.amenities}
                onChange={(amenities) => setFormData({ ...formData, amenities })}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 w-full min-w-0">
              {[
                { label: 'Max Guests', key: 'maxGuests', icon: Users, val: formData.maxGuests, min: 1 },
                { label: 'Bedrooms', key: 'bedrooms', icon: Bed, val: formData.bedrooms, min: 1 },
                { label: 'Beds', key: 'beds', icon: Bed, val: formData.beds, min: 1 },
                { label: 'Bathrooms', key: 'bathrooms', icon: Bath, val: formData.bathrooms, min: 1 }
              ].map(st => {
                const Icon = st.icon;
                return (
                  <div key={st.key} className="bg-[#101726]/90 border border-slate-800/80 p-3.5 rounded-2xl flex flex-col items-center justify-between gap-2 shadow-sm min-w-0">
                    <div className="flex items-center gap-1.5 text-slate-300 text-xs font-bold truncate">
                      <Icon className="w-3.5 h-3.5 text-sky-400" />
                      <span className="truncate">{st.label}</span>
                    </div>
                    <div className="text-xl font-black text-white font-mono">{st.val}</div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, [st.key]: Math.max(st.min, (prev as any)[st.key] - 1) }))}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, [st.key]: (prev as any)[st.key] + 1 }))}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 6:
        const currentGuidelines = Array.isArray(formData.curated_guidelines)
          ? formData.curated_guidelines
          : (typeof formData.curated_guidelines === 'string' ? [formData.curated_guidelines] : []);

        return (
          <div className="space-y-8 animate-in fade-in duration-300 w-full min-w-0">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Step 06 · Etiquette, Concierge & Pricing
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight font-display">Hospitality Guidelines & Bespoke Privileges</h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-1.5 leading-relaxed">Craft your point-by-point aristocratic guest protocols, configure tailored white-glove concierge privileges, and set dynamic surge pricing.</p>
            </div>

            {/* 02. Aristocratic Hospitality Guidelines (Point-by-point editor) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[#101726]/90 border border-slate-700/80 space-y-4 shadow-xl w-full min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-mono font-bold text-xs">02</span>
                    <label className="text-sm font-black uppercase tracking-wider text-white">Aristocratic Hospitality Guidelines</label>
                    <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-500/30">
                      Curated
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Define structured point-by-point guidelines for guest etiquette, serenity, and heritage care.</p>
                </div>

                <button
                  type="button"
                  disabled={isCuratingRules}
                  onClick={handleCurateRules}
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-500/20 to-sky-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shrink-0 shadow-sm"
                >
                  {isCuratingRules ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> : <Wand2 className="w-3.5 h-3.5 text-amber-400" />}
                  <span>{isCuratingRules ? 'Curating...' : 'AI Enhance Guidelines'}</span>
                </button>
              </div>

              {/* Point-by-Point Cards List */}
              <div className="space-y-3">
                {currentGuidelines.map((item: string, idx: number) => {
                  const colonIdx = item.indexOf(':');
                  const hasPrefix = colonIdx > 0 && colonIdx < 40;
                  const titlePart = hasPrefix ? item.substring(0, colonIdx) : null;
                  const descPart = hasPrefix ? item.substring(colonIdx + 1).trim() : item;

                  return (
                    <div key={idx} className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#090D16] border border-slate-800 hover:border-amber-500/40 transition-all group">
                      <span className="text-amber-400 font-mono font-bold text-xs shrink-0 mt-2.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <textarea
                        value={item}
                        onChange={e => updateGuidelinePoint(idx, e.target.value)}
                        rows={2}
                        className="flex-1 bg-transparent border-0 text-xs sm:text-sm text-slate-200 placeholder:text-slate-600 focus:ring-0 focus:outline-none resize-none font-medium leading-relaxed"
                        placeholder="e.g. Heritage Sanctity: The sandstone stonework is preserved with organic floral care."
                      />
                      <button
                        type="button"
                        onClick={() => removeGuidelinePoint(idx)}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors shrink-0 cursor-pointer"
                        title="Delete guideline point"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add New Guideline Input */}
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={newGuidelineInput}
                  onChange={e => setNewGuidelineInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addGuidelinePoint();
                    }
                  }}
                  placeholder="Add guideline point (e.g. Twilight Serenity: Acoustic stillness observed after 10 PM...)"
                  className="flex-1 bg-[#090D16] border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 font-medium"
                />
                <button
                  type="button"
                  onClick={() => addGuidelinePoint()}
                  className="px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Point</span>
                </button>
              </div>

              {/* Quick Preset Badges */}
              <div className="pt-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Instant Luxury Presets (Click to add):</p>
                <div className="flex flex-wrap gap-2">
                  {GUIDELINE_PRESETS.map((preset, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={() => addGuidelinePoint(preset)}
                      className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 hover:bg-amber-500/10 text-slate-300 hover:text-amber-200 text-xs transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3 h-3 text-amber-400" />
                      <span>{preset.split(':')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 04. Concierge Privileges & Bespoke Services */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[#101726]/90 border border-slate-700/80 space-y-4 shadow-xl w-full min-w-0">
              <div className="pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-sky-400 font-mono font-bold text-xs">04</span>
                  <label className="text-sm font-black uppercase tracking-wider text-white">Concierge Privileges & Bespoke Services</label>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Detail the white-glove amenities, private dining, transfers, and tailored experiences accessible to guests.</p>
              </div>

              {/* Quick Service Badges (Click to append) */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Available Bespoke Privileges (Click to include):</p>
                <div className="flex flex-wrap gap-2">
                  {CONCIERGE_PRESETS.map((service, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => appendConciergeService(service)}
                      className="px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 text-sky-200 text-xs transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3 h-3 text-sky-400" />
                      <span>{service}</span>
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={4}
                value={formData.concierge_privileges}
                onChange={e => setFormData({ ...formData, concierge_privileges: e.target.value })}
                placeholder="All guests at this Encho Sanctuary receive direct access to our Walled Garden Host Concierge. Private dining experiences, sommelier cellar curation, private driver transfers, and customized wellness sessions can be coordinated seamlessly inside your Encho guest inbox."
                className="w-full bg-[#090D16] border border-slate-700/80 rounded-2xl p-4 text-white placeholder:text-slate-500 text-xs sm:text-sm focus:outline-none focus:ring-4 focus:ring-sky-500/20 resize-none font-medium leading-relaxed"
              />
            </div>

            {/* Dynamic Multipliers */}
            <div className="space-y-3 pt-3 border-t border-slate-800 w-full min-w-0">
              <label className="text-xs font-black uppercase tracking-wider text-slate-200">Dynamic Pricing Multipliers</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#101726]/90 border border-slate-800/80 p-4 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white">Weekend Surge</span>
                    <span className="text-xs font-mono font-bold text-sky-400">{formData.dynamicPricing.weekendMultiplier}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="1.0" 
                    max="2.0" 
                    step="0.05"
                    value={formData.dynamicPricing.weekendMultiplier}
                    onChange={e => setFormData({
                      ...formData,
                      dynamicPricing: { ...formData.dynamicPricing, weekendMultiplier: parseFloat(e.target.value) }
                    })}
                    className="w-full accent-[#0284C7] cursor-pointer"
                  />
                </div>

                <div className="bg-[#101726]/90 border border-slate-800/80 p-4 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white">Peak Season Surge</span>
                    <span className="text-xs font-mono font-bold text-sky-400">{formData.dynamicPricing.seasonalMultiplier}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="1.0" 
                    max="2.5" 
                    step="0.05"
                    value={formData.dynamicPricing.seasonalMultiplier}
                    onChange={e => setFormData({
                      ...formData,
                      dynamicPricing: { ...formData.dynamicPricing, seasonalMultiplier: parseFloat(e.target.value) }
                    })}
                    className="w-full accent-[#0284C7] cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-8 animate-in fade-in duration-300 w-full min-w-0">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <Globe className="w-3.5 h-3.5" />
                Step 07 · Search Discovery & SERP
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight font-display">SEO & Search Optimization</h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-1.5 leading-relaxed">Customize how your sanctuary appears on Google, Meta social sharing cards, and luxury travel engines.</p>
            </div>

            <div className="space-y-3.5 w-full min-w-0">
              <div className="space-y-1.5 min-w-0">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">SEO Meta Title</label>
                <input 
                  type="text" 
                  className="w-full bg-[#101726]/90 border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 text-xs sm:text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 min-w-0" 
                  value={formData.seo_title} 
                  onChange={e => setFormData({...formData, seo_title: e.target.value})} 
                  placeholder={formData.title || 'Luxury Sanctuary Villa'} 
                />
              </div>

              <div className="space-y-1.5 min-w-0">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">SEO Meta Description</label>
                <textarea 
                  className="w-full bg-[#101726]/90 border border-slate-700/80 rounded-xl p-3.5 text-white placeholder:text-slate-500 text-xs sm:text-sm h-20 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 resize-none font-medium min-w-0" 
                  value={formData.seo_description} 
                  onChange={e => setFormData({...formData, seo_description: e.target.value})} 
                  placeholder={formData.description.substring(0, 160) || 'Experience the highest standard of luxury hospitality...'} 
                />
              </div>

              {/* Google SERP Preview */}
              <div className="p-4 rounded-2xl bg-white text-slate-900 shadow-xl space-y-1 border border-slate-200 w-full min-w-0">
                <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">Google Search Preview</span>
                <div className="text-xs text-emerald-800 truncate font-mono">https://encho.space/sanctuaries/{formData.city?.toLowerCase().replace(/\s+/g, '-') || 'wayanad'}</div>
                <h4 className="text-sm font-bold text-[#1a0dab] hover:underline cursor-pointer leading-tight truncate">
                  {formData.seo_title || formData.title || 'Luxury Highland Sanctuary & Spa'}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                  {formData.seo_description || formData.description.substring(0, 150) || 'Discover exclusive architectural pavilions with private heated pool, sommelier cellar, and concierge service.'}
                </p>
              </div>
            </div>
          </div>
        );

      case 8:
        return (
          <div className="space-y-8 animate-in fade-in duration-300 w-full min-w-0">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Step 08 · AI Quality Pre-Flight & Launch
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight font-display">AI Quality Pre-Flight & Launch</h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-1.5 leading-relaxed">Run the Gemini AI Pre-Flight Gatekeeper scan to audit your copy, photography, room configurations, and pricing readiness.</p>
            </div>

            <div className="p-5 sm:p-7 rounded-3xl bg-gradient-to-b from-[#101726] to-[#090D16] border border-slate-800 shadow-2xl space-y-5 w-full min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 text-xl shrink-0">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white font-display">Encho AI Quality Gatekeeper</h3>
                    <p className="text-xs text-slate-400 mt-0.5">FAANG 10/10 Luxury Ad-Ready Verification Scanner</p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isScanning}
                  onClick={runAiPreFlightCheck}
                  className="px-5 py-3 bg-gradient-to-r from-[#0284C7] to-indigo-600 hover:from-[#0274B7] hover:to-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-sky-500/25 shrink-0 cursor-pointer flex items-center gap-2"
                >
                  {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>{isScanning ? 'Scanning...' : 'Run Pre-Flight Scan'}</span>
                </button>
              </div>

              {aiScore !== null && (
                <div className="p-5 rounded-2xl bg-[#070A11] border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Overall Score</span>
                      <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-0.5">{aiScore} <span className="text-sm text-slate-500">/ 10.0</span></div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                      aiScore >= 8.0 
                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' 
                        : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                    }`}>
                      {aiScore >= 8.0 ? '✓ CLEARED' : 'NEEDS POLISH'}
                    </span>
                  </div>

                  {aiResult?.headline && (
                    <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed">
                      {aiResult.headline}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPreviewOpen) {
        setIsPreviewOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewOpen]);

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#090D16] flex flex-col items-center justify-center p-6 text-center text-slate-100">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 bg-[#0284C7]/20 border border-[#0284C7] rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-[#0284C7]/30"
        >
          <ShieldCheck className="w-10 h-10 text-[#0284C7]" />
        </motion.div>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-2 tracking-tight font-display">
          {existingListing ? 'Property Successfully Updated!' : 'Property Published Successfully!'}
        </h1>
        <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
          {existingListing 
            ? "Your property alterations and room type rates have been written to the distributed ledger." 
            : "Your architectural sanctuary is now live on the platform directory and ready for marketing distribution."}
        </p>
      </div>
    );
  }

  const progressPercent = Math.round((currentStep / STEPS.length) * 100);

  return (
    <div className="min-h-screen bg-[#090D16] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/60 via-[#090D16] to-[#04060B] text-white font-sans flex flex-col selection:bg-[#0284C7] selection:text-white w-full max-w-full overflow-x-hidden">
      {/* ── 10/10 LUXURY STUDIO TOP HEADER ── */}
      <header className="sticky top-0 z-50 bg-[#090D16]/90 backdrop-blur-2xl border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xl w-full max-w-full">
        {/* Left: Brand / Title */}
        <div className="flex items-center gap-3.5">
          <button 
            type="button"
            onClick={onBack} 
            className="p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer border border-slate-700/60 shadow-xs"
            title="Go Back"
          >
            <ChevronLeft className="w-5 h-5"/>
          </button>
          <div>
            <h1 className="font-extrabold text-base sm:text-lg text-white tracking-tight leading-tight font-display">
              {existingListing ? 'Revise Luxury Listing' : 'Setup Masterful Listing'}
            </h1>
            <p className="text-[10px] uppercase font-mono font-extrabold tracking-widest text-[#0284C7]">Encho Host Engine · Studio Mode</p>
          </div>
        </div>

        {/* Center Minimal Progress Indicator */}
        <div className="hidden xl:flex items-center gap-2 bg-slate-900/70 border border-slate-800/80 px-4 py-1.5 rounded-full shadow-inner">
          <span className="text-xs font-mono font-bold text-slate-400">Step {currentStep} of {STEPS.length}</span>
          <span className="text-slate-600">·</span>
          <span className="text-xs font-bold text-white font-display">{STEPS[currentStep - 1].label}</span>
          <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-2">
            <div className="h-full bg-[#0284C7] transition-all duration-300 rounded-full" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {/* Right Actions: Split View Toggle & Live Preview */}
        <div className="flex items-center gap-2.5">
          {/* Side-by-Side Split View Toggle */}
          <button
            type="button"
            onClick={() => setIsSplitView(prev => !prev)}
            className={`hidden lg:flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer shadow-md ${
              isSplitView
                ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-sky-950/60'
                : 'bg-slate-900/80 border-slate-700/80 text-slate-400 hover:text-white hover:border-slate-500'
            }`}
            title="Toggle Live Side-by-Side Preview (Desktop/Laptop/Mobile)"
          >
            <Columns className="w-4 h-4 text-sky-400" />
            <span>{isSplitView ? 'Split View Active' : 'Side Preview'}</span>
            <span className={`w-2 h-2 rounded-full ${isSplitView ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
          </button>

          {/* Full-Screen Live Guest Preview Trigger */}
          <button 
            type="button" 
            onClick={() => openGuestPreview(false)}
            className="px-3.5 sm:px-4 py-2 bg-gradient-to-r from-sky-500/15 via-indigo-500/15 to-purple-500/15 border border-sky-500/40 hover:border-sky-400 hover:bg-sky-500/25 text-sky-200 hover:text-white font-bold text-xs rounded-2xl flex items-center gap-2 transition-all shadow-md shadow-sky-950/50 cursor-pointer group"
            title="Open Fullscreen Guest Simulator & Spatial Gallery"
          >
            <Eye className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">Fullscreen View</span>
          </button>

          <button 
            type="button" 
            onClick={onBack} 
            className="hidden sm:inline-block px-3 py-2 text-xs font-bold text-slate-400 hover:text-white uppercase tracking-wider transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button 
            form="host-form" 
            type="submit" 
            disabled={loading} 
            className="px-5 sm:px-6 py-2.5 bg-[#0284C7] hover:bg-[#0274B7] disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-[#0284C7]/20 flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{loading ? 'Saving...' : existingListing ? 'Save Master' : 'Publish Listing'}</span>
          </button>
        </div>
      </header>

      {/* ── STREAMLINED HORIZONTAL STEP NAVIGATOR ── */}
      <div className="sticky top-[69px] z-40 bg-[#090D16]/95 backdrop-blur-xl border-b border-slate-800/80 overflow-x-auto py-2.5 px-4 sm:px-8 w-full max-w-full">
        <div className="max-w-7xl mx-auto flex items-center gap-2 justify-start sm:justify-center">
          {STEPS.map(s => {
            const isActive = currentStep === s.id;
            const isCompleted = currentStep > s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  let canJump = true;
                  for (let i = 1; i < s.id; i++) {
                    if (!validateStep(i)) {
                      canJump = false;
                      setCurrentStep(i);
                      break;
                    }
                  }
                  if (canJump) setCurrentStep(s.id);
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  isActive 
                    ? 'bg-[#0284C7] border-[#0284C7] text-white shadow-lg shadow-[#0284C7]/30 scale-105 ring-2 ring-sky-400/40' 
                    : isCompleted 
                      ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60' 
                      : 'bg-[#101726]/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded-full text-[9px] font-mono flex items-center justify-center ${
                  isActive ? 'bg-white text-[#0284C7] font-black' : isCompleted ? 'bg-emerald-400 text-emerald-950 font-black' : 'bg-slate-800 text-slate-400'
                }`}>
                  {isCompleted ? '✓' : s.id}
                </span>
                <span>{s.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── WORKSPACE CANVAS (SPLIT OR CENTERED) ── */}
      <div className={`w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 min-w-0 ${
        isSplitView ? 'max-w-[1720px] mx-auto' : 'max-w-4xl mx-auto'
      }`}>
        <div className={`w-full min-w-0 ${
          isSplitView ? 'flex flex-col lg:flex-row items-start gap-6 lg:gap-8' : ''
        }`}>
          {/* LEFT: Main Form Editor Card */}
          <main className={`w-full min-w-0 ${
            isSplitView ? 'lg:w-[48%] xl:w-[45%]' : 'w-full'
          }`}>
            <div className="bg-[#0F1626]/85 border border-slate-800/80 rounded-3xl sm:rounded-[32px] p-4 sm:p-7 lg:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl w-full max-w-full overflow-hidden min-w-0">
              <form id="host-form" onSubmit={handleSubmit}>
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={currentStep} 
                    initial={{ opacity: 0, y: 10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="w-full min-w-0"
                  >
                    {renderStep()}
                  </motion.div>
                </AnimatePresence>
              </form>
            </div>
          </main>

          {/* RIGHT: Live Side-by-Side Preview Studio Dock */}
          {isSplitView && (
            <aside className="hidden lg:flex flex-col w-full lg:w-[52%] xl:w-[55%] sticky top-[125px] h-[calc(100vh-155px)] bg-[#0C1322] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl min-w-0 z-20">
              {/* Top Studio HUD */}
              <div className="h-14 shrink-0 bg-[#0F1829] border-b border-slate-800 px-4 flex items-center justify-between z-30">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-black uppercase tracking-wider text-white">Live Guest View</span>
                  <span className="text-[10px] font-mono text-sky-400 bg-sky-950/70 border border-sky-500/30 px-2 py-0.5 rounded-full font-bold">
                    LIVE SYNC
                  </span>
                </div>

                {/* Device Switcher */}
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center bg-[#152033] border border-slate-700/80 p-1 rounded-xl gap-1">
                    {[
                      { id: 'mobile',  label: 'Mobile',  icon: Smartphone, width: '390px' },
                      { id: 'laptop',  label: 'Laptop',  icon: Maximize2,  width: 'Fluid' },
                      { id: 'desktop', label: 'Desktop', icon: Monitor,    width: '100%' }
                    ].map(dev => {
                      const Icon = dev.icon;
                      const isActive = splitDevice === dev.id;
                      return (
                        <button
                          key={dev.id}
                          type="button"
                          onClick={() => setSplitDevice(dev.id as any)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-[#0284C7] text-white shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800'
                          }`}
                          title={`${dev.label} view (${dev.width})`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span className="hidden xl:inline">{dev.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Spatial Gallery Quick Toggle */}
                  <button
                    type="button"
                    onClick={() => setSplitGalleryOpen(prev => !prev)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      splitGalleryOpen
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                        : 'bg-[#152033] border-slate-700 text-slate-300 hover:text-white'
                    }`}
                    title="Open Spatial Gallery Overlay in Preview"
                  >
                    <Images className="w-3.5 h-3.5 text-sky-400" />
                    <span className="hidden xl:inline">Gallery</span>
                    <span className="text-[10px] font-mono font-bold bg-sky-950 border border-sky-500/40 text-sky-300 px-1 rounded-full">
                      {previewListing.photos?.length || 0}
                    </span>
                  </button>

                  {/* Fullscreen Popout */}
                  <button
                    type="button"
                    onClick={() => openGuestPreview(false)}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Open in Fullscreen Modal"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Viewport Frame */}
              <div className="flex-1 bg-[#070A11] bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px] overflow-hidden flex items-center justify-center p-3 sm:p-4">
                <div className={`transition-all duration-300 ${
                  splitDevice === 'mobile'
                    ? 'w-[375px] h-full max-h-[812px] bg-white rounded-[38px] shadow-[0_20px_60px_rgba(0,0,0,0.85)] border-4 border-slate-800 ring-2 ring-slate-700 relative overflow-y-auto'
                    : splitDevice === 'laptop'
                      ? 'w-full h-full bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] border border-slate-700 overflow-y-auto'
                      : 'w-full h-full bg-white rounded-xl shadow-2xl overflow-y-auto'
                }`}
                style={{ scrollbarWidth: 'thin' }}
                >
                  {splitDevice === 'mobile' && (
                    <div className="sticky top-0 z-50 w-full h-6 bg-white flex items-center justify-center border-b border-zinc-100">
                      <div className="w-20 h-3.5 bg-black rounded-full shadow-inner" />
                    </div>
                  )}

                  <ListingDetailsNew
                    listing={previewListing}
                    onBack={() => {}}
                    isFavorite={false}
                    initialGalleryOpen={splitGalleryOpen}
                    onToggleFavorite={() => addToast('Wishlist', 'Saved to wishlist (Live Simulation)', 'success')}
                    onBook={() => addToast('Reservation Simulator', 'Guest reservation checkout flow verified!', 'success')}
                    onContactHost={() => addToast('Host Concierge', 'Walled garden concierge chat opened (Live Simulation)', 'info')}
                  />
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* ── STICKY BOTTOM CONTROL FOOTER ── */}
      <footer className="sticky bottom-0 z-40 bg-[#090D16]/95 backdrop-blur-2xl border-t border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xl w-full max-w-full">
        <button 
          type="button" 
          onClick={handlePrevStep} 
          disabled={currentStep === 1} 
          className="px-5 py-2.5 rounded-2xl bg-[#101726] hover:bg-slate-800 disabled:opacity-30 border border-slate-700/80 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          {currentStep < 8 ? (
            <button 
              type="button"
              onClick={handleNextStep} 
              className="px-7 py-2.5 bg-[#0284C7] hover:bg-[#0274B7] text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-[#0284C7]/25 flex items-center gap-2 cursor-pointer"
            >
              <span>Continue to {STEPS[currentStep].name}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button 
              form="host-form" 
              type="submit" 
              disabled={loading}
              className="px-7 py-2.5 bg-gradient-to-r from-[#0284C7] to-emerald-500 hover:from-[#0274B7] hover:to-emerald-600 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>{loading ? 'Publishing...' : 'Publish Listing'}</span>
            </button>
          )}
        </div>
      </footer>

      {/* ── FULLSCREEN LIVE GUEST SIMULATOR MODAL ── */}
      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-[#070A12] flex flex-col overflow-hidden"
          >
            <div className="h-16 shrink-0 bg-[#0C1322] border-b border-slate-800 px-4 md:px-8 flex items-center justify-between z-30 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-[#0284C7] font-black text-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="hidden sm:block">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-white">Live Guest Experience Simulator</span>
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      LIVE SYNC ACTIVE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate max-w-sm">
                    {previewListing.title}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#141E30] border border-slate-700/80 p-1 rounded-2xl gap-1 shadow-inner">
                  {[
                    { id: 'desktop', label: 'Desktop', icon: Monitor, sub: 'Fluid' },
                    { id: 'laptop',  label: 'Laptop',  icon: Maximize2, sub: '1280px' },
                    { id: 'tablet',  label: 'Tablet',  icon: Tablet,  sub: '768px' },
                    { id: 'mobile',  label: 'Mobile',  icon: Smartphone, sub: '390px' }
                  ].map(dev => {
                    const Icon = dev.icon;
                    const isActive = previewDevice === dev.id;
                    return (
                      <button
                        key={dev.id}
                        type="button"
                        onClick={() => setPreviewDevice(dev.id as any)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#0284C7] text-white shadow-md shadow-sky-900/40'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                        title={`${dev.label} View (${dev.sub})`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">{dev.label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewInitialGallery(prev => !prev)}
                  className={`hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-md ${
                    previewInitialGallery
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-sky-950/60'
                      : 'bg-[#141E30] border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
                  }`}
                  title="Open Encho Spatial Gallery Overlay"
                >
                  <Images className="w-3.5 h-3.5 text-sky-400" />
                  <span>Spatial Gallery</span>
                  <span className="text-[10px] font-mono font-bold bg-sky-950/80 border border-sky-500/40 text-sky-300 px-1.5 py-0.2 rounded-full">
                    {previewListing.photos?.length || 0}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-4 h-4 text-slate-400" />
                  <span>Exit Preview</span>
                  <kbd className="hidden sm:inline ml-1 px-1.5 py-0.5 text-[9px] font-mono bg-slate-900 text-slate-400 rounded border border-slate-800">ESC</kbd>
                </button>
              </div>
            </div>

            <div className="flex-1 bg-[#070A11] bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] overflow-hidden flex items-center justify-center p-0 sm:p-4 md:p-6">
              <motion.div
                layout
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className={`transition-all duration-300 ${
                  previewDevice === 'desktop'
                    ? 'w-full h-full bg-white shadow-2xl overflow-y-auto'
                    : previewDevice === 'laptop'
                      ? 'w-full max-w-[1280px] h-[90vh] bg-white rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.85)] border border-slate-700 overflow-y-auto'
                      : previewDevice === 'tablet'
                        ? 'w-[768px] h-[90vh] bg-white rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.9)] border-4 border-slate-800 ring-1 ring-slate-700 overflow-y-auto'
                        : 'w-[390px] h-[844px] max-h-[90vh] bg-white rounded-[44px] shadow-[0_25px_80px_rgba(0,0,0,0.95)] border-8 border-slate-800 ring-2 ring-slate-700 relative overflow-y-auto'
                }`}
                style={{ scrollbarWidth: 'thin' }}
              >
                {previewDevice === 'mobile' && (
                  <div className="sticky top-0 z-50 w-full h-7 bg-white flex items-center justify-center border-b border-zinc-100">
                    <div className="w-24 h-4 bg-black rounded-full shadow-inner" />
                  </div>
                )}

                <ListingDetailsNew
                  listing={previewListing}
                  onBack={() => setIsPreviewOpen(false)}
                  isFavorite={false}
                  initialGalleryOpen={previewInitialGallery}
                  onToggleFavorite={() => addToast('Wishlist', 'Saved to wishlist (Live Simulation Mode)', 'success')}
                  onBook={() => addToast('Reservation Simulator', 'Guest reservation checkout flow verified!', 'success')}
                  onContactHost={() => addToast('Host Concierge', 'Walled garden concierge chat opened (Live Simulation Mode)', 'info')}
                />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HostForm;
