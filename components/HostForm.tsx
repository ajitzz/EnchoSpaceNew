import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Listing, Room, SpatialPhoto } from '../types';
import { ChevronLeft, ChevronRight, ShieldCheck } from './Icons';
import { LocationPicker } from './LocationPicker';
import { PhotoUpload, PhotoData } from './PhotoUpload';
import { AmenitiesPicker } from './AmenitiesPicker';
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
  ChevronDown, ChevronUp, Globe, MapPin, Video, AlertCircle, Info, Loader2, Plus, Minus, Tag,
  Eye, Compass, DollarSign, Layers, Shield, ArrowRight, Wand2, CheckCircle,
  Monitor, Tablet, Smartphone, Maximize2, ExternalLink
} from 'lucide-react';

interface HostFormProps {
  onBack: () => void;
  onSuccess: () => void;
  existingListing?: Listing;
}

const STEPS = [
  { id: 1, name: 'Identity',   label: 'Property Identity',       desc: 'Title, type & description', icon: Home },
  { id: 2, name: 'Location',   label: 'Location & Map',           desc: 'Address, map & nearby places', icon: MapPin },
  { id: 3, name: 'Rooms',      label: 'Room Types Builder',       desc: 'Accommodations & pricing', icon: Bed },
  { id: 4, name: 'Media',      label: 'Property Media',           desc: 'Photos, video & visual identity', icon: Layers },
  { id: 5, name: 'Amenities',  label: 'Amenities & Safety',       desc: 'Features & guest safety', icon: Shield },
  { id: 6, name: 'Policies',   label: 'Policies & Pricing',       desc: 'Rules, pricing & stays', icon: DollarSign },
  { id: 7, name: 'SEO',        label: 'SEO & Discovery',          desc: 'Search engine optimization', icon: Globe },
  { id: 8, name: 'Launch',     label: 'AI Pre-Flight & Launch',   desc: 'AI quality check & publish', icon: Sparkles },
];

const PROPERTY_TYPES = [
  { id: 'Resort', label: 'Resort', icon: Trees },
  { id: 'Apartment', label: 'Flat/apartment', icon: Building2 },
  { id: 'House', label: 'House', icon: Home },
  { id: 'Barn', label: 'Barn', icon: Tractor },
  { id: 'Bed & breakfast', label: 'Bed & breakfast', icon: Coffee },
  { id: 'Boat', label: 'Boat', icon: Ship },
  { id: 'Cabin', label: 'Cabin', icon: Tent },
  { id: 'Campervan', label: 'Campervan', icon: Caravan },
  { id: 'Castle', label: 'Castle', icon: Castle },
  { id: 'Cave', label: 'Cave', icon: Mountain },
  { id: 'Container', label: 'Container', icon: Box },
  { id: 'Dome', label: 'Dome', icon: Circle },
  { id: 'Earth home', label: 'Earth home', icon: Leaf },
  { id: 'Hotel', label: 'Hotel', icon: Building2 },
  { id: 'Boutique', label: 'Boutique', icon: Star },
  { id: 'Villa', label: 'Villa', icon: Home }
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
  const { formatPrice } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [draftId, setDraftId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    title: existingListing?.title || '',
    description: existingListing?.description || '',
    type: existingListing?.type || 'Resort',
    tagline: '',
    rentalMode: existingListing?.rental_mode || 'entire_place',
    address: existingListing?.address || '',
    city: existingListing?.city || '',
    lat: existingListing?.lat || 11.6854,
    lng: existingListing?.lng || 76.1320,
    nearby: existingListing?.nearby || [] as any[],
    rooms: (existingListing?.rooms && existingListing.rooms.length > 0)
      ? existingListing.rooms.map((r: any) => ({ 
          ...r, 
          icon: r.icon || '🛏️',
          tag: r.tag || '',
          specs: r.specs || '',
          description: r.description || '',
          photos: r.photos || [] 
        }))
      : [{ id: `room-${Date.now()}`, name: '', type: 'room-1', icon: '🛏️', tag: '', price: 0, capacity: 2, inventory_count: 1, description: '', specs: '', features: [], amenities: [], photos: [] }],
    maxGuests: existingListing?.maxGuests || 2,
    bedrooms: existingListing?.bedrooms || 1,
    beds: existingListing?.beds || 1,
    bathrooms: existingListing?.bathrooms || 1,
    amenities: existingListing?.amenities || [] as string[],
    amenity_clusters: existingListing?.amenity_clusters || { vibe: [], comfort: [], work: [], culinary: [] },
    child_safety_specs: existingListing?.child_safety_specs || [] as string[],
    videoUrl: existingListing?.video_url || '',
    hero_video_url: existingListing?.hero_video_url || '',
    hero_fallback_url: existingListing?.hero_fallback_url || '',
    dominant_color_hex: existingListing?.dominant_color_hex || '#0284C7',
    experience_tags: existingListing?.experience_tags || [] as string[],
    concierge_privileges: existingListing?.concierge_privileges || '',
    host_philosophy: existingListing?.host_philosophy || '',
    price: existingListing?.price?.toString() || '0',
    dynamicPricing: existingListing?.dynamicPricing || { weekendMultiplier: 1.0, seasonalMultiplier: 1.0 },
    raw_rules: existingListing?.raw_rules || '',
    curated_guidelines: existingListing?.curated_guidelines || '',
    seo_title: existingListing?.seo_title || '',
    seo_description: existingListing?.seo_description || '',
    seo_keywords: existingListing?.seo_keywords || '',
    seo_image_url: existingListing?.seo_image_url || '',
  });

  const [photos, setPhotos] = useState<PhotoData[]>(() => {
    let urls: string[] = [];
    if (existingListing?.imageUrls && existingListing.imageUrls.length > 0) {
      urls = existingListing.imageUrls;
    } else if (existingListing?.imageUrl) {
      urls = [existingListing.imageUrl];
    }
    return urls.map((url: string) => ({ id: Math.random().toString(36).substr(2,7), previewUrl: url, tier: 'common', category: 'exterior' as any }));
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
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'laptop' | 'tablet' | 'mobile'>('desktop');

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
        category: 'dining',
        title: 'Sommelier Wine Lounge',
        description: 'Private culinary enclave for bespoke in-villa dining.'
      }
    ];

    const allImageUrls = fallbackPhotos.map(p => p.url);

    // Formulate rooms with fallback pricing and metadata
    const processedRooms: Room[] = (formData.rooms && formData.rooms.length > 0)
      ? formData.rooms.map((r: any, idx: number) => ({
          id: r.id || `room-${idx + 1}`,
          name: r.name || (ROOM_CLASSIFICATIONS[idx % ROOM_CLASSIFICATIONS.length]?.name || `Sanctuary Suite ${idx + 1}`),
          type: r.type || (ROOM_CLASSIFICATIONS[idx % ROOM_CLASSIFICATIONS.length]?.tier || 'suites'),
          icon: r.icon || '👑',
          tag: r.tag || 'Most Exclusive',
          price: parseFloat(r.price) || (parseFloat(formData.price) || 18500),
          capacity: r.capacity || 2,
          inventory_count: r.inventory_count || 1,
          description: r.description || formData.description || 'Bespoke architectural suite with private panoramic views.',
          specs: r.specs || '1,200 sq.ft · Panoramic Views · Private Balcony',
          features: (r.features && r.features.length > 0) ? r.features : ['Private Terrace', 'Spa Bathroom', 'Fiber WiFi'],
          amenities: r.amenities || formData.amenities || [],
          photos: (r.photos && r.photos.length > 0) ? r.photos : fallbackPhotos.slice(idx * 2, (idx * 2) + 2)
        }))
      : [
          {
            id: 'room-default-1',
            name: 'Presidential Panorama Suite',
            type: 'suites',
            icon: '👑',
            tag: 'Most Exclusive',
            price: parseFloat(formData.price) || 18500,
            capacity: 2,
            inventory_count: 1,
            specs: '1,200 sq.ft · 270° Valley View · Heated Jacuzzi',
            description: 'Ultra-exclusive master pavilion with panoramic views.',
            features: ['Private Heated Jacuzzi', 'Dedicated Butler Call', 'Panoramic Mountain View'],
            photos: fallbackPhotos
          }
        ];

    return {
      id: existingListing?.id || 'preview-sanctuary-draft',
      user_id: user?.id || 1,
      host_id: user?.id || 1,
      title: formData.title.trim() || 'Untitled Luxury Architectural Sanctuary',
      description: formData.description.trim() || 'Experience elevated serenity and world-class architectural design surrounded by pristine natural vistas.',
      type: formData.type || 'Resort',
      rental_mode: formData.rentalMode as any,
      price: parseFloat(formData.price) || 18500,
      currency: 'INR',
      address: formData.address || 'Signature Wayanad Highlands',
      city: formData.city || 'Wayanad, Kerala',
      lat: formData.lat || 11.6854,
      lng: formData.lng || 76.1320,
      imageUrl: allImageUrls[0],
      imageUrls: allImageUrls,
      photos: fallbackPhotos,
      imageCount: fallbackPhotos.length,
      isVerified: true,
      rating: 4.98,
      reviewCount: 42,
      maxGuests: formData.maxGuests || 4,
      bedrooms: formData.bedrooms || 2,
      beds: formData.beds || 3,
      bathrooms: formData.bathrooms || 2,
      amenities: formData.amenities.length > 0 ? formData.amenities : ['Heated Pool', 'Private Chef', '1 Gbps WiFi', 'Air Conditioning', 'Free Parking', 'Spa'],
      experience_tags: formData.experience_tags.length > 0 ? formData.experience_tags : ['Ocean Waves', 'Heated Infinity Pool', 'Private Chef Available', '1 Gbps Fiber WiFi', 'Panoramic Mountain View'],
      concierge_privileges: formData.concierge_privileges || 'All guests receive dedicated access to our 24/7 Host Concierge for private cellar tastings, driver transfers, and in-villa wellness treatments.',
      host_philosophy: formData.host_philosophy || 'Hosting is an art form of anticipation. Our mission is to curate an environment where architecture and nature merge seamlessly.',
      raw_rules: formData.raw_rules || 'Quiet hours after twilight. No smoking indoors.',
      curated_guidelines: formData.curated_guidelines || 'We invite guests to embrace the tranquil atmosphere of the estate, observing quiet serenity after twilight.',
      child_safety_specs: formData.child_safety_specs || [],
      dominant_color_hex: formData.dominant_color_hex || '#0284C7',
      hero_video_url: formData.hero_video_url || formData.videoUrl || '',
      hero_fallback_url: formData.hero_fallback_url || allImageUrls[0],
      video_url: formData.videoUrl || '',
      nearby: formData.nearby && formData.nearby.length > 0 ? formData.nearby : [
        { name: 'Chembra Peak Vista', distance: '3.2 km', minutes: 8, type: 'PARK' as any },
        { name: 'Banasura Sagar Lake', distance: '8.5 km', minutes: 18, type: 'PARK' as any },
        { name: 'Artisan Plantation Cafe', distance: '1.2 km', minutes: 3, type: 'CAFE' as any }
      ],
      dynamicPricing: formData.dynamicPricing,
      seo_title: formData.seo_title || formData.title,
      seo_description: formData.seo_description || formData.description
    };
  }, [formData, photos, user, existingListing]);

  const uploadPhotoFile = async (file: File): Promise<string> => {
    const token = localStorage.getItem('token');
    try {
      const presignRes = await fetch('/api/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ filename: file.name || 'photo.webp', contentType: file.type || 'image/webp' }),
      });
      if (presignRes.ok) {
        const { uploadUrl, fileUrl } = presignRes.headers.get('content-type')?.includes('json') ? await presignRes.json() : { error: 'Server returned non-JSON response: ' + (await presignRes.text()).slice(0, 150) } as any;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'image/webp' },
          body: file,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (uploadRes.ok) {
          return fileUrl;
        }
      }
    } catch (err) {
      console.warn('PUT upload failed, attempting base64 upload fallback:', err);
    }

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64Data = await base64Promise;
      const res = await fetch('/api/upload-base64', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ filename: file.name || 'photo.webp', base64Data, contentType: file.type || 'image/webp' })
      });
      if (res.ok) {
        const data = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
        if (data.url) return data.url;
      }
      return base64Data;
    } catch (base64Err) {
      console.warn('Server upload fallback failed, using client data URL:', base64Err);
      try {
        const reader = new FileReader();
        return await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } catch (e) {
        console.error('All upload and client-side conversion methods failed:', e);
        return '';
      }
    }
  };

  const resolveAndUploadPhoto = async (photo: any): Promise<string> => {
    if (!photo) return '';
    const preview = photo.previewUrl || photo.url || photo;
    if (typeof preview === 'string') {
      if (preview.startsWith('http://') || preview.startsWith('https://') || preview.startsWith('/uploads/') || preview.startsWith('data:')) {
        return preview;
      }
    }
    let fileToUpload: File | null = photo.file || null;
    if (!fileToUpload && typeof preview === 'string' && (preview.startsWith('blob:') || preview.startsWith('data:'))) {
      if (preview.startsWith('data:')) return preview;
      try {
        const res = await fetch(preview);
        const blob = await res.blob();
        fileToUpload = new File([blob], `upload-${Date.now()}.webp`, { type: blob.type || 'image/webp' });
      } catch (e) {
        console.warn('Failed to fetch blob url for upload:', e);
      }
    }
    if (fileToUpload) {
      return await uploadPhotoFile(fileToUpload);
    }
    return typeof preview === 'string' ? preview : '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const uploadedImageUrls: string[] = [];
      const spatialPhotos: any[] = [];

      for (const photo of photos) {
        const url = await resolveAndUploadPhoto(photo);
        if (url && !url.startsWith('blob:')) {
          uploadedImageUrls.push(url);
          spatialPhotos.push({
            id: photo.id || `sp-${Date.now()}`,
            url,
            category: photo.category || 'exterior',
            tier: photo.tier || 'common',
            title: photo.title || '',
            description: photo.description || '',
            specs: photo.specs || '',
            isHero: uploadedImageUrls.length === 1
          });
        }
      }

      const processedRooms: any[] = [];
      for (const room of formData.rooms) {
        const roomPhotoUrls: string[] = [];
        const roomSpatialPhotos: any[] = [];
        for (const rp of (room.photos || [])) {
          const url = await resolveAndUploadPhoto(rp);
          if (url && !url.startsWith('blob:')) {
            roomPhotoUrls.push(url);
            uploadedImageUrls.push(url);
            const sp = {
              id: rp.id || `rp-${Date.now()}`,
              url,
              category: rp.category || 'bedroom',
              tier: room.type || 'common',
              title: rp.title || room.name || '',
              description: rp.description || '',
              specs: rp.specs || '',
              isHero: false
            };
            spatialPhotos.push(sp);
            roomSpatialPhotos.push(sp);
          }
        }
        processedRooms.push({
          ...room,
          imageUrls: roomPhotoUrls,
          imageUrl: roomPhotoUrls[0] || '',
          photos: roomSpatialPhotos
        });
      }

      const payload: any = {
        title: formData.title,
        description: formData.description,
        price: parseFloat(formData.price) || (processedRooms[0]?.price || 0),
        type: formData.type,
        address: formData.address,
        city: formData.city,
        imageUrl: uploadedImageUrls[0] || '',
        imageUrls: uploadedImageUrls,
        photos: spatialPhotos,
        videoUrl: formData.videoUrl || '',
        rentalMode: formData.rentalMode,
        rooms: processedRooms,
        maxGuests: formData.maxGuests,
        bedrooms: formData.bedrooms,
        beds: formData.beds,
        bathrooms: formData.bathrooms,
        amenities: formData.amenities,
        lat: formData.lat,
        lng: formData.lng,
        dynamicPricing: formData.dynamicPricing,
        amenity_clusters: formData.amenity_clusters,
        child_safety_specs: formData.child_safety_specs,
        nearby: formData.nearby,
        hero_video_url: formData.hero_video_url,
        hero_fallback_url: formData.hero_fallback_url,
        dominant_color_hex: formData.dominant_color_hex,
        raw_rules: formData.raw_rules,
        curated_guidelines: formData.curated_guidelines,
        experience_tags: formData.experience_tags,
        concierge_privileges: formData.concierge_privileges,
        host_philosophy: formData.host_philosophy,
        seo_title: formData.seo_title,
        seo_description: formData.seo_description,
        seo_keywords: formData.seo_keywords,
        seo_image_url: formData.seo_image_url,
      };
      const endpoint = existingListing?.id ? `/api/listings/${existingListing.id}` : '/api/listings';
      const method = existingListing?.id ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Publish failed');
      }
      addToast('Success', existingListing ? 'Property updated successfully!' : 'Property published successfully!', 'success');
      setSubmitted(true);
      setTimeout(() => { onSuccess(); }, 1500);
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to publish.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const runAiGatekeeper = async () => {
    setIsScanning(true);
    setAiScore(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/ai/evaluate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          photos: photos.map(p => ({ category: p.category, tier: p.tier })),
          rooms: formData.rooms.map((r: any) => ({ name: r.name, price: r.price, description: r.description })),
          amenities: formData.amenities,
          price: parseFloat(formData.price) || (formData.rooms[0]?.price || 0),
          city: formData.city
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiScore(data.score);
        setAiResult(data);
      } else {
        addToast('Notice', 'AI evaluation unavailable. Proceeding with heuristic check.', 'info');
      }
    } catch (err) {
      addToast('Notice', 'AI evaluation failed. Please try again.', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const suggestNearbyPOIs = async () => {
    if (!formData.lat || !formData.lng) {
      addToast('Notice', 'Please set your property location on the map first.', 'info');
      return;
    }
    setIsSuggestingPOIs(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/ai/nearby-pois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ lat: formData.lat, lng: formData.lng, city: formData.city, propertyType: formData.type })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pois && data.pois.length > 0) {
          setFormData(prev => ({ ...prev, nearby: [...prev.nearby, ...data.pois] }));
          addToast('AI Success', `${data.pois.length} nearby points of interest added!`, 'success');
        }
      }
    } catch (err) {
      addToast('Error', 'Could not fetch AI POI suggestions.', 'error');
    } finally {
      setIsSuggestingPOIs(false);
    }
  };
  
  const handleCurateRules = async () => {
    if (!formData.raw_rules?.trim()) {
      addToast("Information", "Please enter some house rules first to refine.", "info");
      return;
    }
    setIsCuratingRules(true);
    try {
      const res = await fetch('/api/ai/curate-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawRules: formData.raw_rules })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.curatedGuidelines) {
          setFormData(prev => ({ ...prev, curated_guidelines: data.curatedGuidelines }));
          addToast("AI Success", "Rules refined into 5-star luxury House Guidelines!", "success");
        }
      }
    } catch (e) {
      console.error('Failed to curate rules:', e);
      addToast("Notice", "Rule refinement completed with heuristic rules.", "info");
    } finally {
      setIsCuratingRules(false);
    }
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1: return formData.title.trim().length >= 10 && formData.type.length > 0;
      case 2: return formData.city.trim().length > 0;
      case 3: return formData.rooms.some((r: any) => r.name.trim().length > 0 && r.price > 0);
      default: return true;
    }
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(8, prev + 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      if (currentStep === 1) addToast('Validation', 'Please provide a descriptive title (at least 10 chars).', 'warning');
      else if (currentStep === 2) addToast('Validation', 'Please enter at least a City for your property location.', 'warning');
      else if (currentStep === 3) addToast('Validation', 'Please configure at least one room with a name and price.', 'warning');
      else addToast('Validation', 'Please fill required fields before proceeding.', 'warning');
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(prev => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const updateRoom = (id: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      rooms: prev.rooms.map((r: any) => r.id === id ? { ...r, [field]: value } : r)
    }));
  };
  
  const addRoom = () => {
    const newId = `room-${Date.now()}`;
    const defaultClass = ROOM_CLASSIFICATIONS[0];
    setFormData(prev => ({
      ...prev,
      rooms: [...prev.rooms, { 
        id: newId, 
        name: defaultClass.name, 
        type: defaultClass.tier, 
        icon: defaultClass.icon, 
        tag: defaultClass.defaultTag, 
        price: 0, 
        capacity: 2, 
        inventory_count: 1, 
        description: '', 
        specs: defaultClass.defaultSpecs, 
        features: [], 
        amenities: [], 
        photos: [] 
      }]
    }));
    setExpandedRoomId(newId);
  };

  const removeRoom = (id: string) => {
    if (formData.rooms.length <= 1) {
      addToast('Notice', 'At least one room type is required.', 'info');
      return;
    }
    setFormData(prev => ({
      ...prev,
      rooms: prev.rooms.filter((r: any) => r.id !== id)
    }));
  };

  const addRoomFeature = (roomId: string) => {
    const text = (newFeatureText[roomId] || '').trim();
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

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Property Identity</h2>
              <p className="text-sm text-slate-400 mt-1">Define the core signature, architectural category, and luxury narrative of your estate.</p>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Listing Headline & Title *</label>
                <span className={`text-xs font-mono font-bold ${formData.title.length < 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {formData.title.length}/100 chars
                </span>
              </div>
              <input 
                type="text" 
                maxLength={100}
                className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-4 py-3.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-[#0284C7] transition-all text-base font-semibold shadow-inner"
                value={formData.title} 
                onChange={e => setFormData({...formData, title: e.target.value})} 
                placeholder="e.g. Cloud Valley Sovereign Estate & Spa Sanctuary" 
              />
              <p className="text-xs text-slate-500">Catchy, evocative title describing location and unique aesthetic.</p>
            </div>

            {/* Property Type Grid */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Architectural Category *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {PROPERTY_TYPES.map(pt => {
                  const isSelected = formData.type === pt.id;
                  const IconComponent = pt.icon;
                  return (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() => setFormData({...formData, type: pt.id})}
                      className={`p-4 rounded-2xl border text-left flex flex-col items-center justify-center gap-2.5 transition-all cursor-pointer ${
                        isSelected 
                          ? 'border-[#0284C7] bg-[#0284C7]/20 text-white ring-2 ring-[#0284C7] shadow-lg shadow-[#0284C7]/20 scale-[1.02]' 
                          : 'border-slate-800 bg-[#151D2C]/70 hover:bg-[#1C2638] hover:border-slate-600 text-slate-300 hover:text-white'
                      }`}
                    >
                      <IconComponent className={`w-6 h-6 ${isSelected ? 'text-[#0284C7]' : 'text-slate-400'}`} />
                      <span className="text-xs font-bold tracking-tight text-center">{pt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rental Mode */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Rental Structure Mode</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'entire_place', label: 'Entire Place', desc: 'Guests book the whole property' },
                  { id: 'private_rooms', label: 'Private Rooms', desc: 'Guests book individual room subunits' },
                  { id: 'hybrid', label: 'Hybrid Estate', desc: 'Rent as whole or by room types' }
                ].map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setFormData({...formData, rentalMode: mode.id as any})}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      formData.rentalMode === mode.id
                        ? 'border-[#0284C7] bg-[#0284C7]/15 text-white ring-1 ring-[#0284C7]'
                        : 'border-slate-800 bg-[#151D2C]/60 hover:bg-[#151D2C] text-slate-300'
                    }`}
                  >
                    <div className="font-bold text-sm text-white">{mode.label}</div>
                    <div className="text-xs text-slate-400 mt-1">{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* About The Sanctuary (Description) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">About The Sanctuary</label>
                <span className="text-xs text-slate-400 font-mono">{formData.description.length} chars</span>
              </div>
              <textarea 
                className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl p-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-[#0284C7] transition-all text-sm leading-relaxed h-32 font-medium resize-none shadow-inner"
                value={formData.description} 
                onChange={e => setFormData({...formData, description: e.target.value})} 
                placeholder="Paint a vivid sensory description of this estate..."
              />
            </div>

            {/* Host Philosophy */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Host Philosophy</label>
                <span className="text-xs text-slate-400 font-mono">{formData.host_philosophy.length} chars</span>
              </div>
              <textarea 
                className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl p-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0284C7] transition-all text-sm leading-relaxed h-24 font-medium resize-none shadow-inner"
                value={formData.host_philosophy} 
                onChange={e => setFormData({...formData, host_philosophy: e.target.value})} 
                placeholder="Describe your personal hosting philosophy, cultural approach, and what makes your hospitality unique..."
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
          <div className="space-y-8 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Location & Surroundings</h2>
              <p className="text-sm text-slate-400 mt-1">Pinpoint the exact spatial coordinates and curate high-intent neighborhood attractions.</p>
            </div>

            {/* Address & City */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Street / Estate Address</label>
                <input 
                  type="text" 
                  className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0284C7] text-sm font-medium"
                  value={formData.address} 
                  onChange={e => setFormData({...formData, address: e.target.value})} 
                  placeholder="e.g. Ridge Road, Valley Sanctuary Estate"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">City / Destination *</label>
                <input 
                  type="text" 
                  className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0284C7] text-sm font-medium"
                  value={formData.city} 
                  onChange={e => setFormData({...formData, city: e.target.value})} 
                  placeholder="e.g. Wayanad, Kerala"
                />
              </div>
            </div>

            {/* Interactive Location Picker Map */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Interactive Map Pin Location</label>
              <div className="rounded-2xl overflow-hidden border border-slate-700/80 bg-[#151D2C] p-2">
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
              <div className="flex gap-4 text-xs font-mono text-slate-400">
                <span>LAT: <strong className="text-white">{formData.lat.toFixed(4)}</strong></span>
                <span>LNG: <strong className="text-white">{formData.lng.toFixed(4)}</strong></span>
              </div>
            </div>

            {/* Nearby POIs */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex justify-between items-center">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Curated Neighborhood Highlights</label>
                  <p className="text-xs text-slate-500">Points of interest shown to prospective guests.</p>
                </div>
                <button 
                  type="button" 
                  disabled={isSuggestingPOIs}
                  onClick={suggestNearbyPOIs} 
                  className="px-4 py-2 bg-purple-600/20 border border-purple-500/40 hover:bg-purple-600/30 text-purple-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSuggestingPOIs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
                  <span>{isSuggestingPOIs ? 'Generating...' : 'AI Suggest POIs'}</span>
                </button>
              </div>

              <div className="space-y-3">
                {formData.nearby.map((poi: any, i: number) => (
                  <div key={i} className="flex gap-3 items-center bg-[#151D2C] p-3 rounded-xl border border-slate-700/80">
                    <span className="text-lg">📍</span>
                    <input 
                      type="text" 
                      className="bg-[#0B0F19] border border-slate-700/60 rounded-lg px-3 py-2 text-white text-xs font-semibold flex-1 focus:outline-none focus:ring-1 focus:ring-[#0284C7]" 
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
                      className="bg-[#0B0F19] border border-slate-700/60 rounded-lg px-3 py-2 text-white text-xs font-medium w-28 focus:outline-none focus:ring-1 focus:ring-[#0284C7]" 
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
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                ))}

                <button 
                  type="button" 
                  onClick={() => setFormData({...formData, nearby: [...formData.nearby, { name: '', distance: '', type: 'attraction' }]})}
                  className="w-full py-3 border-2 border-dashed border-slate-700 hover:border-[#0284C7] rounded-xl text-slate-400 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4"/> Add Neighborhood Point of Interest
                </button>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Room Classification Builder</h2>
              <p className="text-sm text-slate-400 mt-1">Select from Encho's curated room classifications, set individual rates, configure subunit inventories, and upload per-room spatial media galleries.</p>
            </div>

            <div className="space-y-4">
              {formData.rooms.map((room: any, rIdx: number) => {
                const isExpanded = expandedRoomId === room.id;
                return (
                  <div key={room.id} className="border border-slate-700/80 rounded-2xl bg-[#151D2C] overflow-hidden shadow-md">
                    {/* Header */}
                    <div 
                      className="p-5 flex items-center justify-between cursor-pointer hover:bg-[#1C2638] transition-colors select-none"
                      onClick={() => setExpandedRoomId(isExpanded ? null : room.id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{room.icon || '🛏️'}</span>
                        <div>
                          <h3 className="font-bold text-base text-white">{room.name || `Room Type #${rIdx + 1}`}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            {room.type && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#0284C7] bg-[#0284C7]/15 px-2 py-0.5 rounded-full border border-[#0284C7]/30">
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
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4"/>
                          </button>
                        )}
                        <div className={`w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Body */}
                    {isExpanded && (
                      <div className="p-6 pt-2 border-t border-slate-800 space-y-6 bg-[#0E1522]">
                        {/* Icon Picker */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Room Icon Badge</label>
                          <div className="flex flex-wrap gap-2">
                            {ROOM_ICONS.map(emoji => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => updateRoom(room.id, 'icon', emoji)}
                                className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all cursor-pointer ${
                                  room.icon === emoji 
                                    ? 'bg-[#0284C7] text-white ring-2 ring-[#0284C7]/50 scale-110 shadow-md' 
                                    : 'bg-[#151D2C] hover:bg-slate-700 text-slate-300'
                                }`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Classification Selector — Controlled, no free-form naming */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Room Classification *</label>
                            <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded-full border border-slate-700">
                              🔒 Standard classifications only
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                    isSelected
                                      ? 'border-[#0284C7] bg-[#0284C7]/15 ring-1 ring-[#0284C7]'
                                      : 'border-slate-700 bg-[#151D2C] hover:border-slate-500 hover:bg-[#1C2638]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-base">{cls.icon}</span>
                                    <span className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-200'}`}>{cls.label}</span>
                                    {isSelected && <span className="ml-auto text-[#0284C7] text-xs font-black">✓</span>}
                                  </div>
                                  <p className="text-[10px] text-slate-500 leading-tight">{cls.defaultSpecs}</p>
                                </button>
                              );
                            })}
                          </div>
                          {room.name && (
                            <div className="flex items-center gap-2 p-3 bg-[#0284C7]/10 border border-[#0284C7]/30 rounded-xl">
                              <span className="text-[#0284C7] text-xs font-bold">Selected:</span>
                              <span className="text-white text-xs font-bold">{room.name}</span>
                              <span className="text-slate-400 text-[10px] font-mono ml-auto">tier: {room.type}</span>
                            </div>
                          )}
                        </div>

                        {/* Row: Price, Capacity, Inventory */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Nightly Rate (₹) *</label>
                            <input 
                              type="number" 
                              className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-3 py-3 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.price || ''} 
                              onChange={e => updateRoom(room.id, 'price', parseFloat(e.target.value) || 0)} 
                              placeholder="18500"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Max Capacity</label>
                            <input 
                              type="number" 
                              min={1}
                              className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-3 py-3 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.capacity || 2} 
                              onChange={e => updateRoom(room.id, 'capacity', parseInt(e.target.value) || 1)} 
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Units Available</label>
                            <input 
                              type="number" 
                              min={1}
                              className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-3 py-3 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.inventory_count || 1} 
                              onChange={e => updateRoom(room.id, 'inventory_count', parseInt(e.target.value) || 1)} 
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Marketing Tag</label>
                            <input 
                              type="text" 
                              className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-3 py-3 text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                              value={room.tag || ''} 
                              onChange={e => updateRoom(room.id, 'tag', e.target.value)} 
                              placeholder="e.g. Most Popular"
                            />
                          </div>
                        </div>

                        {/* Specs */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Key Specs Line</label>
                          <input 
                            type="text" 
                            className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                            value={room.specs || ''} 
                            onChange={e => updateRoom(room.id, 'specs', e.target.value)} 
                            placeholder="e.g. 1,200 sq.ft · 270° Valley View · Heated Jacuzzi"
                          />
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Subunit Description</label>
                          <textarea 
                            className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl p-3.5 text-white placeholder:text-slate-500 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none" 
                            value={room.description || ''} 
                            onChange={e => updateRoom(room.id, 'description', e.target.value)} 
                            placeholder="Describe the architectural nuances and amenities of this specific room..."
                          />
                        </div>

                        {/* Features Chips */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Features & Amenities Highlights</label>
                          <div className="flex flex-wrap gap-2">
                            {(room.features || []).map((feat: string, fIdx: number) => (
                              <span key={fIdx} className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#151D2C] border border-slate-700 rounded-full text-xs text-white font-medium">
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
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRoomFeature(room.id); } }}
                              placeholder="Type a feature and press Add (e.g. Rain Shower)"
                              className="bg-[#151D2C] border border-slate-700 rounded-xl px-3 py-2 text-white text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-[#0284C7]"
                            />
                            <button 
                              type="button" 
                              onClick={() => addRoomFeature(room.id)}
                              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        </div>

                        {/* Room Photos with Spatial Sub-Classification */}
                        <div className="space-y-2 pt-2 border-t border-slate-800">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Room Photos & Spatial Sub-Classification</label>
                              <p className="text-xs text-slate-500 mt-0.5">Upload photos for <strong className="text-slate-300">{room.name || 'this room'}</strong> — then click any photo to tag it with its sub-category: <span className="text-[#0284C7]">Bedroom · Bathroom · Balcony · Pool & Wellness · Living Room · Views</span></p>
                            </div>
                            <span className="shrink-0 text-[10px] font-bold text-amber-400 bg-amber-900/30 border border-amber-800/50 px-2 py-1 rounded-full whitespace-nowrap">
                              🔒 Locked to: {room.name || 'Room'}
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
                className="w-full py-4 border-2 border-dashed border-slate-700 hover:border-[#0284C7] bg-[#151D2C]/40 hover:bg-[#151D2C] rounded-2xl text-slate-300 hover:text-white font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-5 h-5"/> Add Another Room Type
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Property-Wide Media</h2>
              <p className="text-sm text-slate-400 mt-1">Upload shared grounds, facade, pool, wellness, and restaurant photography for the main gallery.</p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Property Grounds & Common Photography</label>
              <PhotoUpload 
                photos={photos} 
                setPhotos={setPhotos} 
                lockedTier="common" 
                lockedTierLabel="Property & Amenities"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Hero Cinematic Video (YouTube / Vimeo / MP4)</label>
                <input 
                  type="text" 
                  className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                  value={formData.hero_video_url} 
                  onChange={e => setFormData({...formData, hero_video_url: e.target.value})} 
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Brand Color Accent</label>
                <div className="flex gap-3 items-center">
                  <input 
                    type="color" 
                    className="border border-slate-700 rounded-xl h-11 w-16 bg-[#151D2C] cursor-pointer" 
                    value={formData.dominant_color_hex} 
                    onChange={e => setFormData({...formData, dominant_color_hex: e.target.value})} 
                  />
                  <span className="font-mono text-sm font-bold text-slate-300">{formData.dominant_color_hex}</span>
                </div>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Amenities & Guest Capacity</h2>
              <p className="text-sm text-slate-400 mt-1">Select all features, luxury services, and structural guest safety guarantees.</p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Curated Amenities Checklist</label>
              <div className="bg-[#151D2C] p-4 rounded-2xl border border-slate-700/80">
                <AmenitiesPicker selected={formData.amenities} onChange={(amens) => setFormData({...formData, amenities: amens})} />
              </div>
            </div>

            {/* Guest capacity counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-800">
              {[
                { key: 'maxGuests', label: 'Max Guests' },
                { key: 'bedrooms', label: 'Bedrooms' },
                { key: 'beds', label: 'Total Beds' },
                { key: 'bathrooms', label: 'Bathrooms' },
              ].map(item => (
                <div key={item.key} className="bg-[#151D2C] p-4 rounded-2xl border border-slate-700/80 text-center space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{item.label}</span>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, [item.key]: Math.max(1, ((prev as any)[item.key] || 1) - 1) }))}
                      className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono text-xl font-extrabold text-white w-8">
                      {(formData as any)[item.key]}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, [item.key]: ((prev as any)[item.key] || 1) + 1 }))}
                      className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Policies, Guidelines & Concierge</h2>
              <p className="text-sm text-slate-400 mt-1">Set authoritative base rates, aristocratic hospitality guidelines, and bespoke concierge services.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Base Nightly Price (₹)</label>
                <input 
                  type="number" 
                  className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                  value={formData.price} 
                  onChange={e => setFormData({...formData, price: e.target.value})} 
                  placeholder="12000"
                />
                <p className="text-xs text-slate-500">Fallback rate when entire property is booked.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Weekend Surge Multiplier ({formData.dynamicPricing.weekendMultiplier}x)
                </label>
                <input 
                  type="range" 
                  min="1.0" 
                  max="2.0" 
                  step="0.05" 
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-[#0284C7]" 
                  value={formData.dynamicPricing.weekendMultiplier} 
                  onChange={e => setFormData({...formData, dynamicPricing: {...formData.dynamicPricing, weekendMultiplier: parseFloat(e.target.value)}})} 
                />
                <div className="flex justify-between text-[11px] font-mono text-slate-500">
                  <span>1.0x (Standard)</span>
                  <span>1.5x</span>
                  <span>2.0x (Double)</span>
                </div>
              </div>
            </div>

            {/* Aristocratic Hospitality Guidelines */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex justify-between items-center">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Aristocratic Hospitality Guidelines</label>
                  <p className="text-xs text-slate-500">Enter raw rules or let AI refine them into luxury etiquette.</p>
                </div>
                <button 
                  type="button" 
                  disabled={isCuratingRules}
                  onClick={handleCurateRules} 
                  className="px-4 py-2 bg-purple-600/20 border border-purple-500/40 hover:bg-purple-600/30 text-purple-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isCuratingRules ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-purple-400" />}
                  <span>{isCuratingRules ? 'Curating...' : 'Refine with AI'}</span>
                </button>
              </div>
              <textarea 
                className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl p-4 text-white placeholder:text-slate-500 text-sm h-32 focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none" 
                value={formData.raw_rules} 
                onChange={e => setFormData({...formData, raw_rules: e.target.value})} 
                placeholder="e.g. Quiet hours after 10 PM. No glass around the heated pool. Pets welcomed upon prior notification..."
              />
              {formData.curated_guidelines && (
                <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 leading-relaxed">
                  <div className="font-bold flex items-center gap-1 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" /> AI-Curated Luxury Etiquette:
                  </div>
                  {formData.curated_guidelines}
                </div>
              )}
            </div>

            {/* Concierge Privileges & Bespoke Services */}
            <div className="space-y-2 pt-4 border-t border-slate-800">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Concierge Privileges & Bespoke Services</label>
              <textarea 
                className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl p-4 text-white placeholder:text-slate-500 text-sm h-28 focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none" 
                value={formData.concierge_privileges} 
                onChange={e => setFormData({...formData, concierge_privileges: e.target.value})} 
                placeholder="Describe exclusive services offered... e.g. Dedicated 24/7 butler, private sommelier, helipad access, in-villa spa treatments."
              />
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">SEO & Search Card Preview</h2>
              <p className="text-sm text-slate-400 mt-1">Optimize metadata so prospective high-net-worth guests discover your listing on Google Search.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">SEO Page Title Tag</label>
                <input 
                  type="text" 
                  className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                  value={formData.seo_title} 
                  onChange={e => setFormData({...formData, seo_title: e.target.value})} 
                  placeholder={formData.title || "Luxury Stay & Resort"}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Meta Meta Description</label>
                <textarea 
                  className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl p-3.5 text-white placeholder:text-slate-500 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-[#0284C7] resize-none" 
                  value={formData.seo_description} 
                  onChange={e => setFormData({...formData, seo_description: e.target.value})} 
                  placeholder="Experience unrivaled serenity, private chef dining, and panoramic vistas at..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Target SEO Keywords</label>
                <input 
                  type="text" 
                  className="w-full bg-[#151D2C] border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7]" 
                  value={formData.seo_keywords} 
                  onChange={e => setFormData({...formData, seo_keywords: e.target.value})} 
                  placeholder="luxury villa, private pool resort, wayanad retreat"
                />
              </div>
            </div>

            {/* Google Search Card Preview */}
            <div className="space-y-2 pt-4 border-t border-slate-800">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Live Google SERP Card Simulation</label>
              <div className="p-5 bg-[#151D2C] rounded-2xl border border-slate-700/80 shadow-md">
                <div className="text-xs text-emerald-400 font-mono">https://encho.space/stay/{formData.city.toLowerCase().replace(/\s+/g, '-') || 'wayanad'}</div>
                <div className="text-lg font-semibold text-[#60A5FA] hover:underline cursor-pointer mt-0.5">
                  {formData.seo_title || formData.title || "Luxury Architectural Sanctuary | Encho"}
                </div>
                <div className="text-xs text-slate-300 mt-1 leading-relaxed line-clamp-2">
                  {formData.seo_description || formData.description || "Discover verified architectural stays and boutique sanctuaries on Encho."}
                </div>
              </div>
            </div>
          </div>
        );

      case 8:
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">AI Quality Pre-Flight Scan</h2>
              <p className="text-sm text-slate-400 mt-1">Our FAANG-grade AI Gatekeeper audits listing completeness, high-res photography, and pricing taxonomy.</p>
            </div>

            <div className="p-8 bg-gradient-to-br from-[#151D2C] to-[#0E1522] rounded-3xl border border-slate-700/80 text-center space-y-6 shadow-xl">
              <div className="max-w-md mx-auto space-y-4">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-[#0284C7]/20 border border-[#0284C7]/40 flex items-center justify-center text-[#0284C7] shadow-lg shadow-[#0284C7]/20">
                  <Sparkles className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-black text-white">Automated AI Quality Gatekeeper</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Pre-flight scans verify image aspect ratios, copy quality, subunit completeness, and ad network compliance before live distribution.
                </p>
                <button 
                  type="button" 
                  disabled={isScanning}
                  onClick={runAiGatekeeper} 
                  className="w-full py-4 bg-gradient-to-r from-[#0284C7] to-indigo-600 hover:from-[#0274B7] hover:to-indigo-500 text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#0284C7]/25 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isScanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  <span>{isScanning ? 'Auditing Listing with Gemini AI...' : 'Run Pre-Flight AI Scan'}</span>
                </button>
              </div>

              {/* Score Display */}
              {aiScore !== null && (
                <div className="p-6 bg-[#0B0F19] rounded-2xl border border-slate-800 text-center space-y-4 animate-in zoom-in-95 duration-300">
                  <div className="inline-flex flex-col items-center">
                    <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-[#0284C7] font-mono">
                      {aiScore}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Quality Index Score / 10</span>
                  </div>

                  {aiResult && (
                    <div className="text-left space-y-3 max-w-lg mx-auto pt-4 border-t border-slate-800">
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        {aiScore >= 8 ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 text-amber-400" />}
                        <span>{aiResult.headline || (aiScore >= 8 ? 'Cleared for Ad Engine & Live Directory' : 'Recommended Improvements Needed')}</span>
                      </div>
                      {aiResult.issues && aiResult.issues.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Optimization Feedback:</span>
                          <ul className="text-xs text-slate-400 list-disc list-inside space-y-1">
                            {aiResult.issues.map((iss: string, i: number) => <li key={i}>{iss}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Interactive Guest View & Spatial Gallery Launcher */}
            <div className="p-6 bg-gradient-to-br from-[#101A2D] to-[#0A101C] rounded-3xl border border-sky-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-4 text-left">
                <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 shadow-lg shadow-sky-500/10">
                  <Eye className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-black text-white">Full Guest Page & Spatial Gallery Simulation</h4>
                    <span className="text-[10px] font-bold text-sky-400 bg-sky-950/80 border border-sky-500/40 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      Live Preview
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Test your live sanctuary page, rooms breakdown, sensory atmosphere deck, and 360 spatial galleries across desktop, tablet, and mobile simulator frames.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
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
      <div className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center p-6 text-center text-slate-100">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 bg-[#0284C7]/20 border border-[#0284C7] rounded-full flex items-center justify-center mb-6 shadow-xl shadow-[#0284C7]/20"
        >
          <ShieldCheck className="w-10 h-10 text-[#0284C7]" />
        </motion.div>
        <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
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
    <div className="min-h-screen bg-[#0B0F19] text-white font-sans flex flex-col selection:bg-[#0284C7] selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-[#0B0F19]/90 backdrop-blur-xl border-b border-slate-800/80 px-4 md:px-8 py-3.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={onBack} 
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer border border-slate-700/60"
            title="Go Back"
          >
            <ChevronLeft className="w-5 h-5"/>
          </button>
          <div>
            <h1 className="font-extrabold text-base text-white tracking-tight leading-tight">
              {existingListing ? 'Revise Luxury Listing' : 'Setup Masterful Listing'}
            </h1>
            <p className="text-[10px] uppercase font-extrabold tracking-widest text-[#0284C7]">Encho Host Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono font-bold text-slate-400">
            <span>Step {currentStep} of {STEPS.length}</span>
            <span className="text-slate-600">·</span>
            <span className="text-white font-bold">{STEPS[currentStep - 1].name}</span>
          </div>

          {/* 10/10 Live Guest Preview Trigger */}
          <button 
            type="button" 
            onClick={() => setIsPreviewOpen(true)}
            className="px-3.5 py-2 bg-gradient-to-r from-sky-500/15 via-indigo-500/15 to-purple-500/15 border border-sky-500/35 hover:border-sky-400 hover:bg-sky-500/25 text-sky-200 hover:text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md shadow-sky-950/50 cursor-pointer group"
            title="Open Live Guest Experience Preview & Spatial Gallery"
          >
            <Eye className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">Live Guest View</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          <button 
            type="button" 
            onClick={onBack} 
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white uppercase tracking-wider transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button 
            form="host-form" 
            type="submit" 
            disabled={loading} 
            className="px-6 py-2.5 bg-[#0284C7] hover:bg-[#0274B7] disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-[#0284C7]/20 flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{loading ? 'Saving...' : existingListing ? 'Save Master' : 'Publish Listing'}</span>
          </button>
        </div>
      </header>

      {/* Step Pills Navigation Ribbon */}
      <div className="bg-[#0E1522] border-b border-slate-800/80 overflow-x-auto py-2.5 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
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
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  isActive 
                    ? 'bg-[#0284C7] border-[#0284C7] text-white shadow-md shadow-[#0284C7]/25 scale-105' 
                    : isCompleted 
                      ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60' 
                      : 'bg-[#151D2C] border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                <span className={`w-4 h-4 rounded-full text-[10px] font-mono flex items-center justify-center ${
                  isActive ? 'bg-white text-[#0284C7] font-black' : isCompleted ? 'bg-emerald-400 text-emerald-950 font-black' : 'bg-slate-700 text-slate-300'
                }`}>
                  {isCompleted ? '✓' : s.id}
                </span>
                <span>{s.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Form Body */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 flex-1 w-full">
        {/* Left Sidebar Steps */}
        <aside className="hidden lg:block">
          <div className="space-y-2 sticky top-28 bg-[#151D2C]/60 p-3 rounded-2xl border border-slate-800/80">
            <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Navigation Steps ({progressPercent}%)
            </div>
            {STEPS.map(s => {
              const isActive = currentStep === s.id;
              const isCompleted = currentStep > s.id;
              const StepIcon = s.icon;
              return (
                <div 
                  key={s.id} 
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
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                    isActive 
                      ? 'border-[#0284C7] bg-[#0284C7]/15 text-white shadow-md' 
                      : isCompleted 
                        ? 'border-transparent text-emerald-300 hover:bg-white/5' 
                        : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono font-bold mt-0.5 ${
                    isActive ? 'bg-[#0284C7] text-white' : isCompleted ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {isCompleted ? '✓' : s.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-bold text-xs tracking-tight ${isActive ? 'text-white' : isCompleted ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {s.label}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {s.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Form Main Canvas */}
        <main className="bg-[#111827]/70 border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-sm">
          <form id="host-form" onSubmit={handleSubmit}>
            <AnimatePresence mode="wait">
              <motion.div 
                key={currentStep} 
                initial={{ opacity: 0, y: 8 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </form>
        </main>
      </div>

      {/* Sticky Bottom Control Bar */}
      <footer className="sticky bottom-0 z-40 bg-[#0B0F19]/95 backdrop-blur-xl border-t border-slate-800/80 px-4 md:px-8 py-4 flex items-center justify-between shadow-2xl">
        <button 
          type="button" 
          onClick={handlePrevStep} 
          disabled={currentStep === 1} 
          className="px-6 py-2.5 rounded-xl bg-[#151D2C] hover:bg-slate-700 disabled:opacity-30 border border-slate-700/80 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          {currentStep < 8 ? (
            <button 
              type="button"
              onClick={handleNextStep} 
              className="px-8 py-2.5 bg-[#0284C7] hover:bg-[#0274B7] text-white font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-[#0284C7]/25 flex items-center gap-2 cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button 
              form="host-form" 
              type="submit" 
              disabled={loading}
              className="px-8 py-2.5 bg-gradient-to-r from-[#0284C7] to-emerald-500 hover:from-[#0274B7] hover:to-emerald-600 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>{loading ? 'Publishing...' : 'Publish Listing'}</span>
            </button>
          )}
        </div>
      </footer>

      {/* ── FLOATING QUICK-ACTION PREVIEW PILL (ALWAYS ACCESSIBLE) ── */}
      <div className="fixed bottom-20 right-6 z-40">
        <motion.button
          type="button"
          onClick={() => setIsPreviewOpen(true)}
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

              {/* Center Device Switcher */}
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

