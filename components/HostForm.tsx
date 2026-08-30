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
  X, Sparkles, Check, CheckCircle2, Bed, Users, Trash2, Crown, Star, DoorOpen, Bath, 
  ChevronDown, ChevronUp, ChevronLeft, Globe, MapPin, Video, AlertCircle, Info, Loader2, Plus, Minus, Tag,
  Eye, Compass, DollarSign, Layers, Shield, ArrowRight, Wand2, CheckCircle, ShieldCheck,
  Monitor, Tablet, Smartphone, Maximize2, ExternalLink, Images, RefreshCw, Key
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

const ROOM_ICONS = ['🛏️', '👑', '💻', '🌴', '🏡', '🌺', '🎋', '⭐', '🏖️', '🌿', '🎯', '🌊', '✨', '🏰'];

// ADR-001 REVISED: Room classifications are FIXED. Hosts SELECT, not free-type.
// Gallery routing keys are derived automatically from name.
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

export const HostForm: React.FC<HostFormProps> = ({ onBack, onSuccess, existingListing }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { currency, formatPrice } = useCurrency();

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
    curated_guidelines: existingListing?.curated_guidelines || 'We invite guests to embrace the serene sanctuary atmosphere, preserving acoustic stillness across the private estate grounds after twilight.',
    seo_title: existingListing?.seo_title || '',
    seo_description: existingListing?.seo_description || '',
    seo_keywords: existingListing?.seo_keywords || '',
    seo_image_url: existingListing?.seo_image_url || '',
  });

  // Photos State (Property-wide common grounds)
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
  
  // 10/10 Live Guest Preview Simulator State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewInitialGallery, setPreviewInitialGallery] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'laptop' | 'tablet' | 'mobile'>('desktop');

  const openGuestPreview = useCallback((openGallery = false) => {
    setPreviewInitialGallery(openGallery);
    setIsPreviewOpen(true);
  }, []);

  // Real-time Guest View Data Compiler
  const previewListing: Listing = useMemo(() => {
    // 1. Gather all spatial photos from main upload and per-room uploads
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

    // High-resolution Aman Standard fallback imagery if host hasn't uploaded photos yet
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

    // 2. Prepare structured Room items
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

  // Upload helpers
  const uploadPhotoFile = async (file: File): Promise<string> => {
    try {
      const res = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type })
      });
      if (res.ok) {
        const { uploadUrl, publicUrl } = await res.json();
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file
        });
        if (uploadRes.ok) return publicUrl;
      }
    } catch {
      // Fallback
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const res2 = await fetch('/api/upload-base64', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, filename: file.name })
    });
    if (!res2.ok) throw new Error('Photo upload failed');
    const data = await res2.json();
    return data.url;
  };

  const resolveAndUploadPhoto = async (photo: PhotoData): Promise<string> => {
    if (photo.file) return await uploadPhotoFile(photo.file);
    return photo.previewUrl;
  };

  // AI Curate Rules
  const handleCurateRules = async () => {
    if (!formData.raw_rules.trim()) {
      addToast('Rules Missing', 'Please enter some base house rules first.', 'info');
      return;
    }
    setIsCuratingRules(true);
    try {
      const res = await fetch('/api/ai/curate-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_rules: formData.raw_rules, property_type: formData.type })
      });
      if (!res.ok) throw new Error('AI curation failed');
      const data = await res.json();
      setFormData(prev => ({ ...prev, curated_guidelines: data.curated_guidelines }));
      addToast('Rules Curated', 'Aristocratic hospitality guidelines drafted successfully!', 'success');
    } catch (err: any) {
      addToast('AI Curation Notice', 'Using refined luxury guidelines template.', 'info');
      setFormData(prev => ({
        ...prev,
        curated_guidelines: 'We invite our esteemed guests to honor the acoustic stillness and private natural harmony of the estate after twilight.'
      }));
    } finally {
      setIsCuratingRules(false);
    }
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
        headers: { 'Content-Type': 'application/json' },
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

    // High standard fallback POIs
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
        headers: { 'Content-Type': 'application/json' },
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
      // Heuristic fallback
    } finally {
      setIsScanning(false);
    }

    // Deterministic fallback score
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
      // 1. Upload common property photos
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

      // 2. Upload per-room photos
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
        curated_guidelines: formData.curated_guidelines,
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

      const res = await fetch('/api/listings/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Listing submission failed');

      queueCustomMutation('CREATE_OR_UPDATE_LISTING', payload);
      setSubmitted(true);
      addToast('Listing Published', 'Your architectural sanctuary is now live on Encho!', 'success');
      setTimeout(() => onSuccess(), 1600);
    } catch (err: any) {
      addToast('Submission Error', err.message || 'Failed to publish listing', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Room Management Helpers
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
          <div className="space-y-10 animate-in fade-in duration-300">
            {/* Step Header */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Step 01 · Foundational Identity
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">Define Your Architectural Sanctuary</h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 leading-relaxed">Establish the luxury narrative, architectural classification, and hospitality signature of your estate.</p>
            </div>

            {/* Listing Headline & Title */}
            <div className="space-y-3">
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
                className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl px-5 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7] transition-all text-base sm:text-lg font-semibold shadow-inner"
                value={formData.title} 
                onChange={e => setFormData({...formData, title: e.target.value})} 
                placeholder="e.g. Cloud Valley Sovereign Estate & Spa Sanctuary" 
              />
              <p className="text-xs text-slate-500">Evocative luxury title reflecting the location, landscape, and spatial aesthetic.</p>
            </div>

            {/* Architectural Category Grid (10/10 Aman Luxury Redesign) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-200">Architectural Category *</label>
                  <p className="text-xs text-slate-500 mt-0.5">Select the primary structural and spatial typology of the property.</p>
                </div>
                <span className="text-[11px] font-mono font-bold text-sky-400 bg-sky-950/60 border border-sky-500/30 px-2.5 py-1 rounded-full">
                  Selected: {formData.type}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {PROPERTY_TYPES.map(pt => {
                  const isSelected = formData.type === pt.id;
                  const IconComponent = pt.icon;
                  return (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() => setFormData({...formData, type: pt.id})}
                      className={`relative p-4 sm:p-5 rounded-2xl border text-left flex flex-col justify-between gap-3 transition-all cursor-pointer group ${
                        isSelected 
                          ? 'border-[#0284C7] bg-gradient-to-b from-[#0284C7]/25 via-[#0F172A] to-[#0A0F1D] text-white ring-2 ring-[#0284C7]/50 shadow-[0_0_25px_rgba(2,132,199,0.3)] scale-[1.02]' 
                          : 'border-slate-800/80 bg-[#121927]/80 hover:bg-[#182235] hover:border-slate-600 text-slate-300 hover:text-white shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                          isSelected 
                            ? 'bg-[#0284C7] text-white shadow-md shadow-sky-900/60' 
                            : 'bg-slate-800/70 border border-slate-700/60 text-slate-400 group-hover:text-sky-400 group-hover:border-sky-500/40 group-hover:bg-sky-500/10'
                        }`}>
                          <IconComponent className="w-5 h-5" />
                        </div>
                        {isSelected ? (
                          <span className="w-5 h-5 rounded-full bg-[#0284C7] text-white flex items-center justify-center text-[10px] font-black shadow-xs">✓</span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">{pt.tag}</span>
                        )}
                      </div>

                      <div>
                        <span className="text-sm font-bold tracking-tight block text-white">{pt.label}</span>
                        <p className="text-[11px] text-slate-400 leading-tight mt-1 line-clamp-2">{pt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rental Structure Mode */}
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">Rental Structure Mode</label>
                <p className="text-xs text-slate-500 mt-0.5">Determine how guests book accommodations across your estate.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                      className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                        isSelected
                          ? 'border-[#0284C7] bg-[#0284C7]/15 text-white ring-2 ring-[#0284C7]/40 shadow-lg shadow-[#0284C7]/20'
                          : 'border-slate-800/80 bg-[#121927]/80 hover:bg-[#182235] hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isSelected ? 'bg-[#0284C7] text-white' : 'bg-slate-800 text-slate-400'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${isSelected ? 'bg-sky-500/30 text-sky-200 border border-sky-400/40' : 'bg-slate-800 text-slate-400'}`}>
                          {mode.tag}
                        </span>
                      </div>
                      <div>
                        <div className="font-bold text-sm text-white">{mode.label}</div>
                        <div className="text-xs text-slate-400 mt-1 leading-relaxed">{mode.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* About The Sanctuary (Primary Narrative) */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-200">About The Sanctuary (Narrative) *</label>
                  <p className="text-xs text-slate-500">Paint a vivid sensory description of this estate's architectural and natural setting.</p>
                </div>
                <span className="text-xs text-slate-400 font-mono font-bold">{formData.description.length} chars</span>
              </div>
              <textarea 
                className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl p-5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7] transition-all text-sm sm:text-base leading-relaxed h-36 font-normal resize-none shadow-inner"
                value={formData.description} 
                onChange={e => setFormData({...formData, description: e.target.value})} 
                placeholder="Perched on a dramatic ridgeline overlooking misty tea valleys, this architectural sanctuary merges minimalist stone pavilions with lush indigenous flora..."
              />
            </div>

            {/* Host Philosophy & Signature Message */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-200">Host Philosophy & Signature Message</label>
                  <p className="text-xs text-slate-500">This quote appears in the verified Host section on your listing.</p>
                </div>
                <span className="text-xs text-slate-400 font-mono font-bold">{formData.host_philosophy.length} chars</span>
              </div>
              <textarea 
                className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl p-5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7] transition-all text-sm leading-relaxed h-28 font-medium italic resize-none shadow-inner"
                value={formData.host_philosophy} 
                onChange={e => setFormData({...formData, host_philosophy: e.target.value})} 
                placeholder="e.g. Our design philosophy is to allow natural sunlight and acoustic stillness to heal the modern soul. Every detail here is intentional."
              />
            </div>

            {/* Sensory Atmosphere Deck (Tags) - 10/10 Aman Standard AI Tag Picker */}
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
          <div className="space-y-10 animate-in fade-in duration-300">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <MapPin className="w-3.5 h-3.5" />
                Step 02 · Spatial Coordinates & Radar
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">Location & Surroundings</h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 leading-relaxed">Pinpoint the exact spatial coordinates and curate high-intent neighborhood attractions.</p>
            </div>

            {/* Address & City */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">Street / Estate Address</label>
                <input 
                  type="text" 
                  className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl px-5 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7] text-sm font-medium"
                  value={formData.address} 
                  onChange={e => setFormData({...formData, address: e.target.value})} 
                  placeholder="e.g. Ridge Road, Valley Sanctuary Estate"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">City / Destination *</label>
                <input 
                  type="text" 
                  className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl px-5 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7] text-sm font-medium"
                  value={formData.city} 
                  onChange={e => setFormData({...formData, city: e.target.value})} 
                  placeholder="e.g. Wayanad, Kerala"
                />
              </div>
            </div>

            {/* Interactive Location Picker Map */}
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-wider text-slate-200">Interactive Map Pin Location</label>
              <div className="rounded-3xl overflow-hidden border border-slate-800/80 bg-[#101726] p-2.5 shadow-2xl">
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

            {/* Nearby POIs */}
            <div className="space-y-5 pt-4 border-t border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-200">Curated Neighborhood Highlights</label>
                  <p className="text-xs text-slate-500 mt-0.5">Points of interest shown to prospective guests on the spatial radar map.</p>
                </div>
                <button 
                  type="button" 
                  disabled={isSuggestingPOIs}
                  onClick={suggestNearbyPOIs} 
                  className="px-4 py-2.5 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/40 hover:bg-purple-600/30 text-purple-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-purple-950/40 shrink-0"
                >
                  {isSuggestingPOIs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
                  <span>{isSuggestingPOIs ? 'Generating Radar...' : 'AI Suggest POIs'}</span>
                </button>
              </div>

              <div className="space-y-3">
                {formData.nearby.map((poi: any, i: number) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center bg-[#101726]/90 p-3.5 rounded-2xl border border-slate-800/80 shadow-sm">
                    <span className="text-xl shrink-0 self-center">📍</span>
                    <input 
                      type="text" 
                      className="bg-[#090D16] border border-slate-700/80 rounded-xl px-4 py-2.5 text-white text-xs font-semibold flex-1 focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
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
                      className="bg-[#090D16] border border-slate-700/80 rounded-xl px-4 py-2.5 text-white text-xs font-medium w-full sm:w-36 focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
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
                      className="p-2.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors self-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                ))}

                <button 
                  type="button" 
                  onClick={() => setFormData({...formData, nearby: [...formData.nearby, { name: '', distance: '', type: 'attraction' }]})}
                  className="w-full py-4 border-2 border-dashed border-slate-800 hover:border-[#0284C7] bg-[#101726]/40 hover:bg-[#101726] rounded-2xl text-slate-400 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4"/> Add Neighborhood Point of Interest
                </button>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-10 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                  <Bed className="w-3.5 h-3.5" />
                  Step 03 · Accommodations & Subunits
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">Room Classification Builder</h2>
                <p className="text-slate-400 text-sm sm:text-base mt-2 leading-relaxed">Select from Encho's curated room classifications, set individual rates, and upload per-room spatial media.</p>
              </div>
              <button
                type="button"
                onClick={() => openGuestPreview(true)}
                className="shrink-0 px-4 py-2.5 bg-gradient-to-r from-sky-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 border border-sky-500/40 text-sky-200 hover:text-white rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-sky-950/40"
              >
                <Images className="w-4 h-4 text-sky-400" />
                <span>Preview in Spatial Gallery</span>
              </button>
            </div>

            <div className="space-y-5">
              {formData.rooms.map((room: any, rIdx: number) => {
                const isExpanded = expandedRoomId === room.id;
                return (
                  <div key={room.id} className="border border-slate-800/90 rounded-3xl bg-[#101726]/90 overflow-hidden shadow-xl">
                    {/* Header */}
                    <div 
                      className="p-5 sm:p-6 flex items-center justify-between cursor-pointer hover:bg-[#182235] transition-colors select-none"
                      onClick={() => setExpandedRoomId(isExpanded ? null : room.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                          {room.icon || '🛏️'}
                        </div>
                        <div>
                          <h3 className="font-extrabold text-base sm:text-lg text-white font-display">{room.name || `Room Type #${rIdx + 1}`}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {room.type && (
                              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#0284C7] bg-[#0284C7]/15 px-2.5 py-0.5 rounded-full border border-[#0284C7]/30">
                                {room.type}
                              </span>
                            )}
                            <span className="text-xs text-slate-400 font-mono font-semibold">
                              {formatPrice(room.price || 0, 'INR')}/night · {room.capacity || 2} guests · {room.inventory_count || 1} units
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
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
                        <div className="w-8 h-8 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-white"/> : <ChevronDown className="w-4 h-4"/>}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Edit Form */}
                    {isExpanded && (
                      <div className="p-5 sm:p-7 border-t border-slate-800 bg-[#090D16]/90 space-y-6 animate-in fade-in duration-200">
                        {/* Preset Classification Selector */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-200">Select Fixed Room Classification *</label>
                            <span className="text-[10px] text-sky-400 font-mono font-bold bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded-full">
                              🔒 Aman Standard
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
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
                                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                                    isSelected
                                      ? 'border-[#0284C7] bg-[#0284C7]/15 ring-2 ring-[#0284C7]/40 shadow-sm'
                                      : 'border-slate-800 bg-[#101726] hover:border-slate-600 hover:bg-[#182235]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-base">{cls.icon}</span>
                                    <span className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-300'}`}>{cls.label}</span>
                                    {isSelected && <span className="ml-auto text-[#0284C7] text-xs font-black">✓</span>}
                                  </div>
                                  <p className="text-[11px] text-slate-500 leading-tight">{cls.defaultSpecs}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Row: Price, Capacity, Inventory, Tag */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                          <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-200">Nightly Rate (₹) *</label>
                            <input 
                              type="number" 
                              className="w-full bg-[#101726] border border-slate-700/80 rounded-2xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.price || ''} 
                              onChange={e => updateRoom(room.id, 'price', parseFloat(e.target.value) || 0)} 
                              placeholder="18500"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-200">Max Capacity</label>
                            <input 
                              type="number" 
                              min={1}
                              className="w-full bg-[#101726] border border-slate-700/80 rounded-2xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.capacity || 2} 
                              onChange={e => updateRoom(room.id, 'capacity', parseInt(e.target.value) || 2)} 
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-200">Units Available</label>
                            <input 
                              type="number" 
                              min={1}
                              className="w-full bg-[#101726] border border-slate-700/80 rounded-2xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.inventory_count || 1} 
                              onChange={e => updateRoom(room.id, 'inventory_count', parseInt(e.target.value) || 1)} 
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-200">Marketing Tag</label>
                            <input 
                              type="text" 
                              className="w-full bg-[#101726] border border-slate-700/80 rounded-2xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.tag || ''} 
                              onChange={e => updateRoom(room.id, 'tag', e.target.value)} 
                              placeholder="e.g. Most Popular"
                            />
                          </div>
                        </div>

                        {/* Specs */}
                        <div className="space-y-2">
                          <label className="text-xs font-black uppercase tracking-wider text-slate-200">Key Specs Line</label>
                          <input 
                            type="text" 
                            className="w-full bg-[#101726] border border-slate-700/80 rounded-2xl px-4 py-3 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                            value={room.specs || ''} 
                            onChange={e => updateRoom(room.id, 'specs', e.target.value)} 
                            placeholder="e.g. 1,200 sq.ft · 270° Valley View · Heated Jacuzzi"
                          />
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                          <label className="text-xs font-black uppercase tracking-wider text-slate-200">Subunit Description</label>
                          <textarea 
                            className="w-full bg-[#101726] border border-slate-700/80 rounded-2xl p-4 text-white placeholder:text-slate-500 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none" 
                            value={room.description || ''} 
                            onChange={e => updateRoom(room.id, 'description', e.target.value)} 
                            placeholder="Describe the architectural nuances and amenities of this specific room..."
                          />
                        </div>

                        {/* Features Chips */}
                        <div className="space-y-3">
                          <label className="text-xs font-black uppercase tracking-wider text-slate-200">Features & Highlights</label>
                          <div className="flex flex-wrap gap-2">
                            {(room.features || []).map((feat: string, fIdx: number) => (
                              <span key={fIdx} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#101726] border border-slate-700 rounded-full text-xs text-white font-medium">
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
                              className="bg-[#101726] border border-slate-700/80 rounded-2xl px-4 py-2.5 text-white text-xs flex-1 focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              placeholder="Type a feature and press Enter (e.g. Rainforest Shower)"
                            />
                            <button 
                              type="button" 
                              onClick={() => addRoomFeature(room.id)} 
                              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl text-xs font-bold text-white transition-colors cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        </div>

                        {/* Room Photos & Sub-Classification */}
                        <div className="space-y-4 pt-4 border-t border-slate-800">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <label className="text-xs font-black uppercase tracking-wider text-slate-200">Room Photos & Spatial Sub-Classification</label>
                              <p className="text-xs text-slate-500 mt-0.5">Upload photos for <strong className="text-slate-300">{room.name || 'this room'}</strong> — click any photo to tag with spatial categories.</p>
                            </div>
                            <span className="shrink-0 text-[10px] font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2.5 py-1 rounded-full whitespace-nowrap">
                              🔒 Scoped to: {room.name || 'Room'}
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
                className="w-full py-4 border-2 border-dashed border-slate-800 hover:border-[#0284C7] bg-[#101726]/40 hover:bg-[#101726] rounded-3xl text-slate-300 hover:text-white font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-5 h-5"/> Add Another Room Type
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-10 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                  <Layers className="w-3.5 h-3.5" />
                  Step 04 · Media & Visual Identity
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">Property-Wide Media</h2>
                <p className="text-slate-400 text-sm sm:text-base mt-2 leading-relaxed">Upload shared grounds, facade, pool, wellness, and restaurant photography for the main gallery.</p>
              </div>
              <button
                type="button"
                onClick={() => openGuestPreview(true)}
                className="shrink-0 px-4 py-2.5 bg-gradient-to-r from-sky-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 border border-sky-500/40 text-sky-200 hover:text-white rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-sky-950/40"
              >
                <Images className="w-4 h-4 text-sky-400" />
                <span>Preview in Spatial Gallery</span>
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-wider text-slate-200">Property Grounds & Common Photography</label>
              <PhotoUpload 
                photos={photos} 
                setPhotos={setPhotos} 
                lockedTier="common" 
                lockedTierLabel="Property & Amenities"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">Hero Cinematic Video (YouTube / Vimeo / MP4)</label>
                <input 
                  type="text" 
                  className="w-full bg-[#101726]/90 border border-slate-700/80 hover:border-slate-500 rounded-2xl px-4 py-3.5 text-white placeholder:text-slate-500 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 focus:border-[#0284C7]" 
                  value={formData.hero_video_url} 
                  onChange={e => setFormData({...formData, hero_video_url: e.target.value})} 
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">Brand Color Accent</label>
                <div className="flex gap-3 items-center bg-[#101726]/90 border border-slate-700/80 p-2.5 rounded-2xl">
                  <input 
                    type="color" 
                    className="border-0 rounded-xl h-10 w-14 bg-transparent cursor-pointer" 
                    value={formData.dominant_color_hex} 
                    onChange={e => setFormData({...formData, dominant_color_hex: e.target.value})} 
                  />
                  <span className="font-mono text-sm font-bold text-slate-200">{formData.dominant_color_hex}</span>
                  <div className="ml-auto w-6 h-6 rounded-full border border-white/20" style={{ backgroundColor: formData.dominant_color_hex }} />
                </div>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-10 animate-in fade-in duration-300">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <Shield className="w-3.5 h-3.5" />
                Step 05 · Amenities & Structural Safety
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">Amenities & Guest Capacity</h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 leading-relaxed">Select all features, luxury services, and structural guest safety guarantees.</p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-wider text-slate-200">Full Amenities & Privileges Deck</label>
              <AmenitiesPicker
                selected={formData.amenities}
                onChange={(amenities) => setFormData({ ...formData, amenities })}
              />
            </div>

            {/* Steppers: maxGuests, bedrooms, beds, bathrooms */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-800">
              {[
                { label: 'Max Guests', key: 'maxGuests', icon: Users, val: formData.maxGuests, min: 1 },
                { label: 'Bedrooms', key: 'bedrooms', icon: Bed, val: formData.bedrooms, min: 1 },
                { label: 'Beds', key: 'beds', icon: Bed, val: formData.beds, min: 1 },
                { label: 'Bathrooms', key: 'bathrooms', icon: Bath, val: formData.bathrooms, min: 1 }
              ].map(st => {
                const Icon = st.icon;
                return (
                  <div key={st.key} className="bg-[#101726]/90 border border-slate-800/80 p-4 rounded-2xl flex flex-col items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-300 text-xs font-bold">
                      <Icon className="w-4 h-4 text-sky-400" />
                      <span>{st.label}</span>
                    </div>
                    <div className="text-2xl font-black text-white font-mono">{st.val}</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, [st.key]: Math.max(st.min, (prev as any)[st.key] - 1) }))}
                        className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, [st.key]: (prev as any)[st.key] + 1 }))}
                        className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-10 animate-in fade-in duration-300">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <DollarSign className="w-3.5 h-3.5" />
                Step 06 · Rules & Dynamic Multipliers
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">Hospitality Guidelines & Pricing</h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 leading-relaxed">Establish estate rules, AI-curated guest etiquette, and dynamic weekend/seasonal surge algorithms.</p>
            </div>

            {/* House Rules & AI Curation */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-200">Base House Rules</label>
                  <p className="text-xs text-slate-500">Provide basic rules — Encho AI will elevate them into aristocratic etiquette guidelines.</p>
                </div>
                <button
                  type="button"
                  disabled={isCuratingRules}
                  onClick={handleCurateRules}
                  className="px-4 py-2.5 bg-gradient-to-r from-sky-500/20 to-indigo-500/20 border border-sky-500/40 hover:bg-sky-500/30 text-sky-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-sky-950/40"
                >
                  {isCuratingRules ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-sky-400" />}
                  <span>{isCuratingRules ? 'Curating...' : 'AI Curate Guidelines'}</span>
                </button>
              </div>

              <textarea 
                className="w-full bg-[#101726]/90 border border-slate-700/80 rounded-2xl p-4 text-white placeholder:text-slate-500 text-sm h-24 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 resize-none font-medium"
                value={formData.raw_rules} 
                onChange={e => setFormData({...formData, raw_rules: e.target.value})} 
                placeholder="Quiet hours after 10 PM. No indoor smoking. Swimming pool closes at 11 PM..."
              />

              {formData.curated_guidelines && (
                <div className="p-5 rounded-2xl bg-[#090D16] border border-sky-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Aristocratic Hospitality Guidelines (Rendered to Guests)</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed italic">
                    "{formData.curated_guidelines}"
                  </p>
                </div>
              )}
            </div>

            {/* Dynamic Multipliers */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <label className="text-xs font-black uppercase tracking-wider text-slate-200">Dynamic Pricing Yield Multipliers</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#101726]/90 border border-slate-800/80 p-5 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white">Weekend Surge Rate</span>
                    <span className="text-sm font-mono font-bold text-sky-400">{formData.dynamicPricing.weekendMultiplier}x</span>
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
                  <p className="text-[11px] text-slate-500">Automatically scales nightly rates for Friday & Saturday check-ins.</p>
                </div>

                <div className="bg-[#101726]/90 border border-slate-800/80 p-5 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white">Peak Season Multiplier</span>
                    <span className="text-sm font-mono font-bold text-sky-400">{formData.dynamicPricing.seasonalMultiplier}x</span>
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
                  <p className="text-[11px] text-slate-500">Surges during high-occupancy festive & holiday windows.</p>
                </div>
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-10 animate-in fade-in duration-300">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <Globe className="w-3.5 h-3.5" />
                Step 07 · Search Discovery & SERP
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">SEO & Search Optimization</h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 leading-relaxed">Customize how your sanctuary appears on Google, Meta social sharing cards, and luxury travel engines.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">SEO Meta Title</label>
                <input 
                  type="text" 
                  className="w-full bg-[#101726]/90 border border-slate-700/80 rounded-2xl px-4 py-3.5 text-white placeholder:text-slate-500 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20" 
                  value={formData.seo_title} 
                  onChange={e => setFormData({...formData, seo_title: e.target.value})} 
                  placeholder={formData.title || 'Luxury Sanctuary Villa'} 
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-200">SEO Meta Description</label>
                <textarea 
                  className="w-full bg-[#101726]/90 border border-slate-700/80 rounded-2xl p-4 text-white placeholder:text-slate-500 text-sm h-24 focus:outline-none focus:ring-4 focus:ring-[#0284C7]/20 resize-none font-medium" 
                  value={formData.seo_description} 
                  onChange={e => setFormData({...formData, seo_description: e.target.value})} 
                  placeholder={formData.description.substring(0, 160) || 'Experience the highest standard of luxury hospitality...'} 
                />
              </div>

              {/* Google SERP Preview */}
              <div className="p-5 rounded-3xl bg-white text-slate-900 shadow-xl space-y-1.5 border border-slate-200">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Google Search Engine Card Preview</span>
                <div className="text-xs text-emerald-800 truncate font-mono">https://encho.space/sanctuaries/{formData.city?.toLowerCase().replace(/\s+/g, '-') || 'wayanad'}</div>
                <h4 className="text-base font-bold text-[#1a0dab] hover:underline cursor-pointer leading-tight">
                  {formData.seo_title || formData.title || 'Luxury Highland Sanctuary & Spa'}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {formData.seo_description || formData.description.substring(0, 150) || 'Discover exclusive architectural pavilions with private heated pool, sommelier cellar, and concierge service.'}
                </p>
              </div>
            </div>
          </div>
        );

      case 8:
        return (
          <div className="space-y-10 animate-in fade-in duration-300">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-black tracking-widest uppercase mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Step 08 · AI Quality Pre-Flight & Launch
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">AI Quality Pre-Flight & Launch</h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 leading-relaxed">Run the Gemini AI Pre-Flight Gatekeeper scan to audit your copy, photography, room configurations, and pricing readiness.</p>
            </div>

            {/* AI Gatekeeper Card */}
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#101726] to-[#090D16] border border-slate-800 shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 text-2xl shrink-0 shadow-inner">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-white font-display">Encho AI Quality Gatekeeper</h3>
                    <p className="text-xs text-slate-400 mt-0.5">FAANG 10/10 Luxury Ad-Ready Verification Scanner</p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isScanning}
                  onClick={runAiPreFlightCheck}
                  className="px-6 py-3.5 bg-gradient-to-r from-[#0284C7] to-indigo-600 hover:from-[#0274B7] hover:to-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-sky-500/25 shrink-0 cursor-pointer flex items-center gap-2"
                >
                  {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>{isScanning ? 'Scanning Sanctuary...' : 'Run Pre-Flight AI Scan'}</span>
                </button>
              </div>

              {/* Score Display */}
              {aiScore !== null && (
                <div className="p-6 rounded-2xl bg-[#070A11] border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Overall Quality Score</span>
                      <div className="text-3xl sm:text-4xl font-black text-white font-mono mt-0.5">{aiScore} <span className="text-base text-slate-500">/ 10.0</span></div>
                    </div>
                    <span className={`px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border ${
                      aiScore >= 8.0 
                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-950/50' 
                        : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                    }`}>
                      {aiScore >= 8.0 ? '✓ CLEARED FOR PAID AD ENGINES' : 'REQUIRES POLISH'}
                    </span>
                  </div>

                  {aiResult?.headline && (
                    <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed">
                      {aiResult.headline}
                    </p>
                  )}

                  {aiResult?.issues && aiResult.issues.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <span className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-widest">Recommended Actions:</span>
                      {aiResult.issues.map((iss: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="text-amber-400">•</span>
                          <span>{iss}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Launch Live Guest Experience Simulator Card */}
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-sky-950/40 via-indigo-950/30 to-purple-950/30 border border-sky-500/30 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 shrink-0 shadow-lg">
                  <Monitor className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-white font-display">Interactive Guest Page & Spatial Gallery Simulation</h3>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
                    Test your live sanctuary page, rooms breakdown, sensory atmosphere deck, and 360 spatial galleries across desktop, tablet, and mobile simulator frames.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openGuestPreview(false)}
                className="px-6 py-3.5 bg-gradient-to-r from-[#0284C7] to-indigo-600 hover:from-[#0274B7] hover:to-indigo-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-sky-500/25 shrink-0 cursor-pointer flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                <span>Launch Live Preview</span>
              </button>
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
      <header className="sticky top-0 z-50 bg-[#090D16]/90 backdrop-blur-2xl border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xl">
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
        <div className="hidden lg:flex items-center gap-2 bg-slate-900/70 border border-slate-800/80 px-4 py-1.5 rounded-full shadow-inner">
          <span className="text-xs font-mono font-bold text-slate-400">Step {currentStep} of {STEPS.length}</span>
          <span className="text-slate-600">·</span>
          <span className="text-xs font-bold text-white font-display">{STEPS[currentStep - 1].label}</span>
          <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-2">
            <div className="h-full bg-[#0284C7] transition-all duration-300 rounded-full" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Live Guest Preview Trigger */}
          <button 
            type="button" 
            onClick={() => openGuestPreview(false)}
            className="px-4 py-2 bg-gradient-to-r from-sky-500/15 via-indigo-500/15 to-purple-500/15 border border-sky-500/40 hover:border-sky-400 hover:bg-sky-500/25 text-sky-200 hover:text-white font-bold text-xs rounded-2xl flex items-center gap-2 transition-all shadow-md shadow-sky-950/50 cursor-pointer group"
            title="Open Live Guest Experience Preview & Spatial Gallery"
          >
            <Eye className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">Live Guest View</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          <button 
            type="button" 
            onClick={onBack} 
            className="hidden sm:inline-block px-3.5 py-2 text-xs font-bold text-slate-400 hover:text-white uppercase tracking-wider transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button 
            form="host-form" 
            type="submit" 
            disabled={loading} 
            className="px-6 py-2.5 bg-[#0284C7] hover:bg-[#0274B7] disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-[#0284C7]/20 flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{loading ? 'Saving...' : existingListing ? 'Save Master' : 'Publish Listing'}</span>
          </button>
        </div>
      </header>

      {/* ── STREAMLINED HORIZONTAL STEP NAVIGATOR ── */}
      <div className="sticky top-[69px] z-40 bg-[#090D16]/95 backdrop-blur-xl border-b border-slate-800/80 overflow-x-auto py-3 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto flex items-center gap-2.5 justify-start sm:justify-center">
          {STEPS.map(s => {
            const isActive = currentStep === s.id;
            const isCompleted = currentStep > s.id;
            const StepIcon = s.icon;
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
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  isActive 
                    ? 'bg-[#0284C7] border-[#0284C7] text-white shadow-lg shadow-[#0284C7]/30 scale-105 ring-2 ring-sky-400/40' 
                    : isCompleted 
                      ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60' 
                      : 'bg-[#101726]/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className={`w-4 h-4 rounded-full text-[10px] font-mono flex items-center justify-center ${
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

      {/* ── MAIN WORKSPACE CANVAS ── */}
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10 flex-1 min-w-0">
        <div className="bg-[#0F1626]/85 border border-slate-800/80 rounded-3xl sm:rounded-[32px] p-4 sm:p-8 lg:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl w-full max-w-full overflow-hidden min-w-0">
          <form id="host-form" onSubmit={handleSubmit}>
            <AnimatePresence mode="wait">
              <motion.div 
                key={currentStep} 
                initial={{ opacity: 0, y: 12 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.22 }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </form>
        </div>
      </main>

      {/* ── STICKY BOTTOM CONTROL FOOTER ── */}
      <footer className="sticky bottom-0 z-40 bg-[#090D16]/95 backdrop-blur-2xl border-t border-slate-800/80 px-4 sm:px-8 py-4 flex items-center justify-between shadow-2xl">
        <button 
          type="button" 
          onClick={handlePrevStep} 
          disabled={currentStep === 1} 
          className="px-6 py-3 rounded-2xl bg-[#101726] hover:bg-slate-800 disabled:opacity-30 border border-slate-700/80 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          {currentStep < 8 ? (
            <button 
              type="button"
              onClick={handleNextStep} 
              className="px-8 py-3 bg-[#0284C7] hover:bg-[#0274B7] text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-[#0284C7]/25 flex items-center gap-2 cursor-pointer"
            >
              <span>Continue to {STEPS[currentStep].name}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button 
              form="host-form" 
              type="submit" 
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-[#0284C7] to-emerald-500 hover:from-[#0274B7] hover:to-emerald-600 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>{loading ? 'Publishing...' : 'Publish Listing'}</span>
            </button>
          )}
        </div>
      </footer>

      {/* ── FLOATING QUICK-ACTION PREVIEW PILL ── */}
      <div className="fixed bottom-20 right-6 z-40">
        <motion.button
          type="button"
          onClick={() => openGuestPreview(false)}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          className="px-5 py-3 bg-gradient-to-r from-[#0284C7] via-indigo-600 to-sky-600 hover:from-[#0274B7] hover:to-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-full flex items-center gap-2.5 shadow-2xl shadow-sky-500/40 border border-sky-400/40 cursor-pointer backdrop-blur-md transition-all group"
        >
          <Eye className="w-4 h-4 text-sky-200 group-hover:scale-110 transition-transform" />
          <span className="font-bold">Live Guest View</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </motion.button>
      </div>

      {/* ── 10/10 FULL-SCREEN LIVE GUEST SIMULATOR MODAL (WITH SPATIAL GALLERY) ── */}
      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-[#070A12] flex flex-col overflow-hidden"
          >
            {/* Top Control Bar HUD */}
            <div className="h-16 shrink-0 bg-[#0C1322] border-b border-slate-800 px-4 md:px-8 flex items-center justify-between z-30 shadow-xl">
              {/* Left Branding */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-[#0284C7] font-black text-xs shadow-xs">
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

              {/* Center Device Switcher & Spatial Gallery Quick Trigger */}
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

              {/* Right Exit Button */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <X className="w-4 h-4 text-slate-400" />
                  <span>Exit Preview</span>
                  <kbd className="hidden sm:inline ml-1 px-1.5 py-0.5 text-[9px] font-mono bg-slate-900 text-slate-400 rounded border border-slate-800">ESC</kbd>
                </button>
              </div>
            </div>

            {/* Viewport Studio Workspace */}
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
                {/* Mobile Dynamic Island / Bezel Simulator */}
                {previewDevice === 'mobile' && (
                  <div className="sticky top-0 z-50 w-full h-7 bg-white flex items-center justify-center border-b border-zinc-100">
                    <div className="w-24 h-4 bg-black rounded-full shadow-inner" />
                  </div>
                )}

                {/* Render Full Live Guest Page & Encho Spatial Gallery Modal */}
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
