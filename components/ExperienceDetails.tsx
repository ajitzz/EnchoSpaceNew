import React, { useState, useEffect } from 'react';
import { SEO } from './SEO';
import { motion, AnimatePresence } from 'framer-motion';
import { Experience } from '../types';
import { OptimizedImage } from './OptimizedImage';
import { Settings, Trash2, MapPin, Calendar, Clock, Info, Sparkles, Star, ArrowRight, ChevronLeft, Heart, Check, Crown, ChevronRight, CheckCircle2, XCircle, Map, Users, Activity, Languages, ShieldCheck, Navigation, Play, Volume2, VolumeX, Plus, Upload, Video, Eye, Compass, Send, Camera, X, Briefcase, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from './AuthContext';
import { CheckoutModal } from './CheckoutModal';
import { useToast } from './ToastContext';
import { getRatingWord, formatRating } from '../lib/ratingUtils';

interface ExperienceDetailsProps {
  experience: Experience;
  onBack: () => void;
  onRequestAuth: () => void;
  onSelectExperience?: (exp: Experience) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onMessageHost?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const PACKAGE_DESTINATIONS = [
  {
    id: 1,
    title: "Chembra Peak",
    location: "WAYANAD",
    image: "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&q=80&w=800",
    description: "Trek to the heart-shaped lake at the top.",
    video: "https://assets.mixkit.co/videos/preview/mixkit-hiking-path-on-a-sunny-day-34327-large.mp4",
    gallery: [
      "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1582510003544-4d00b7f7415e?auto=format&fit=crop&q=80&w=800",
    ],
    details: "A challenging but rewarding trek through dense forests and tea plantations leading to a natural heart-shaped lake, offering panoramic views of the Western Ghats."
  },
  {
    id: 2,
    title: "Edakkal Caves",
    location: "WAYANAD",
    image: "https://images.unsplash.com/photo-1596423735880-5c6020ce84b4?auto=format&fit=crop&q=80&w=800",
    description: "Explore ancient petroglyphs in natural caves.",
    video: "https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4",
    gallery: [
      "https://images.unsplash.com/photo-1596423735880-5c6020ce84b4?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1621886861502-39c0f9923edc?auto=format&fit=crop&q=80&w=800"
    ],
    details: "Step back into the Neolithic age at Edakkal Caves. These aren't just caves, but a cleft between massive rocks featuring intricate ancient carvings."
  },
  {
    id: 3,
    title: "Banasura Sagar Dam",
    location: "WAYANAD",
    image: "https://images.unsplash.com/photo-1577717903315-1691ae25ab3f?auto=format&fit=crop&q=80&w=800",
    description: "The largest earth dam in India with boating.",
    video: "https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-a-beautiful-lake-in-the-mountains-32734-large.mp4",
    gallery: [
      "https://images.unsplash.com/photo-1577717903315-1691ae25ab3f?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1605332675685-78e24458f3fb?auto=format&fit=crop&q=80&w=800"
    ],
    details: "Nestled at the foot of Banasura hills, this dam offers spectacular views. Enjoy speed boating or simply walk around the massive earth structure surrounded by nature."
  }
];

const INCLUDED_STAY = {
    title: "Vythiri Village Resort",
    location: "Wayanad, Kerala",
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800",
    amenities: ["Breakfast Included", "Pool Access", "Bonfire Setup", "Nature Walk", "Spa Services", "In-house Cafe"],
    description: "A 5-star luxury spa resort set amidst the lush green jungles of Wayanad. Your premium stay includes comfortable twin-sharing rooms and morning breakfast.",
    video: "https://assets.mixkit.co/videos/preview/mixkit-swimming-pool-in-a-luxury-hotel-at-sunset-10332-large.mp4",
    gallery: [
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1582719478250-c89408d8ce64?auto=format&fit=crop&q=80&w=800"
    ],
    long_description: "Wake up to the sounds of the jungle in this ultra-premium eco-resort. Complete with an infinity pool, suspended rope bridge, multi-cuisine dining, and guided nature walks within the property. We ensure a twin-sharing luxury room for all travelers to unwind after a long day of exploring."
};

const getSeedReviews = (experienceId: number) => {
  return [
    {
      id: -1,
      user_name: "Rahul Sharma",
      rating: 10,
      content: "Absolutely spectacular! The coordination was flawless from the pickup point in Bangalore to the resort stay. Vythiri Village Resort was incredibly luxury, the pool was pristine and the breakfast was delicious. The trek to Chembra Peak was the highlight of the trip - that heart-shaped lake is breathtaking. Worth every single rupee!",
      is_verified: true,
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: -2,
      user_name: "Priya Nair",
      rating: 10,
      content: "This was my first solo group trip and I felt completely safe and at home. The guides were professional, patient, and kept the group spirit lively with music and intro games in the traveler. Highly recommend for solo travelers or small groups wanting a hassle-free premium escape to Wayanad.",
      is_verified: true,
      created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: -3,
      user_name: "Vikram Malhotra",
      rating: 9.6,
      content: "Very well-managed itinerary. We covered the Banasura Sagar Dam, Edakkal Caves, and peak points without feeling rushed. The twin-sharing resort rooms were neat, comfortable, and had a lovely forest view. The bonfire evening was magical. Just note that lunches and dinners are self-paid, but our guide took us to some fantastic local Kerala spice joints.",
      is_verified: true,
      created_at: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];
};

const formatReviewDate = (dateStr: string) => {
  try {
    return format(new Date(dateStr), 'MMM d, yyyy');
  } catch (e) {
    return 'Recent';
  }
};

import { TravelerLobby } from './TravelerLobby';
import { VideoReelsModal } from './VideoReelsModal';

interface GeoPoint {
  day: number;
  name: string;
  lat: string;
  lng: string;
  elevation: string;
  landmark: string;
  distance: string;
}

const getGeoPointsForExperience = (exp: Experience): GeoPoint[] => {
  if (exp.itinerary && exp.itinerary.length > 0) {
      const hasRealData = exp.itinerary.some(day => day.lat || day.lng || day.elevation || day.landmark || day.distance);
      if (hasRealData) {
          return exp.itinerary.map((day, idx) => ({
              day: idx + 1,
              name: day.name || day.title || `Day ${idx + 1} Location`,
              lat: day.lat || 'N/A',
              lng: day.lng || 'N/A',
              elevation: day.elevation || 'N/A',
              landmark: day.landmark || 'N/A',
              distance: day.distance || 'N/A'
          }));
      }
  }

  const destLower = (exp.destination || "").toLowerCase();
  if (destLower.includes("alp") || destLower.includes("swiss")) {
    return [
      { day: 1, name: "Zurich Assembly", lat: "47.3769° N", lng: "8.5417° E", elevation: "408m", landmark: "Central Station Point", distance: "Starting Point" },
      { day: 2, name: "Interlaken Base Camp", lat: "46.6863° N", lng: "7.8632° E", elevation: "568m", landmark: "Lake Thun Shore", distance: "120 km travel" },
      { day: 3, name: "Jungfraujoch Summit", lat: "46.5475° N", lng: "7.9820° E", elevation: "3,454m", landmark: "Top of Europe Observatory", distance: "18 km trek" }
    ];
  } else if (destLower.includes("maldiv")) {
    return [
      { day: 1, name: "Male Airport Arrival", lat: "4.1755° N", lng: "73.5093° E", elevation: "1m", landmark: "Velana Transit", distance: "Starting Point" },
      { day: 2, name: "Sunset Sandbank Picnic", lat: "3.4842° N", lng: "72.9348° E", elevation: "2m", landmark: "Coral Reef Island", distance: "45 min speedboat" },
      { day: 3, name: "Water Villa Lagoon", lat: "3.4721° N", lng: "72.8239° E", elevation: "1m", landmark: "Infinity Blue Lagoon", distance: "12 km boat" }
    ];
  } else if (destLower.includes("rom") || destLower.includes("ital")) {
    return [
      { day: 1, name: "Rome Central Station", lat: "41.9028° N", lng: "12.4964° E", elevation: "52m", landmark: "Piazza dei Cinquecento", distance: "Starting Point" },
      { day: 2, name: "Colosseum & Forum Walk", lat: "41.8902° N", lng: "12.4922° E", elevation: "48m", landmark: "Ancient Gladiators Arena", distance: "3.5 km trek" },
      { day: 3, name: "Vatican Museum", lat: "41.9029° N", lng: "12.4534° E", elevation: "19m", landmark: "St. Peter's Square", distance: "5.2 km walk" }
    ];
  } else if (destLower.includes("sahar") || destLower.includes("desert")) {
    return [
      { day: 1, name: "Marrakech Assembly", lat: "31.6295° N", lng: "-7.9811° E", elevation: "466m", landmark: "Jemaa el-Fnaa square", distance: "Starting Point" },
      { day: 2, name: "Atlas Mountain Pass", lat: "31.1415° N", lng: "-7.9213° E", elevation: "2,260m", landmark: "Tizi n'Tichka viewpoint", distance: "180 km travel" },
      { day: 3, name: "Merzouga Desert Camp", lat: "31.0972° N", lng: "-4.0121° E", elevation: "750m", landmark: "Erg Chebbi Dunes", distance: "310 km luxury 4x4" }
    ];
  }
  return [
    { day: 1, name: "Bangalore Departure", lat: "12.9716° N", lng: "77.5946° E", elevation: "920m", landmark: "Majestic Assembly Point", distance: "Starting Point" },
    { day: 2, name: "Wayanad Valley / Resort Check-in", lat: "11.5362° N", lng: "76.0841° E", elevation: "700m", landmark: "Vythiri Forest Ridge", distance: "270 km AC Traveller" },
    { day: 3, name: "Chembra Peak Trek & Return", lat: "11.6033° N", lng: "76.1361° E", elevation: "2,100m", landmark: "Heart-Shaped Lake Viewpoint", distance: "14 km trek" }
  ];
};

const DEFAULT_VIDEOS = [
  {
    id: -1,
    title: "Morning Jungle Stream Hike",
    video_url: "https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4",
    thumbnail_url: "https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&q=80&w=300",
    author_name: "Rahul Sharma",
    likes: 42
  },
  {
    id: -2,
    title: "Sunset Campfire & Music Jam",
    video_url: "https://assets.mixkit.co/videos/preview/mixkit-bonfire-burning-in-the-forest-at-night-42289-large.mp4",
    thumbnail_url: "https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&q=80&w=300",
    author_name: "Priya Nair",
    likes: 89
  },
  {
    id: -3,
    title: "Trekking Wayanad High Trails",
    video_url: "https://assets.mixkit.co/videos/preview/mixkit-hiking-path-on-a-sunny-day-34327-large.mp4",
    thumbnail_url: "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&q=80&w=300",
    author_name: "Vikram Malhotra",
    likes: 56
  },
  {
    id: -4,
    title: "Vythiri Luxury Resort Pool",
    video_url: "https://assets.mixkit.co/videos/preview/mixkit-swimming-pool-in-a-luxury-hotel-at-sunset-10332-large.mp4",
    thumbnail_url: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&q=80&w=300",
    author_name: "Encho Host",
    likes: 120
  }
];

export const ExperienceDetails: React.FC<ExperienceDetailsProps> = ({ 
    experience, 
    onBack, 
    onRequestAuth, 
    onSelectExperience,
    isFavorite,
    onToggleFavorite,
    onMessageHost
}) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [numTickets, setNumTickets] = useState(1);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [bookingStatus, setBookingStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const [reviews, setReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [relatedExperiences, setRelatedExperiences] = useState<Experience[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [isEligible, setIsEligible] = useState(false);
  const [newRating, setNewRating] = useState(10);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [newContent, setNewContent] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // New Senior Designer Map & Video Snippets States
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [videos, setVideos] = useState<any[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [submittingVideo, setSubmittingVideo] = useState(false);
  const [activeVideo, setActiveVideo] = useState<any | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [showAddVideo, setShowAddVideo] = useState(false);
  const [showLobby, setShowLobby] = useState(false);
  const [isLobbyEligible, setIsLobbyEligible] = useState(false);
  
  const [selectedPlace, setSelectedPlace] = useState<any | null>(null);
  const [selectedStay, setSelectedStay] = useState<any | null>(null);

  // Fetch reviews from Postgres or use high-fidelity seed reviews
  const fetchReviews = async () => {
    try {
      const res = await fetch(`/api/experiences/${experience.id}/reviews`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setReviews(data);
        } else {
          setReviews(getSeedReviews(experience.id));
        }
      } else {
        setReviews(getSeedReviews(experience.id));
      }
    } catch (e) {
      setReviews(getSeedReviews(experience.id));
    } finally {
      setLoadingReviews(false);
    }
  };

  const fetchVideos = async () => {
    try {
      const res = await fetch(`/api/experiences/${experience.id}/videos`);
      
      let baseVideos: any[] = [];
      if (experience.video_urls && experience.video_urls.length > 0) {
        baseVideos = experience.video_urls.map((url, i) => ({
            id: `exp-vid-${i}`,
            title: experience.title + " Highlight",
            video_url: url,
            thumbnail_url: experience.image_urls?.[0] || 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&q=80&w=300',
            author_name: experience.host_name || "Host",
            likes: Math.floor(Math.random() * 100) + 10
        }));
      } else {
        baseVideos = DEFAULT_VIDEOS;
      }

      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setVideos([...baseVideos, ...data]);
        } else {
          setVideos(baseVideos);
        }
      } else {
        setVideos(baseVideos);
      }
    } catch (e) {
      setVideos(experience.video_urls && experience.video_urls.length > 0 
          ? experience.video_urls.map((url, i) => ({
              id: `exp-vid-${i}`,
              title: experience.title + " Highlight",
              video_url: url,
              thumbnail_url: experience.image_urls?.[0] || 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&q=80&w=300',
              author_name: experience.host_name || "Host",
              likes: Math.floor(Math.random() * 100) + 10
          }))
          : DEFAULT_VIDEOS);
    } finally {
      setLoadingVideos(false);
    }
  };

  const fetchRelatedExperiences = async () => {
    try {
      const res = await fetch(`/api/experiences`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          // Filter out current, shuffle, take 2
          const others = data.filter((e: Experience) => e.id !== experience.id);
          const shuffled = others.sort(() => 0.5 - Math.random());
          setRelatedExperiences(shuffled.slice(0, 2));
        } else {
          setRelatedExperiences([]);
        }
      } else {
        setRelatedExperiences([]);
      }
    } catch (e) {
      setRelatedExperiences([]);
    } finally {
      setLoadingRelated(false);
    }
  };

  // Check if authenticated user has booked this experience
  const checkEligibility = async () => {
    if (!user) {
      setIsEligible(false);
      setIsLobbyEligible(false);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/experiences/${experience.id}/reviews/eligible`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIsEligible(data.eligible);
      }

      const lobbyRes = await fetch(`/api/experiences/${experience.id}/lobby/participants`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (lobbyRes.ok) {
        setIsLobbyEligible(true);
      } else {
        setIsLobbyEligible(false);
      }
    } catch (e) {
      setIsEligible(false);
      setIsLobbyEligible(false);
    }
  };

  useEffect(() => {
    fetchReviews();
    fetchVideos();
    fetchRelatedExperiences();
    checkEligibility();
  }, [experience.id, user]);

  const handleSubmitVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoUrl.trim()) {
      addToast("Error", "Please provide a valid video link or select a preset.", "error");
      return;
    }
    setSubmittingVideo(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/experiences/${experience.id}/videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          video_url: newVideoUrl,
          title: newVideoTitle || 'Travel Highlight',
          thumbnail_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=200'
        })
      });

      if (res.ok) {
        const addedVideo = await res.json();
        setVideos(prev => [addedVideo, ...prev]);
        setNewVideoUrl('');
        setNewVideoTitle('');
        setShowAddVideo(false);
        addToast("Snippet Uploaded!", "Your vertical reel has been added to this experience timeline.", "success");
      } else {
        const errorData = await res.json();
        addToast("Error", errorData.error || "Failed to submit video.", "error");
      }
    } catch (e) {
      addToast("Error", "An unexpected error occurred.", "error");
    } finally {
      setSubmittingVideo(false);
    }
  };

  const handleLikeVideo = async (videoId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setVideos(prev => prev.map(v => v.id === videoId ? { ...v, likes: (v.likes || 0) + 1 } : v));
      if (activeVideo && activeVideo.id === videoId) {
        setActiveVideo((prev: any) => prev ? { ...prev, likes: (prev.likes || 0) + 1 } : null);
      }
      await fetch(`/api/experiences/videos/${videoId}/like`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) {
      addToast("Error", "Please write a review comment.", "error");
      return;
    }
    setSubmittingReview(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/experiences/${experience.id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rating: newRating,
          content: newContent
        })
      });

      if (res.ok) {
        const addedReview = await res.json();
        setReviews(prev => [addedReview, ...prev]);
        setNewContent('');
        setNewRating(5);
        addToast("Review Submitted", "Thank you for your feedback! It builds trust for other travelers.", "success");
      } else {
        const errorData = await res.json();
        addToast("Error", errorData.error || "Failed to submit review.", "error");
      }
    } catch (e) {
      addToast("Error", "An unexpected error occurred.", "error");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleBook = () => {
    if (!user) {
      onRequestAuth();
      return;
    }
    setShowCheckout(true);
  };

  const processBooking = async (paymentIntentId?: string) => {
    setBookingStatus('loading');
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/experience-bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                experience_id: experience.id,
                num_tickets: numTickets,
                total_price: experience.price * numTickets,
                name: user?.name || '',
                phone: user?.phone || '',
                user_id: user?.id,
                payment_intent: paymentIntentId
            })
        });
        
        if (!res.ok) {
            throw new Error('Booking failed');
        }
        
        setBookingStatus('success');
        addToast("Booking Confirmed", "Your experience is booked successfully!", "success");
        setTimeout(() => {
            onBack();
        }, 2000);
    } catch(err) {
        setBookingStatus('idle');
        addToast("Error", "Failed to book experience. Please try again.", "error");
    }
  };

  const handleCheckoutSuccess = (paymentIntentId: string) => {
      setShowCheckout(false);
      processBooking(paymentIntentId);
  };

  const placesToVisit = (experience.places_to_visit && experience.places_to_visit.length > 0) 
      ? experience.places_to_visit 
      : PACKAGE_DESTINATIONS;

  const hasIncludedStay = experience.included_stay && (experience.included_stay.title || experience.included_stay.image || experience.included_stay.description || (experience.included_stay.gallery && experience.included_stay.gallery.length > 0));
  const includedStay = hasIncludedStay ? experience.included_stay : INCLUDED_STAY;

  return (
    <>
      <SEO 
        title={experience.seo_title || `${experience.title} | Encho Space Experiences`} 
        description={experience.seo_description || experience.description?.substring(0, 160) || `Join ${experience.title} in ${experience.destination}`}
        image={experience.seo_image_url || experience.imageUrls?.[0] || experience.imageUrl}
        keywords={experience.seo_keywords || `experience, ${experience.destination}, ${experience.title}`}
      />
    <div className="bg-[#0a0a0a] min-h-screen text-gray-200 font-sans selection:bg-blue-500/30">
      
      {/* Immersive Hero Section */}
      <div className="relative h-[60vh] md:h-[75vh] w-full isolate">
        {/* Back Button Floating */}
        <button 
          onClick={onBack}
          className="absolute top-6 left-6 z-50 bg-black/40 hover:bg-black/60 backdrop-blur-md p-3 rounded-full text-white transition-all border border-white/10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Wishlist Button Floating */}
        {onToggleFavorite && (
            <button 
              onClick={onToggleFavorite}
              className="absolute top-6 right-6 z-50 bg-black/40 hover:bg-black/60 backdrop-blur-md p-3 rounded-full text-white transition-all border border-white/10"
            >
              <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="presentation" focusable="false" style={{ display: 'block', fill: isFavorite ? '#ef4444' : 'rgba(0, 0, 0, 0.5)', height: '24px', width: '24px', stroke: 'white', strokeWidth: 2, overflow: 'visible' }}>
                  <path d="M16 28c7-4.73 14-10 14-17a6.98 6.98 0 0 0-7-7c-1.8 0-3.58.68-4.95 2.05L16 8.1l-2.05-2.05a6.98 6.98 0 0 0-9.9 0A6.98 6.98 0 0 0 2 11c0 7 7 12.27 14 17z" />
              </svg>
            </button>
        )}

        <div className="absolute inset-0 z-0">
          <OptimizedImage 
            src={experience.image_urls?.[0] || 'https://images.unsplash.com/photo-1542314831-c6a4d14d8c81?auto=format&fit=crop&q=80&w=2400'} 
            alt={experience.title}
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* Gradient Overlay perfectly blending into dark background */}
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#0a0a0a] via-black/50 to-transparent" />
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/40 via-transparent to-transparent" />

        {/* Hero Content pinned to bottom */}
        <div className="absolute inset-0 z-20 flex flex-col justify-end px-6 lg:px-8 xl:px-16 pb-16 max-w-7xl mx-auto w-full">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap items-center gap-3 mb-6"
            >
                {experience.target_audience && experience.target_audience !== 'all' && (
                    <span className="px-3 py-1.5 bg-blue-500/20 backdrop-blur-md border border-blue-500/30 rounded-full text-[10px] font-bold tracking-widest uppercase text-blue-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        {experience.target_audience.replace('_', ' ')}
                    </span>
                )}
                {experience.start_time && (
                    <span className="px-3 py-1.5 bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 rounded-full text-[10px] font-bold tracking-widest uppercase text-emerald-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Starts {experience.start_time}
                    </span>
                )}
                {experience.language && (
                    <span className="px-3 py-1.5 bg-purple-500/20 backdrop-blur-md border border-purple-500/30 rounded-full text-[10px] font-bold tracking-widest uppercase text-purple-400 flex items-center gap-1.5">
                        <Languages className="w-3.5 h-3.5" />
                        {experience.language}
                    </span>
                )}
                {experience.available_spots <= 10 && experience.available_spots > 0 && (
                    <span className="px-3 py-1.5 bg-orange-500/20 backdrop-blur-md border border-orange-500/30 rounded-full text-[10px] font-bold tracking-widest uppercase text-orange-400 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />
                        {experience.available_spots} Spots Left
                    </span>
                )}
            </motion.div>

            <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-5xl md:text-7xl lg:text-[5.5rem] font-black text-white tracking-tight mb-6 leading-[1.05] max-w-5xl"
            >
                {experience.title}
            </motion.h1>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center text-gray-300 gap-2 font-medium tracking-wide text-sm md:text-base bg-black/30 backdrop-blur-md w-fit px-4 py-2 rounded-2xl border border-white/5"
            >
                <Navigation className="w-5 h-5 text-blue-500" />
                <span>Round trip from <strong className="text-white">{experience.departure_location}</strong> to <strong className="text-white">{experience.destination}</strong></span>
            </motion.div>
        </div>
      </div>

      {/* Content Layout */}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 xl:px-16 py-12 grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-12 xl:gap-24">
        
        {/* Left Column: Details */}
        <div className="flex flex-col gap-16 min-w-0">
            
            {/* Quick Info Bar */}
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6 border-y border-white/5"
            >
                <div className="flex flex-col gap-1">
                    <Clock className="w-5 h-5 text-gray-400 mb-1" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Duration</span>
                    <span className="text-sm font-medium text-white">
                        {Math.max(1, Math.ceil((new Date(experience.end_date).getTime() - new Date(experience.start_date).getTime()) / (1000 * 60 * 60 * 24)))} Days, {Math.max(0, Math.ceil((new Date(experience.end_date).getTime() - new Date(experience.start_date).getTime()) / (1000 * 60 * 60 * 24)) - 1)} Nights
                    </span>
                </div>
                <div className="flex flex-col gap-1">
                    <Users className="w-5 h-5 text-gray-400 mb-1" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Group Size</span>
                    <span className="text-sm font-medium text-white">Up to {experience.available_spots + 5} people</span>
                </div>
                <div className="flex flex-col gap-1">
                    <Activity className="w-5 h-5 text-gray-400 mb-1" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Activity</span>
                    <span className="text-sm font-medium text-white">Moderate</span>
                </div>
                <div className="flex flex-col gap-1">
                    <Languages className="w-5 h-5 text-gray-400 mb-1" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Languages</span>
                    <span className="text-sm font-medium text-white">{experience.language || 'English, Hindi'}</span>
                </div>
            </motion.div>

            {/* The Vibe & Crowd Profile */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 }}
                className="py-8 border-b border-white/5 mb-8"
            >
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Users className="w-6 h-6 text-purple-400" />
                        <h2 className="text-2xl font-bold text-white tracking-tight">
                            {experience.target_audience === 'students' ? "Bangalore Students Batch" : 
                             experience.target_audience === 'women_only' ? "Women Only Escapes" :
                             experience.target_audience === 'corporate' ? "IT & Tech Networking" :
                             experience.target_audience === 'couples' ? "Couples & Romantic Getaway" :
                             experience.target_audience === 'solo' ? "Solo Travelers" :
                             experience.target_audience === 'family' ? "Family Friendly" :
                             "Who Usually Joins Us?"}
                        </h2>
                    </div>
                    <span className="text-xs font-bold bg-white/5 px-3 py-1.5 rounded-full text-gray-400 border border-white/10">
                        {experience.target_audience === 'all' || !experience.target_audience ? 'Vibe Checked Crowd' : 'Strict Profile Match'}
                    </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(!experience.target_audience || experience.target_audience === 'all' || experience.target_audience === 'corporate') && (
                        <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 p-5 rounded-2xl flex gap-4 hover:border-blue-500/20 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                                <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-1">Unplug from the Screen</h4>
                                <p className="text-xs text-gray-400 leading-relaxed">Perfect for tech professionals from HSR, Koramangala & Whitefield. Swap the laptop for nature and network with respectful peers.</p>
                            </div>
                        </div>
                    )}
                    
                    {(!experience.target_audience || experience.target_audience === 'all' || experience.target_audience === 'women_only') && (
                        <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 p-5 rounded-2xl flex gap-4 hover:border-pink-500/20 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center shrink-0">
                                <ShieldCheck className="w-5 h-5 text-pink-400" />
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-1">Absolute Peace of Mind</h4>
                                <p className="text-xs text-gray-400 leading-relaxed">Verified female captains, strict no-creep policy, and comfortable stays. Travel freely with like-minded women from the city.</p>
                            </div>
                        </div>
                    )}

                    {(!experience.target_audience || experience.target_audience === 'all' || experience.target_audience === 'couples') && (
                        <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 p-5 rounded-2xl flex gap-4 hover:border-purple-500/20 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
                                <Heart className="w-5 h-5 text-purple-400" />
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-1">Couples Friendly</h4>
                                <p className="text-xs text-gray-400 leading-relaxed">Guaranteed private twin-sharing. Enjoy your own romantic space while being part of a fun, hassle-free group itinerary.</p>
                            </div>
                        </div>
                    )}

                    {(!experience.target_audience || experience.target_audience === 'all' || experience.target_audience === 'solo') && (
                        <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 p-5 rounded-2xl flex gap-4 hover:border-amber-500/20 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                                <Compass className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-1">Solo Travelers</h4>
                                <p className="text-xs text-gray-400 leading-relaxed">Join a vibrant community of explorers. A safe, structured environment to meet new friends or enjoy quiet introspection.</p>
                            </div>
                        </div>
                    )}

                    {(!experience.target_audience || experience.target_audience === 'all' || experience.target_audience === 'family') && (
                        <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 p-5 rounded-2xl flex gap-4 hover:border-sky-500/20 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center shrink-0">
                                <Users className="w-5 h-5 text-sky-400" />
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-1">Family Friendly</h4>
                                <p className="text-xs text-gray-400 leading-relaxed">Activities curated for all ages. Comfortable transport, safe stays, and engaging experiences that bring the family together.</p>
                            </div>
                        </div>
                    )}

                    {(!experience.target_audience || experience.target_audience === 'all' || experience.target_audience === 'students') && (
                        <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 p-5 rounded-2xl flex gap-4 hover:border-emerald-500/20 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                                <svg viewBox="0 0 24 24" className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-1">Student Budget & Vibe</h4>
                                <p className="text-xs text-gray-400 leading-relaxed">Subsidized pricing for Bangalore college students. High energy, bonfires, music, and making memories before the semester ends.</p>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
            
            {/* About this place */}
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <div className="flex items-center gap-3 mb-6">
                    <Info className="w-6 h-6 text-blue-400" />
                    <h2 className="text-2xl font-bold text-white tracking-tight">The Experience</h2>
                </div>
                <p className="text-gray-400 text-lg leading-relaxed font-light">
                    {experience.description}
                </p>
            </motion.div>

            {/* Inclusions & Exclusions */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-[#111] p-8 rounded-3xl border border-white/5"
            >
                {experience.highlights && experience.highlights.length > 0 && (
                    <div className="md:col-span-2 mb-4">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Star className="w-5 h-5 text-yellow-400" /> Experience Highlights
                        </h3>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {experience.highlights.map((hl, i) => (
                                <li key={i} className="flex items-start gap-3 text-gray-300 text-sm bg-white/5 p-4 rounded-xl border border-white/5 shadow-sm">
                                    <Sparkles className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                                    <span>{hl}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                <div>
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" /> What's Included
                    </h3>
                    <ul className="space-y-3">
                        {(experience.includes && experience.includes.length > 0) ? (
                            experience.includes.map((inc, i) => (
                                <li key={i} className="flex items-start gap-2 text-gray-400 text-sm">
                                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                    <span>{inc}</span>
                                </li>
                            ))
                        ) : (
                            <>
                                <li className="flex items-start gap-2 text-gray-400 text-sm">
                                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                    <span>Round-trip AC transportation</span>
                                </li>
                                <li className="flex items-start gap-2 text-gray-400 text-sm">
                                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                    <span>Premium resort accommodation (Twin sharing)</span>
                                </li>
                                <li className="flex items-start gap-2 text-gray-400 text-sm">
                                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                    <span>Morning Breakfast & Welcome Drinks</span>
                                </li>
                                <li className="flex items-start gap-2 text-gray-400 text-sm">
                                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                    <span>Guided sightseeing tour</span>
                                </li>
                            </>
                        )}
                    </ul>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-red-400" /> What's Not Included
                    </h3>
                    <ul className="space-y-3">
                        {(experience.excludes && experience.excludes.length > 0) ? (
                            experience.excludes.map((exc, i) => (
                                <li key={i} className="flex items-start gap-2 text-gray-400 text-sm">
                                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                    <span>{exc}</span>
                                </li>
                            ))
                        ) : (
                            <>
                                <li className="flex items-start gap-2 text-gray-400 text-sm">
                                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                    <span>Lunch and Dinner meals</span>
                                </li>
                                <li className="flex items-start gap-2 text-gray-400 text-sm">
                                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                    <span>Entry fees for monuments/parks</span>
                                </li>
                                <li className="flex items-start gap-2 text-gray-400 text-sm">
                                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                    <span>Personal expenses & shopping</span>
                                </li>
                            </>
                        )}
                    </ul>
                </div>
                
                {experience.things_to_carry && experience.things_to_carry.length > 0 && (
                    <div className="md:col-span-1 border-t border-white/5 pt-6 md:pt-8 md:border-t-0">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-blue-400" /> Things to Carry
                        </h3>
                        <ul className="space-y-3">
                            {experience.things_to_carry.map((thing, i) => (
                                <li key={i} className="flex items-start gap-2 text-gray-400 text-sm">
                                    <Check className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                    <span>{thing}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {experience.important_notes && (
                    <div className="md:col-span-1 border-t border-white/5 pt-6 md:pt-8 md:border-t-0">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-orange-400" /> Important Notes
                        </h3>
                        <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {experience.important_notes}
                        </div>
                    </div>
                )}
                
                {experience.cancellation_policy && (
                    <div className="md:col-span-1 border-t border-white/5 pt-6 md:pt-8 md:border-t-0">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-blue-400" /> Cancellation Policy
                        </h3>
                        <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {experience.cancellation_policy}
                        </div>
                    </div>
                )}
                
                {experience.map_link && (
                    <div className="md:col-span-2 border-t border-white/5 pt-6 md:pt-8 flex justify-center">
                        <a href={experience.map_link} target="_blank" rel="noreferrer" className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-white text-sm font-bold flex items-center gap-2 transition-colors">
                            <MapPin className="w-4 h-4" />
                            View Starting Point on Google Maps
                        </a>
                    </div>
                )}
            </motion.div>

            {/* Top Places */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="w-full overflow-hidden"
            >
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <Map className="w-6 h-6 text-blue-400" />
                        <h2 className="text-2xl font-bold text-white tracking-tight">Places We'll Visit</h2>
                    </div>
                </div>
                
                <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide -mx-6 px-6 md:mx-0 md:px-0 w-full min-w-0 snap-x snap-mandatory">
                    {placesToVisit.map((place: any, index: number) => (
                        <div 
                            key={place.id || index} 
                            onClick={() => setSelectedPlace(place)}
                            className="relative w-[80vw] sm:w-[300px] max-w-[300px] shrink-0 rounded-3xl overflow-hidden aspect-[4/5] group border border-white/5 bg-[#111] snap-center sm:snap-start cursor-pointer hover:border-blue-500/30 transition-all hover:shadow-2xl hover:shadow-blue-500/10"
                        >
                            <div className="absolute inset-0 h-2/3">
                                <OptimizedImage src={place.image} alt={place.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#111]" />
                            </div>
                            
                            <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col">
                                <div className="flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-blue-400 mb-2">
                                    <MapPin className="w-3 h-3" />
                                    {place.location}
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">{place.title || place.name}</h3>
                                <p className="text-sm text-gray-400 font-light mb-2">{place.description}</p>
                                {place.details && (
                                    <p className="text-xs text-gray-500 font-light italic">{place.details}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Luxury Stays */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="w-full"
            >
                <div className="flex items-center gap-3 mb-8">
                    <Star className="w-6 h-6 text-blue-400" />
                    <h2 className="text-2xl font-bold text-white tracking-tight">Where You'll Stay</h2>
                </div>
                
                <div 
                    onClick={() => setSelectedStay(includedStay)}
                    className="cursor-pointer rounded-[2rem] bg-[#111111] border border-white/5 overflow-hidden flex flex-col md:flex-row group hover:border-emerald-500/30 transition-all shadow-2xl hover:shadow-emerald-500/10"
                >
                    <div className="relative md:w-[45%] h-72 md:h-auto overflow-hidden">
                        <OptimizedImage src={includedStay.image} alt={includedStay.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#111111]/90 hidden md:block" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#111111] to-transparent md:hidden" />
                        
                        <div className="absolute top-6 left-6 bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold text-white shadow-xl">
                            <Star className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                            Premium Stay Included
                        </div>
                    </div>
                    
                    <div className="p-8 md:p-10 flex flex-col justify-center flex-1 gap-6 md:-ml-8 z-10">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-blue-400 mb-3 uppercase">
                                <MapPin className="w-4 h-4" />
                                {includedStay.location}
                            </div>
                            <h3 className="text-3xl font-bold text-white mb-4">{includedStay.title}</h3>
                            <p className="text-gray-400 text-base leading-relaxed">{includedStay.description}</p>
                        </div>
                        
                        <div className="flex flex-wrap gap-3">
                            {includedStay.amenities?.map((amenity: string, idx: number) => (
                                <span key={idx} className="px-4 py-2 rounded-full bg-[#1a1a1a] border border-white/10 text-xs font-bold tracking-wide text-gray-300 flex items-center gap-2 shadow-lg">
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    {amenity}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Traveler Video Snippets Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="w-full mt-10"
            >
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                    <div className="flex items-center gap-3">
                        <Video className="w-6 h-6 text-blue-400" />
                        <div>
                            <h2 className="text-2xl font-bold text-white tracking-tight">Traveler Video Reels</h2>
                            <p className="text-xs text-gray-400 font-light mt-0.5">Real 10s video bites shared by hosts and verified travelers</p>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowAddVideo(!showAddVideo)}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-2 tracking-wide self-start md:self-auto"
                    >
                        <Plus className="w-4 h-4 text-blue-400" />
                        {showAddVideo ? 'Close Form' : 'Share Your Reel'}
                    </button>
                </div>

                <AnimatePresence>
                    {showAddVideo && (
                        <motion.form
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            onSubmit={handleSubmitVideo}
                            className="bg-[#111] border border-white/5 rounded-3xl p-6 mb-8 overflow-hidden space-y-4"
                        >
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-blue-400">Add Video Snippet</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-400">Select Preset Reel or Link Custom MP4:</label>
                                    <select
                                        value={newVideoUrl}
                                        onChange={(e) => {
                                            setNewVideoUrl(e.target.value);
                                            const found = DEFAULT_VIDEOS.find(v => v.video_url === e.target.value);
                                            if (found) setNewVideoTitle(found.title);
                                        }}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-blue-500 transition-colors"
                                        required
                                    >
                                        <option value="">-- Choose Vertical Highlight Video --</option>
                                        <option value="https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4">Jungle Stream Hike (Stock Loop)</option>
                                        <option value="https://assets.mixkit.co/videos/preview/mixkit-bonfire-burning-in-the-forest-at-night-42289-large.mp4">Sunset Campfire & Songs (Stock Loop)</option>
                                        <option value="https://assets.mixkit.co/videos/preview/mixkit-hiking-path-on-a-sunny-day-34327-large.mp4">Hiking Pathway Vista (Stock Loop)</option>
                                        <option value="https://assets.mixkit.co/videos/preview/mixkit-swimming-pool-in-a-luxury-hotel-at-sunset-10332-large.mp4">Resort Swimming Pool Loop (Stock Loop)</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-400">Highlight Title:</label>
                                    <input
                                        type="text"
                                        value={newVideoTitle}
                                        onChange={(e) => setNewVideoTitle(e.target.value)}
                                        placeholder="e.g. My first Chembra peak summit!"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-blue-500 transition-colors placeholder:text-gray-600"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2">
                                <span className="text-[10px] text-gray-500">
                                    {user ? 'Posting as ' + (user.name || 'Verified Explorer') : 'Log in to add personalized snippets'}
                                </span>
                                <button
                                    type="submit"
                                    disabled={submittingVideo || !user}
                                    className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs transition-colors disabled:opacity-40"
                                >
                                    {submittingVideo ? 'Publishing...' : 'Publish Reel'}
                                </button>
                            </div>
                        </motion.form>
                    )}
                </AnimatePresence>

                {/* Reels Carousel */}
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-6 px-6 md:mx-0 md:px-0 w-full min-w-0 snap-x snap-mandatory">
                    {loadingVideos ? (
                        <div className="flex gap-4 py-8 w-full justify-center">
                            <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        </div>
                    ) : videos.length === 0 ? (
                        <p className="text-xs text-gray-500 py-4 italic">No traveler reels added yet. Be the first to add yours!</p>
                    ) : (
                        videos.map((vid, idx) => (
                            <motion.div
                                key={vid.id || idx}
                                whileHover={{ y: -6, scale: 1.02 }}
                                onClick={() => {
                                    setActiveVideo(vid);
                                    setIsMuted(false);
                                }}
                                className="relative w-[140px] h-[240px] sm:w-[180px] sm:h-[300px] shrink-0 rounded-3xl overflow-hidden border border-white/10 bg-black cursor-pointer group shadow-2xl snap-center sm:snap-start ring-1 ring-white/5 hover:ring-blue-500/30 transition-all"
                            >
                                <div className="absolute inset-0">
                                    <OptimizedImage
                                        src={vid.thumbnail_url || 'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&q=80&w=300'}
                                        alt={vid.title}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-90 group-hover:opacity-100"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/50" />
                                </div>

                                {/* Persistent Play button overlay */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                                    <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl transition-transform active:scale-95 duration-200 group-hover:bg-blue-500/20 group-hover:border-blue-500/50">
                                        <Play className="w-5 h-5 text-white fill-white ml-0.5 group-hover:text-blue-400 group-hover:fill-blue-400 transition-colors" />
                                    </div>
                                </div>

                                <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-white bg-black/50 backdrop-blur-md border border-white/10 px-2 py-1 rounded-full shadow-lg">
                                        <Eye className="w-3 h-3 text-blue-400" />
                                        1.2K
                                    </span>
                                    <button
                                        onClick={(e) => handleLikeVideo(vid.id, e)}
                                        className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-rose-400 hover:text-rose-300 transition-colors active:scale-90 shadow-lg"
                                    >
                                        <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
                                    </button>
                                </div>

                                <div className="absolute bottom-3 left-3 right-3 text-left z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 p-[1px] shadow-lg">
                                            <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-[10px] font-bold text-white">
                                                {vid.author_name?.charAt(0) || 'E'}
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-200 truncate drop-shadow-md">
                                            {vid.author_name || 'Traveler'}
                                        </span>
                                    </div>
                                    <h4 className="text-white text-xs sm:text-sm font-bold line-clamp-2 leading-tight group-hover:text-blue-300 transition-colors drop-shadow-lg shadow-black">
                                        {vid.title}
                                    </h4>
                                    <span className="text-[10px] text-gray-400 block font-light">
                                        By {vid.author_name || 'Verified Explorer'}
                                    </span>
                                    <div className="flex items-center gap-1 mt-1 text-[9px] text-gray-500 font-bold">
                                        <Heart className="w-2.5 h-2.5 text-rose-500 fill-rose-500 shrink-0" />
                                        {vid.likes || 0} Likes
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </motion.div>

            {/* Immersive Video Reel Player Modal Overlay */}
            <AnimatePresence>
                {activeVideo && (
                    <VideoReelsModal
                        videos={videos}
                        initialVideoId={activeVideo.id}
                        onClose={() => setActiveVideo(null)}
                        onLike={handleLikeVideo}
                        isMuted={isMuted}
                        setIsMuted={setIsMuted}
                    />
                )}
            </AnimatePresence>

            {/* Logistics & Boarding Points */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="my-16 border-t border-white/5 pt-12"
            >
                <div className="flex items-center gap-3 mb-8">
                    <Navigation className="w-6 h-6 text-emerald-400" />
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Bangalore Boarding Points</h2>
                        <p className="text-xs text-gray-400 font-light mt-1">We run synchronized AC Tempo Travelers connecting major tech hubs</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#111] border border-white/5 p-5 rounded-2xl flex flex-col items-center text-center hover:border-emerald-500/20 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                            <span className="text-emerald-400 font-black text-sm">#1</span>
                        </div>
                        <h4 className="text-white font-bold text-sm mb-1">Manyata Tech Park</h4>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">7:00 PM</p>
                        <p className="text-xs text-gray-400 mt-2">Hebbal / Nagawara / North BLR</p>
                    </div>
                    
                    <div className="bg-[#111] border border-white/5 p-5 rounded-2xl flex flex-col items-center text-center hover:border-emerald-500/20 transition-colors relative">
                        <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent hidden lg:block" style={{ transform: 'translateX(-50%)', top: '24px' }}></div>
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3 z-10">
                            <span className="text-emerald-400 font-black text-sm">#2</span>
                        </div>
                        <h4 className="text-white font-bold text-sm mb-1">Marathahalli</h4>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">8:15 PM</p>
                        <p className="text-xs text-gray-400 mt-2">Kalamandir / Whitefield Route</p>
                    </div>

                    <div className="bg-[#111] border border-white/5 p-5 rounded-2xl flex flex-col items-center text-center hover:border-emerald-500/20 transition-colors relative">
                        <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent hidden lg:block" style={{ transform: 'translateX(-50%)', top: '24px' }}></div>
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3 z-10">
                            <span className="text-emerald-400 font-black text-sm">#3</span>
                        </div>
                        <h4 className="text-white font-bold text-sm mb-1">Silk Board</h4>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">9:00 PM</p>
                        <p className="text-xs text-gray-400 mt-2">HSR / BTM / Koramangala</p>
                    </div>

                    <div className="bg-[#111] border border-white/5 p-5 rounded-2xl flex flex-col items-center text-center hover:border-emerald-500/20 transition-colors relative">
                        <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent hidden lg:block" style={{ transform: 'translateX(-50%)', top: '24px' }}></div>
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3 z-10 relative">
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
                            <span className="text-emerald-400 font-black text-sm">#4</span>
                        </div>
                        <h4 className="text-white font-bold text-sm mb-1">Electronic City</h4>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">10:00 PM</p>
                        <p className="text-xs text-gray-400 mt-2">Final Pick-up / Toll Gate Exit</p>
                    </div>
                </div>
            </motion.div>

            {/* Micro Experiences & Day-by-Day Interactive Maps */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start my-16 border-t border-white/5 pt-12">
                
                {/* Left Column: Interactive Timeline List */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                    className="lg:col-span-7 flex flex-col gap-6"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <Clock className="w-6 h-6 text-blue-400" />
                        <div>
                            <h2 className="text-2xl font-bold text-white tracking-tight">The Itinerary</h2>
                            <p className="text-xs text-gray-400 font-light mt-0.5">Select a day or pin to view station coordinates and travel trail</p>
                        </div>
                    </div>
                    
                    <div className="relative pl-6 md:pl-8 border-l border-white/10 ml-4 md:ml-6 flex flex-col gap-8">
                        {experience.itinerary && experience.itinerary.length > 0 ? (
                            experience.itinerary.map((day: any, idx: number) => {
                                const isActive = idx === activeDayIdx;
                                return (
                                    <div 
                                        key={idx} 
                                        className="relative group cursor-pointer"
                                        onClick={() => setActiveDayIdx(idx)}
                                    >
                                        <div className={`absolute -left-[43px] md:-left-[51px] top-1 w-10 h-10 rounded-full bg-[#0a0a0a] border-2 transition-all duration-300 flex items-center justify-center z-10 ${
                                            isActive 
                                                ? 'border-blue-500 scale-110 shadow-[0_0_15px_rgba(59,130,246,0.6)] text-white' 
                                                : 'border-white/10 text-gray-500 group-hover:border-white/30'
                                        }`}>
                                            <span className="font-bold text-sm">{idx + 1}</span>
                                        </div>
                                        <div className={`border transition-all duration-300 overflow-hidden rounded-3xl ${
                                            isActive 
                                                ? 'bg-[#151515] border-blue-500/30 shadow-2xl' 
                                                : 'bg-[#111111] border-white/5 hover:border-white/10 hover:bg-[#131313]'
                                        }`}>
                                            <div className="p-6 md:p-8">
                                                <div className="flex justify-between items-start gap-4">
                                                    <div>
                                                        <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-3 ${
                                                            isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-gray-400'
                                                        }`}>
                                                            Day {idx + 1}
                                                        </span>
                                                        <h3 className={`text-xl font-bold mb-2 transition-colors ${isActive ? 'text-white' : 'text-gray-200 group-hover:text-white'}`}>
                                                            {day.title || `Exploring Day ${idx + 1}`}
                                                        </h3>
                                                    </div>
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform duration-300 ${isActive ? 'bg-blue-500 text-white rotate-90' : 'bg-white/5 text-gray-400 group-hover:bg-white/10'}`}>
                                                        <ChevronRight className="w-4 h-4" />
                                                    </div>
                                                </div>
                                                <p className={`text-sm leading-relaxed transition-all duration-300 ${isActive ? 'text-gray-300' : 'text-gray-500 line-clamp-2'}`}>
                                                    {day.description}
                                                </p>
                                            </div>
                                            
                                            {/* Expandable Image Area for Active Day */}
                                            <AnimatePresence>
                                                {isActive && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="px-6 md:px-8 pb-6 md:pb-8 pt-2">
                                                            <div className="relative w-full h-48 md:h-64 rounded-2xl overflow-hidden border border-white/10">
                                                                <OptimizedImage
                                                                    src={`https://images.unsplash.com/photo-${1551632811 + idx}-561732d1e306?auto=format&fit=crop&q=80&w=800`}
                                                                    alt={day.title || `Day ${idx + 1}`}
                                                                    className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                                                                />
                                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                                                <div className="absolute bottom-4 left-4 flex items-center gap-2">
                                                                    <div className="px-2 py-1 bg-black/50 backdrop-blur-md rounded border border-white/10 text-[9px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                                                        <MapPin className="w-3 h-3 text-blue-400" />
                                                                        {getGeoPointsForExperience(experience)[idx]?.name || 'Destination Point'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            // High Fidelity Default Itinerary mapped interactive
                            [
                                { step: "1", tag: "Day 1", title: "Assembly & Scenic Drive", desc: "Board our premium AC traveller, meet your guide, and head up the winding mountain pass with planned scenic tea stops. We will have ice-breaking sessions and short pit-stops for amazing photography." },
                                { step: "2", tag: "Day 2", title: "Summit Trek & Sunset Bonfire", desc: "Wake up early for the highlight sunrise hike. Explore the lush mist valleys, discover hidden streams, and return for an evening cozy fireside music jam under the stars with fellow travelers." },
                                { step: "3", tag: "Day 3", title: "Resort Leisure & Return", desc: "Sip morning coffee overlooking the canopy view. Enjoy a hearty breakfast, take a dip in the pool, and visit local spice cooperatives before beginning our return trip by evening." }
                            ].map((row, idx) => {
                                const isActive = idx === activeDayIdx;
                                return (
                                    <div 
                                        key={idx} 
                                        className="relative group cursor-pointer"
                                        onClick={() => setActiveDayIdx(idx)}
                                    >
                                        <div className={`absolute -left-[43px] md:-left-[51px] top-1 w-10 h-10 rounded-full bg-[#0a0a0a] border-2 transition-all duration-300 flex items-center justify-center z-10 ${
                                            isActive 
                                                ? 'border-blue-500 scale-110 shadow-[0_0_15px_rgba(59,130,246,0.6)] text-white font-black' 
                                                : 'border-white/10 text-gray-500 font-bold group-hover:border-white/30'
                                        }`}>
                                            <span>{row.step}</span>
                                        </div>
                                        <div className={`border transition-all duration-300 overflow-hidden rounded-3xl ${
                                            isActive 
                                                ? 'bg-[#151515] border-blue-500/30 shadow-2xl' 
                                                : 'bg-[#111111] border-white/5 hover:border-white/10 hover:bg-[#131313]'
                                        }`}>
                                            <div className="p-6 md:p-8">
                                                <div className="flex justify-between items-start gap-4">
                                                    <div>
                                                        <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-3 ${
                                                            isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-gray-400'
                                                        }`}>
                                                            {row.tag}
                                                        </span>
                                                        <h3 className={`text-xl font-bold mb-2 transition-colors ${isActive ? 'text-white' : 'text-gray-200 group-hover:text-white'}`}>
                                                            {row.title}
                                                        </h3>
                                                    </div>
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform duration-300 ${isActive ? 'bg-blue-500 text-white rotate-90' : 'bg-white/5 text-gray-400 group-hover:bg-white/10'}`}>
                                                        <ChevronRight className="w-4 h-4" />
                                                    </div>
                                                </div>
                                                <p className={`text-sm leading-relaxed transition-all duration-300 ${isActive ? 'text-gray-300' : 'text-gray-500 line-clamp-2'}`}>
                                                    {row.desc}
                                                </p>
                                            </div>

                                            {/* Expandable Image Area for Active Day */}
                                            <AnimatePresence>
                                                {isActive && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="px-6 md:px-8 pb-6 md:pb-8 pt-2">
                                                            <div className="relative w-full h-48 md:h-64 rounded-2xl overflow-hidden border border-white/10">
                                                                <OptimizedImage
                                                                    src={
                                                                        idx === 0 ? "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=800" :
                                                                        idx === 1 ? "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&q=80&w=800" :
                                                                        "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&q=80&w=800"
                                                                    }
                                                                    alt={row.title}
                                                                    className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                                                                />
                                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                                                <div className="absolute bottom-4 left-4 flex items-center gap-2">
                                                                    <div className="px-2 py-1 bg-black/50 backdrop-blur-md rounded border border-white/10 text-[9px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                                                        <MapPin className="w-3 h-3 text-blue-400" />
                                                                        {getGeoPointsForExperience(experience)[idx]?.name || 'Destination Point'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </motion.div>

                {/* Right Column: Interactive Day-by-Day Map Card */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.65 }}
                    className="lg:col-span-5 lg:sticky lg:top-24 flex flex-col gap-6"
                >
                    <div className="bg-[#111] border border-white/5 rounded-[2rem] overflow-hidden p-6 shadow-2xl flex flex-col gap-6">
                        
                        {/* Map Canvas Frame */}
                        <div className="relative aspect-[4/3] md:aspect-square w-full rounded-2xl bg-[#080808] border border-white/10 overflow-hidden flex flex-col items-center justify-center">
                            
                            {/* Topological Map Grid lines and technical compass markings */}
                            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] [background-size:2rem_2rem] opacity-20" />
                            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-blue-500/20" />
                            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-blue-500/20" />
                            
                            {/* Radar rings */}
                            <div className="absolute inset-8 rounded-full border border-blue-500/10 border-dashed" />
                            <div className="absolute inset-24 rounded-full border border-blue-500/10 border-dashed pointer-events-none" />
                            <div className="absolute inset-40 rounded-full border border-blue-500/5 pointer-events-none" />

                            <div className="absolute top-4 right-4 flex items-center gap-2 text-[9px] font-mono text-gray-500 bg-black/60 px-2 py-1 rounded backdrop-blur-sm border border-white/5">
                                <Compass className="w-3.5 h-3.5 text-blue-400 animate-spin-slow" />
                                <span>GRID_NAV: N_31.5</span>
                            </div>

                            {/* SVG Animated Connector Path & Pins */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 400 400">
                                <defs>
                                    <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#3b82f6" />
                                        <stop offset="100%" stopColor="#10b981" />
                                    </linearGradient>
                                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                        <feGaussianBlur stdDeviation="4" result="blur" />
                                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                    </filter>
                                </defs>
                                
                                {/* Path connectors between days */}
                                <motion.path
                                    d="M 80,300 Q 150,200 220,180 T 320,100"
                                    fill="none"
                                    stroke="url(#neonGradient)"
                                    strokeWidth="3"
                                    strokeDasharray="8 6"
                                    strokeLinecap="round"
                                    initial={{ strokeDashoffset: 100 }}
                                    animate={{ strokeDashoffset: 0 }}
                                    transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
                                    filter="url(#glow)"
                                />

                                {/* Interactive Coordinates Pins */}
                                {[[80, 300, 0], [220, 180, 1], [320, 100, 2]].map(([cx, cy, idx]) => {
                                    const isActive = idx === activeDayIdx;
                                    return (
                                        <g key={idx} className="cursor-pointer pointer-events-auto" onClick={() => setActiveDayIdx(idx)}>
                                            {isActive && (
                                                <circle
                                                    cx={cx}
                                                    cy={cy}
                                                    r="20"
                                                    fill="none"
                                                    stroke="#3b82f6"
                                                    strokeWidth="1.5"
                                                    className="animate-ping origin-center"
                                                    style={{ transformOrigin: `${cx}px ${cy}px` }}
                                                />
                                            )}
                                            <circle
                                                cx={cx}
                                                cy={cy}
                                                r={isActive ? "12" : "8"}
                                                fill={isActive ? "#3b82f6" : "#0f172a"}
                                                stroke={isActive ? "#fff" : "#3b82f6"}
                                                strokeWidth="2"
                                                className="transition-all duration-300"
                                                filter={isActive ? "url(#glow)" : ""}
                                            />
                                            <text
                                                x={cx}
                                                y={cy + 4}
                                                fill={isActive ? "#fff" : "#94a3b8"}
                                                fontSize="10"
                                                fontWeight="bold"
                                                textAnchor="middle"
                                                className="font-mono transition-colors duration-300"
                                            >
                                                {idx + 1}
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>

                            {/* Geo Location Label Overlay */}
                            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-3 z-20 shadow-xl">
                                <div className="flex items-center gap-2">
                                    <Navigation className="w-4 h-4 text-blue-400 rotate-45 shrink-0" />
                                    <div>
                                        <span className="text-[10px] text-gray-400 block font-light">ACTIVE STATION COORDINATES</span>
                                        <span className="text-[11px] text-white font-mono font-bold">
                                            {getGeoPointsForExperience(experience)[activeDayIdx]?.lat || '11.5362° N'} , {getGeoPointsForExperience(experience)[activeDayIdx]?.lng || '76.0841° E'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(`${getGeoPointsForExperience(experience)[activeDayIdx]?.lat || '11.5362° N'}, ${getGeoPointsForExperience(experience)[activeDayIdx]?.lng || '76.0841° E'}`);
                                        addToast("GPS Copied", "Station coordinates copied to clipboard.", "success");
                                    }}
                                    className="px-2.5 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-[9px] font-bold text-gray-300 uppercase tracking-wider"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        {/* Stations Information Hub Panel */}
                        <div className="space-y-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-blue-400 font-bold uppercase tracking-widest">
                                        <Sparkles className="w-3 h-3" />
                                        Day {activeDayIdx + 1} Selected Location
                                    </div>
                                    <h4 className="text-white text-lg font-black tracking-tight mt-0.5">
                                        {getGeoPointsForExperience(experience)[activeDayIdx]?.name || 'Wayanad High Trail'}
                                    </h4>
                                </div>
                                <span className="px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-black text-blue-400 font-mono">
                                    ALT: {getGeoPointsForExperience(experience)[activeDayIdx]?.elevation || '700m'}
                                </span>
                            </div>

                            <p className="text-gray-400 text-xs font-light leading-relaxed">
                                <strong className="text-gray-300">Station Landmark:</strong> {getGeoPointsForExperience(experience)[activeDayIdx]?.landmark || 'Vythiri Forest Ridge'}. <br />
                                <strong className="text-gray-300">Transit Distance:</strong> {getGeoPointsForExperience(experience)[activeDayIdx]?.distance || '270 km AC Traveller'}.
                            </p>

                            {/* Elevation gain sparkline */}
                            <div className="bg-black/40 border border-white/5 p-4 rounded-2xl flex flex-col gap-2">
                                <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold">
                                    <span>ELEVATION PROFILE (STATION 1-3)</span>
                                    <span className="text-blue-400">Peak: 3,454m</span>
                                </div>
                                
                                <div className="h-10 flex items-end justify-between px-2 gap-4 mt-1">
                                    {getGeoPointsForExperience(experience).map((p, i) => {
                                        const hPct = i === 0 ? "30%" : i === 1 ? "55%" : "100%";
                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                                                <div 
                                                    className={`w-full rounded-t-md transition-all duration-500 ${
                                                        i === activeDayIdx ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-white/10'
                                                    }`}
                                                    style={{ height: hPct }}
                                                />
                                                <span className={`text-[8px] font-mono font-bold ${i === activeDayIdx ? 'text-blue-400' : 'text-gray-500'}`}>
                                                    D{p.day} ({p.elevation})
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Insider Tips */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
            >
                <div className="flex items-center gap-3 mb-6">
                    <Sparkles className="w-6 h-6 text-blue-400" />
                    <h2 className="text-2xl font-bold text-white tracking-tight">Insider Tips</h2>
                </div>
                <div className="bg-[#111] border border-white/5 p-8 rounded-3xl">
                    <ul className="space-y-5">
                        <li className="flex items-start gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                <ArrowRight className="w-4 h-4 text-blue-500" />
                            </div>
                            <p className="text-gray-400 font-light leading-relaxed">Pack light and wear comfortable walking shoes for the excursions. The terrain can be uneven during treks.</p>
                        </li>
                        <li className="flex items-start gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                <ArrowRight className="w-4 h-4 text-blue-500" />
                            </div>
                            <p className="text-gray-400 font-light leading-relaxed">Keep a light jacket handy as temperatures can drop in the evenings, especially near the hills.</p>
                        </li>
                        <li className="flex items-start gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                <ArrowRight className="w-4 h-4 text-blue-500" />
                            </div>
                            <p className="text-gray-400 font-light leading-relaxed">Don't forget your camera—the sunrise views from the resort are spectacular and highly photogenic.</p>
                        </li>
                    </ul>
                </div>
            </motion.div>

            {/* FAQs */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="pt-4"
            >
                <div className="flex items-center gap-3 mb-6">
                    <Info className="w-6 h-6 text-blue-400" />
                    <h2 className="text-2xl font-bold text-white tracking-tight">Frequently Asked Questions</h2>
                </div>
                <div className="space-y-4">
                    <div className="bg-[#111] border border-white/5 p-6 rounded-2xl group hover:border-white/10 transition-colors">
                        <h4 className="text-white font-bold mb-2">Is the trip suitable for beginners?</h4>
                        <p className="text-gray-400 text-sm leading-relaxed">Yes, the treks and activities are curated for beginners with average fitness levels. Our guides ensure a comfortable pace for everyone.</p>
                    </div>
                    <div className="bg-[#111] border border-white/5 p-6 rounded-2xl group hover:border-white/10 transition-colors">
                        <h4 className="text-white font-bold mb-2">Are meals included?</h4>
                        <p className="text-gray-400 text-sm leading-relaxed">Morning breakfast at the resort is included. Lunch and dinner are not included so you can explore local culinary options. We'll stop at great restaurants!</p>
                    </div>
                    <div className="bg-[#111] border border-white/5 p-6 rounded-2xl group hover:border-white/10 transition-colors">
                        <h4 className="text-white font-bold mb-2">What is the group size?</h4>
                        <p className="text-gray-400 text-sm leading-relaxed">We maintain small group sizes (up to 15 travelers) to ensure a personalized and uncrowded experience.</p>
                    </div>
                </div>
            </motion.div>

            {/* Meet Your Host (Gold Standard) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.85 }}
                className="mt-16 mb-24 relative"
            >
                {/* Background glow */}
                <div className="absolute inset-0 bg-blue-500/5 blur-3xl rounded-full" />
                
                <div className="relative bg-[#0d0d0d] border border-white/5 rounded-[2.5rem] p-8 md:p-12 overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                        <Crown className="w-32 h-32 text-blue-500/20" />
                    </div>

                    <div className="flex flex-col md:flex-row gap-10 md:gap-16 relative z-10">
                        {/* Host Image and Badges */}
                        <div className="flex flex-col items-center shrink-0">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-emerald-400 rounded-full blur-md opacity-30 animate-pulse" />
                                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-[3px] border-[#151515] relative z-10">
                                    <img src="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=400" alt="Host" className="w-full h-full object-cover transition-transform duration-700 hover:scale-110" />
                                </div>
                                <div className="absolute -bottom-3 -right-2 bg-gradient-to-r from-blue-600 to-blue-400 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border-2 border-[#0d0d0d] shadow-lg z-20 flex items-center gap-1.5">
                                    <ShieldCheck className="w-3 h-3" />
                                    Superhost
                                </div>
                            </div>
                            <div className="mt-8 text-center">
                                <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                                    {experience.host_id ? 'Verified Guide' : 'Encho Team'}
                                </h3>
                                <p className="text-blue-400 text-sm font-bold uppercase tracking-widest mt-1">Host since 2019</p>
                            </div>
                        </div>

                        {/* Host Details and Stats */}
                        <div className="flex-1 flex flex-col justify-center">
                            <h4 className="text-xl font-bold text-white mb-4">About the Host</h4>
                            <p className="text-gray-400 text-sm md:text-base leading-relaxed mb-8 max-w-2xl font-light">
                                Passionate about creating unforgettable travel experiences. We specialize in curating group trips that blend adventure, comfort, and local culture. With over 5 years of experience leading tours across South India, your safety and enjoyment are our top priorities. We don't just guide; we create lifelong memories.
                            </p>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                                <div className="flex flex-col">
                                    <span className="text-2xl md:text-3xl font-black text-white mb-1">120+</span>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Reviews</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-2xl md:text-3xl font-black text-white mb-1 flex items-center gap-2">
                                        <div className="bg-[#003B95] text-white text-base md:text-lg px-2 py-0.5 rounded-t-md rounded-br-md shadow-[0_0_15px_rgba(0,59,149,0.5)]">
                                            9.8
                                        </div>
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Rating</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-2xl md:text-3xl font-black text-white mb-1">5+</span>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Years Exp.</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-2xl md:text-3xl font-black text-emerald-400 mb-1">100%</span>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Response Rate</span>
                                </div>
                            </div>
                            
                            <div className="mt-8 pt-8 border-t border-white/5 flex items-center gap-4">
                                <button className="bg-white/5 hover:bg-white/10 text-white font-bold py-3.5 px-6 rounded-full text-sm transition-colors border border-white/10">
                                    Message Host
                                </button>
                                <span className="text-xs text-gray-500 font-medium">
                                    Typically replies within an hour
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Traveler Reviews Section (Gold Standard) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="pt-6 border-t border-white/5 my-12"
            >
                <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 mb-12">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <Star className="w-8 h-8 text-amber-400 fill-amber-400" />
                            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight">Traveler Reviews</h2>
                        </div>
                        <p className="text-gray-400 text-sm md:text-base max-w-xl leading-relaxed mt-4">
                            Real feedback from our verified community. We take pride in delivering exceptional experiences every single time.
                        </p>
                    </div>
                    <span className="text-sm font-bold text-gray-400 uppercase tracking-widest bg-white/5 px-4 py-2 rounded-full border border-white/5 whitespace-nowrap">
                        {reviews.length} Verified Reviews
                    </span>
                </div>

                {/* Rating Distribution Header */}
                <div className="flex flex-col md:flex-row gap-8 md:gap-16 items-center bg-[#0a0a0a] border border-white/5 p-8 md:p-12 rounded-[2.5rem] mb-12 relative overflow-hidden shadow-2xl">
                    {/* Background accent */}
                    <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

                    {/* Average Rating big numbers */}
                    <div className="flex flex-col items-center justify-center text-center shrink-0 relative z-10 md:pr-16 md:border-r border-white/5">
                        <div className="bg-[#003B95] text-white text-6xl md:text-7xl font-black px-6 py-3 rounded-t-2xl rounded-br-2xl shadow-[0_0_30px_rgba(0,59,149,0.4)] mb-4 tracking-tighter">
                            9.8
                        </div>
                        <span className="text-xl font-bold text-white mb-2">{getRatingWord(9.8)}</span>
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5 mt-2">
                            <CheckCircle2 className="w-4 h-4" /> Top Rated Trip
                        </span>
                    </div>

                    {/* Star bars */}
                    <div className="flex-1 w-full flex flex-col justify-center gap-4 relative z-10">
                        {[
                            { stars: 10, pct: 92 },
                            { stars: 9, pct: 6 },
                            { stars: 8, pct: 2 },
                            { stars: 7, pct: 0 },
                            { stars: 6, pct: 0 },
                        ].map((row) => (
                            <div key={row.stars} className="flex items-center gap-4">
                                <span className="text-sm font-bold text-gray-300 w-4">{row.stars}</span>
                                <Star className="w-4 h-4 text-gray-500 fill-gray-500 shrink-0" />
                                <div className="flex-1 h-2.5 bg-[#1a1a1a] rounded-full overflow-hidden border border-white/5">
                                    <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${row.pct}%` }}
                                        transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
                                        className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full"
                                    />
                                </div>
                                <span className="text-xs font-bold text-gray-500 w-10 text-right">{row.pct}%</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Add Review Form */}
                <div className="bg-[#111] border border-white/5 p-8 rounded-[2rem] mb-12 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full blur-2xl pointer-events-none" />
                    {user ? (
                        <form onSubmit={handleSubmitReview} className="space-y-6 relative z-10">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-lg">
                                    {user.name?.charAt(0) || 'U'}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white tracking-tight">Share Your Experience</h3>
                                    <p className="text-xs text-gray-400 font-light mt-0.5">Your review helps our community grow.</p>
                                </div>
                            </div>
                            
                            <div className="flex flex-col md:flex-row md:items-center gap-4 bg-black/30 w-fit px-5 py-3.5 rounded-2xl border border-white/5">
                                <span className="text-sm font-semibold text-gray-300">Your Rating</span>
                                <div className="hidden md:block w-px h-6 bg-white/10 mx-2" />
                                <div className="flex items-center gap-1.5">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((starValue) => {
                                        const isHighlighted = hoverRating !== null 
                                            ? starValue <= hoverRating 
                                            : starValue <= newRating;
                                        return (
                                            <button
                                                type="button"
                                                key={starValue}
                                                onClick={() => setNewRating(starValue)}
                                                onMouseEnter={() => setHoverRating(starValue)}
                                                onMouseLeave={() => setHoverRating(null)}
                                                className="transition-transform active:scale-90"
                                            >
                                                <Star 
                                                    className={`w-6 h-6 md:w-8 md:h-8 transition-all duration-300 ${
                                                        isHighlighted 
                                                            ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)] scale-110' 
                                                            : 'text-gray-600 hover:text-gray-500'
                                                    }`} 
                                                />
                                            </button>
                                        );
                                    })}
                                </div>
                                <span className="text-xs font-black text-amber-400 md:ml-4 uppercase tracking-widest min-w-[80px]">
                                    {newRating}/10
                                </span>
                            </div>

                            <div className="relative group">
                                <textarea
                                    value={newContent}
                                    onChange={(e) => setNewContent(e.target.value)}
                                    placeholder="Write your review about the resort, activities, guides, and total experience..."
                                    rows={4}
                                    className="w-full bg-[#0a0a0a] border border-white/10 group-hover:border-white/20 rounded-[1.5rem] p-6 text-white text-sm md:text-base focus:outline-none focus:border-blue-500 transition-all placeholder:text-gray-600 resize-none shadow-inner"
                                    required
                                />
                                <div className="absolute bottom-4 right-4 text-xs font-bold text-gray-600">
                                    {newContent.length} chars
                                </div>
                            </div>

                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pt-2">
                                {isEligible ? (
                                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20 shadow-inner">
                                        <ShieldCheck className="w-4 h-4" />
                                        Verified Buyer Badge Active
                                    </div>
                                ) : (
                                    <div className="text-xs text-gray-500 font-light max-w-sm">
                                        Your review will help fellow travelers plan their perfect trip!
                                    </div>
                                )}
                                <button
                                    type="submit"
                                    disabled={submittingReview}
                                    className="w-full md:w-auto px-8 py-3.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm tracking-wide transition-all active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_5px_20px_rgba(59,130,246,0.3)] hover:shadow-[0_5px_25px_rgba(59,130,246,0.5)]"
                                >
                                    {submittingReview ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            Post Review
                                            <Send className="w-4 h-4 ml-1" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="text-center py-12 relative z-10">
                            <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
                                <Users className="w-8 h-8 text-gray-400" />
                            </div>
                            <h4 className="text-white text-2xl font-black mb-3 tracking-tight">Have you taken this trip?</h4>
                            <p className="text-gray-400 text-sm mb-8 font-light max-w-md mx-auto leading-relaxed">Please log in to share your rating and authentic experience with other travelers in our community.</p>
                            <button
                                onClick={onRequestAuth}
                                className="px-10 py-4 rounded-full bg-white text-black hover:bg-gray-200 font-bold text-sm tracking-wide transition-all hover:scale-105 active:scale-95 shadow-xl"
                            >
                                Login to Review
                            </button>
                        </div>
                    )}
                </div>

                {/* Review Feed list (Masonry Layout) */}
                <div className="w-full">
                    {loadingReviews ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-12 h-12 border-[3px] border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        </div>
                    ) : reviews.length === 0 ? (
                        <div className="text-center py-20 border border-dashed border-white/10 rounded-[2.5rem] bg-[#0a0a0a]">
                            <p className="text-gray-500 text-base font-medium tracking-wide">No reviews yet for this trip. Be the first to leave one!</p>
                        </div>
                    ) : (
                        <div className="columns-1 md:columns-2 lg:columns-2 gap-6 space-y-6">
                            {reviews.map((review) => (
                                <div 
                                    key={review.id} 
                                    className="break-inside-avoid bg-[#111] border border-white/5 p-8 rounded-[2rem] flex flex-col gap-5 group hover:bg-[#151515] hover:border-white/10 transition-all duration-500 hover:shadow-[0_10px_40px_rgba(0,0,0,0.5)] hover:-translate-y-1 relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none transition-opacity duration-500 group-hover:opacity-10">
                                        <Star className="w-24 h-24 text-white" />
                                    </div>
                                    <div className="flex items-start justify-between gap-4 relative z-10">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-blue-600/20 to-emerald-600/20 border border-white/10 flex items-center justify-center text-white font-bold text-xl shadow-inner">
                                                {(review.user_name || 'V').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <h4 className="text-white font-bold text-lg tracking-tight">{review.user_name || 'Verified Traveler'}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <div className="bg-[#003B95] text-white text-xs font-bold px-1.5 py-0.5 rounded-t-md rounded-br-md shadow-[0_0_10px_rgba(0,59,149,0.5)]">
                                                        {formatRating(Number(review.rating))}
                                                    </div>
                                                    <span className="text-xs font-bold text-gray-300 ml-1">{getRatingWord(Number(review.rating))}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-gray-300 text-base leading-relaxed font-light mt-2 relative z-10">
                                        "{review.content}"
                                    </p>
                                    
                                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between relative z-10">
                                        {(review.is_verified || review.is_verified === undefined || review.id < 0) ? (
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                Verified Booking
                                            </div>
                                        ) : <div/>}
                                        <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest">
                                            {formatReviewDate(review.created_at)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Image Gallery */}
            {experience.image_urls && experience.image_urls.length > 1 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="pt-8"
                >
                    <h2 className="text-2xl font-bold text-white tracking-tight mb-6">Visuals</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {experience.image_urls.map((url, idx) => (
                            <div key={idx} className={`rounded-2xl overflow-hidden aspect-square ${idx === 0 ? 'hidden' : ''}`}>
                                <OptimizedImage 
                                    src={url} 
                                    alt={`Gallery ${idx}`}
                                    className="w-full h-full object-cover hover:scale-110 transition-transform duration-700"
                                />
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* You Might Also Like Section */}
            {relatedExperiences.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="pt-12 mt-12 border-t border-white/5"
                >
                    <div className="flex items-center gap-3 mb-8">
                        <Sparkles className="w-8 h-8 text-blue-400" />
                        <div>
                            <h2 className="text-3xl font-black text-white tracking-tight">You Might Also Like</h2>
                            <p className="text-gray-400 text-sm mt-1">Similar experiences handpicked for you</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {relatedExperiences.map(exp => (
                            <motion.div 
                                key={exp.id} 
                                onClick={() => {
                                    if (onSelectExperience) {
                                        onSelectExperience(exp);
                                    }
                                }}
                                whileHover={{ y: -8 }}
                                className="group cursor-pointer flex flex-col gap-4 relative"
                            >
                                {/* Image */}
                                <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-gray-900 shadow-xl border border-white/5">
                                    <OptimizedImage 
                                        src={exp.image_urls?.[0] || 'https://images.unsplash.com/photo-1542314831-c6a4d14d8c81?auto=format&fit=crop&q=80&w=800'}
                                        alt={exp.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out opacity-80 group-hover:opacity-100"
                                    />
                                    
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-500" />

                                    {/* Status Badge */}
                                    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                                        {exp.status === 'sold_out' ? (
                                            <div className="bg-black/80 backdrop-blur-md border border-white/10 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-xl">
                                                Sold Out
                                            </div>
                                        ) : exp.available_spots <= 5 ? (
                                            <div className="bg-red-500/90 backdrop-blur-md border border-red-400/50 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-xl animate-pulse">
                                                Only {exp.available_spots} left
                                            </div>
                                        ) : (
                                            <div className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-xl">
                                                Available
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Price Tag (bottom right inside image) */}
                                    <div className="absolute bottom-4 right-4 z-10">
                                        <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-1 shadow-lg">
                                            <span className="text-white font-black text-lg">₹{Number(exp.price).toLocaleString()}</span>
                                            <span className="text-gray-400 text-xs font-medium">/pp</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex flex-col px-1">
                                    <div className="flex items-center text-blue-400 text-[11px] font-bold tracking-widest uppercase gap-1.5 mb-2">
                                        <MapPin className="w-3.5 h-3.5" />
                                        <span>{exp.destination}</span>
                                    </div>
                                    
                                    <h3 className="text-xl font-bold text-white leading-tight group-hover:text-blue-400 transition-colors line-clamp-2">
                                        {exp.title}
                                    </h3>
                                    
                                    <div className="flex items-center justify-between mt-4 border-t border-white/5 pt-4">
                                        <div className="flex items-center text-gray-400 text-sm font-medium gap-1.5">
                                            <Calendar className="w-4 h-4 text-gray-500" />
                                            <span>{format(new Date(exp.start_date), 'MMM d')} - {format(new Date(exp.end_date), 'MMM d')}</span>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                            <ArrowRight className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}

        </div>

        {/* Right Column: Sticky Booking Card */}
        <div className="relative">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                className="sticky top-32 bg-[#111111] border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl flex flex-col gap-6 sm:gap-8"
            >
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Package Price</span>
                        <div className="flex items-baseline gap-1.5 sm:gap-2">
                            <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">₹{Number(experience.price).toLocaleString()}</span>
                            <span className="text-sm sm:text-base text-gray-500 font-medium">/ person</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">Or 3 interest-free parts of <strong className="text-white font-bold">₹{Math.ceil(experience.price / 3).toLocaleString()}</strong></p>
                    </div>
                    {experience.available_spots <= 10 && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap">
                            <Sparkles className="w-3.5 h-3.5" />
                            {experience.available_spots} spots left
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-4 bg-black/30 p-3 sm:p-4 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3 sm:gap-4 text-gray-300">
                        <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center border border-white/5 shrink-0">
                            <Calendar className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Departure ({experience.departure_location || 'Point'})</span>
                            <span className="text-sm font-medium truncate">
                                {format(new Date(experience.start_date), 'EEEE, MMM d')} • {experience.start_time || '10:00 PM'}
                            </span>
                        </div>
                    </div>
                    <div className="h-[1px] w-full bg-white/5" />
                    <div className="flex items-center gap-3 sm:gap-4 text-gray-300">
                        <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center border border-white/5 shrink-0">
                            <Clock className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Return ({experience.departure_location || 'Point'})</span>
                            <span className="text-sm font-medium truncate">
                                {format(new Date(experience.end_date), 'EEEE, MMM d')} • {experience.end_time || '8:00 PM'}
                            </span>
                        </div>
                    </div>
                    {experience.map_link && (
                        <>
                            <div className="h-[1px] w-full bg-white/5" />
                            <a href={experience.map_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 sm:gap-4 text-blue-400 hover:text-blue-300 transition-colors">
                                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                                    <MapPin className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-xs text-blue-400/80 font-bold uppercase tracking-wider">Boarding Point Location</span>
                                    <span className="text-sm font-medium truncate underline underline-offset-2">View on Google Maps</span>
                                </div>
                            </a>
                        </>
                    )}
                </div>

                <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 p-3 sm:p-4 rounded-2xl">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-xs sm:text-sm text-emerald-300 font-medium leading-relaxed">
                        <strong className="text-emerald-400 block mb-1">Zero PTO Required</strong>
                        Pick-ups available across major IT Hubs (Silk Board, Marathahalli, Electronic City, Manyata).
                    </p>
                </div>

                {/* What's Included Quick Visual */}
                <div className="flex items-center justify-between border-y border-white/5 py-4 my-2">
                    <div className="flex flex-col items-center gap-1.5 text-center w-1/4">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14.5a3 3 0 0 0 6 0 3 3 0 0 0-6 0Z"/><path d="M14 14.5a3 3 0 0 0 6 0 3 3 0 0 0-6 0Z"/><path d="M14 14.5V8a4 4 0 0 0-8 0v6.5"/><path d="M22 14.5v-3a2 2 0 0 0-2-2h-3"/><path d="M11 6V2"/></svg>
                        </div>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-tight">AC<br/>Travel</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 text-center w-1/4">
                        <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-orange-400" />
                        </div>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-tight">Scenic<br/>Stay</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 text-center w-1/4">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                            <Activity className="w-4 h-4 text-emerald-400" />
                        </div>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-tight">Expert<br/>Guide</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 text-center w-1/4">
                        <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 10h16"/><path d="M4 14h16"/><path d="M12 4v16"/></svg>
                        </div>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-tight">4<br/>Meals</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Number of Travelers</label>
                    <div className="flex items-center justify-between p-2 border border-white/10 rounded-2xl bg-black/50">
                        <button 
                            className="w-12 h-12 rounded-xl bg-[#1a1a1a] border border-white/5 hover:bg-[#222] hover:border-white/20 flex items-center justify-center text-gray-400 hover:text-white text-2xl font-light transition-all active:scale-95 disabled:opacity-50"
                            onClick={() => setNumTickets(Math.max(1, numTickets - 1))}
                            disabled={numTickets <= 1}
                        >
                            -
                        </button>
                        <div className="flex-1 text-center font-black text-white text-xl">
                            {numTickets}
                        </div>
                        <button 
                            className="w-12 h-12 rounded-xl bg-[#1a1a1a] border border-white/5 hover:bg-[#222] hover:border-white/20 flex items-center justify-center text-gray-400 hover:text-white text-2xl font-light transition-all active:scale-95 disabled:opacity-50"
                            onClick={() => setNumTickets(Math.min(experience.available_spots, numTickets + 1))}
                            disabled={numTickets >= experience.available_spots}
                        >
                            +
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-2 pt-4 border-t border-white/5">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">₹{Number(experience.price).toLocaleString()} x {numTickets} travelers</span>
                        <span className="text-white font-medium">₹{(experience.price * numTickets).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Taxes & Fees</span>
                        <span className="text-emerald-400 font-medium">Included</span>
                    </div>
                    <div className="flex justify-between py-4 mt-2 border-t border-white/5">
                        <span className="font-bold text-gray-300 text-lg">Total</span>
                        <span className="font-black text-white text-2xl">₹{(experience.price * numTickets).toLocaleString()}</span>
                    </div>
                </div>

                <button
                    onClick={handleBook}
                    disabled={bookingStatus === 'loading' || experience.status === 'sold_out'}
                    className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] relative overflow-hidden group"
                >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                    <span className="relative flex items-center gap-2">
                        {bookingStatus === 'loading' ? (
                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : experience.status === 'sold_out' ? (
                            'Sold Out'
                        ) : (
                            <>
                                Reserve Your Spot <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </span>
                </button>

                <button
                    onClick={() => {
                        const url = window.location.href;
                        const text = `Check out this weekend getaway to ${experience.title}! Zero PTO required (Fri 10PM - Sun 8PM). Let's go together!`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`, '_blank');
                    }}
                    className="w-full h-12 rounded-2xl bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                    Pitch to Friends on WhatsApp
                </button>

                <button
                    onClick={() => {
                        window.location.href = "mailto:corporate@encho.com?subject=Team Outing Request: " + experience.title;
                    }}
                    className="w-full h-12 rounded-2xl bg-[#1a1a1a] hover:bg-[#222] border border-white/10 hover:border-white/20 text-gray-300 hover:text-white font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                    <Users className="w-4 h-4 text-blue-400" />
                    Planning a Team Outing?
                </button>

                <div className="flex flex-col gap-3 mt-1">
                    <div className="flex items-center justify-center gap-3 py-3 border-b border-white/5 mb-1">
                        <div className="flex -space-x-2">
                            <img src="https://i.pravatar.cc/100?img=1" className="w-6 h-6 rounded-full border border-[#111]" alt="Traveler" />
                            <img src="https://i.pravatar.cc/100?img=5" className="w-6 h-6 rounded-full border border-[#111]" alt="Traveler" />
                            <img src="https://i.pravatar.cc/100?img=8" className="w-6 h-6 rounded-full border border-[#111]" alt="Traveler" />
                        </div>
                        <span className="text-[11px] font-medium text-gray-400">Join 12 IT Professionals from Blr</span>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-xs font-medium text-gray-300 tracking-wide bg-black/40 py-2 rounded-xl border border-white/5">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        Secure payment • Instantly confirmed
                    </div>
                    <div className="flex items-start justify-center gap-2 text-center text-[11px] text-gray-400 font-medium px-2 py-1">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>
                            {experience.cancellation_policy || (
                                <>Free cancellation up to 48 hrs before departure.<br className="hidden md:block" /> 100% full refund guaranteed.</>
                            )}
                        </span>
                    </div>
                </div>
            </motion.div>
        </div>
      </div>

      {/* Mobile Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#111] border-t border-white/10 p-3 pb-6 z-50 flex flex-col gap-3 lg:hidden shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
          <div className="w-full flex items-center justify-between text-[11px] font-bold text-emerald-400 tracking-wider bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> CONFIRMED TRIP</span>
              <span>{format(new Date(experience.start_date), 'E')} {experience.start_time || '10PM'} - {format(new Date(experience.end_date), 'E')} {experience.end_time || '8PM'}</span>
          </div>
          <div className="flex items-center gap-3">
              <button 
                  onClick={() => {
                      const url = window.location.href;
                      const text = `Check out this weekend getaway to ${experience.title}! Zero PTO required. Let's go together!`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`, '_blank');
                  }}
                  className="w-12 h-12 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl flex items-center justify-center shrink-0 transition-colors active:bg-green-500/20"
              >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
              </button>
              <div className="flex flex-col flex-shrink-0 min-w-[90px]">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Price</span>
                  <span className="text-xl font-black text-white">₹{(experience.price * numTickets).toLocaleString()}</span>
              </div>
              <button 
                disabled={experience.status === 'sold_out' || bookingStatus === 'loading'}
                onClick={() => {
                    if (user) {
                        if (experience.target_audience === 'students' || experience.target_audience === 'women_only') {
                            setShowVerificationModal(true);
                        } else {
                            setShowCheckout(true);
                        }
                    } else {
                        document.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { reason: 'booking' } }));
                    }
                }}
                className="flex-1 h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-base transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                 {bookingStatus === 'loading' ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : experience.status === 'sold_out' ? (
                      'Sold Out'
                  ) : (
                      <>
                          Reserve Spot
                      </>
                  )}
              </button>
          </div>
      </div>

      <AnimatePresence>
        {showVerificationModal && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                <div className="bg-[#111] border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative p-6">
                    <button onClick={() => setShowVerificationModal(false)} className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors z-10 text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                    
                    <div className="mb-6 flex flex-col items-center text-center">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${experience.target_audience === 'students' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-pink-500/10 text-pink-400'}`}>
                            {experience.target_audience === 'students' ? <CheckCircle2 className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">
                            {experience.target_audience === 'students' ? 'Student Verification' : 'Women-Only Verification'}
                        </h2>
                        <p className="text-sm text-gray-400">
                            {experience.target_audience === 'students' 
                                ? 'This is a subsidized batch exclusively for Bangalore college students. Please verify your College ID to proceed to payment.'
                                : 'For maximum safety and peace of mind, this trip is exclusively for women. Please upload a valid Govt ID to proceed.'}
                        </p>
                    </div>

                    <div className="border-2 border-dashed border-white/10 hover:border-white/20 rounded-2xl p-8 flex flex-col items-center justify-center bg-black/30 transition-colors mb-6 cursor-pointer">
                        <Camera className="w-8 h-8 text-gray-500 mb-3" />
                        <span className="text-sm font-bold text-white mb-1">Click to Upload ID</span>
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">JPG, PNG, PDF</span>
                    </div>
                    
                    <button 
                        onClick={() => {
                            setShowVerificationModal(false);
                            setShowCheckout(true);
                            addToast("ID Verified Temporarily (Demo)", "success");
                        }}
                        className={`w-full py-3.5 rounded-xl text-sm font-bold transition-transform active:scale-[0.98] ${
                            experience.target_audience === 'students' 
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                                : 'bg-pink-600 hover:bg-pink-500 text-white'
                        }`}
                    >
                        Submit & Continue to Payment
                    </button>
                    <p className="text-center text-[10px] text-gray-500 mt-4 px-4 leading-tight">
                        By uploading, you consent to our verification process. Docs are deleted after 24 hrs.
                    </p>
                </div>
            </div>
        )}
        {showCheckout && (
            <CheckoutModal
                isOpen={showCheckout}
                onClose={() => setShowCheckout(false)}
                amount={experience.price * numTickets}
                                onSuccess={() => handleCheckoutSuccess("")}
            />
        )}
        {showLobby && (
          <TravelerLobby 
            experience={experience} 
            onClose={() => setShowLobby(false)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isLobbyEligible && !showLobby && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 lg:bottom-6 left-4 lg:left-6 z-50"
          >
            <button
              onClick={() => setShowLobby(true)}
              className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3.5 rounded-full shadow-[0_10px_30px_rgba(59,130,246,0.4)] font-bold transition-all hover:scale-105 active:scale-95 group"
            >
              <div className="relative">
                <Users className="w-5 h-5" />
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-blue-600 animate-pulse" />
              </div>
              <span className="tracking-wide">Traveler Lobby</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
            {selectedPlace && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-[#0a0a0a] border border-white/10 rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden relative shadow-2xl scrollbar-hide"
                    >
                        <button onClick={() => setSelectedPlace(null)} className="absolute top-6 right-6 z-10 p-3 bg-black/50 hover:bg-black/80 rounded-full text-white border border-white/10 backdrop-blur-md transition-all hover:scale-105">
                            <X className="w-5 h-5" />
                        </button>
                        
                        <div className="relative w-full aspect-video md:aspect-[21/9] bg-black">
                            {selectedPlace.video ? (
                                <video 
                                    src={selectedPlace.video} 
                                    autoPlay 
                                    loop 
                                    muted 
                                    playsInline 
                                    className="w-full h-full object-cover opacity-80"
                                />
                            ) : (
                                <OptimizedImage src={selectedPlace.image} alt={selectedPlace.title} className="w-full h-full object-cover opacity-80" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-black/30" />
                            <div className="absolute bottom-6 left-6 md:bottom-8 md:left-8">
                                <div className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-blue-400 mb-3 bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/20 w-fit">
                                    <MapPin className="w-4 h-4" />
                                    {selectedPlace.location}
                                </div>
                                <h2 className="text-3xl md:text-5xl font-bold text-white mb-2">{selectedPlace.title}</h2>
                            </div>
                        </div>

                        <div className="p-6 md:p-10">
                            <p className="text-gray-300 text-lg leading-relaxed font-light mb-10">
                                {selectedPlace.details || selectedPlace.description}
                            </p>
                            
                            {selectedPlace.gallery && selectedPlace.gallery.length > 0 && (
                                <>
                                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                        <Camera className="w-5 h-5 text-blue-400" />
                                        Photo Gallery
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {selectedPlace.gallery?.map((img: string, idx: number) => (
                                            <div key={idx} className="rounded-2xl overflow-hidden aspect-[4/3] border border-white/5 relative group">
                                                <OptimizedImage src={img} alt={`Gallery ${idx}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
      </AnimatePresence>

      <AnimatePresence>
            {selectedStay && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-[#0a0a0a] border border-white/10 rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden relative shadow-2xl scrollbar-hide"
                    >
                        <button onClick={() => setSelectedStay(null)} className="absolute top-6 right-6 z-10 p-3 bg-black/50 hover:bg-black/80 rounded-full text-white border border-white/10 backdrop-blur-md transition-all hover:scale-105">
                            <X className="w-5 h-5" />
                        </button>
                        
                        <div className="relative w-full aspect-video md:aspect-[21/9] bg-black">
                            {selectedStay.video ? (
                                <video 
                                    src={selectedStay.video} 
                                    autoPlay 
                                    loop 
                                    muted 
                                    playsInline 
                                    className="w-full h-full object-cover opacity-80"
                                />
                            ) : (
                                <OptimizedImage src={selectedStay.image} alt={selectedStay.title} className="w-full h-full object-cover opacity-80" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-black/30" />
                            <div className="absolute bottom-6 left-6 md:bottom-8 md:left-8">
                                <div className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-emerald-400 mb-3 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 w-fit">
                                    <Star className="w-4 h-4" />
                                    Premium Accommodation
                                </div>
                                <h2 className="text-3xl md:text-5xl font-bold text-white mb-2">{selectedStay.title}</h2>
                                <div className="flex items-center gap-2 text-gray-300 font-medium">
                                    <MapPin className="w-4 h-4 text-gray-400" />
                                    {selectedStay.location}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 md:p-10">
                            <div className="flex flex-wrap gap-3 mb-10">
                                {selectedStay.amenities?.map((amenity: string, idx: number) => (
                                    <span key={idx} className="px-5 py-2.5 rounded-full bg-[#111] border border-white/10 text-sm font-bold tracking-wide text-gray-200 flex items-center gap-2 shadow-sm">
                                        <Check className="w-4 h-4 text-emerald-500" />
                                        {amenity}
                                    </span>
                                ))}
                            </div>

                            <p className="text-gray-300 text-lg leading-relaxed font-light mb-10 border-l-2 border-emerald-500/50 pl-6">
                                {selectedStay.long_description || selectedStay.description}
                            </p>
                            
                            {selectedStay.gallery && selectedStay.gallery.length > 0 && (
                                <>
                                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                        <Camera className="w-5 h-5 text-emerald-400" />
                                        Property Showcase
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {selectedStay.gallery?.map((img: string, idx: number) => (
                                            <div key={idx} className="rounded-2xl overflow-hidden aspect-[4/3] border border-white/5 relative group">
                                                <OptimizedImage src={img} alt={`Stay ${idx}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
      </AnimatePresence>
    </div>
    </>
  );
};

