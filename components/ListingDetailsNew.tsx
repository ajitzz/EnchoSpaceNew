import { useAuth } from './AuthContext';
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useMotionTemplate, useMotionValueEvent } from 'framer-motion';
import { SEO } from './SEO';
import { Listing } from '../types';
import { ListingErrorBoundary } from './ListingErrorBoundary';

export const getBrandTypography = (fontId?: string) => {
    switch (fontId) {
        case 'font-playfair': return { fontFamily: '"Playfair Display", serif', className: 'tracking-wider font-semibold' };
        case 'font-cormorant': return { fontFamily: '"Cormorant", serif', className: 'tracking-[0.15em] uppercase font-semibold' };
        case 'font-montserrat': return { fontFamily: '"Montserrat", sans-serif', className: 'tracking-[0.25em] uppercase font-medium' };
        default: return { fontFamily: 'var(--font-display)', className: 'tracking-[0.22em] uppercase font-medium' };
    }
};

export const getBrandColorStyle = (colorId?: string) => {
    switch (colorId) {
        case 'text-amber-800': return '#92400E';
        case 'text-teal-900': return '#134E4A';
        case 'text-rose-900': return '#881337';
        case 'text-blue-950': return '#172554';
        case 'text-zinc-900':
        default:
            return '#18181B';
    }
};

import { useListingTelemetry } from '../hooks/useListingTelemetry';
import { OptimizedImage } from './OptimizedImage';
import { CinematicVideoPlayer } from './CinematicVideoPlayer';
import { ChevronLeft, HeartIcon, ShieldCheck } from './Icons';
import {
  Share,
  Users,
  Eye,
  Image as ImageIcon,
  MessageCircle,
  MapPin,
  Star,
  Sparkles,
  Navigation,
  Calendar,
  CreditCard,
  Clock,
  ShieldAlert,
  CheckCircle2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  X,
  Check,
  ChevronRight,
  ArrowRight,
  Mail,
  Flame,
  Waves,
  Utensils,
  Wifi,
  Mountain,
  Wine,
  Award,
  Lock,
  Send,
  Loader2,
  Tag,
  Crown,
  Plus,
  Minus,
  Search,
  Bookmark,
  Share2,
  Compass,
  ArrowUpRight,
  Coffee,
  Sun,
  Moon,
  Dumbbell,
  Shield,
  Trees,
  Heart,
  Radio,
  Camera,
  Film,
  BookOpen,
  Wind,
  Anchor,
  Tent,
  Bed, Menu
} from 'lucide-react';
import { uiAudio } from './audio';
import { useToast } from './ToastContext';
import { SanctuaryGalleryModal, GalleryCategoryKey } from './SanctuaryGalleryModal';
import { EnchoWordmark } from './EnchoWordmark';
import { getSensoryTagIcon } from './SensoryTagPicker';
import MuxPlayer from '@mux/mux-player-react';

// LEGACY fallback — used only when listing.rooms[] is empty (MIG-001)
export const LEGACY_ROOM_TIER_CONFIG: Record<string, {
  name: string; price: number; priceUsd: number; capacity: number; specs: string; tag: string; icon: string;
}> = {
  suites:    { name: 'Presidential Panorama Suite', price: 18500, priceUsd: 220, capacity: 2, specs: '1,200 sq.ft · 270° Valley View · Heated Jacuzzi', tag: 'Master Luxury', icon: '👑' },
  deluxe:    { name: 'Deluxe Garden Double Room',   price: 11500, priceUsd: 140, capacity: 2, specs: '650 sq.ft · Garden Verandah · Twin Plush Beds', tag: 'Recommended', icon: '🛏️' },
  executive: { name: 'Executive Studio Sanctuary',  price: 7500,  priceUsd: 90,  capacity: 1, specs: '420 sq.ft · Work Enclave · Rain Shower', tag: 'Solo & Work', icon: '💻' }
};
// Backward-compat alias — preserves existing imports
export const ROOM_TIER_CONFIG = LEGACY_ROOM_TIER_CONFIG;

interface ListingDetailsNewProps {
  listing: Listing;
  onBack: () => void;
  onListingClick?: (listing: Listing) => void;
  similarListings?: Listing[];
  isFavorite?: boolean;
  onToggleFavorite?: (listing: Listing) => void;
  onBook?: (data: any) => void;
  onContactHost?: () => void;
  onRequestAuth?: () => void;
  initialGalleryOpen?: boolean;
  isPreview?: boolean;
}

// Legacy getTagIcon removed in favor of shared getSensoryTagIcon

const LUXURY_BACKUP_POOL = [
  "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1506059612708-99d6c258160e?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1544984243-ec57ea16fe25?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=800&q=80"
];
const DEFAULT_IMAGES = LUXURY_BACKUP_POOL.slice(0, 5);

const ListingDetailsNewContent: React.FC<ListingDetailsNewProps> = ({ 
  listing: initialListing, 
  onBack, 
  onListingClick,
  similarListings, 
  isFavorite, 
  onToggleFavorite, 
  onBook, 
  onContactHost, 
  onRequestAuth,
  initialGalleryOpen = false,
  isPreview = false
}) => {
  const [listing, setListing] = useState<Listing>(initialListing);

  useEffect(() => {
    setListing(initialListing);
    if (!isPreview && initialListing.id && initialListing.id !== 'live-preview-sanctuary' && !String(initialListing.id).startsWith('demo-')) {
      fetch(`/api/listings/${initialListing.id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.id) {
             setListing(prev => ({ ...prev, ...data }));
          }
        })
        .catch(console.error);
    }
  }, [initialListing, isPreview]);

  const { user } = useAuth();
  const { addToast } = useToast();
  const { trackPhotoView, trackDateSelection } = useListingTelemetry(listing.id);
  const [liveViewers, setLiveViewers] = useState(1);
  const [activeMobileImage, setActiveMobileImage] = useState(0);

  // Chameleon UI Dynamic Dominant Color
  const dominantColor = listing.dominant_color_hex || '#06b6d4';
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [activeGalleryTab, setActiveGalleryTab] = useState('all');
  const [activeSlide, setActiveSlide] = useState(0);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [radarCategory, setRadarCategory] = useState<string>("DESTINATION");
  const [activeTouristPlace, setActiveTouristPlace] = useState<any | null>(null);
  const [activeCollageCenterIndex, setActiveCollageCenterIndex] = useState<number | null>(null);
  const collageTrackRef = useRef<HTMLDivElement>(null);


  // 10/10 Award-Winning Header Scroll Mechanics
  const { scrollY } = useScroll();
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const direction = latest - lastScrollY.current;
    if (latest < 100) {
      setIsHeaderVisible(true);
    } else {
      if (direction > 10 && isHeaderVisible) { // scrolling down
        setIsHeaderVisible(false);
      } else if (direction < -10 && !isHeaderVisible) { // scrolling up
        setIsHeaderVisible(true);
      }
    }
    lastScrollY.current = latest;
  });

  const headerBgColor = useTransform(scrollY, [0, 100, 400], ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.4)", "rgba(255, 255, 255, 0.75)"]);
  const headerBgColorDark = useTransform(scrollY, [0, 100, 400], ["rgba(24, 24, 27, 0)", "rgba(24, 24, 27, 0.4)", "rgba(24, 24, 27, 0.75)"]);
  const headerBlur = useTransform(scrollY, [0, 100, 400], ["blur(0px)", "blur(12px)", "blur(24px)"]);
  const headerBorder = useTransform(scrollY, [0, 400], ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.2)"]);
  
  const titleOpacity = useTransform(scrollY, [150, 300], [0, 1]);
  const titleY = useTransform(scrollY, [150, 300], [10, 0]);
  
  // Transition text color from white (over video) to zinc (over light bg) on mobile
  const textColorMobile = useTransform(scrollY, [0, 300], ["#ffffff", "#18181b"]);

  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    setIsDesktop(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);


  // 10/10 Adaptive Media Allocator: Guarantees zero duplicate images across all collections
  const uniqueMediaPool = useMemo(() => {
    const raw = (listing.imageUrls && listing.imageUrls.length > 0)
      ? listing.imageUrls
      : (listing.imageUrl ? [listing.imageUrl] : []);
    
    const combined = [...raw];
    // Fill remaining slots with distinct luxury assets from pool
    for (const backup of LUXURY_BACKUP_POOL) {
      if (combined.length >= 24) break;
      if (!combined.includes(backup)) {
        combined.push(backup);
      }
    }
    return combined;
  }, [listing.imageUrls, listing.imageUrl]);


  // Mobile Center-Pivot Scroll Spotlight for Monochrome-to-Color Collage
  const handleCollageTrackScroll = useCallback(() => {
    if (!collageTrackRef.current) return;
    const container = collageTrackRef.current;
    const centerPoint = container.scrollLeft + container.clientWidth / 2;
    const cards = container.children;
    let closestIndex = null;
    let minDistance = Infinity;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as HTMLElement;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - centerPoint);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }
    setActiveCollageCenterIndex(closestIndex);
  }, []);

  const images = uniqueMediaPool;

  // MIG-001: Dual-read — live room data takes precedence over LEGACY_ROOM_TIER_CONFIG
  const liveRoomConfigs = useMemo(() => {
    if (!listing.rooms || listing.rooms.length === 0) return null;
    const configs: Record<string, { name: string; price: number; capacity: number; specs: string; tag: string; icon: string; description: string; features: string[]; }> = {};
    (listing.rooms as any[]).forEach(room => {
      const key = room.type || room.id || `room_${room.name}`;
      configs[key] = {
        name: room.name || key,
        price: Number(room.price) || 0,
        capacity: room.capacity || 2,
        specs: room.specs || (Array.isArray(room.features) ? room.features.join(' · ') : ''),
        tag: room.tag || '',
        icon: room.icon || '🛏️',
        description: room.description || '',
        features: Array.isArray(room.features) ? room.features : []
      };
    });
    return Object.keys(configs).length > 0 ? configs : null;
  }, [listing.rooms]);

  const availableRoomTiers = useMemo(() => {
    if (liveRoomConfigs) return Object.keys(liveRoomConfigs);
    return ['suites', 'deluxe', 'executive'];
  }, [liveRoomConfigs]);

  const getRoomConfig = useCallback((tierKey: string) => {
    if (liveRoomConfigs && liveRoomConfigs[tierKey]) return liveRoomConfigs[tierKey];
    return LEGACY_ROOM_TIER_CONFIG[tierKey] || LEGACY_ROOM_TIER_CONFIG['deluxe'];
  }, [liveRoomConfigs]);

  // Curated AI Tourist Concierge Dataset (Home Epicenter + Dynamic Category Pruning)
  const sanctuaryHomePOI = useMemo(() => ({
    id: 'sanctuary-home',
    isHome: true,
    name: listing.title ? `${listing.title} (Our Sanctuary)` : 'Our Sanctuary',
    localScript: 'നിങ്ങളുടെ വസതി · Sanctuary Residence',
    category: 'HOME',
    type: 'SANCTUARY RESIDENCE',
    distance: 'Home Epicenter',
    rating: listing.rating || 4.95,
    reviewCount: listing.reviewCount || 128,
    photo: listing.imageUrl || listing.imageUrls?.[0] || 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80',
    summary: 'Your central private luxury retreat from which all regional expeditions and mountain treks begin. 100% verified security and privacy.',
    address: `${listing.city || 'Wayanad'}, Kerala`,
    pinCode: 'Verified Sanctuary Coordinates',
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((listing.title || 'Sanctuary') + ' ' + (listing.city || 'Kerala'))}`,
    pinTop: '50%',
    pinLeft: '50%'
  }), [listing]);

  const curatedNeighborhoodPOIs = useMemo(() => {
    if (listing.nearby && Array.isArray(listing.nearby) && (listing.nearby as any[]).length > 0) {
      return (listing.nearby as any[]).map((poi: any, index: number) => {
        const angle = (index * (360 / (listing.nearby as any[]).length)) * (Math.PI / 180);
        const radius = 25;
        
        let pinTop = `${50 + (Math.sin(angle) * radius)}%`;
        let pinLeft = `${50 + (Math.cos(angle) * radius)}%`;
        
        if (poi.lat && poi.lng && listing.lat && listing.lng) {
           const latDiff = (listing.lat - poi.lat) * 2000;
           const lngDiff = (poi.lng - listing.lng) * 2000; 
           pinTop = `${Math.max(10, Math.min(90, 50 + latDiff))}%`;
           pinLeft = `${Math.max(10, Math.min(90, 50 + lngDiff))}%`;
        }

        const isRestaurant = poi.categoryGroup === 'restaurant' || ['fine_dining', 'cafe', 'farm_to_table', 'restaurant', 'dining', 'local_authentic', 'scenic_bar'].includes(poi.type);

        const fallbackImages: Record<string, string> = {
          'nature': 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1200&q=80',
          'culture': 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80',
          'landmark': 'https://images.unsplash.com/photo-1548625361-ec8587114b7e?auto=format&fit=crop&w=1200&q=80',
          'viewpoint': 'https://images.unsplash.com/photo-1534008897995-27a23e859048?auto=format&fit=crop&w=1200&q=80',
          'experience': 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
          'fine_dining': 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1200&q=80',
          'cafe': 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
          'farm_to_table': 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=1200&q=80',
          'local_authentic': 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
          'scenic_bar': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80'
        };

        return {
          id: poi.id || Math.random().toString(),
          isHome: false,
          name: poi.name || '',
          distance: poi.distance || '',
          type: poi.type || (isRestaurant ? 'fine_dining' : 'attraction'),
          cuisine: poi.cuisine || '',
          description: poi.description || (isRestaurant ? (poi.cuisine || 'Curated culinary destination.') : 'A highly recommended destination.'),
          summary: poi.description || (isRestaurant ? (poi.cuisine || 'Curated culinary destination.') : 'A highly recommended destination.'),
          photo: poi.photoUrl || fallbackImages[poi.type] || (isRestaurant ? fallbackImages['fine_dining'] : fallbackImages['experience']),
          category: isRestaurant ? 'RESTAURANT' : 'DESTINATION',
          pinTop,
          pinLeft,
          googleMapsUrl: poi.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((poi.name || '') + ' ' + (listing.city || ''))}`,
          rating: poi.rating || (isRestaurant ? 4.8 : 4.5)
        };
      });
    }
    return [];
  }, [listing.nearby, listing.lat, listing.lng, listing.city]);

  // AI Dynamic Category Pruning: Only show categories that have high-quality items
  const availableRadarCategories = useMemo(() => {
    const categories: { id: string; label: string }[] = [{ id: 'DESTINATION', label: 'Top Destinations' }];
    const hasRestaurants = curatedNeighborhoodPOIs.some(p => p.category === 'RESTAURANT');
    if (hasRestaurants) categories.push({ id: 'RESTAURANT', label: 'Restaurants & Dining' });
    return categories;
  }, [curatedNeighborhoodPOIs]);

  const filteredPOIs = useMemo(() => {
    const list = curatedNeighborhoodPOIs.filter(p => p.category === radarCategory);
    return [sanctuaryHomePOI, ...list];
  }, [curatedNeighborhoodPOIs, radarCategory, sanctuaryHomePOI]);


  // Curated Room Inventory Collections (Suites, Double Rooms, Single Rooms)
  const slideCollections = useMemo(() => {
    const inferUnitType = (name: string): string => {
      const n = (name || '').toLowerCase();
      if (n.includes('suite')) return 'Suite';
      if (n.includes('villa')) return 'Villa';
      if (n.includes('studio')) return 'Studio';
      if (n.includes('duplex')) return 'Duplex';
      if (n.includes('bungalow')) return 'Bungalow';
      if (n.includes('penthouse')) return 'Penthouse';
      if (n.includes('cottage')) return 'Cottage';
      if (n.includes('room')) return 'Room';
      return 'Accommodation';
    };

    const categoryTagMap: Record<string, string> = {
      'bedroom': 'Bedrooms & Sleeping Quarters',
      'bathroom': 'Bathrooms & Spa',
      'balcony': 'Balconies & Terraces',
      'living_room': 'Living Room & Atrium',
      'living': 'Living Room & Lounge',
      'dining': 'Dining & Kitchen',
      'pool': 'Pool & Wellness',
      'garden': 'Gardens & Courtyards',
      'exterior': 'Exterior Architecture',
      'restaurant': 'Restaurant & Dining',
      'lobby': 'Lobby & Reception',
      'spa': 'Spa & Wellness',
      'gym': 'Gym & Fitness',
      'activity_area': 'Activity & Recreation',
      'view': 'Panoramic Views',
      'parking': 'Arrival & Parking',
      'details': 'Curated Details',
      'other': 'Sanctuary Space'
    };

    // MIG-002: Use structured photos if available
    if (listing.photos && (listing.photos as any[]).length > 0) {
      const byTier: Record<string, any[]> = {};
      (listing.photos as any[]).forEach((photo: any) => {
        const tier = photo.tier || 'common';
        if (!byTier[tier]) byTier[tier] = [];
        byTier[tier].push(photo);
      });
      const commonPhotos = byTier['common'] || [];
      
      const collections = availableRoomTiers.map((tierKey, index) => {
        const roomCfg = getRoomConfig(tierKey);
        const unitType = inferUnitType(roomCfg.name);
        // STRICT SPATIAL SEPARATION: Use 100% room photos. Never prepend common grounds photos!
        const roomPhotosOnly = (byTier[tierKey] || []).filter(p => p.url);
        const tierPhotos = roomPhotosOnly.length > 0 ? roomPhotosOnly : commonPhotos.filter(p => p.url);
        
        let defaultSpaceTags = ['HERO FEATURE ANCHOR', 'HORIZON BALCONY', 'SPA ENSUITE', 'MASTER SALON'];
        let defaultSpaceTitles = [
          roomCfg.name,
          'Private Glass Balcony & Horizon Deck',
          'Ensuite Italian Marble Spa Bath',
          'Acoustic Hearth & Evening Reading Salon'
        ];

        if (tierKey === 'deluxe') {
          defaultSpaceTags = ['HERO FEATURE ANCHOR', 'TWIN SUITE', 'GARDEN BATH', 'VERANDAH'];
          defaultSpaceTitles = [
            roomCfg.name,
            'Twin Plush Organic Cotton Bedding',
            'Rainforest View Ensuite Bath',
            'Private Sunlit Verandah & Lounge'
          ];
        } else if (tierKey === 'executive') {
          defaultSpaceTags = ['HERO FEATURE ANCHOR', 'Work & Living Area', 'Architectural Details', 'Private Terrace'];
          defaultSpaceTitles = [
            roomCfg.name,
            'Dedicated Ergonomic Work Enclave',
            'Bespoke Studio Architectural Details',
            'Courtyard Reading Nook'
          ];
        }

        const spaces = tierPhotos.slice(0, 6).map((photo: any, pIdx: number) => {
          const categoryKey = (photo.category || '').toLowerCase();
          const subCategoryLabel = categoryTagMap[categoryKey]
            || (photo.categoryLabel || photo.tag || defaultSpaceTags[pIdx % defaultSpaceTags.length]);

          const spaceTag = pIdx === 0 
            ? 'HERO FEATURE ANCHOR' 
            : subCategoryLabel;

          const spaceTitle = pIdx === 0 
            ? (roomCfg.name || 'Presidential Panorama Suite')
            : (photo.description && photo.description.trim() 
                ? photo.description.trim() 
                : (photo.title && photo.title !== roomCfg.name ? photo.title : defaultSpaceTitles[pIdx % defaultSpaceTitles.length]));

          return {
            title: spaceTitle,
            caption: photo.description || roomCfg.specs || '',
            img: photo.url,
            imgIndex: 0,
            desc: photo.description || roomCfg.specs || '',
            tag: spaceTag,
            hasVideo: pIdx === 0 && !!((listing as any).hero_video_url || listing.video_url),
            unitType
          };
        });
        
        // Pad to ensure space01 - space04 exist only if room has < 4 photos
        let padIdx = 0;
        while (spaces.length < 4) {
          const fallbackImg = commonPhotos[padIdx]?.url || uniqueMediaPool[padIdx % uniqueMediaPool.length];
          spaces.push({
            title: `${roomCfg.name} · Space 0${spaces.length + 1}`,
            caption: '',
            img: fallbackImg,
            imgIndex: 0,
            desc: '',
            tag: 'Sanctuary Architecture',
            hasVideo: false,
            unitType
          });
          padIdx++;
        }

        return {
          id: tierKey,
          name: `${String(index + 1).padStart(2, '0')} · ${roomCfg.name}`,
          description: (roomCfg as any).description || roomCfg.specs,
          unitType,
          spaces: spaces,
          space01: { ...spaces[0], unitType },
          space02: spaces[1],
          space03: spaces[2],
          space04: spaces[3]
        };
      }).filter(col => col.spaces.length > 0);
      
      if (collections.length > 0) return collections;
    }
    
    // Legacy positional fallback
    const pool = uniqueMediaPool;
    return [
      {
        id: 'suites',
        name: '01 · ' + LEGACY_ROOM_TIER_CONFIG.suites.name,
        description: LEGACY_ROOM_TIER_CONFIG.suites.specs,
        unitType: 'Suite',
        spaces: [
          { title: LEGACY_ROOM_TIER_CONFIG.suites.name, caption: LEGACY_ROOM_TIER_CONFIG.suites.specs, img: pool[0] },
          { title: 'Panorama Terrace', caption: 'Private wraparound verandah', img: pool[1] },
          { title: 'Architectural Detail', caption: 'Custom crafted finishes and stone textures', img: pool[2] },
          { title: 'Valley Living Salon', caption: 'Integrated architectural living space', img: pool[3] }
        ],
        space01: {
          title: `${listing.title ? listing.title.split('•')[0].trim() : 'Sanctuary'} Presidential Panorama Suite`,
          desc: 'Panoramic master glass suite with custom king platform bed, private jacuzzi lounge, and valley vistas.',
          img: pool[0], imgIndex: 0, tag: 'Presidential Suite', unitType: 'Suite', hasVideo: !!((listing as any).hero_video_url || listing.video_url)
        },
        space02: { title: 'Private Glass Balcony & Horizon Deck', img: pool[1], imgIndex: 1, tag: 'HORIZON BALCONY' },
        space03: { title: 'Ensuite Italian Marble Spa Bath', img: pool[2], imgIndex: 2, tag: 'SPA ENSUITE' },
        space04: { title: 'Acoustic Hearth & Evening Reading Salon', img: pool[3], imgIndex: 3, tag: 'MASTER SALON' }
      },
      {
        id: 'deluxe',
        name: '02 · ' + LEGACY_ROOM_TIER_CONFIG.deluxe.name,
        description: LEGACY_ROOM_TIER_CONFIG.deluxe.specs,
        unitType: 'Room',
        spaces: [
          { title: LEGACY_ROOM_TIER_CONFIG.deluxe.name, caption: LEGACY_ROOM_TIER_CONFIG.deluxe.specs, img: pool[4] },
          { title: 'Plush Bedding Area', caption: 'Plush organic cotton twin setup', img: pool[5] },
          { title: 'Architectural Detail', caption: 'Refined garden interior textures', img: pool[6] },
          { title: 'Private Verandah', caption: 'Integrated garden access', img: pool[7] }
        ],
        space01: { title: 'The Deluxe Garden Double Room', desc: 'Spacious double room featuring twin plush organic cotton beds, garden terrace, and en-suite marble bath.', img: pool[4], imgIndex: 4, tag: 'Deluxe Double Room', unitType: 'Room' },
        space02: { title: 'Twin Plush Organic Cotton Bedding', img: pool[5], imgIndex: 5, tag: 'TWIN SUITE' },
        space03: { title: 'Rainforest View Ensuite Bath', img: pool[6], imgIndex: 6, tag: 'GARDEN BATH' },
        space04: { title: 'Private Sunlit Verandah & Lounge', img: pool[7], imgIndex: 7, tag: 'VERANDAH' }
      },
      {
        id: 'executive',
        name: '03 · ' + LEGACY_ROOM_TIER_CONFIG.executive.name,
        description: LEGACY_ROOM_TIER_CONFIG.executive.specs,
        unitType: 'Studio',
        spaces: [
          { title: LEGACY_ROOM_TIER_CONFIG.executive.name, caption: LEGACY_ROOM_TIER_CONFIG.executive.specs, img: pool[8] },
          { title: 'Work & Living Enclave', caption: 'Ergonomic dedicated productivity space', img: pool[9] },
          { title: 'Architectural Detail', caption: 'Minimalist studio design elements', img: pool[10] },
          { title: 'Courtyard Terrace', caption: 'Private balcony with serene natural light', img: pool[11] }
        ],
        space01: { title: 'The Executive Studio Sanctuary', desc: 'Minimalist private single room with dedicated ergonomic work enclave, rain shower pod, and courtyard terrace.', img: pool[8], imgIndex: 8, tag: 'Executive Studio', unitType: 'Studio' },
        space02: { title: 'Dedicated Ergonomic Work Enclave', img: pool[9], imgIndex: 9, tag: 'Work & Living Area' },
        space03: { title: 'Bespoke Studio Architectural Details', img: pool[10], imgIndex: 10, tag: 'Architectural Details' },
        space04: { title: 'Courtyard Reading Nook', img: pool[11], imgIndex: 11, tag: 'Private Terrace' }
      }
    ];
  }, [listing.photos, uniqueMediaPool, availableRoomTiers, getRoomConfig, listing.title, listing.video_url]);

  const mobileGalleryRef = useRef<HTMLDivElement>(null);
  const [mobileSpaceIndex, setMobileSpaceIndex] = useState(0);
  const [isMorphingReservation, setIsMorphingReservation] = useState(false);

  const triggerKineticReservation = (overrideTier?: 'suites' | 'deluxe' | 'executive') => {
    if (isMorphingReservation) return;
    const targetTier = overrideTier || (activeSlide === 0 ? 'suites' : activeSlide === 1 ? 'deluxe' : 'executive');
    setSelectedRoomTier(targetTier);
    uiAudio.playSuccess();
    setIsMorphingReservation(true);
    setTimeout(() => {
      handleReserve(targetTier);
      setIsMorphingReservation(false);
    }, 750);
  };

  // Pure 12-Space Continuous Media Stream (Zero Fake Text Cards)
  const mobileContinuousSpaces = useMemo(() => {
    let globalIdxCounter = 1;
    return slideCollections.flatMap((collection, cIdx) => {
      const spaces = [collection.space01, collection.space02, collection.space03, collection.space04].filter(Boolean);
      return spaces.map((space, sIdx) => ({
        space,
        collectionIdx: cIdx,
        globalIdx: globalIdxCounter++,
        subIdx: sIdx + 1,
        chapterName: collection.name,
        isChapterStart: sIdx === 0
      }));
    });
  }, [slideCollections]);

  const handleMobileScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const scrollLeft = target.scrollLeft;
    const cardWidth = target.clientWidth * 0.85;
    const maxIdx = mobileContinuousSpaces.length - 1;
    const currentIdx = Math.min(Math.max(Math.round(scrollLeft / cardWidth), 0), maxIdx);

    setMobileSpaceIndex(currentIdx);

    const collectionIdx = Math.floor(currentIdx / 4);
    if (activeSlide !== collectionIdx && collectionIdx < slideCollections.length) {
      setActiveSlide(collectionIdx);
    }
  };

  const handleCategoryPillClick = (idx: number) => {
    uiAudio.playClick();
    setActiveSlide(idx);
    const tier = slideCollections[idx]?.id || availableRoomTiers[idx] || 'suites';
    setSelectedRoomTier(tier);
    if (mobileGalleryRef.current) {
      const targetCard = mobileGalleryRef.current.children[idx * 4] as HTMLElement;
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  };

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isGalleryOpen, setIsGalleryOpen] = useState(initialGalleryOpen || false);
  const [galleryInitialCategory, setGalleryInitialCategory] = useState<GalleryCategoryKey>('all');
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const [showFloatingCapsule, setShowFloatingCapsule] = useState(false);
  const [showMobileStickyBar, setShowMobileStickyBar] = useState(false);
  const zone1Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialGalleryOpen !== undefined) {
      setIsGalleryOpen(initialGalleryOpen);
    }
  }, [initialGalleryOpen]);

  // Scroll listener for smooth bi-directional morphing of Booking Dock
  useEffect(() => {
    const handleScroll = () => {
      // Show mobile sticky bar only after scrolling past the video hero
      setShowMobileStickyBar(window.scrollY > window.innerHeight * 0.7);

      if (zone1Ref.current) {
        const rect = zone1Ref.current.getBoundingClientRect();
        // Morph into capsule when bottom of Zone 1 scrolls past the upper viewport
        setShowFloatingCapsule(rect.bottom < 240);
      } else {
        setShowFloatingCapsule(window.scrollY > 850);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Sensory Tags
  const sensoryTags: string[] = useMemo(() => {
    if (Array.isArray(listing.experience_tags) && listing.experience_tags.length > 0) {
      return listing.experience_tags;
    }
    if (Array.isArray(listing.amenities) && listing.amenities.length > 0) {
      return listing.amenities.slice(0, 5);
    }
    return ['Ocean Waves', 'Heated Infinity Pool', 'Private Chef Available', '1 Gbps Fiber WiFi', 'Panoramic Mountain View'];
  }, [listing.experience_tags, listing.amenities]);

  // Parse Curated Guidelines
  const parsedGuidelines: string[] = useMemo(() => {
    if (Array.isArray(listing.curated_guidelines)) {
      return listing.curated_guidelines;
    }
    if (typeof listing.curated_guidelines === 'string' && listing.curated_guidelines.trim()) {
      try {
        const parsed = JSON.parse(listing.curated_guidelines);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        return (listing.curated_guidelines as string).split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return [
      "Footwear must be removed before entering residential pavilions.",
      "Acoustic serenity is requested after 10:00 PM for all guests.",
      "Professional drone photography requires prior concierge clearance.",
      "Eco-conscious air conditioning: Please close pavilion doors when active."
    ];
  }, [listing.curated_guidelines]);

  // Accordion state (01 About, 02 Hospitality Guidelines, 03 Family Safety, 04 Concierge Privileges)
  const [openAccordion, setOpenAccordion] = useState<{ about: boolean; guidelines: boolean; safety: boolean; services: boolean }>({
    about: true,
    guidelines: false,
    safety: false,
    services: false
  });

  const toggleAccordion = (key: 'about' | 'guidelines' | 'safety' | 'services') => {
    uiAudio.playClick();
    setOpenAccordion(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Live Viewers Simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveViewers(Math.floor(Math.random() * 5) + 2);
    }, 15000);
    return () => clearInterval(interval);
  }, []);



  // Selected Room Tier: Defaults to 'deluxe' (Psychological Revenue Anchor)
  // If listing has rooms, default to first room's type key; else 'suites'
  const [selectedRoomTier, setSelectedRoomTier] = useState<string>(() => {
    if (listing.rooms && listing.rooms.length > 0) {
      const firstRoom = (listing.rooms as any[])[0];
      return firstRoom.type || firstRoom.id || 'suites';
    }
    return 'suites';
  });

  // Booking Form State
  const [checkIn, setCheckIn] = useState<string>(() => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    return today.toISOString().split('T')[0];
  });
  const [checkOut, setCheckOut] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  
  // Luxury Granular Occupancy Engine (Adults, Children, Infants)
  const [adultsCount, setAdultsCount] = useState<number>(2);
  const [childrenCount, setChildrenCount] = useState<number>(0);
  const [infantsCount, setInfantsCount] = useState<number>(0);
  const [showOccupancyPicker, setShowOccupancyPicker] = useState<boolean>(false);
  const guests = adultsCount + childrenCount;

  // Real-Time Room Availability & Date Lockout Engine
  const [roomCalendarData, setRoomCalendarData] = useState<any>(null);

  useEffect(() => {
    if (listing.id && listing.id !== 'live-preview-sanctuary' && !String(listing.id).startsWith('demo-')) {
      fetch(`/api/listings/${listing.id}/room-calendar?_t=${Date.now()}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) setRoomCalendarData(data);
        })
        .catch(console.error);
    }
  }, [listing.id]);

  // Multi-Unit Capacity & Real-Time Availability Calculator
  const roomInventoryStats = useMemo(() => {
    const defaultStats = { totalUnits: 1, occupiedUnits: 0, remainingUnits: 1, isSoldOut: false };
    if (!roomCalendarData) return defaultStats;
    const sDate = checkIn;
    const eDate = checkOut;
    if (!sDate || !eDate) return defaultStats;

    // 1. Find Room Configuration
    const targetRoom = (roomCalendarData.rooms || []).find((r: any) => r.tierKey === selectedRoomTier);
    const totalUnits = targetRoom ? (targetRoom.inventoryCount || 1) : 1;

    // 2. Count Occupied Physical Units for this date range
    const occupiedSet = new Set<number>();
    let isAllHeld = false;

    // Check Blocks
    (roomCalendarData.blocks || []).forEach((blk: any) => {
      const isMatchTier = blk.roomTierKey === selectedRoomTier || blk.roomTierKey === 'all';
      if (isMatchTier && blk.startDate <= eDate && blk.endDate >= sDate) {
        const uNum = Number(blk.roomUnitNumber);
        if (uNum === 0 || blk.roomTierKey === 'all') {
          isAllHeld = true;
        } else {
          occupiedSet.add(uNum);
        }
      }
    });

    // Check Active Bookings
    (roomCalendarData.bookings || []).forEach((b: any) => {
      const isMatchTier = b.roomTier === selectedRoomTier || !b.roomTier;
      if (isMatchTier && b.startDate < eDate && b.endDate > sDate) {
        const bUnit = Number(b.roomUnitNumber) || 1;
        occupiedSet.add(bUnit);
      }
    });

    const occupiedCount = isAllHeld ? totalUnits : occupiedSet.size;
    const remainingUnits = Math.max(0, totalUnits - occupiedCount);
    const isSoldOut = isAllHeld || remainingUnits <= 0;

    return {
      totalUnits,
      occupiedUnits: occupiedCount,
      remainingUnits,
      isSoldOut
    };
  }, [roomCalendarData, checkIn, checkOut, selectedRoomTier]);

  const isDateRangeBlocked = roomInventoryStats.isSoldOut;

  // Double-Entry Ledger Calculation per Selected Room Tier
  const activeTierObj = getRoomConfig(selectedRoomTier);
// ADR-003: Price authority is listing.rooms[].price, not hardcoded multipliers
  const activeNightlyRate = useMemo(() => {
    if (liveRoomConfigs && liveRoomConfigs[selectedRoomTier]) {
      return liveRoomConfigs[selectedRoomTier].price;
    }
    // Legacy fallback
    const legacyConfig = LEGACY_ROOM_TIER_CONFIG[selectedRoomTier];
    if (!legacyConfig) return listing.price || 0;
    if (listing.currency === 'USD') return legacyConfig.priceUsd;
    if (listing.price && listing.price > 1000) {
      if (selectedRoomTier === 'suites') return Math.round(listing.price * 1.35);
      if (selectedRoomTier === 'executive') return Math.round(listing.price * 0.65);
      return listing.price;
    }
    return legacyConfig.price;
  }, [selectedRoomTier, liveRoomConfigs, listing.price, listing.currency]);

  const nights = useMemo(() => {
    const start = new Date(checkIn).getTime();
    const end = new Date(checkOut).getTime();
    const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  }, [checkIn, checkOut]);

  const baseRentTotal = activeNightlyRate * nights;
  const enchoFee = Math.round(baseRentTotal * 0.15); // 15% SaaS Optimization Fee
  const taxAmount = Math.round((baseRentTotal + enchoFee) * 0.18); // 18% Statutory GST
  const grandTotal = baseRentTotal + enchoFee + taxAmount;

  const handleReserve = (overrideTier?: string) => {
    if (isDateRangeBlocked) {
      uiAudio.playPop();
      addToast('Suite Unavailable', 'The selected dates are currently held or reserved. Please choose different dates or select another suite.', 'error');
      return;
    }
    uiAudio.playSuccess();
    const tierKey = overrideTier || selectedRoomTier;
    const tierMeta = getRoomConfig(tierKey);
    const nightly = listing.currency === 'USD' ? ((tierMeta as any).priceUsd || tierMeta.price) : activeNightlyRate;
    const rent = nightly * nights;
    const fee = Math.round(rent * 0.15);
    const tax = Math.round((rent + fee) * 0.18);
    const total = rent + fee + tax;

    if (onBook) {
      onBook({
        isStartCheckout: true,
        listingId: listing.id,
        listingTitle: listing.title,
        roomTier: tierKey,
        roomTierName: tierMeta.name,
        roomTierIcon: tierMeta.icon,
        roomTierSpecs: tierMeta.specs,
        nightlyRate: nightly,
        moveInDate: checkIn,
        checkOutDate: checkOut,
        configuration: tierMeta.name,
        name: user?.name || '',
        phone: '',
        totalRent: total,
        baseRent: rent,
        fees: fee,
        taxes: tax,
        guests: Math.min(guests, tierMeta.capacity),
        adultsCount,
        childrenCount,
        infantsCount,
        currency: listing.currency || 'INR'
      } as any);
    }
  };

  // Filter images for full gallery
  const filteredGalleryImages = useMemo(() => {
    if (activeGalleryTab === 'all') return images;
    return images;
  }, [images, activeGalleryTab]);

  return (
    <>
      <SEO 
        title={`${listing.title} | Luxury Sanctuary in ${listing.city} - Encho`}
        description={listing.description ? listing.description.substring(0, 155) : `Experience pure architectural tranquility at ${listing.title}. Verified luxury stay in ${listing.city}.`}
        image={images[0]}
      />

      <div className="min-h-screen bg-[#F9F8F6] dark:bg-[#F9F8F6] font-sans antialiased text-zinc-900 pb-28 md:pb-36 selection:bg-amber-500/20">

        

        {/* 10/10 AMAN-GRADE LUXURY EDITORIAL MASTER HEADER */}
        <header className={"sticky top-0 z-[60] w-full bg-[#F9F8F6]/90 backdrop-blur-md border-b border-[#E8E4DC] transition-all duration-300 ease-in-out " + (isHeaderVisible ? "translate-y-0" : "-translate-y-full")}>
          <div className="max-w-[1400px] mx-auto flex items-center justify-between h-16 md:h-20 px-4 sm:px-8 md:px-12">
            
            {/* LEFT: [< (Back) ENCHO (logo official <EnchoWordmark />)] */}
            <div className="flex items-center gap-4 shrink-0">
                <button 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playClick(); onBack(); }}
                    className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 active:scale-95 transition-all text-zinc-900 cursor-pointer group/back"
                    aria-label="Go back"
                    title="Go back"
                >
                    <ChevronLeft strokeWidth={1.5} className="w-6 h-6 group-hover/back:-translate-x-1 transition-transform" />
                </button>

                {/* Official ENCHO Wordmark */}
                <div 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playClick(); onBack(); }}
                    className="flex items-center cursor-pointer group shrink-0 select-none"
                    title="Encho Space"
                >
                    <div className="flex items-center">
                        <EnchoWordmark className="h-4 sm:h-[18px] w-auto" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] ml-[2px] transition-transform duration-300 group-hover:scale-125 shrink-0" />
                    </div>
                    <span className="ml-3 text-[9px] font-medium tracking-[0.3em] text-zinc-400 uppercase group-hover:text-zinc-600 transition-colors hidden sm:inline-block">
                        STAYS
                    </span>
                </div>
            </div>

            {/* CENTER: THUSHARA (Brand Identity) */}
            <div className="flex items-center justify-center px-4 min-w-0 flex-1">
                {((listing as any).brand && (listing as any).brand.trim().length > 0) && (
                    <div className="flex items-center gap-2 px-2 sm:px-4 py-1.5 min-w-0">
                        <span 
                            style={{ 
                              fontFamily: getBrandTypography((listing as any).brand_font).fontFamily,
                              color: getBrandColorStyle((listing as any).brand_color)
                            }} 
                            className={`${getBrandTypography((listing as any).brand_font).className} text-[13px] md:text-[15px] truncate font-semibold uppercase`}
                        >
                            {(listing as any).brand.trim()}
                        </span>
                    </div>
                )}
            </div>

            {/* RIGHT: [♥ Wishlist]  [☰Menu ] */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                {/* Wishlist Button */}
                <button 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playPop(); if(onToggleFavorite) onToggleFavorite(listing); }}
                    className={`hidden sm:flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full transition-all cursor-pointer group/fav active:scale-95 ${
                        isFavorite 
                            ? 'text-[#e51d53]' 
                            : 'hover:bg-black/5 text-zinc-900'
                    }`}
                    aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
                >
                    <HeartIcon 
                        className={`w-5 h-5 transition-transform group-hover/fav:scale-110 ${
                            isFavorite ? 'fill-[#e51d53] text-[#e51d53]' : 'text-zinc-900'
                        }`} 
                        filled={isFavorite} 
                    />
                    <span className="hidden md:inline text-[11px] font-medium font-sans uppercase tracking-[0.1em]">
                        {isFavorite ? 'Saved' : 'Wishlist'}
                    </span>
                </button>

                {/* Menu Button */}
                <button 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playClick(); /* Future Menu Drawer */ }}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full hover:bg-black/5 transition-all text-zinc-900 cursor-pointer active:scale-95"
                    aria-label="Menu"
                >
                    <Menu strokeWidth={1.5} className="w-5 h-5" />
                    <span className="hidden md:inline text-[11px] font-medium font-sans uppercase tracking-[0.1em]">
                        Menu
                    </span>
                </button>
            </div>

          </div>
        </header>

        
        <div className="w-full md:max-w-[1400px] mx-auto px-3 sm:px-6 md:px-8 pt-3 sm:pt-4 pb-6">
            {((listing as any).hero_video_url || listing.video_url) ? (
                <div className="w-full h-[75vh] md:h-[75vh] lg:h-[85vh] rounded-2xl md:rounded-3xl overflow-hidden bg-black shadow-xl relative group/video border border-zinc-200/40 /40">
                    <CinematicVideoPlayer
                        videoUrl={(listing as any).hero_video_url || listing.video_url}
                        posterUrl={images[0]}
                        title={listing.title}
                        price={activeNightlyRate}
                        currency={listing.currency}
                        onReserveClick={handleReserve}
                    />
                    
                    {liveViewers > 1 && (
                        <div className="absolute top-6 right-6 bg-black/30 backdrop-blur-md px-4 py-2 rounded flex items-center gap-2 border border-white/10 pointer-events-none z-20">
                            <div className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
                            </div>
                            <span className="text-[10px] font-light tracking-[0.2em] text-white uppercase font-display">{liveViewers} Viewing</span>
                        </div>
                    )}
                </div>
            ) : (
                <>
                    <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2.5 h-[65vh] lg:h-[75vh] rounded-3xl overflow-hidden bg-zinc-200 shadow-sm relative">
                        <div className="col-span-2 row-span-2 relative h-full overflow-hidden">
                            <OptimizedImage src={images[0]} aspectRatio="4:3" priority={true} className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt={`${listing.title} Main View`} onClick={() => { uiAudio.playClick(); trackPhotoView(0); setGalleryInitialIndex(0); setGalleryInitialCategory('all'); setIsGalleryOpen(true); }} />
                            {listing.isVerified && (
                                <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-xl px-4 py-2 rounded-xl shadow-lg border border-white/40 flex items-center gap-2 pointer-events-none">
                                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                                    <span className="text-[10px] font-bold font-display tracking-widest text-zinc-900 uppercase">Verified Sanctuary</span>
                                </div>
                            )}
                        </div>
                        <div className="relative overflow-hidden h-full">
                            <OptimizedImage src={images[1]} aspectRatio="16:9" className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="View 2" onClick={() => { uiAudio.playClick(); trackPhotoView(1); setGalleryInitialIndex(1); setGalleryInitialCategory('all'); setIsGalleryOpen(true); }} />
                        </div>
                        <div className="relative overflow-hidden h-full">
                            <OptimizedImage src={images[2]} aspectRatio="16:9" className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="View 3" onClick={() => { uiAudio.playClick(); trackPhotoView(2); setGalleryInitialIndex(2); setGalleryInitialCategory('all'); setIsGalleryOpen(true); }} />
                        </div>
                        <div className="relative overflow-hidden h-full">
                            <OptimizedImage src={images[3]} aspectRatio="16:9" className="w-full h-full object-cover hover:scale-[1.03] duration-700 transition-transform cursor-pointer" alt="View 4" onClick={() => { uiAudio.playClick(); trackPhotoView(3); setGalleryInitialIndex(3); setGalleryInitialCategory('all'); setIsGalleryOpen(true); }} />
                        </div>
                        <div className="relative overflow-hidden h-full group/gallery cursor-pointer" onClick={() => { uiAudio.playClick(); trackPhotoView(4); setGalleryInitialIndex(0); setGalleryInitialCategory('all'); setIsGalleryOpen(true); }}>
                            <OptimizedImage src={images[4]} aspectRatio="16:9" className="w-full h-full object-cover transition-transform duration-700 group-hover/gallery:scale-[1.03] group-hover/gallery:blur-sm" alt="View 5" />
                            <div className="absolute inset-0 bg-black/10 group-hover/gallery:bg-black/20 transition-colors duration-500" />
                            <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-xl border border-white/50 text-zinc-900 px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg hover:scale-[1.02] active:scale-95 transition-transform">
                                <ImageIcon className="w-4 h-4" />
                                <span className="text-[11px] font-extrabold uppercase tracking-widest font-display">Show All Media</span>
                            </div>
                        </div>
                        {liveViewers > 1 && (
                            <div className="absolute top-6 right-6 bg-zinc-900/80 backdrop-blur-xl px-4 py-2 rounded-full flex items-center gap-2 border border-white/10 shadow-2xl animate-fade-in pointer-events-none">
                                <div className="relative flex h-2.5 w-2.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </div>
                                <span className="text-[10px] font-extrabold tracking-widest text-white uppercase font-display">{liveViewers} Viewing</span>
                            </div>
                        )}
                    </div>

                    <div className="md:hidden relative w-full aspect-[4/5] sm:aspect-square bg-zinc-200 overflow-hidden">
                        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide w-full h-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} onScroll={(e) => {
                            const scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                            const width = (e.target as HTMLDivElement).clientWidth;
                            const idx = Math.round(scrollLeft / width);
                            if (idx !== activeMobileImage) {
                                setActiveMobileImage(idx);
                                trackPhotoView(idx);
                            }
                        }}>
                            {images.map((img, idx) => (
                                <div key={idx} className="w-full h-full snap-center shrink-0 relative" onClick={() => setLightboxIndex(idx)}>
                                    <OptimizedImage src={img} aspectRatio="1:1" priority={idx === 0} className="w-full h-full object-cover" alt={`${listing.title} View ${idx + 1}`} />
                                </div>
                            ))}
                        </div>

                        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
                            <div className="flex gap-1.5 bg-black/30 backdrop-blur-xl px-3 py-1.5 rounded-full">
                                {images.map((_, i) => (
                                    <div key={i} className={`h-1 rounded-full transition-all duration-300 ${activeMobileImage === i ? 'w-4 bg-white' : 'w-1 bg-white/40'}`} />
                                ))}
                            </div>
                        </div>
                        {listing.isVerified && (
                            <div className="absolute bottom-6 left-4 bg-white/80 backdrop-blur-xl px-3.5 py-1.5 rounded-xl shadow-sm border border-white/40 flex items-center gap-1.5 pointer-events-none">
                                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                <span className="text-[10px] font-bold tracking-widest text-zinc-900 uppercase font-display">Verified</span>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>

        
        {/* ========================================================================= */}
        {/* ZONE 1: HIGH-CONVERSION SPLIT GRID (Top -> End of Host Section)           */}
        {/* ========================================================================= */}
        <div ref={zone1Ref} className="w-full md:max-w-7xl mx-auto px-4 md:px-6 lg:px-8 mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
            
            {/* Left Column (Zone 1 Content) */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-12">
                
                {/* Suite Showcase Matrix (Modular Suites) */}
                {(listing.rental_mode === 'hybrid' || listing.rental_mode === 'private_rooms') && listing.rooms && listing.rooms.length > 0 && (
                    <section className="space-y-6">
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 font-display">Suite Configurations</h2>
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border border-amber-200">Modular</span>
                        </div>
                        <p className="text-zinc-500 font-medium leading-relaxed max-w-2xl">
                            Customize your stay by reserving individual suites. Each modular unit maintains complete privacy while sharing central sanctuary access.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            {listing.rooms.map((room) => (
                                <div key={room.id} className="group relative bg-white border border-zinc-200 rounded-3xl overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col">
                                    <div className="h-48 bg-zinc-100 relative overflow-hidden">
                                        <OptimizedImage 
                                            src={room.imageUrls?.[0] || images[1]} 
                                            aspectRatio="16:9" 
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                                            alt={room.name} 
                                        />
                                        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/40 shadow-sm flex items-center gap-1.5">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-900">{room.sqft ? `${room.sqft} sqft` : 'Private Suite'}</span>
                                        </div>
                                    </div>
                                    <div className="p-5 flex-1 flex flex-col justify-between bg-gradient-to-b from-white to-zinc-50/50">
                                        <div>
                                            <h3 className="text-lg font-bold text-zinc-900 font-display">{room.name}</h3>
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {room.features?.slice(0,3).map(f => (
                                                    <span key={f} className="text-[10px] font-semibold text-zinc-600 bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200/60">
                                                        {f}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* SENSORY ATMOSPHERE DECK */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 font-display flex items-center gap-2.5">
                      <Sparkles className="w-5 h-5 text-[#0284C7]" />
                      <span>Sensory Atmosphere Deck</span>
                    </h2>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-display">Aman Standard</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {sensoryTags.map((tag, idx) => {
                      const IconComponent = getSensoryTagIcon(tag);
                      return (
                        <div
                          key={idx}
                          className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-100/90 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-md transition-all flex items-center gap-4 group"
                        >
                          <div className="w-12 h-12 rounded-2xl bg-[#F0F9FF] border border-[#E0F2FE] flex items-center justify-center shrink-0 text-[#0284C7] group-hover:scale-105 transition-transform shadow-xs">
                            <IconComponent className="w-6 h-6 stroke-[1.8]" />
                          </div>
                          <span className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight leading-snug">{tag}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="border-t border-zinc-200/80 pt-6 space-y-2">
                  {/* Accordion Item 1: About The Sanctuary */}
                  <div className="border-b border-zinc-200/80 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleAccordion('about')}
                      className="w-full py-5 flex items-center justify-between text-left group transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="text-zinc-400 font-bold text-xs tracking-wider font-mono">01</span>
                        <h3 className="text-lg md:text-xl font-bold text-zinc-900 tracking-tight group-hover:text-zinc-700 font-display">
                          About The Sanctuary
                        </h3>
                      </div>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 group-hover:bg-zinc-100 transition-all text-xl font-light">
                        {openAccordion.about ? <Minus className="w-4 h-4 text-zinc-700" /> : <Plus className="w-4 h-4 text-zinc-700" />}
                      </div>
                    </button>
                    {openAccordion.about && (
                      <div className="pb-6 pt-1 text-zinc-600 text-sm md:text-base leading-relaxed space-y-4 font-normal animate-fade-in pl-8 pr-2">
                        <p className="text-zinc-600 leading-relaxed">
                          {listing.description || "Designed as an acoustic sanctuary for high-discretion travelers. Features hand-crafted limestone walls, floor-to-ceiling panoramic glass, and integrated circadian lighting systems that harmonize with natural sun cycles."}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Accordion Item 2: Aristocratic Hospitality Guidelines */}
                  <div className="border-b border-zinc-200/80 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleAccordion('guidelines')}
                      className="w-full py-5 flex items-center justify-between text-left group transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="text-zinc-400 font-bold text-xs tracking-wider font-mono">02</span>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg md:text-xl font-bold text-zinc-900 tracking-tight group-hover:text-zinc-700 font-display">
                            Aristocratic Hospitality Guidelines
                          </h3>
                          <span className="bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200">
                            Curated
                          </span>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 group-hover:bg-zinc-100 transition-all text-xl font-light">
                        {openAccordion.guidelines ? <Minus className="w-4 h-4 text-zinc-700" /> : <Plus className="w-4 h-4 text-zinc-700" />}
                      </div>
                    </button>
                    {openAccordion.guidelines && (
                      <div className="pb-6 pt-1 text-zinc-600 text-sm md:text-base leading-relaxed space-y-4 font-normal animate-fade-in pl-8 pr-2">
                        <div className="space-y-3">
                          {parsedGuidelines.map((g, idx) => {
                            const colonIdx = g.indexOf(':');
                            const hasPrefix = colonIdx > 0 && colonIdx < 40;
                            const titlePart = hasPrefix ? g.substring(0, colonIdx) : null;
                            const descPart = hasPrefix ? g.substring(colonIdx + 1).trim() : g;

                            return (
                              <div key={idx} className="flex items-start gap-3.5 p-4 rounded-2xl bg-zinc-50/80 border border-zinc-200/80 transition-all hover:bg-zinc-50 hover:border-zinc-300">
                                <span className="text-amber-800 font-bold text-xs shrink-0 mt-0.5 font-mono tracking-wider">
                                  {String(idx + 1).padStart(2, '0')}.
                                </span>
                                <p className="text-xs md:text-sm text-zinc-800 leading-relaxed font-normal">
                                  {titlePart ? (
                                    <>
                                      <strong className="font-bold text-zinc-900">{titlePart}: </strong>
                                      <span>{descPart}</span>
                                    </>
                                  ) : (
                                    <span>{g}</span>
                                  )}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Accordion Item 3: Family & Child Safety Protocols */}
                  <div className="border-b border-zinc-200/80 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleAccordion('safety')}
                      className="w-full py-5 flex items-center justify-between text-left group transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="text-zinc-400 font-bold text-xs tracking-wider font-mono">03</span>
                        <h3 className="text-lg md:text-xl font-bold text-zinc-900 tracking-tight group-hover:text-zinc-700 font-display">
                          Family & Child Safety Protocols
                        </h3>
                      </div>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 group-hover:bg-zinc-100 transition-all text-xl font-light">
                        {openAccordion.safety ? <Minus className="w-4 h-4 text-zinc-700" /> : <Plus className="w-4 h-4 text-zinc-700" />}
                      </div>
                    </button>
                    {openAccordion.safety && (
                      <div className="pb-6 pt-1 text-zinc-600 text-sm md:text-base leading-relaxed space-y-4 font-normal animate-fade-in pl-8 pr-2">
                        {listing.child_safety_specs && listing.child_safety_specs.length > 0 ? (
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {listing.child_safety_specs.map((spec, i) => (
                              <li key={i} className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100">
                                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <span className="text-xs font-semibold text-emerald-950">{spec}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 text-xs text-zinc-600 space-y-1.5">
                            <p className="font-bold text-zinc-800">Standard luxury safety protocols observed.</p>
                            <p className="leading-relaxed">While individual pavilions feature architectural water features and open vistas, dedicated pool barriers, stair gates, and baby cribs can be installed prior to arrival with advance notice.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Accordion Item 4: Bespoke Concierge & Culinary Privileges */}
                  <div className="border-b border-zinc-200/80 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleAccordion('services')}
                      className="w-full py-5 flex items-center justify-between text-left group transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="text-zinc-400 font-bold text-xs tracking-wider font-mono">04</span>
                        <h3 className="text-lg md:text-xl font-bold text-zinc-900 tracking-tight group-hover:text-zinc-700 font-display">
                          Concierge Privileges & Bespoke Services
                        </h3>
                      </div>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 group-hover:bg-zinc-100 transition-all text-xl font-light">
                        {openAccordion.services ? <Minus className="w-4 h-4 text-zinc-700" /> : <Plus className="w-4 h-4 text-zinc-700" />}
                      </div>
                    </button>
                    {openAccordion.services && (
                      <div className="pb-6 pt-1 text-zinc-600 text-sm md:text-base leading-relaxed space-y-3 font-normal animate-fade-in pl-8 pr-2">
                        <p className="text-xs md:text-sm text-zinc-600 leading-relaxed">
                          {listing.concierge_privileges || "All guests at this Encho Sanctuary receive direct access to our Walled Garden Host Concierge. Private dining experiences, sommelier cellar curation, private driver transfers, and customized wellness sessions can be coordinated seamlessly inside your Encho guest inbox."}
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* ANALYTICAL TRUST ANCHOR */}
                <section className="space-y-4 pt-4">
                  <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 font-display">Encho Trust & Safety Anchor</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 font-display">100% In-Person Verified</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">Physically audited by Encho luxury architects for structural integrity and high-fidelity listing truth.</p>
                      </div>
                    </div>

                    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0 border border-cyan-100">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 font-display">Walled Garden Escrow</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">Payments are locked in secure host escrow until 24 hours after seamless check-in confirmation.</p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* EDITORIAL HOST SIGNATURE */}
                <section className="p-6 md:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xl uppercase shadow-md shrink-0 border-2 border-slate-100">
                        {listing.provider ? listing.provider.charAt(0) : 'E'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-extrabold text-zinc-900 tracking-tight font-display">{listing.provider || 'Encho Verified Host'}</h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">Superhost</span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Sanctuary Curator · Fast response under 5 mins</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        uiAudio.playClick();
                        if (onContactHost) onContactHost();
                      }}
                      className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Message Concierge</span>
                    </button>
                  </div>

                  {/* Host Philosophy / Editorial Message */}
                  <div className="p-4 rounded-2xl bg-zinc-50 border-l-2 border-zinc-900 text-sm md:text-base text-zinc-700 font-medium italic leading-relaxed">
                    "{listing.host_philosophy || listing.editorial_quote || "Our design philosophy is to allow natural sunlight and acoustic stillness to heal the modern soul. Every detail here is intentional."}"
                  </div>
                </section>
            </div>

            {/* Right Column: Sticky Glass Checkout Dock (Zone 1 Stays Mounted Here) */}
            <div className="hidden lg:block lg:col-span-5 xl:col-span-4 relative pb-12">
                <div className="sticky top-28 bg-white border border-zinc-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 flex flex-col">
                    <div className="flex items-end justify-between mb-4">
                        <div>
                            <span className="text-3xl font-extrabold tracking-tight text-zinc-900 font-display tabular-nums">{listing.currency === 'USD' ? '$' : '₹'}{activeNightlyRate.toLocaleString()}</span>
                            <span className="text-zinc-500 font-medium ml-1 text-sm">/ night</span>
                        </div>
                        <span className="bg-amber-50 text-amber-800 border border-amber-200/80 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1">
                          <span>{activeTierObj.icon}</span>
                          <span>{(activeTierObj as any).shortName}</span>
                        </span>
                    </div>

                    {/* 1-Tap Room Inventory Tier Selector Pill */}
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono">
                          Room Category
                        </label>
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          {activeTierObj.tag}
                        </span>
                      </div>
                      <div className={`grid gap-1.5 p-1 bg-zinc-100/80 rounded-2xl border border-zinc-200/60 ${availableRoomTiers.length === 1 ? 'grid-cols-1' : availableRoomTiers.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {availableRoomTiers.map((tierKey, idx) => {
                          const t = getRoomConfig(tierKey);
                          const isSelected = selectedRoomTier === tierKey;
                          const tRate = listing.currency === 'USD' ? ((t as any).priceUsd || t.price) : t.price;
                          return (
                            <button
                              key={tierKey}
                              type="button"
                              onClick={() => {
                                uiAudio.playClick();
                                setSelectedRoomTier(tierKey);
                                setActiveSlide(idx);
                              }}
                              className={`py-2 px-1.5 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                                isSelected
                                  ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-900/10 font-bold scale-[1.02]'
                                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-white/60'
                              }`}
                            >
                              <span className="text-xs">{t.icon}</span>
                              <span className="text-[11px] font-bold tracking-tight mt-0.5">{(t as any).shortName || t.name.substring(0, 10)}</span>
                              <span className="text-[9px] font-mono text-zinc-400">
                                {listing.currency === 'USD' ? `$${tRate}` : `₹${Math.round(tRate / 1000)}k`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-zinc-400 font-medium mt-1.5 px-1 truncate">
                        {activeTierObj.specs}
                      </p>
                    </div>

                    {/* Dual-Date Engine */}
                    <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl overflow-hidden mb-6">
                        <div className="grid grid-cols-2 divide-x divide-zinc-200/80 border-b border-zinc-200/80">
                            <div className="p-3">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-900 mb-1 font-display">Check-in</label>
                                <input 
                                    type="date" 
                                    min={new Date().toISOString().split('T')[0]}
                                    value={checkIn}
                                    onChange={(e) => {
                                        setCheckIn(e.target.value);
                                        trackDateSelection(e.target.value, checkOut);
                                    }}
                                    className="w-full bg-transparent border-none p-0 text-sm font-medium text-zinc-700 focus:ring-0 cursor-pointer"
                                />
                            </div>
                            <div className="p-3">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-900 mb-1 font-display">Check-out</label>
                                <input 
                                    type="date" 
                                    min={checkIn}
                                    value={checkOut}
                                    onChange={(e) => {
                                        setCheckOut(e.target.value);
                                        trackDateSelection(checkIn, e.target.value);
                                    }}
                                    className="w-full bg-transparent border-none p-0 text-sm font-medium text-zinc-700 focus:ring-0 cursor-pointer"
                                />
                            </div>
                        </div>
                        <div className="p-3 relative">
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-900 mb-1 font-display flex items-center justify-between">
                              <span>Occupancy</span>
                              <span className="text-[9px] text-zinc-400 font-mono">Max {activeTierObj.capacity} Guests</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => { uiAudio.playClick(); setShowOccupancyPicker(prev => !prev); }}
                              className="w-full text-left bg-white px-2.5 py-1.5 rounded-xl border border-zinc-200/80 text-xs font-semibold text-zinc-800 flex items-center justify-between cursor-pointer hover:border-zinc-400 transition-colors"
                            >
                              <span>
                                {adultsCount} Adult{adultsCount > 1 ? 's' : ''}
                                {childrenCount > 0 ? ` · ${childrenCount} Child${childrenCount > 1 ? 'ren' : ''}` : ''}
                                {infantsCount > 0 ? ` · ${infantsCount} Infant${infantsCount > 1 ? 's' : ''}` : ''}
                              </span>
                              <span className="text-zinc-400 text-[10px]">▼</span>
                            </button>

                            {/* Frosted Occupancy Stepper Popover */}
                            {showOccupancyPicker && (
                              <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-zinc-200/90 shadow-2xl rounded-2xl p-4 z-50 space-y-3.5">
                                {/* Adults Stepper */}
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="text-xs font-bold text-zinc-900 block">Adults</span>
                                    <span className="text-[10px] text-zinc-400 font-medium">Age 13+</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={adultsCount <= 1}
                                      onClick={() => { uiAudio.playClick(); setAdultsCount(prev => Math.max(1, prev - 1)); }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >-</button>
                                    <span className="w-5 text-center font-mono font-bold text-xs">{adultsCount}</span>
                                    <button
                                      type="button"
                                      disabled={adultsCount + childrenCount >= activeTierObj.capacity}
                                      onClick={() => { 
                                        uiAudio.playClick(); 
                                        if (adultsCount + childrenCount < activeTierObj.capacity) {
                                          setAdultsCount(prev => prev + 1);
                                        } else if (selectedRoomTier !== 'suites') {
                                          // Auto-upgrade suggestion
                                          setSelectedRoomTier('suites');
                                          setAdultsCount(prev => prev + 1);
                                        }
                                      }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >+</button>
                                  </div>
                                </div>

                                {/* Children Stepper */}
                                <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                                  <div>
                                    <span className="text-xs font-bold text-zinc-900 block">Children</span>
                                    <span className="text-[10px] text-zinc-400 font-medium">Ages 2–12</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={childrenCount <= 0}
                                      onClick={() => { uiAudio.playClick(); setChildrenCount(prev => Math.max(0, prev - 1)); }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >-</button>
                                    <span className="w-5 text-center font-mono font-bold text-xs">{childrenCount}</span>
                                    <button
                                      type="button"
                                      onClick={() => { 
                                        uiAudio.playClick(); 
                                        if (selectedRoomTier !== 'suites') {
                                          setSelectedRoomTier('suites'); // Upgrade to suite for family
                                        }
                                        setChildrenCount(prev => Math.min(1, prev + 1));
                                      }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >+</button>
                                  </div>
                                </div>

                                {/* Infants Stepper */}
                                <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                                  <div>
                                    <span className="text-xs font-bold text-zinc-900 block">Infants</span>
                                    <span className="text-[10px] text-emerald-600 font-medium">Under 2 (Free Crib)</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={infantsCount <= 0}
                                      onClick={() => { uiAudio.playClick(); setInfantsCount(prev => Math.max(0, prev - 1)); }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >-</button>
                                    <span className="w-5 text-center font-mono font-bold text-xs">{infantsCount}</span>
                                    <button
                                      type="button"
                                      onClick={() => { uiAudio.playClick(); setInfantsCount(prev => Math.min(2, prev + 1)); }}
                                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    >+</button>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setShowOccupancyPicker(false)}
                                  className="w-full py-2 bg-zinc-900 text-white font-bold text-xs rounded-xl mt-2 cursor-pointer"
                                >
                                  Apply Occupancy
                                </button>
                              </div>
                            )}
                        </div>
                    </div>

                    {/* Dynamic Multi-Unit Availability & Date Block Status Banner */}
                    {isDateRangeBlocked ? (
                      <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200/90 text-rose-800 text-xs flex items-start gap-2.5 font-medium animate-fadeIn shadow-sm">
                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block text-rose-900 font-display">All Units Reserved for Dates</span>
                          <span className="text-[11px] text-rose-700 leading-relaxed block mt-0.5">
                            All {roomInventoryStats.totalUnits} {activeTierObj.name} suites are booked or held for {checkIn} → {checkOut}. Please choose alternative dates or toggle another suite above.
                          </span>
                        </div>
                      </div>
                    ) : roomInventoryStats.occupiedUnits > 0 ? (
                      <div className="mb-4 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between font-semibold animate-fadeIn">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          High Demand · {roomInventoryStats.occupiedUnits} of {roomInventoryStats.totalUnits} units booked
                        </span>
                        <span className="text-amber-800 font-mono font-bold">Only {roomInventoryStats.remainingUnits} left!</span>
                      </div>
                    ) : null}

                    <button 
                        disabled={isDateRangeBlocked}
                        onClick={() => handleReserve()}
                        className={`w-full font-bold font-display py-4 rounded-2xl transition-all flex items-center justify-center gap-2 mb-4 ${
                          isDateRangeBlocked
                            ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed border border-zinc-300/60 shadow-none'
                            : 'bg-gradient-to-r from-zinc-900 to-zinc-800 text-white shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] active:scale-[0.98] cursor-pointer'
                        }`}
                    >
                        <CreditCard className="w-4 h-4" />
                        <span>{isDateRangeBlocked ? 'Dates Unavailable for this Suite' : 'Reserve Sanctuary'}</span>
                    </button>
                    
                    <p className="text-[11px] text-zinc-400 text-center mb-6 font-medium">
                      {isDateRangeBlocked ? 'Choose alternate dates to unlock reservation' : "You won't be charged yet"}
                    </p>

                    {/* Visual Split-Cost Calculator (Strict Ledger) */}
                    <div className="space-y-3 text-sm text-zinc-600 font-medium">
                        <div className="flex justify-between">
                            <span>{(activeTierObj as any).shortName || activeTierObj.name} ({listing.currency === 'USD' ? '$' : '₹'}{activeNightlyRate.toLocaleString()} × {nights} nts)</span>
                            <span className="tabular-nums font-semibold text-zinc-900">{listing.currency === 'USD' ? '$' : '₹'}{baseRentTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Concierge & Escrow (15%)</span>
                            <span className="tabular-nums font-semibold text-zinc-900">{listing.currency === 'USD' ? '$' : '₹'}{enchoFee.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Statutory GST (18%)</span>
                            <span className="tabular-nums font-semibold text-zinc-900">{listing.currency === 'USD' ? '$' : '₹'}{taxAmount.toLocaleString()}</span>
                        </div>
                    </div>
                    
                    <div className="h-px bg-zinc-200/80 my-4" />
                    
                    <div className="flex justify-between items-center text-lg font-extrabold text-zinc-900 font-display tabular-nums">
                        <span>Total Before Taxes</span>
                        <span>{listing.currency === 'USD' ? '$' : '₹'}{grandTotal.toLocaleString()}</span>
                    </div>
                </div>
            </div>

        </div>

        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* MONOCHROME-TO-COLOR SPOTLIGHT SCATTERED EDITORIAL COLLAGE (100vw)          */}
        {/* Quiet Grayscale Resting State · Desktop Hover Bloom · Mobile Center Pivot */}
        {/* ========================================================================= */}
        <div className="w-screen relative left-1/2 right-1/2 -mx-[50vw] overflow-x-clip overflow-y-visible mt-6 md:mt-8 mb-0 pt-4 pb-20 md:pb-28 bg-transparent">
          <div 
            ref={collageTrackRef}
            onScroll={handleCollageTrackScroll}
            className="flex overflow-x-auto gap-0 px-4 md:px-8 pt-4 pb-16 md:pb-24 scrollbar-hide snap-x snap-mandatory items-center min-h-[540px] sm:min-h-[620px] md:min-h-[720px]" 
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* 24 Heavily Colliding Scattered Cards Packing 100% of Space */}
            {[
              { idx: 0, w: 'w-[280px] sm:w-[360px] md:w-[460px]', h: 'h-[320px] sm:h-[380px] md:h-[460px]', z: 'z-10', overlap: 'ml-0', aspect: '16:9', rotate: '-rotate-2', translateY: '-translate-y-8 md:-translate-y-14' },
              { idx: 1, w: 'w-[200px] sm:w-[260px] md:w-[320px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: 'rotate-2', translateY: 'translate-y-14 md:translate-y-24' },
              { idx: 2, w: 'w-[240px] sm:w-[300px] md:w-[380px]', h: 'h-[300px] sm:h-[360px] md:h-[430px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-40', aspect: '16:9', rotate: '-rotate-3', translateY: '-translate-y-6 md:-translate-y-10' },
              { idx: 3, w: 'w-[210px] sm:w-[270px] md:w-[340px]', h: 'h-[360px] sm:h-[430px] md:h-[530px]', z: 'z-30', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: 'rotate-1', translateY: 'translate-y-10 md:translate-y-18' },
              { idx: 4, w: 'w-[300px] sm:w-[380px] md:w-[480px]', h: 'h-[330px] sm:h-[400px] md:h-[480px]', z: 'z-10', overlap: '-ml-32 sm:-ml-40 md:-ml-52', aspect: '16:9', rotate: 'rotate-3', translateY: '-translate-y-10 md:-translate-y-16' },
              { idx: 5, w: 'w-[220px] sm:w-[280px] md:w-[350px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: '-rotate-2', translateY: 'translate-y-16 md:translate-y-28' },
              { idx: 6, w: 'w-[260px] sm:w-[340px] md:w-[420px]', h: 'h-[310px] sm:h-[370px] md:h-[450px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '16:9', rotate: 'rotate-2', translateY: '-translate-y-8 md:-translate-y-14' },
              { idx: 7, w: 'w-[200px] sm:w-[260px] md:w-[320px]', h: 'h-[360px] sm:h-[430px] md:h-[520px]', z: 'z-35', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: '-rotate-3', translateY: 'translate-y-8 md:translate-y-14' },
              { idx: 8, w: 'w-[310px] sm:w-[390px] md:w-[490px]', h: 'h-[330px] sm:h-[400px] md:h-[480px]', z: 'z-10', overlap: '-ml-32 sm:-ml-44 md:-ml-56', aspect: '16:9', rotate: 'rotate-2', translateY: '-translate-y-12 md:-translate-y-18' },
              { idx: 9, w: 'w-[210px] sm:w-[270px] md:w-[340px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: '-rotate-1', translateY: 'translate-y-14 md:translate-y-24' },
              { idx: 10, w: 'w-[270px] sm:w-[350px] md:w-[440px]', h: 'h-[310px] sm:h-[370px] md:h-[450px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '16:9', rotate: 'rotate-3', translateY: '-translate-y-8 md:-translate-y-12' },
              { idx: 11, w: 'w-[220px] sm:w-[280px] md:w-[350px]', h: 'h-[360px] sm:h-[430px] md:h-[530px]', z: 'z-30', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: '-rotate-2', translateY: 'translate-y-10 md:translate-y-16' },
              { idx: 12, w: 'w-[290px] sm:w-[370px] md:w-[470px]', h: 'h-[320px] sm:h-[380px] md:h-[460px]', z: 'z-10', overlap: '-ml-32 sm:-ml-40 md:-ml-52', aspect: '16:9', rotate: '-rotate-2', translateY: '-translate-y-10 md:-translate-y-16' },
              { idx: 13, w: 'w-[200px] sm:w-[260px] md:w-[320px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: 'rotate-2', translateY: 'translate-y-16 md:translate-y-28' },
              { idx: 14, w: 'w-[250px] sm:w-[330px] md:w-[420px]', h: 'h-[300px] sm:h-[360px] md:h-[430px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-40', aspect: '16:9', rotate: '-rotate-1', translateY: '-translate-y-6 md:-translate-y-10' },
              { idx: 15, w: 'w-[210px] sm:w-[270px] md:w-[340px]', h: 'h-[360px] sm:h-[430px] md:h-[520px]', z: 'z-30', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: 'rotate-3', translateY: 'translate-y-8 md:translate-y-14' },
              { idx: 16, w: 'w-[300px] sm:w-[380px] md:w-[480px]', h: 'h-[330px] sm:h-[400px] md:h-[480px]', z: 'z-10', overlap: '-ml-32 sm:-ml-44 md:-ml-56', aspect: '16:9', rotate: 'rotate-1', translateY: '-translate-y-12 md:-translate-y-18' },
              { idx: 17, w: 'w-[220px] sm:w-[280px] md:w-[350px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: '-rotate-3', translateY: 'translate-y-14 md:translate-y-24' },
              { idx: 18, w: 'w-[270px] sm:w-[350px] md:w-[440px]', h: 'h-[310px] sm:h-[370px] md:h-[450px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '16:9', rotate: 'rotate-2', translateY: '-translate-y-8 md:-translate-y-14' },
              { idx: 19, w: 'w-[200px] sm:w-[260px] md:w-[320px]', h: 'h-[360px] sm:h-[430px] md:h-[530px]', z: 'z-35', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: '-rotate-1', translateY: 'translate-y-10 md:translate-y-18' },
              { idx: 20, w: 'w-[310px] sm:w-[390px] md:w-[490px]', h: 'h-[330px] sm:h-[400px] md:h-[480px]', z: 'z-10', overlap: '-ml-32 sm:-ml-44 md:-ml-56', aspect: '16:9', rotate: '-rotate-2', translateY: '-translate-y-10 md:-translate-y-16' },
              { idx: 21, w: 'w-[210px] sm:w-[270px] md:w-[340px]', h: 'h-[350px] sm:h-[420px] md:h-[510px]', z: 'z-25', overlap: '-ml-28 sm:-ml-36 md:-ml-48', aspect: '4:3', rotate: 'rotate-2', translateY: 'translate-y-16 md:translate-y-28' },
              { idx: 22, w: 'w-[280px] sm:w-[360px] md:w-[460px]', h: 'h-[310px] sm:h-[370px] md:h-[450px]', z: 'z-15', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '16:9', rotate: '-rotate-3', translateY: '-translate-y-8 md:-translate-y-12' },
              { idx: 23, w: 'w-[220px] sm:w-[280px] md:w-[350px]', h: 'h-[360px] sm:h-[430px] md:h-[530px]', z: 'z-30', overlap: '-ml-24 sm:-ml-32 md:-ml-44', aspect: '4:3', rotate: 'rotate-1', translateY: 'translate-y-8 md:translate-y-16' }
            ].map((sheet, sIndex) => (
              <div
                key={sIndex}
                onClick={() => {
                  uiAudio.playClick();
                  setLightboxIndex(sheet.idx % uniqueMediaPool.length);
                }}
                className={`relative shrink-0 ${sheet.w} ${sheet.h} ${sheet.z} ${sheet.overlap} ${sheet.rotate} ${sheet.translateY} rounded-2xl md:rounded-3xl overflow-hidden bg-zinc-900 border-[2.5px] border-white ring-1 ring-black/5 shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-all duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] origin-center cursor-pointer hover:!z-50 hover:scale-[1.10] hover:rotate-0 hover:grayscale-0 hover:opacity-100 hover:shadow-[0_25px_60px_rgba(0,0,0,0.35)] hover:ring-black/10 group snap-center ${
                  activeCollageCenterIndex === sIndex 
                    ? '!grayscale-0 !opacity-100 scale-[1.04] !z-40 shadow-xl' 
                    : 'grayscale contrast-95 opacity-55'
                }`}
              >
                <OptimizedImage
                  src={uniqueMediaPool[sheet.idx % uniqueMediaPool.length]}
                  aspectRatio={sheet.aspect as '16:9' | '4:3'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  alt={`Sanctuary Moment ${sheet.idx + 1}`}
                />
              </div>
            ))}
          </div>
        </div>

                {/* ZONE 2: 100% FULL-WIDTH CINEMATIC IMMERSIVE SUITE                        */}
        {/* ========================================================================= */}
        <div className="w-full md:max-w-7xl mx-auto px-4 md:px-6 lg:px-8 mt-4 md:mt-6 flex flex-col gap-16 md:gap-24">

          {/* 1. 10/10 CINEMATIC HORIZONTAL SLIDING BENTO GALLERY */}
          <section className="space-y-8 pt-8 border-t border-zinc-200/80">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 font-display">
                    THE ROOM COLLECTIONS
                  </span>
                </div>
                <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight text-zinc-900 font-display">
                  Our Sanctuary Chambers
                </h2>
                <p className="text-sm md:text-base text-zinc-500 font-medium mt-1">
                  Explore our curated selection of spaces.
                </p>
              </div>

              {/* Slide Navigation Controls & Collection Badge */}
              <div className="flex items-center gap-3 self-start md:self-end">
                <div className="bg-zinc-100 px-4 py-2 rounded-full text-xs font-bold text-zinc-700 font-display flex items-center gap-2 border border-zinc-200/60 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                  <span>COLLECTION 0{activeSlide + 1} / 0{slideCollections.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    setActiveSlide((activeSlide - 1 + slideCollections.length) % slideCollections.length);
                  }}
                  className="w-10 h-10 rounded-full bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-900 flex items-center justify-center shadow-xs active:scale-95 transition-all cursor-pointer"
                  title="Previous Collection"
                >
                  <ChevronLeft strokeWidth={1.5} className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    uiAudio.playClick();
                    setActiveSlide((activeSlide + 1) % slideCollections.length);
                  }}
                  className="w-10 h-10 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
                  title="Next Collection"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Collection Category Pills (Dynamic Room Inventory Taxonomy) */}
            <div className="flex flex-wrap gap-2">
              {slideCollections.map((col, idx) => (
                <button
                  key={col.id || idx}
                  type="button"
                  onClick={() => handleCategoryPillClick(idx)}
                  className={`px-4 py-2 rounded-full text-xs font-bold font-display transition-all cursor-pointer flex items-center gap-2 ${
                    activeSlide === idx
                      ? 'bg-zinc-900 text-white shadow-sm ring-1 ring-zinc-900'
                      : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200/60'
                  }`}
                >
                  <span>{col.name}</span>
                </button>
              ))}
            </div>

            {/* DESKTOP BENTO COLLAGE (Left-Trio + Right-Hero + Floating Hover Paddles) */}
            <div className="hidden md:block relative group/gallery overflow-hidden min-h-[560px] md:min-h-[640px] rounded-3xl">
              {/* Floating Edge Glass Paddles (Appear on Gallery Hover) */}
              <button
                type="button"
                onClick={() => {
                  uiAudio.playClick();
                  setActiveSlide((activeSlide - 1 + slideCollections.length) % slideCollections.length);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-xl border border-white/20 flex items-center justify-center opacity-0 group-hover/gallery:opacity-100 transition-all duration-300 shadow-xl active:scale-90 cursor-pointer"
                title="Previous Collection"
              >
                <ChevronLeft strokeWidth={1.5} className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={() => {
                  uiAudio.playClick();
                  setActiveSlide((activeSlide + 1) % slideCollections.length);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-xl border border-white/20 flex items-center justify-center opacity-0 group-hover/gallery:opacity-100 transition-all duration-300 shadow-xl active:scale-90 cursor-pointer"
                title="Next Collection"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSlide}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-12 gap-4 h-full"
                >
                  {/* LEFT SIDE (7 Cols): TRIO OF DETAIL SPACES (Sub-Classification Labels ONLY) */}
                  <div className="col-span-7 flex flex-col gap-4">
                    {/* Top Row: Spaces 02 & 03 (4:3) */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Space 02 */}
                      <div
                        onClick={() => {
                          uiAudio.playClick();
                          setLightboxIndex(slideCollections[activeSlide].space02.imgIndex);
                        }}
                        className="group relative h-64 md:h-72 rounded-3xl overflow-hidden bg-zinc-100 border border-zinc-200/60 shadow-xs hover:shadow-xl transition-all duration-500 cursor-pointer"
                      >
                        <OptimizedImage
                          src={slideCollections[activeSlide].space02.img}
                          aspectRatio="4:3"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          alt={slideCollections[activeSlide].space02.tag || 'Space'}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent opacity-85 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4 sm:p-5">
                          <div className="flex flex-col w-full text-white">
                            <div className="flex items-center justify-between w-full">
                              <span className="uppercase text-[10px] md:text-xs text-amber-400 font-mono font-bold tracking-wider">{slideCollections[activeSlide]?.space02?.tag || 'Sanctuary Space'}</span>
                              <div className="p-2 rounded-full bg-white/20 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <Eye className="w-4 h-4 text-white" />
                              </div>
                            </div>
                            <h4 className="mt-3 text-lg font-bold font-display leading-tight shadow-sm drop-shadow-md">{slideCollections[activeSlide].space02.title}</h4>
                          </div>
                        </div>
                      </div>

                      {/* Space 03 */}
                      <div
                        onClick={() => {
                          uiAudio.playClick();
                          setLightboxIndex(slideCollections[activeSlide].space03.imgIndex);
                        }}
                        className="group relative h-64 md:h-72 rounded-3xl overflow-hidden bg-zinc-100 border border-zinc-200/60 shadow-xs hover:shadow-xl transition-all duration-500 cursor-pointer"
                      >
                        <OptimizedImage
                          src={slideCollections[activeSlide].space03.img}
                          aspectRatio="4:3"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          alt={slideCollections[activeSlide].space03.tag || 'Space'}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent opacity-85 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4 sm:p-5">
                          <div className="flex flex-col w-full text-white">
                            <div className="flex items-center justify-between w-full">
                              <span className="uppercase text-[10px] md:text-xs text-amber-400 font-mono font-bold tracking-wider">{slideCollections[activeSlide]?.space03?.tag || 'Sanctuary Space'}</span>
                              <div className="p-2 rounded-full bg-white/20 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <Eye className="w-4 h-4 text-white" />
                              </div>
                            </div>
                            <h4 className="mt-3 text-lg font-bold font-display leading-tight shadow-sm drop-shadow-md">{slideCollections[activeSlide].space03.title}</h4>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Wide Architectural Banner (Space 04, 16:9) */}
                    <div
                      onClick={() => {
                        uiAudio.playClick();
                        setLightboxIndex(slideCollections[activeSlide].space04.imgIndex);
                      }}
                      className="group relative h-56 md:h-64 rounded-3xl overflow-hidden bg-zinc-100 border border-zinc-200/60 shadow-xs hover:shadow-xl transition-all duration-500 cursor-pointer"
                    >
                      <OptimizedImage
                        src={slideCollections[activeSlide].space04.img}
                        aspectRatio="16:9"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        alt={slideCollections[activeSlide].space04.tag || 'Space'}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent opacity-85 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-5 sm:p-6">
                        <div className="flex flex-col w-full text-white">
                          <div className="flex items-center justify-between w-full">
                            <span className="uppercase text-[10px] md:text-xs text-amber-400 font-mono font-bold tracking-wider">{slideCollections[activeSlide]?.space04?.tag || 'Sanctuary Space'}</span>
                            <div className="p-2.5 rounded-full bg-white/20 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <Eye className="w-4 h-4 text-white" />
                            </div>
                          </div>
                          <h4 className="mt-3 text-xl font-bold font-display leading-tight shadow-sm drop-shadow-md">{slideCollections[activeSlide].space04.title}</h4>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT SIDE (5 Cols): LARGE FEATURE HERO VISTA (Space 01) */}
                  <div
                    onClick={() => {
                      uiAudio.playClick();
                      setGalleryInitialIndex(0);
                      setGalleryInitialCategory(slideCollections[activeSlide].id as GalleryCategoryKey);
                      setIsGalleryOpen(true);
                    }}
                    className="col-span-5 group relative min-h-[380px] lg:min-h-full rounded-3xl overflow-hidden bg-zinc-100 border border-zinc-200/60 shadow-xs hover:shadow-2xl transition-all duration-500 cursor-pointer flex flex-col justify-end"
                  >
                    {slideCollections[activeSlide].space01.hasVideo && ((listing as any).hero_video_url || listing.video_url) ? (
                      <div className="absolute inset-0 w-full h-full">
                        <OptimizedImage
                          src={slideCollections[activeSlide].space01.img}
                          aspectRatio="16:9"
                          priority={true}
                          className="absolute inset-0 w-full h-full object-cover"
                          alt={slideCollections[activeSlide].space01.title}
                        />
                        {((listing as any).hero_video_url || listing.video_url).startsWith('mux://') ? (
                          <MuxPlayer
                            playbackId={((listing as any).hero_video_url || listing.video_url).replace('mux://', '')}
                            autoPlay="muted"
                            loop
                            muted
                            onCanPlay={() => setIsVideoReady(true)}
                            className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ${isVideoReady ? 'opacity-100' : 'opacity-0'}`}
                            style={{ '--media-object-fit': 'cover' } as any}
                          />
                        ) : (
                          <video
                            src={(listing as any).hero_video_url || listing.video_url}
                            autoPlay
                            loop
                            muted
                            playsInline
                            onCanPlayThrough={() => setIsVideoReady(true)}
                            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${isVideoReady ? 'opacity-100' : 'opacity-0'}`}
                          />
                        )}
                      </div>
                    ) : (
                      <OptimizedImage
                        src={slideCollections[activeSlide].space01.img}
                        aspectRatio="16:9"
                        priority={true}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        alt={slideCollections[activeSlide].space01.title}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-85 group-hover:opacity-95 transition-opacity duration-300" />
                    
                    {/* Hero Badge & Metadata */}
                    <div className="relative z-10 p-6 md:p-8 text-white space-y-2">
                      <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/30 text-[10px] font-black uppercase tracking-widest font-mono">
                        <Crown className="w-3.5 h-3.5 text-amber-300" />
                        <span>{slideCollections[activeSlide]?.space01?.tag || 'Flagship Living Quarters'}</span>
                      </div>
                      <h3 className="text-xl md:text-2xl font-extrabold font-display leading-tight">
                        {slideCollections[activeSlide].space01.title}
                      </h3>
                      <p className="text-xs md:text-sm text-zinc-300 font-medium leading-relaxed max-w-sm">
                        {slideCollections[activeSlide].space01.desc}
                      </p>
                      <div className="pt-3 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerKineticReservation();
                          }}
                          className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs shadow-md active:scale-95 hover:scale-[1.02] transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          {isMorphingReservation ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-900" />
                              <span>Selecting...</span>
                            </>
                          ) : (
                            <>
                              <Bed className="w-3.5 h-3.5 text-zinc-900" />
                              <span>Select This {slideCollections[activeSlide]?.space01?.unitType || 'Accommodation'}</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center gap-1.5 text-xs font-bold font-display text-amber-300 group-hover:translate-x-1 transition-transform">
                          <span>Explore All Photos</span>
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Bottom Tactile Progress Indicators */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                {[0, 1, 2].map(idx => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      uiAudio.playClick();
                      setActiveSlide(idx);
                    }}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                      activeSlide === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                    }`}
                    title={`Go to Collection ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* 10/10 APPLE FLOATING DYNAMIC CAPSULE STREAM (< 768px) */}
            <div className="md:hidden space-y-3">
              {/* 1. Pure Full-Bleed Continuous Swipe Track (with Kinetic Shrink-Jump Arc on Reserve) */}
              <div 
                ref={mobileGalleryRef}
                onScroll={handleMobileScroll}
                className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-1 scrollbar-hide" 
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {mobileContinuousSpaces.map((item, mIdx) => {
                  const space = item.space;
                  const isCurrentActive = mobileSpaceIndex === mIdx;
                  return (
                    <motion.div
                      key={`space-${mIdx}`}
                      onClick={() => {
                        uiAudio.playClick();
                        setLightboxIndex(space.imgIndex);
                      }}
                      animate={isMorphingReservation && isCurrentActive ? {
                        scale: [1, 0.88, 0.4, 0.15],
                        y: [0, -30, 80, 140],
                        opacity: [1, 0.9, 0.4, 0],
                        transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] }
                      } : {
                        scale: 1,
                        y: 0,
                        opacity: 1
                      }}
                      className="snap-center shrink-0 w-[86vw] sm:w-[72vw] relative aspect-[4/3] rounded-3xl overflow-hidden bg-zinc-100 border border-zinc-200/80 shadow-md cursor-pointer group origin-bottom"
                    >
                      <OptimizedImage
                        src={space.img}
                        aspectRatio="4:3"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        alt={space.title}
                      />

                      {/* Clean Minimalist Bottom Caption Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex items-end p-4 text-white">
                        <div className="w-full">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 font-mono">
                              {activeSlide === 0 ? 'Suites' : activeSlide === 1 ? 'Deluxe' : 'Executive'} 0{(item.subIdx)} · {space.tag}
                            </span>
                            <span className="text-[10px] text-zinc-300 font-medium font-mono">
                              {item.globalIdx} / 12
                            </span>
                          </div>
                          <h4 className="text-sm font-bold font-display mt-0.5 truncate text-white">{space.title}</h4>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* 2. 10/10 APPLE FLOATING DYNAMIC CAPSULE (Dynamic Tier Naming · Kinetic Morphing · VisionOS Polish) */}
              <div className="flex justify-center px-2">
                <div className="bg-white/95 backdrop-blur-2xl px-4 py-2 rounded-full border border-white/80 shadow-[0_12px_35px_rgba(0,0,0,0.12)] flex items-center gap-3.5 max-w-[95vw] ring-1 ring-black/5">
                  {/* Left: Dynamic Tier Label (Suites 01/04, Deluxe 01/04, Executive 01/04) */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-[11px] font-extrabold text-zinc-900 font-mono tracking-tight">
                      {activeSlide === 0 ? 'Suites' : activeSlide === 1 ? 'Deluxe' : 'Executive'} 0{(mobileSpaceIndex % 4) + 1}
                      <span className="text-zinc-400 font-normal">/04</span>
                    </span>
                  </div>

                  {/* Center: Apple-Grade Kinetic Scrub Progress Bar */}
                  <div className="w-14 sm:w-18 h-1 bg-zinc-200/80 rounded-full relative overflow-hidden shrink-0">
                    <div 
                      className="h-full bg-zinc-900 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${((mobileSpaceIndex % 4) + 1) * 25}%` }}
                    />
                  </div>

                  {/* Right: Tactile Spring Action Pill with Auto 'Booking...' Morph Loader */}
                  {isMorphingReservation ? (
                    <div className="bg-zinc-950 text-white text-xs font-bold px-3.5 py-1.5 rounded-full shadow-xs flex items-center gap-1.5 shrink-0 animate-pulse font-mono">
                      <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                      <span>Booking...</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerKineticReservation();
                      }}
                      className="bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-extrabold px-3.5 py-1.5 rounded-full shadow-xs active:scale-90 hover:scale-105 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <span>Reserve</span>
                      <ArrowUpRight className="w-3 h-3 text-zinc-300" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between px-3 text-[11px] font-medium text-zinc-400 pt-0.5">
                <span>Swipe across room configurations</span>
                <span>Tap photo to expand full view</span>
              </div>
            </div>
          </section>

          {/* 2. AMBIENT NEIGHBORHOOD RADAR (Apple Hybrid Photo-Pin & Ultra-Minimal Micro-Dock) */}
          <section className="space-y-6 pt-8 border-t border-zinc-200/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 font-display">Neighborhood Radar</h2>
                <p className="text-sm text-zinc-500 font-medium mt-0.5">Surrounding landmarks, private transit times, and curated local highlights.</p>
              </div>
              <span className="text-sm font-bold text-indigo-600 flex items-center gap-1.5 bg-indigo-50 px-3.5 py-2 rounded-xl border border-indigo-100 w-fit">
                <MapPin className="w-4 h-4" /> {listing.city}
              </span>
            </div>

            <div className="relative w-full h-[380px] sm:h-[420px] md:h-[460px] bg-zinc-100 rounded-3xl overflow-hidden border border-zinc-200 shadow-inner group">
              {/* Locked "Dormant to Life" Chromatic Shift Layer with Dynamic Camera Zoom */}
              <div 
                className="absolute inset-0 opacity-50 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1600&q=80')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-1000 ease-out" 
                style={{
                  transform: activeTouristPlace ? 'scale(1.35)' : 'scale(1.0)',
                  transformOrigin: activeTouristPlace ? `${(activeTouristPlace as any).pinLeft} ${(activeTouristPlace as any).pinTop}` : 'center center'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/30 to-transparent pointer-events-none" />

              {/* Dynamic AI Category Filter Pills (Top-Left) */}
              <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 p-1 bg-white/90 backdrop-blur-md rounded-2xl border border-white/70 shadow-sm">
                {availableRadarCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      uiAudio.playClick();
                      setRadarCategory(cat.id);
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                      radarCategory === cat.id
                        ? 'bg-zinc-900 text-white shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* TOP-RIGHT FLOATING GLASS HUD CARD (Leaving 70%+ of Map Open & Visible) */}
              <AnimatePresence>
                {activeTouristPlace && (
                  <motion.div
                    initial={{ opacity: 0, x: 20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, scale: 0.95 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="absolute top-4 right-4 z-30 w-[280px] sm:w-[320px] bg-white/95 backdrop-blur-md rounded-2xl border border-white/80 shadow-2xl p-3.5 space-y-2.5"
                  >
                    {/* Header: Title & Camera Reset Button */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-zinc-100">
                      <div className="flex items-center gap-1.5 truncate">
                        {activeTouristPlace.isHome ? (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                          </span>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                        <h4 className="text-xs font-extrabold text-zinc-900 truncate font-display">
                          {activeTouristPlace.isHome ? 'Our Sanctuary' : activeTouristPlace.name}
                        </h4>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          uiAudio.playClick();
                          setActiveTouristPlace(null);
                        }}
                        className="w-5 h-5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                        title="Reset Map Camera"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Image & Key Telemetry */}
                    <div className="flex gap-2.5 items-center">
                      <div className="relative w-20 h-16 rounded-xl overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200/60 shadow-xs">
                        <OptimizedImage
                          src={activeTouristPlace.photo}
                          aspectRatio="16:9"
                          className="w-full h-full object-cover"
                          alt={activeTouristPlace.name}
                        />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-[10px] font-semibold text-zinc-500 truncate">{activeTouristPlace.localScript}</p>
                        <div className="flex items-center gap-1.5 text-xs font-extrabold text-zinc-900">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span>{(activeTouristPlace as any).rating}</span>
                          <span className="text-[10px] text-zinc-400 font-normal">({(activeTouristPlace.reviewCount ?? 100).toLocaleString()})</span>
                        </div>
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          activeTouristPlace.isHome 
                            ? 'text-indigo-700 bg-indigo-50 border-indigo-100'
                            : 'text-emerald-700 bg-emerald-50 border-emerald-100'
                        }`}>
                          {activeTouristPlace.isHome ? '🏠 Primary Residence' : `🚗 ${activeTouristPlace.distance}`}
                        </span>
                      </div>
                    </div>

                    {/* AI Concierge Summary */}
                    <div className="bg-zinc-50 border border-zinc-200/60 rounded-xl p-2 text-[11px] text-zinc-600 font-medium leading-relaxed">
                      <span className="font-bold text-zinc-800">AI Concierge: </span>
                      {activeTouristPlace.summary}
                    </div>

                    {/* Minimal Direct Navigation Button */}
                    <a
                      href={(activeTouristPlace as any).googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full text-white text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all hover:shadow-md cursor-pointer ${
                        activeTouristPlace.isHome 
                          ? 'bg-zinc-900 hover:bg-zinc-800' 
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      <span>{activeTouristPlace.isHome ? 'Directions to Residence' : 'Open in Google Maps'}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Interactive Glowing Radar Map Pins (Apple Hybrid Photo-Pin + Landmark Pins) */}
              {filteredPOIs.map((poi, pIdx) => {
                const isActive = activeTouristPlace?.id === poi.id;
                const isHome = poi.isHome;

                if (isHome) {
                  return (
                    <div
                      key={poi.id}
                      style={{ position: 'absolute', top: (poi as any).pinTop, left: (poi as any).pinLeft }}
                      className={`z-30 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group/pin transition-all duration-500 ${
                        activeTouristPlace && !isActive ? 'opacity-60 scale-95' : 'opacity-100'
                      }`}
                    >
                      {/* Apple-Grade Hybrid Glass Photo-Pin */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          uiAudio.playClick();
                          setActiveTouristPlace(isActive ? null : poi);
                        }}
                        className={`relative flex items-center gap-2 p-1.5 pr-3 rounded-2xl bg-white/95 backdrop-blur-xl border border-white/80 shadow-[0_10px_30px_rgba(0,0,0,0.16)] transition-all duration-300 cursor-pointer ${
                          isActive 
                            ? 'ring-2 ring-zinc-900 scale-105 shadow-2xl' 
                            : 'hover:scale-105 hover:shadow-xl'
                        }`}
                      >
                        {/* Micro Embedded Property Photo Avatar */}
                        <div className="relative w-8 h-8 rounded-xl overflow-hidden ring-2 ring-white/90 shadow-xs shrink-0 bg-zinc-100">
                          <OptimizedImage
                            src={poi.photo}
                            aspectRatio="1:1"
                            className="w-full h-full object-cover"
                            alt="Our Sanctuary"
                          />
                        </div>

                        {/* Title & Live Breathing Red Dot */}
                        <div className="text-left leading-tight pr-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-extrabold text-zinc-900 tracking-tight font-display">Our Sanctuary</span>
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
                            </span>
                          </div>
                          <span className="text-[9px] font-semibold text-zinc-400 block tracking-wide">Primary Residence</span>
                        </div>

                        <a
                          href={(poi as any).googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-emerald-600 text-zinc-400 p-0.5 rounded transition-colors ml-0.5"
                          title="Directions to Residence"
                        >
                          <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </button>

                      {/* Precision Glass Pin Stem / Point */}
                      <div className="w-2 h-2 bg-white rotate-45 -mt-1 shadow-xs border-r border-b border-white/80" />
                    </div>
                  );
                }

                const touristIndex = pIdx; // Numbered landmark pin index
                return (
                  <div
                    key={poi.id}
                    style={{ position: 'absolute', top: (poi as any).pinTop, left: (poi as any).pinLeft }}
                    className={`z-20 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group/pin transition-all duration-500 ${
                      activeTouristPlace && !isActive ? 'opacity-40 scale-90' : 'opacity-100'
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        uiAudio.playClick();
                        setActiveTouristPlace(isActive ? null : poi);
                      }}
                      className="relative flex items-center justify-center focus:outline-none cursor-pointer"
                    >
                      <span className={`absolute rounded-full transition-all ${
                        isActive 
                          ? 'w-10 h-10 bg-emerald-400/60 animate-ping' 
                          : 'w-6 h-6 bg-emerald-400/40 animate-ping'
                      }`} />
                      <div className={`rounded-full flex items-center justify-center shadow-xl border-2 border-white font-black transition-all ${
                        isActive
                          ? 'w-9 h-9 bg-emerald-600 text-white text-xs scale-110 shadow-emerald-500/50'
                          : 'w-7 h-7 bg-zinc-900 text-white text-[11px] hover:bg-emerald-600'
                      }`}>
                        {touristIndex}
                      </div>
                    </button>

                    {/* Minimal Pin Navigation Tooltip */}
                    <div className={`flex items-center gap-1 transition-all bg-zinc-900/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/20 whitespace-nowrap shadow-md mt-1 ${
                      isActive ? 'opacity-100 scale-105 bg-emerald-950 border-emerald-400/50' : 'opacity-0 group-hover/pin:opacity-100'
                    }`}>
                      <span>{poi.name} · {poi.distance}</span>
                      <a
                        href={(poi as any).googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-emerald-300 ml-1 p-0.5 rounded hover:bg-white/20 transition-colors"
                        title="Direct Google Maps Directions"
                      >
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              })}

              {/* ULTRA-MINIMAL APPLE-GRADE FROSTED MICRO-DOCK (35% Less Space, Maximum Polish) */}
              <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4 z-20">
                <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-2.5 pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {filteredPOIs.map((poi, idx) => {
                    const isSelected = activeTouristPlace?.id === poi.id;
                    const isHome = poi.isHome;

                    if (isHome) {
                      return (
                        <div 
                          key={poi.id} 
                          onClick={() => {
                            uiAudio.playClick();
                            setActiveTouristPlace(isSelected ? null : poi);
                          }}
                          className={`snap-center shrink-0 backdrop-blur-md p-2.5 rounded-2xl border transition-all duration-300 min-w-[190px] sm:min-w-[205px] cursor-pointer group/pill flex items-center gap-2.5 ${
                            isSelected
                              ? 'bg-white border-zinc-900 shadow-xl ring-2 ring-zinc-900/10 scale-[1.02]'
                              : 'bg-white/90 border-white/70 shadow-md hover:bg-white hover:scale-[1.01] hover:shadow-lg'
                          }`}
                        >
                          {/* Micro Photo Avatar */}
                          <div className="relative w-9 h-9 rounded-xl overflow-hidden ring-1 ring-zinc-200 shadow-2xs shrink-0 bg-zinc-100">
                            <OptimizedImage
                              src={poi.photo}
                              aspectRatio="1:1"
                              className="w-full h-full object-cover"
                              alt="Our Sanctuary"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            {/* Top Line: Red Pulse Dot + OUR SANCTUARY + Star Rating */}
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-900 font-mono flex items-center gap-1.5">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
                                </span>
                                <span>OUR SANCTUARY</span>
                              </span>
                              <span className="text-[10px] font-bold text-amber-600 flex items-center gap-0.5">
                                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                <span>{(poi as any).rating}</span>
                              </span>
                            </div>

                            {/* Middle Line: Shortened Clean Property Title (Max 15 Chars) */}
                            <h4 className="text-xs font-bold truncate font-display text-zinc-900 mt-0.5 max-w-[125px]">
                              {poi.name}
                            </h4>

                            {/* Bottom Line: Direct Directions Action Trigger */}
                            <p className="text-[10px] font-semibold text-zinc-700 group-hover/pill:text-emerald-700 mt-0.5 flex items-center gap-0.5 transition-colors">
                              <span>Directions</span>
                              <ArrowUpRight className="w-2.5 h-2.5" />
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div 
                        key={poi.id} 
                        onClick={() => {
                          uiAudio.playClick();
                          setActiveTouristPlace(isSelected ? null : poi);
                        }}
                        className={`snap-center shrink-0 backdrop-blur-md px-3.5 py-2.5 rounded-2xl border transition-all duration-300 min-w-[175px] sm:min-w-[195px] cursor-pointer group/pill ${
                          isSelected
                            ? 'bg-white border-emerald-500 shadow-xl ring-2 ring-emerald-500/20 scale-[1.02]'
                            : 'bg-white/90 border-white/70 shadow-md hover:bg-white hover:scale-[1.01] hover:shadow-lg'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1">
                            <Navigation className={`w-3 h-3 ${isSelected ? 'text-emerald-600' : 'text-zinc-500'}`} />
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 font-mono">{poi.type}</span>
                          </div>
                          <div className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-1 py-0.2 rounded">
                            <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                            <span>{(poi as any).rating}</span>
                          </div>
                        </div>
                        <h4 className={`text-xs font-bold truncate font-display transition-colors ${
                          isSelected ? 'text-emerald-700' : 'text-zinc-900 group-hover/pill:text-emerald-700'
                        }`}>
                          {poi.name}
                        </h4>
                        <p className="text-[10px] font-semibold text-emerald-700 mt-0.5 flex items-center justify-between">
                          <span>{poi.distance}</span>
                          <span className="text-[9px] text-zinc-400 font-normal flex items-center gap-0.5">
                            {isSelected ? '✦ Zoomed' : 'Explore'} <ArrowUpRight className="w-2.5 h-2.5" />
                          </span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </section>

          {/* 3. VERIFIED GUEST REVIEWS */}
          <section className="space-y-6 pt-8 border-t border-zinc-200/80">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Star className="w-7 h-7 text-amber-500 fill-amber-500" />
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 font-display tabular-nums">
                  {listing.rating?.toFixed(2) || '4.95'}
                </h2>
              </div>
              <span className="text-zinc-300 text-2xl font-light">|</span>
              <span className="text-lg font-bold text-zinc-600 font-display">{listing.reviewCount || 124} Verified Stays</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  author: "Michael R.",
                  initial: "M",
                  color: "bg-indigo-100 text-indigo-700",
                  tag: "October 2025 · Tech Retreat",
                  quote: "The suite configuration was perfect for our remote team. The Wi-Fi was flawless, and the architectural lighting kept the vibe perfectly balanced."
                },
                {
                  author: "Sarah K.",
                  initial: "S",
                  color: "bg-emerald-100 text-emerald-700",
                  tag: "September 2025 · Couple's Getaway",
                  quote: "Immaculate attention to detail. The host concierge was incredibly responsive through the app. Felt incredibly safe and well-taken care of."
                },
                {
                  author: "Aarav M.",
                  initial: "A",
                  color: "bg-amber-100 text-amber-800",
                  tag: "August 2025 · Family Escape",
                  quote: "The private chef and pool were spectacular. Having 100% verified staff and seamless Walled Garden check-in made it a 10/10 stay."
                }
              ].map((rev, idx) => (
                <div key={idx} className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold font-display ${rev.color}`}>
                        {rev.initial}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-zinc-900 font-display">{rev.author}</h4>
                        <p className="text-xs text-zinc-500 font-medium">{rev.tag}</p>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-600 leading-relaxed font-normal italic">"{rev.quote}"</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 4. SIMILAR SANCTUARIES */}
          {similarListings && similarListings.length > 0 && (
            <section className="space-y-6 pt-8 border-t border-zinc-200/80 pb-16">
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 font-display">Similar Sanctuaries</h2>
              <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {similarListings.map(sim => (
                  <div 
                    key={sim.id} 
                    onClick={() => { uiAudio.playClick(); if (onListingClick) onListingClick(sim); }}
                    className="snap-start shrink-0 w-[280px] md:w-[320px] cursor-pointer group"
                  >
                    <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden bg-zinc-100 mb-3 border border-zinc-200/50">
                      <OptimizedImage 
                        src={sim.imageUrls?.[0] || sim.imageUrl} 
                        aspectRatio="4:3" 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                        alt={sim.title} 
                      />
                      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/40 shadow-xs flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span className="text-[10px] font-bold text-zinc-900 tabular-nums">{sim.rating?.toFixed(1) || '4.9'}</span>
                      </div>
                    </div>
                    <h4 className="text-sm font-bold text-zinc-900 truncate font-display">{sim.title}</h4>
                    <p className="text-xs font-medium text-zinc-500 truncate">{sim.type} · {sim.city}</p>
                    <p className="text-sm font-extrabold text-zinc-900 mt-1 font-display tabular-nums">
                      {sim.currency === 'USD' ? '$' : '₹'}{sim.price.toLocaleString()} <span className="font-medium text-xs text-zinc-500">/ night</span>
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>

        {/* ========================================================================= */}
        {/* GRAPHIC MORPHING FLOATING BOOKING CAPSULE (Visible past Host Section)      */}
        {/* ========================================================================= */}
        <AnimatePresence>
          {showFloatingCapsule && (
            <motion.div 
              initial={{ y: 90, opacity: 0, scale: 0.94 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 90, opacity: 0, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="hidden lg:flex fixed bottom-7 inset-x-0 z-50 justify-center px-4 pointer-events-none"
            >
              <div className="bg-zinc-900/95 text-white backdrop-blur-2xl border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.35)] rounded-full px-6 py-3.5 flex items-center justify-between gap-8 pointer-events-auto max-w-xl w-full transition-transform hover:scale-[1.01]">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-2xl overflow-hidden bg-zinc-800 shrink-0 border border-white/10 relative">
                    <OptimizedImage src={images[0]} aspectRatio="1:1" className="w-full h-full object-cover" alt="Sanctuary Thumbnail" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-extrabold text-white font-display tabular-nums">
                        {listing.currency === 'USD' ? '$' : '₹'}{activeNightlyRate.toLocaleString()}
                      </span>
                      <span className="text-xs text-zinc-400 font-medium">/ night</span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center gap-1.5 font-display">
                      <span>{new Date(checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span>·</span>
                      <span>{guests} {guests === 1 ? 'Guest' : 'Guests'}</span>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isDateRangeBlocked}
                  onClick={() => handleReserve()}
                  className={`text-xs md:text-sm font-extrabold font-display uppercase tracking-wider px-7 py-3 rounded-full shadow-lg active:scale-95 transition-all flex items-center gap-2 ${
                    isDateRangeBlocked
                      ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 shadow-amber-500/20 cursor-pointer'
                  }`}
                >
                  <span>{isDateRangeBlocked ? 'UNAVAILABLE' : 'RESERVE'}</span>
                  {!isDateRangeBlocked && <ArrowRight className="w-4 h-4 stroke-[2.5]" />}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========================================================================= */}
        {/* UNIFIED LIQUID MORPHING MOBILE BOOKING CAPSULE (10/10 AWARD WINNER)        */}
        {/* ========================================================================= */}
        <div className="lg:hidden">
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className={`fixed z-50 pointer-events-auto transition-colors duration-300 ${
              showMobileStickyBar
                ? "bottom-0 inset-x-0 bg-white/95 backdrop-blur-2xl border-t border-zinc-200/80 shadow-[0_-8px_32px_rgba(0,0,0,0.09)] px-4 py-3 pb-safe safe-area-bottom"
                : "bottom-5 inset-x-4 max-w-md mx-auto bg-zinc-900/90 text-white backdrop-blur-2xl border border-white/15 shadow-[0_16px_48px_rgba(0,0,0,0.4)] rounded-full px-5 py-2.5"
            }`}
          >
            <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1">
                  <span className={`text-lg sm:text-xl font-black font-display tabular-nums ${showMobileStickyBar ? "text-zinc-900" : "text-white"}`}>
                    {listing.currency === 'USD' ? '$' : '₹'}{activeNightlyRate.toLocaleString()}
                  </span>
                  <span className={`text-[10px] font-bold uppercase font-mono ${showMobileStickyBar ? "text-zinc-400" : "text-zinc-300"}`}>
                    / nt
                  </span>
                </div>
                {isDateRangeBlocked ? (
                  <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 mt-0.5 truncate max-w-[150px]">
                    ⛔ Held / Booked
                  </span>
                ) : showMobileStickyBar ? (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5 truncate max-w-[150px]">
                    {getRoomConfig(selectedRoomTier).icon} {getRoomConfig(selectedRoomTier).name}
                  </span>
                ) : (
                  <span className="text-[9px] font-medium text-emerald-400 tracking-wider uppercase flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Instant Confirmation
                  </span>
                )}
              </div>

              <button 
                disabled={isDateRangeBlocked}
                onClick={() => {
                  uiAudio.playPop();
                  handleReserve();
                }}
                className={`font-bold font-display uppercase tracking-wider text-xs py-3 px-6 rounded-full active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5 ${
                  isDateRangeBlocked
                    ? "bg-zinc-300 text-zinc-500 cursor-not-allowed shadow-none"
                    : showMobileStickyBar
                      ? "bg-zinc-950 hover:bg-zinc-900 text-white cursor-pointer"
                      : "bg-white text-zinc-950 hover:bg-zinc-100 shadow-white/20 cursor-pointer"
                }`}
              >
                {isDateRangeBlocked ? (
                  <span>UNAVAILABLE</span>
                ) : showMobileStickyBar ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>RESERVE ↗</span>
                  </>
                ) : (
                  <>
                    <span>Reserve</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>

        {/* ========================================================================= */}
        {/* AWARD-WINNING SANCTUARY SPATIAL GALLERY (iF & RED DOT STANDARD)           */}
        {/* ========================================================================= */}
        <SanctuaryGalleryModal
          isOpen={isGalleryOpen}
          onClose={() => setIsGalleryOpen(false)}
          listing={listing}
          initialIndex={galleryInitialIndex}
          initialCategory={galleryInitialCategory}
          onReserve={() => handleReserve()}
        />

      </div>
    </>
  );
};

export const ListingDetailsNew: React.FC<ListingDetailsNewProps> = (props) => {
  return (
    <ListingErrorBoundary>
      <ListingDetailsNewContent {...props} />
    </ListingErrorBoundary>
  );
};
