
import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { SEO } from './components/SEO';
import { uiAudio } from './components/audio';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import ListingCard from './components/ListingCard';
import FlyToAnimation from './components/FlyToAnimation';
import { MapIcon, ListIcon } from './components/Icons';
import { Listing } from './types';
import { useAuth } from './components/AuthContext';
import { AuthModal } from './components/AuthModal';
import { useAppBadge, useNativeNotification } from './components/usePWA';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchWithCache, queueMutation } from './lib/syncService';
import { initSyncHandlers } from './lib/syncHandlers';

import { ListingCardSkeleton, ListingDetailsSkeleton } from './components/Skeletons';

initSyncHandlers();

const MapSidebar = lazy(() => import('./components/MapSidebar'));
const ListingDetails = lazy(() => import('./components/ListingDetails'));
const WishlistPage = lazy(() => import('./components/WishlistPage'));
const BookingPage = lazy(() => import('./components/BookingPage'));
const ReservationsPage = lazy(() => import('./components/ReservationsPage'));
const HostForm = lazy(() => import('./components/HostForm'));
const HostExperienceForm = lazy(() => import('./components/HostExperienceForm'));
const HostDashboard = lazy(() => import('./components/HostDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const InboxPage = lazy(() => import('./components/InboxPage'));
const ExperiencesPage = lazy(() => import('./components/ExperiencesPage').then(module => ({ default: module.ExperiencesPage })));
const ExperienceDetails = lazy(() => import('./components/ExperienceDetails').then(module => ({ default: module.ExperienceDetails })));

// Ensure type imports if needed
import { Experience } from './types';


function useNetworkState() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

type ViewState = 'SEARCH' | 'DETAILS' | 'WISHLIST' | 'BOOKING' | 'RESERVATIONS' | 'HOSTING' | 'HOSTING_EXPERIENCE' | 'ADMIN' | 'MESSAGES' | 'EXPERIENCES' | 'EXPERIENCE_DETAILS';

let socket: any = null;

interface BookingData {
    moveInDate: string;
    configuration: string;
    name: string;
    phone: string;
    totalRent: number;
}

interface Reservation extends BookingData {
    id: string;
    listing: Listing;
    bookingDate: string;
}

interface FlyAnimationState {
    listing: Listing;
    target: 'RESERVES' | 'WISHLIST';
}

interface ToastMessage {
    id: string;
    title: string;
    message: string;
    type: 'success' | 'info' | 'warning';
}

import { useToast } from './components/ToastContext';

function App() {
  const [city, setCity] = useState('');
  const { addToast } = useToast();

  const [listings, setListings] = useState<Listing[]>([]);
  
  const displayListings = React.useMemo(() => {
      const arr: Listing[] = [];
      listings.forEach(listing => {
          const mode = listing.rental_mode || 'entire_place';
          if (mode === 'entire_place' || mode === 'hybrid') {
              arr.push(listing);
          }
          if (mode === 'hybrid' || mode === 'private_rooms') {
              (listing.rooms || []).forEach(room => {
                  arr.push({
                      ...listing,
                      id: `${listing.id}_${room.id}`,
                      originalId: listing.id,
                      title: listing.title, // keep the property title
                      displayTitle: `${listing.title} - ${room.name}`,
                      price: room.price,
                      displayPrice: room.price,
                      imageUrl: (room.imageUrls && room.imageUrls.length > 0) ? room.imageUrls[0] : listing.imageUrl,
                      imageUrls: (room.imageUrls && room.imageUrls.length > 0) ? room.imageUrls : listing.imageUrls,
                      selectedConfigId: room.id,
                      amenities: room.amenities && room.amenities.length > 0 ? room.amenities : listing.amenities,
                      type: room.name, // Will display as "Master Bedroom" etc.
                  });
              });
          }
      });
      return arr;
  }, [listings]);

  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedExperience, setSelectedExperience] = useState<Experience | null>(null);
  const [hoveredListingId, setHoveredListingId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('SEARCH');
  const [hostDashboardRefresh, setHostDashboardRefresh] = useState(0);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [editingExperience, setEditingExperience] = useState<Experience | null>(null);
  const [appMode, setAppMode] = useState<'travel' | 'host'>('travel');
  const [hostView, setHostView] = useState<'today' | 'calendar' | 'listings' | 'messages' | 'analytics'>('today');
  
  // Auth state
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Animation & Data States
  const [flyAnimation, setFlyAnimation] = useState<FlyAnimationState | null>(null);
  const [highlightReserves, setHighlightReserves] = useState(false);
  const [highlightWishlist, setHighlightWishlist] = useState(false);
  
  const [lastBooking, setLastBooking] = useState<BookingData | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [favorites, setFavorites] = useState<Listing[]>([]);
  const [favoriteExperiences, setFavoriteExperiences] = useState<Experience[]>([]);

  // Preloaded Experiences State
  const [globalExperiences, setGlobalExperiences] = useState<Experience[]>([]);
  const [globalExperiencesSettings, setGlobalExperiencesSettings] = useState<any>({
      hero_title: 'Unforgettable Experiences',
      hero_subtitle: 'Discover exclusive weekend getaways, cultural tours, and extreme adventures curated by local experts.',
      badge_text: 'Curated Collections',
      hero_image_urls: ['https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&q=80&w=2400']
  });
  const [loadingExperiences, setLoadingExperiences] = useState(true);

  const fetchGlobalExperiences = React.useCallback(async () => {
      try {
        const [expRes, settingsRes] = await Promise.all([
          fetch(`/api/experiences?_t=${Date.now()}`),
          fetch(`/api/settings/experiences_page?_t=${Date.now()}`)
        ]);
        
        if (settingsRes.ok) {
            const data = await settingsRes.json();
            if (data && data.hero_title) {
                setGlobalExperiencesSettings(data);
                if (data.hero_image_urls) {
                    data.hero_image_urls.forEach((url: string) => {
                        const img = new Image();
                        img.src = url;
                    });
                }
            }
        }

        if (expRes.ok) {
          const data = await expRes.json();
          if (data && data.length > 0) {
            setGlobalExperiences(data);
            data.forEach((exp: Experience) => {
                if (exp.image_urls?.[0]) {
                    const img = new Image();
                    img.src = exp.image_urls[0];
                }
            });
          }
        }
      } catch (error) {
        console.error("Failed to load experiences globally", error);
      } finally {
        setLoadingExperiences(false);
      }
  }, []);

  useEffect(() => {
      fetchGlobalExperiences();
  }, [fetchGlobalExperiences]);

  const [filters, setFilters] = useState<any>({});
  
  const { setBadge, clearBadge } = useAppBadge();
  const { requestPermission, showNotification } = useNativeNotification();
  const prevUnreadCount = useRef(0);
  const isOnline = useNetworkState();

  // Ask for notification permission on load
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    handleSearch(city, filters);
  }, [filters]);

  useEffect(() => {
    if (user) {
        const token = localStorage.getItem('token');
        fetchWithCache('/api/wishlists', `wishlists_${user.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(data => {
            if (Array.isArray(data)) setFavorites(data);
        })
        .catch(console.error);

        fetchWithCache('/api/experience-wishlists', `experience_wishlists_${user.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(data => {
            if (Array.isArray(data)) setFavoriteExperiences(data);
        })
        .catch(console.error);

        fetchWithCache(`/api/user/bookings?userId=${user.id}`, `bookings_${user.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(data => {
            if (Array.isArray(data)) {
                setReservations(data);
            }
        })
        .catch(console.error);

        // Fetch initial unread count
        const fetchInitialCounts = () => {
             const roleQuery = appMode === 'host' ? '?role=host' : '?role=guest';
             fetch('/api/threads' + roleQuery, {
                headers: { 'Authorization': `Bearer ${token}` }
             })
             .then(r => r.json())
             .then(data => {
                 if (Array.isArray(data)) {
                     let totalUnread = 0;
                     data.forEach((th: any) => {
                         const isGuest = user.id === th.guest_id;
                         totalUnread += isGuest ? th.unread_count_guest : th.unread_count_host;
                     });

                     if (totalUnread > 0) {
                         setBadge(totalUnread);
                     } else {
                         clearBadge();
                     }
                     prevUnreadCount.current = totalUnread;
                 }
             })
             .catch(console.error);
        };
        fetchInitialCounts();

        if (!socket) {
          socket = io({
            reconnectionDelayMax: 10000,
          });
        }
        
        socket.emit('join_user', user.id);
        if (user.role === 'admin') {
           socket.emit('join_admin');
        }
        
        const handleNotification = (notif: any) => {
          if (notif.type === 'new_message') {
             const newCount = prevUnreadCount.current + 1;
             prevUnreadCount.current = newCount;
             setBadge(newCount);
             uiAudio.playSuccess();
             addToast('New message', notif.message.content, 'info');
             showNotification('New message received', {
               body: notif.message.content,
               tag: 'new-message',
             });
          } else if (notif.type === 'booking_update' || notif.type === 'new_booking') {
             uiAudio.playSuccess();
             const title = notif.type === 'new_booking' ? 'New Booking Request' : 'Booking Updated';
             addToast(title, notif.message, 'success');
             showNotification(title, {
                 body: notif.message,
                 tag: 'booking-update',
             });
             
             if (notif.booking) {
                 fetch(`/api/user/bookings?userId=${user.id}`, {
                     headers: { 'Authorization': `Bearer ${token}` }
                 })
                 .then(res => res.json())
                 .then(data => {
                     if (Array.isArray(data)) {
                         setReservations(data);
                         localStorage.setItem('cached_reservations', JSON.stringify(data));
                     }
                 })
                 .catch(console.error);
             }
          }
        };

        socket.on('notification', handleNotification);

        return () => {
           socket.off('notification', handleNotification);
        };

    } else {
        setFavorites([]);
        setReservations([]);
        clearBadge();
    }
  }, [user, appMode, setBadge, clearBadge, showNotification]);

  // Global db_changed listener
  useEffect(() => {
     if (!socket) return;
     const handleDbChange = (data: { type: string }) => {
         if (data.type === 'listing') {
             handleSearch(city, filters);
         } else if (data.type === 'wishlist' && user) {
             const token = localStorage.getItem('token');
             fetch('/api/wishlists', { headers: { 'Authorization': `Bearer ${token}` }})
             .then(res => res.json())
             .then(list => setFavorites(Array.isArray(list) ? list : []))
             .catch(console.error);
         }
     };
     socket.on('db_changed', handleDbChange);
     return () => { socket.off('db_changed', handleDbChange); };
  }, [city, filters, user]);

  const handleSearch = React.useCallback(async (searchCity: string, activeFilters: any = filters, customBounds?: any) => {
    setLoading(true);
    setCity(searchCity);
    setCurrentView('SEARCH');
    setSelectedListing(null);
    try {
        let url = `/api/listings?city=${encodeURIComponent(searchCity)}&_t=${Date.now()}`;
        if (activeFilters.minPrice) url += `&minPrice=${activeFilters.minPrice}`;
        if (activeFilters.maxPrice) url += `&maxPrice=${activeFilters.maxPrice}`;
        if (activeFilters.type) url += `&type=${encodeURIComponent(activeFilters.type)}`;
        if (activeFilters.amenities?.length) url += `&amenities=${encodeURIComponent(activeFilters.amenities.join(','))}`;
        if (activeFilters.bedrooms) url += `&bedrooms=${activeFilters.bedrooms}`;
        if (activeFilters.beds) url += `&beds=${activeFilters.beds}`;
        if (activeFilters.bathrooms) url += `&bathrooms=${activeFilters.bathrooms}`;
        if (activeFilters.maxGuests) url += `&maxGuests=${activeFilters.maxGuests}`;
        if (activeFilters.sort) url += `&sort=${activeFilters.sort}`;
        
        if (customBounds) {
            url += `&minLat=${customBounds.minLat}&maxLat=${customBounds.maxLat}&minLng=${customBounds.minLng}&maxLng=${customBounds.maxLng}`;
        }

        const apiListings: Listing[] = await fetchWithCache(url, `listings_${url}`) || [];

        setListings(apiListings);
        fetchGlobalExperiences();
    } catch (e) {
        console.error("Failed to load listings", e);
    } finally {
        setLoading(false);
    }
  }, [filters]);

  const isFavorite = React.useCallback((id: string | number) => {
      const targetId = String(id);
      return favorites.some(fav => String(fav.id) === targetId);
  }, [favorites]);

  const isFavoriteExperience = React.useCallback((id: string | number) => {
      const targetId = String(id);
      return favoriteExperiences.some(fav => String(fav.id) === targetId);
  }, [favoriteExperiences]);

  const toggleFavorite = React.useCallback(async (listing: Listing) => {
      if (!user) {
          setShowAuthModal(true);
          return;
      }

      const targetId = String(listing.id);
      const isFav = isFavorite(targetId);
      const token = localStorage.getItem('token');
      
      const parentListingId = listing.originalId || listing.id;
      const roomId = listing.selectedConfigId || (listing.originalId ? listing.id : undefined);
      
      try {
          if (isFav) {
              setFavorites(prev => prev.filter(l => String(l.id) !== targetId));
              let deleteUrl = `/api/wishlists/${parentListingId}`;
              if (listing.selectedConfigId) deleteUrl += `?roomId=${listing.selectedConfigId}`;
              await queueMutation(deleteUrl, 'DELETE', undefined, { 'Authorization': `Bearer ${token}` });
          } else {
              setFlyAnimation({ listing, target: 'WISHLIST' });
              setFavorites(prev => {
                  if (prev.some(l => String(l.id) === targetId)) return prev;
                  return [...prev, listing];
              });
              await queueMutation(`/api/wishlists`, 'POST', { listingId: parentListingId, roomId: listing.selectedConfigId }, { 'Authorization': `Bearer ${token}` });
          }
      } catch (e) {
          console.error("Failed to toggle wishlist", e);
      }
  }, [user, isFavorite]);

  const toggleFavoriteExperience = React.useCallback(async (experience: Experience) => {
      if (!user) {
          setShowAuthModal(true);
          return;
      }

      const targetId = String(experience.id);
      const isFav = isFavoriteExperience(targetId);
      const token = localStorage.getItem('token');
      
      try {
          if (isFav) {
              setFavoriteExperiences(prev => prev.filter(e => String(e.id) !== targetId));
              await queueMutation(`/api/experience-wishlists/${targetId}`, 'DELETE', undefined, { 'Authorization': `Bearer ${token}` });
          } else {
              // Option to add fly animation for experiences if desired
              setFavoriteExperiences(prev => {
                  if (prev.some(e => String(e.id) === targetId)) return prev;
                  return [...prev, experience];
              });
              await queueMutation(`/api/experience-wishlists`, 'POST', { experienceId: targetId }, { 'Authorization': `Bearer ${token}` });
          }
      } catch (e) {
          console.error("Failed to toggle experience wishlist", e);
      }
  }, [user, isFavoriteExperience]);

  const handleCancelBooking = React.useCallback(async (id: string) => {
      if (!user) return;
      if (!confirm('Are you sure you want to cancel this booking?')) return;
      try {
          // Optimistically update
          setReservations(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' } : r));
          
          await queueMutation(`/api/user/bookings/${id}/cancel`, 'PUT', { userId: user.id });
      } catch (e) {
          console.error(e);
      }
  }, [user]);

  const handleListingClick = React.useCallback((listing: Listing) => {
    const sourceListing = listing.originalId ? listings.find(l => l.id === listing.originalId) || listing : listing;

    const detailedListing: Listing = {
        ...sourceListing,
        selectedConfigId: listing.selectedConfigId,
        description: sourceListing.description || `Welcome to this stunning ${sourceListing.type.toLowerCase()} in the heart of ${city}. This property offers a perfect blend of modern comfort and classic charm. High ceilings, large windows, and a spacious layout make this the ideal home for professionals or students.`,
        size: sourceListing.size || Math.floor(Math.random() * 80) + 40,
        floor: Math.floor(Math.random() * 5) + 1,
        maxGuests: Math.floor(Math.random() * 3) + 1,
        address: `${sourceListing.title}, ${city}`,
        rooms: sourceListing.rooms || [
            { id: 'r1', name: 'Master Bedroom', price: Math.floor(sourceListing.price * 0.6), sqft: 20, isAvailable: true, features: ['King Bed', 'En-suite', 'Balcony'] },
            { id: 'r2', name: 'Standard Room', price: Math.floor(sourceListing.price * 0.4), sqft: 14, isAvailable: false, features: ['Double Bed', 'Desk'] }
        ],
        nearby: sourceListing.nearby || [
            { name: 'Central Station', type: 'TRANSPORT', distance: '5 min walk', minutes: 5 },
            { name: 'Organic Market', type: 'GROCERY', distance: '2 min walk', minutes: 2 },
            { name: 'City Park', type: 'PARK', distance: '10 min walk', minutes: 10 },
            { name: 'Coffee Lab', type: 'CAFE', distance: '1 min walk', minutes: 1 },
            { name: 'FitFirst Gym', type: 'GYM', distance: '3 min walk', minutes: 3 },
        ]
    };
    setSelectedListing(detailedListing);
    setCurrentView('DETAILS');
    window.scrollTo(0, 0);
  }, [city, listings]);

  const handleBooking = React.useCallback(async (data: BookingData) => {
      if (!selectedListing) return;
      
      try {
        const payload = {
            listingId: selectedListing.originalId || selectedListing.id,
            roomId: selectedListing.selectedConfigId || (selectedListing.originalId ? selectedListing.id : undefined),
            moveInDate: data.moveInDate,
            configuration: data.configuration,
            name: data.name,
            phone: data.phone,
            totalRent: data.totalRent,
            userId: user?.id,
            offlineId: crypto.randomUUID?.() || Math.random().toString(),
        };
        
        // Optimistically update
        const newReservation: Reservation = {
            id: payload.offlineId,
            listing: selectedListing,
            bookingDate: new Date().toISOString(),
            ...data
        };
        setReservations(prev => [...prev, newReservation]);
        setLastBooking(data);
        setCurrentView('BOOKING');
        window.scrollTo(0, 0);

        const success = await queueMutation('/api/bookings', 'POST', payload);
        if (!success && !navigator.onLine) {
            addToast('Offline mode', 'Booking queued and will be synced when you are back online.', 'info');
        }
      } catch (err) {
        console.error('Failed to save booking to db', err);
        alert("Failed to confirm booking. Please check your connection.");
      }
  }, [selectedListing, user]);

  const handleAnimationComplete = React.useCallback(() => {
      const target = flyAnimation?.target;
      setFlyAnimation(null);
      
      if (target === 'RESERVES') {
          setHighlightReserves(true);
          setTimeout(() => setHighlightReserves(false), 2000);
      } else if (target === 'WISHLIST') {
          setHighlightWishlist(true);
          setTimeout(() => setHighlightWishlist(false), 2000);
      }
  }, [flyAnimation]);

  // Handle browser history and back button via URL Hash & Path
  useEffect(() => {
    const handlePopState = async () => {
      const path = window.location.pathname;
      const hash = window.location.hash.replace('#', '').toUpperCase();
      const validViews = ['SEARCH', 'DETAILS', 'EXPERIENCE_DETAILS', 'BOOKING', 'WISHLIST', 'RESERVATIONS', 'MESSAGES', 'HOSTING', 'HOST_DASHBOARD', 'ADMIN'];
      
      if (path.startsWith('/listing/')) {
        const id = path.split('/')[2];
        if (!selectedListing || selectedListing.id !== id) {
          try {
             setLoading(true);
             const res = await fetch(`/api/listings`);
             if (res.ok) {
                const allListings = await res.json();
                const found = allListings.find((l: any) => String(l.id) === String(id));
                if (found) {
                   setSelectedListing(found);
                   setCurrentView('DETAILS');
                } else {
                   setCurrentView('SEARCH');
                }
             }
          } catch(e) { console.error(e); setCurrentView('SEARCH'); }
          setLoading(false);
        } else {
          setCurrentView('DETAILS');
        }
      } else if (path.startsWith('/experience/')) {
        const id = path.split('/')[2];
        if (!selectedExperience || selectedExperience.id !== Number(id)) {
          try {
             setLoading(true);
             const res = await fetch(`/api/experiences`);
             if (res.ok) {
                const allExps = await res.json();
                const found = allExps.find((e: any) => String(e.id) === String(id));
                if (found) {
                   setSelectedExperience(found);
                   setCurrentView('EXPERIENCE_DETAILS');
                } else {
                   setCurrentView('SEARCH');
                }
             }
          } catch(e) { console.error(e); setCurrentView('SEARCH'); }
          setLoading(false);
        } else {
          setCurrentView('EXPERIENCE_DETAILS');
        }
      } else {
        if (!hash) {
          setCurrentView('SEARCH');
        } else if (validViews.includes(hash)) {
          if ((hash === 'DETAILS' || hash === 'BOOKING') && !selectedListing) {
              setCurrentView('SEARCH');
              window.history.replaceState(null, '', '/');
          } else if (hash === 'EXPERIENCE_DETAILS' && !selectedExperience) {
              setCurrentView('SEARCH');
              window.history.replaceState(null, '', '/');
          } else {
              setCurrentView(hash as ViewState);
          }
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Catch initial load
    handlePopState();
    
    return () => window.removeEventListener('popstate', handlePopState);
  }, []); // Run only on mount and unmount

  // Sync state to URL
  useEffect(() => {
    let newPath = window.location.pathname;
    let targetHash = '';
    
    if (currentView === 'DETAILS' && selectedListing) {
      newPath = `/listing/${selectedListing.id}`;
    } else if (currentView === 'EXPERIENCE_DETAILS' && selectedExperience) {
      newPath = `/experience/${selectedExperience.id}`;
    } else {
      newPath = '/';
      targetHash = currentView === 'SEARCH' ? '' : `#${currentView.toLowerCase()}`;
    }

    const currentUrl = window.location.pathname + window.location.hash;
    const targetUrl = newPath + targetHash;

    if (currentUrl !== targetUrl) {
      if (currentUrl === '/' && targetUrl === '') return;
      window.history.pushState(null, '', targetUrl || '/');
    }
  }, [currentView, selectedListing, selectedExperience]);

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    in: { opacity: 1, y: 0 },
    out: { opacity: 0, y: -20 }
  };

  const pageTransition = {
    type: "tween",
    ease: "easeInOut",
    duration: 0.3
  };

  const renderView = () => {
    if (currentView === 'ADMIN') {
        return (
            <motion.div key="admin" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                <AdminDashboard 
                  onBack={() => {
                      window.location.hash = '';
                      setCurrentView('SEARCH');
                  }} 
                />
            </motion.div>
        );
    }

    if (appMode === 'host') {
        return (
          <div className="min-h-screen bg-white font-sans text-gray-900 selection:bg-[#0284C7]/20 selection:text-[#0284C7]">
            <div style={{ display: (currentView === 'HOST_DASHBOARD' || currentView === 'SEARCH') ? 'block' : 'none' }}>
              <motion.div key="host-dashboard" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                <Header 
                  onSearch={handleSearch} 
                  currentCity={city} 
                  onWishlistClick={() => setCurrentView('WISHLIST')}
                  onReservesClick={() => setCurrentView('RESERVATIONS')}
                  onHostClick={() => {}}
                  onLoginClick={() => setShowAuthModal(true)}
                  highlightReserves={highlightReserves}
                  highlightWishlist={highlightWishlist}
                  reservesCount={reservations.length}
                  wishlistCount={favorites.length}
                  appMode="host"
                  onModeSwitch={setAppMode}
                  hostView={hostView}
                  onHostViewChange={setHostView}
                  isOnline={isOnline}
                />
                <HostDashboard 
                  view={hostView} 
                  user={user} 
                  refreshTrigger={hostDashboardRefresh}
                  onNavigateToHostForm={() => {
                    setEditingListing(null);
                    setCurrentView('HOSTING');
                  }} 
                  onEditListing={(listing) => {
                    setEditingListing(listing);
                    setCurrentView('HOSTING');
                  }}
                  onNavigateToExperienceForm={() => {
                    setEditingExperience(null);
                    setCurrentView('HOSTING_EXPERIENCE');
                  }}
                  onEditExperience={(exp) => {
                    setEditingExperience(exp);
                    setCurrentView('HOSTING_EXPERIENCE');
                  }}
                />
              </motion.div>
            </div>
            
            {currentView === 'HOSTING' && (
               <motion.div key="hosting" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                <HostForm 
                  existingListing={editingListing}
                  onBack={() => {
                    setEditingListing(null);
                    setCurrentView('HOST_DASHBOARD');
                  }}
                  onSuccess={() => {
                      handleSearch(city);
                      setHostDashboardRefresh(prev => prev + 1);
                      setCurrentView('HOST_DASHBOARD');
                  }} 
                />
               </motion.div>
            )}

            {currentView === 'HOSTING_EXPERIENCE' && (
               <motion.div key="hosting-experience" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                <HostExperienceForm 
                  existingExperience={editingExperience || undefined}
                  onBack={() => {
                    setEditingExperience(null);
                    setCurrentView('HOST_DASHBOARD');
                  }}
                  onSuccess={() => {
                      handleSearch(city);
                      setHostDashboardRefresh(prev => prev + 1);
                      setCurrentView('HOST_DASHBOARD');
                  }} 
                />
               </motion.div>
            )}
            
            {showAuthModal && (
              <AuthModal onClose={() => setShowAuthModal(false)} />
            )}
          </div>
        );
    }

    if (currentView === 'MESSAGES') {
      return (
        <motion.div key="messages" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="min-h-screen bg-white">
          <Header 
              onSearch={handleSearch} 
              currentCity={city} 
              onWishlistClick={() => setCurrentView('WISHLIST')}
              onReservesClick={() => setCurrentView('RESERVATIONS')}
              onHostClick={() => {
                  if (user) {
                      setAppMode('host');
                  } else {
                      setShowAuthModal(true);
                  }
              }}
              onLoginClick={() => setShowAuthModal(true)}
              reservesCount={reservations.length}
              wishlistCount={favorites.length}
              onInboxClick={() => setCurrentView('MESSAGES')}
              isOnline={isOnline}
          />
          <InboxPage onBack={() => setCurrentView('SEARCH')} role="guest" />
        </motion.div>
      );
    }

    if (currentView === 'DETAILS' && selectedListing) {
        return (
           <motion.div key="details" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
           {flyAnimation && (
              <FlyToAnimation listing={flyAnimation.listing} target={flyAnimation.target} onComplete={handleAnimationComplete} />
           )}
           <ListingDetails 
              listing={selectedListing} 
              onBack={() => setCurrentView('SEARCH')}
              similarListings={listings.filter(l => l.id !== selectedListing.id)}
              onListingClick={handleListingClick}
              isFavorite={isFavorite(selectedListing.id)}
              onToggleFavorite={toggleFavorite}
              onBook={handleBooking}
              onRequestAuth={() => setShowAuthModal(true)}
              onContactHost={async () => {
                  if (!user) {
                      setShowAuthModal(true);
                      return;
                  }
                  try {
                      const res = await fetch('/api/threads', {
                          method: 'POST',
                          headers: { 
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${localStorage.getItem('token')}` 
                          },
                          body: JSON.stringify({ listingId: selectedListing.originalId || selectedListing.id, hostId: selectedListing.user_id })
                      });
                      if (!res.ok) {
                          const errData = await res.json().catch(() => ({}));
                          console.error('Failed to create thread:', errData);
                          alert('Could not start conversation. Listing might be unavailable.');
                          return;
                      }
                      setCurrentView('MESSAGES');
                  } catch (err) {
                      console.error(err);
                  }
              }}
           />
           {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
           </motion.div>
        );
    }

    if (currentView === 'EXPERIENCES') {
        return (
            <motion.div key="experiences" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="min-h-screen bg-white">
                <Header 
                    onSearch={handleSearch} 
                    currentCity={city} 
                    onWishlistClick={() => setCurrentView('WISHLIST')}
                    onReservesClick={() => setCurrentView('RESERVATIONS')}
                    onHostClick={() => {
                        if (user) {
                            setAppMode('host');
                        } else {
                            setShowAuthModal(true);
                        }
                    }}
                    onLoginClick={() => setShowAuthModal(true)}
                    highlightReserves={highlightReserves}
                    highlightWishlist={highlightWishlist}
                    reservesCount={reservations.length}
                    wishlistCount={favorites.length}
                    appMode={appMode}
                    onModeSwitch={setAppMode}
                    hostView={hostView}
                    onHostViewChange={setHostView}
                    isOnline={isOnline}
                    activeTab="experiences"
                    onExperiencesClick={() => setCurrentView('EXPERIENCES')}
                    onStaysClick={() => setCurrentView('SEARCH')}
                />
                <ExperiencesPage 
                    experiences={globalExperiences}
                    settings={globalExperiencesSettings}
                    loading={loadingExperiences}
                    onExperienceClick={(exp) => {
                        setSelectedExperience(exp);
                        setCurrentView('EXPERIENCE_DETAILS');
                        window.scrollTo(0, 0);
                    }}
                    isFavoriteExperience={isFavoriteExperience}
                    onToggleFavoriteExperience={toggleFavoriteExperience}
                />
                {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
            </motion.div>
        );
    }

    if (currentView === 'EXPERIENCE_DETAILS' && selectedExperience) {
        return (
            <motion.div key="experience-details" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
                <ExperienceDetails 
                    experience={selectedExperience}
                    onBack={() => setCurrentView('EXPERIENCES')}
                    onRequestAuth={() => setShowAuthModal(true)}
                    onSelectExperience={(exp) => {
                        setSelectedExperience(exp);
                        window.scrollTo(0, 0);
                    }}
                    isFavorite={isFavoriteExperience(selectedExperience.id)}
                    onToggleFavorite={() => toggleFavoriteExperience(selectedExperience)}
                    onMessageHost={async () => {
                        if (!user) {
                            setShowAuthModal(true);
                            return;
                        }
                        try {
                            const res = await fetch('/api/threads', {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${localStorage.getItem('token')}` 
                                },
                                body: JSON.stringify({ experienceId: selectedExperience.id })
                            });
                            if (!res.ok) {
                                throw new Error('Failed to create thread');
                            }
                            setCurrentView('MESSAGES');
                        } catch (e) {
                            console.error(e);
                        }
                    }}
                    onEdit={() => {
                        setEditingExperience(selectedExperience);
                        setCurrentView('HOSTING_EXPERIENCE');
                    }}
                    onDelete={async () => {
                        if (window.confirm("Are you sure you want to delete this experience?")) {
                            try {
                                const res = await fetch(`/api/experiences/${selectedExperience.id}`, {
                                    method: 'DELETE',
                                    headers: {
                                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                                    }
                                });
                                if (res.ok) {
                                    handleSearch(city); // Refresh experiences
                                    setCurrentView('HOST_DASHBOARD');
                                }
                            } catch (e) {
                                console.error(e);
                            }
                        }
                    }}
                />
                {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
            </motion.div>
        );
    }

    if (currentView === 'WISHLIST') {
        return (
            <motion.div key="wishlist" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <WishlistPage 
              favorites={favorites}
              favoriteExperiences={favoriteExperiences}
              onBack={() => setCurrentView('SEARCH')}
              onListingClick={handleListingClick}
              onToggleFavorite={toggleFavorite}
              onExperienceClick={(exp) => {
                  setSelectedExperience(exp);
                  setCurrentView('EXPERIENCE_DETAILS');
                  window.scrollTo(0, 0);
              }}
              onToggleExperienceFavorite={toggleFavoriteExperience}
            />
            </motion.div>
        );
    }

    if (currentView === 'RESERVATIONS') {
        return (
            <motion.div key="reservations" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <ReservationsPage 
              reservations={reservations}
              isOnline={isOnline}
              onBack={() => setCurrentView('SEARCH')}
              onListingClick={handleListingClick}
              onCancelBooking={handleCancelBooking}
              onContactHost={async (listing) => {
                  if (!user) {
                      setShowAuthModal(true);
                      return;
                  }
                  try {
                      const res = await fetch('/api/threads', {
                          method: 'POST',
                          headers: { 
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${localStorage.getItem('token')}` 
                          },
                          body: JSON.stringify({ listingId: listing.originalId || listing.id, hostId: listing.user_id })
                      });
                      if (!res.ok) {
                          const errData = await res.json().catch(() => ({}));
                          console.error('Failed to create thread:', errData);
                          alert('Could not start conversation. Property might be unavailable.');
                          return;
                      }
                      setCurrentView('MESSAGES');
                  } catch (err) {
                      console.error(err);
                  }
              }}
            />
            </motion.div>
        );
    }

    if (currentView === 'BOOKING' && selectedListing && lastBooking) {
        return (
            <motion.div key="booking" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <BookingPage 
              listing={selectedListing}
              bookingDetails={lastBooking}
              onBackToHome={() => {
                  setCurrentView('SEARCH');
                  // Trigger fly-to-cart animation for the reservation
                  setFlyAnimation({ listing: selectedListing, target: 'RESERVES' });
              }}
            />
            </motion.div>
        );
    }

    return (
      <motion.div key="search" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="min-h-screen bg-white font-sans text-gray-900 selection:bg-[#0284C7]/20 selection:text-[#0284C7]">
        <SEO title={`Stays in ${city} | Encho Space`} description={`Find the perfect place to stay in ${city}.`} />
        {/* Global Fly Animation Overlay */}
        {flyAnimation && (
          <FlyToAnimation 
              listing={flyAnimation.listing} 
              target={flyAnimation.target}
              onComplete={handleAnimationComplete} 
          />
        )}

        <Header 
          onSearch={handleSearch} 
          currentCity={city} 
          onWishlistClick={() => setCurrentView('WISHLIST')}
          onReservesClick={() => setCurrentView('RESERVATIONS')}
          onHostClick={() => {
              if (user) {
                  setAppMode('host');
              } else {
                  setShowAuthModal(true);
              }
          }}
          onLoginClick={() => setShowAuthModal(true)}
          highlightReserves={highlightReserves}
          highlightWishlist={highlightWishlist}
          reservesCount={reservations.length}
          wishlistCount={favorites.length}
          appMode={appMode}
          onModeSwitch={setAppMode}
          hostView={hostView}
          onHostViewChange={setHostView}
          isOnline={isOnline}
          activeTab={currentView === 'EXPERIENCES' || currentView === 'EXPERIENCE_DETAILS' ? 'experiences' : 'stays'}
          onExperiencesClick={() => setCurrentView('EXPERIENCES')}
          onStaysClick={() => setCurrentView('SEARCH')}
        />
        <FilterBar currentFilters={filters} onFilterChange={setFilters} />
        
        {!isOnline && (
           <div className="bg-red-500 text-white text-sm py-2 px-4 text-center font-medium sticky top-[138px] z-40">
             You are currently offline. Some features may be unavailable.
           </div>
        )}

        <main className="max-w-[1920px] mx-auto pt-6 px-4 md:px-6 relative">
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] xl:hidden">
              <button 
                  onClick={() => setShowMap(!showMap)}
                  className="bg-[#111111] hover:bg-black text-white px-6 py-3.5 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.25)] flex items-center gap-2.5 font-bold tracking-wide transition-all duration-300 hover:scale-105 active:scale-95 border border-white/20"
              >
                  {showMap ? (
                      <><span>Show list</span><ListIcon className="w-4 h-4" /></>
                  ) : (
                      <><span>Map</span><MapIcon className="w-4 h-4" /></>
                  )}
              </button>
          </div>

          <div className="flex gap-8 items-start pb-24 xl:pb-20">
            <div className={`flex-1 min-w-0 transition-opacity duration-300 ${showMap ? 'hidden opacity-0 xl:block xl:opacity-100' : 'block opacity-100'}`}>
               {!loading && (
                   <div className="mb-6 flex items-baseline gap-2">
                      <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">Places to stay in {city}</h1>
                      <span className="text-gray-500 font-medium text-sm border-l border-gray-300 pl-3 ml-1">{displayListings.length}+ stays</span>
                   </div>
               )}

              {loading ? (
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-x-6 gap-y-10">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                          <ListingCardSkeleton key={n} />
                      ))}
                   </div>
              ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-x-6 gap-y-10">
                  {displayListings.map((listing, index) => (
                      <ListingCard 
                          key={listing.id} 
                          listing={listing} 
                          priority={index < 6}
                          onHover={setHoveredListingId}
                          onClick={handleListingClick}
                          isFavorite={isFavorite(listing.id)}
                          onToggleFavorite={() => toggleFavorite(listing)}
                      />
                  ))}
                  </div>
              )}
              
               {!loading && (
                  <div className="mt-12 flex flex-col items-center gap-4">
                      <h3 className="text-lg font-bold text-gray-900">Continue exploring {city}</h3>
                      <button className="px-8 py-3.5 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all active:scale-95 shadow-lg">Show more</button>
                  </div>
              )}
            </div>

            <div className={`xl:block xl:sticky xl:top-[160px] xl:w-[45%] xl:h-[calc(100vh-180px)] xl:rounded-2xl xl:overflow-hidden xl:z-0 xl:shadow-2xl ${showMap ? 'fixed inset-0 top-[130px] z-30 block w-full h-[calc(100vh-130px)] bg-gray-50' : 'hidden'}`}>
               <MapSidebar listings={listings} highlightedId={hoveredListingId ? hoveredListingId.split('_')[0] : null} onBoundsChanged={(bounds) => handleSearch(city, filters, bounds)} className="w-full h-full" />
            </div>
          </div>
        </main>

        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </motion.div>
    );
  };

  return (
    <>
      <SEO />
      <AnimatePresence mode="wait">
        <Suspense fallback={
           <motion.div key="suspense-fallback" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
             {currentView === 'DETAILS' ? (
                <ListingDetailsSkeleton />
             ) : (
                <div className="min-h-screen bg-white flex items-center justify-center">
                   <div className="flex flex-col items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#0284C7] animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-3 h-3 rounded-full bg-[#0284C7] animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-3 h-3 rounded-full bg-[#0284C7] animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                   </div>
                </div>
             )}
           </motion.div>
        }>
          {renderView()}
        </Suspense>
      </AnimatePresence>
    </>
  );
}

export default App;
