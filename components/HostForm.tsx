import React, { useState, useRef, useEffect } from 'react';
import { Listing, Room } from '../types';
import { ChevronLeft, ChevronRight, ShieldCheck } from './Icons';
import { LocationPicker } from './LocationPicker';
import { PhotoUpload, PhotoData } from './PhotoUpload';
import { AmenitiesPicker } from './AmenitiesPicker';
import { useAuth } from './AuthContext';
import { 
  Building2, Home, Trees, Tractor, Coffee, Ship, Tent, Caravan, Castle, Mountain, Box, Circle, Leaf, 
  X, Eye, Maximize2, Sparkles, Check, CheckCircle2, Bed, Users, Trash2, Globe, Settings, MapPin, 
  Smartphone, Laptop, ExternalLink, Video, Compass, AlertCircle, Info, DollarSign
} from 'lucide-react';
import { useToast } from './ToastContext';
import { useCurrency } from './CurrencyContext';
import ListingDetails from './ListingDetails';
import { motion, AnimatePresence } from 'framer-motion';
import { queueCustomMutation } from '../lib/syncService';

interface HostFormProps {
  onBack: () => void;
  onSuccess: () => void;
  existingListing?: Listing;
}

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
];

const STEPS = [
  { id: 1, name: 'Basics', label: 'Basics & Category', desc: 'Title, category, description' },
  { id: 2, name: 'Location', label: 'Location & Map', desc: 'Address & spatial location' },
  { id: 3, name: 'Spaces', label: 'Spaces & Layout', desc: 'Rental mode & subunit builder' },
  { id: 4, name: 'Amenities', label: 'Amenities', desc: 'Features, photos, assets' },
  { id: 5, name: 'Pricing', label: 'Pricing & Rules', desc: 'Base prices & peak multipliers' },
  { id: 6, name: 'SEO', label: 'SEO Settings', desc: 'Google Search preview card' },
];

const HostForm: React.FC<HostFormProps> = ({ onBack, onSuccess, existingListing }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { formatPrice } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [previewFidelity, setPreviewFidelity] = useState<'desktop' | 'mobile'>('desktop');
  
  // Collapse state for each added subunit room
  const [expandedRoomIndices, setExpandedRoomIndices] = useState<Record<number, boolean>>({ 0: true });

  const [formData, setFormData] = useState({
    title: existingListing?.title || '',
    description: existingListing?.description || '',
    videoUrl: existingListing?.video_url || '',
    price: existingListing?.price?.toString() || '',
    type: existingListing?.type || 'Apartment',
    rentalMode: existingListing?.rental_mode || 'entire_place',
    rooms: existingListing?.rooms?.map((room: any) => ({
      ...room,
      photos: room.imageUrls ? room.imageUrls.map((url: string) => ({
        id: Math.random().toString(36).substring(2, 9),
        previewUrl: url
      })) : []
    })) || ([] as any[]),
    address: existingListing?.address || '',
    city: existingListing?.city || 'Berlin',
    maxGuests: existingListing?.maxGuests || 2,
    bedrooms: existingListing?.bedrooms || 1,
    beds: existingListing?.beds || 1,
    bathrooms: existingListing?.bathrooms || 1,
    amenities: existingListing?.amenities || ([] as string[]),
    lat: existingListing?.lat || 52.5200,
    lng: existingListing?.lng || 13.4050,
    seo_title: existingListing?.seo_title || '',
    seo_description: existingListing?.seo_description || '',
    seo_keywords: existingListing?.seo_keywords || '',
    seo_image_url: existingListing?.seo_image_url || '',
    dynamicPricing: existingListing?.dynamicPricing || { weekendMultiplier: 1.0, seasonalMultiplier: 1.0 }
  });
  
  const [photos, setPhotos] = useState<PhotoData[]>(() => {
    const urls = (existingListing?.imageUrls && existingListing.imageUrls.length > 0) 
        ? existingListing.imageUrls 
        : (existingListing?.imageUrl ? [existingListing.imageUrl] : []);
    return urls.map((url: string) => ({
      id: Math.random().toString(36).substring(2, 9),
      previewUrl: url
    }));
  });

  const [showMobilePreview, setShowMobilePreview] = useState(false);

  // Parse video URL to check if it is YouTube or Vimeo
  const getYoutubeOrVimeoDetails = (url: string) => {
    if (!url) return null;
    const ytReg = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/||user\/[^/]+\/)|youtu\.be\/)([^"&?/ ]{11})/;
    const ytMatch = url.match(ytReg);
    if (ytMatch) return { type: 'YouTube', id: ytMatch[1] };

    const vimeoReg = /vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/;
    const vimeoMatch = url.match(vimeoReg);
    if (vimeoMatch) return { type: 'Vimeo', id: vimeoMatch[3] };

    if (url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm')) {
      return { type: 'Direct MP4/WebM File', id: 'direct' };
    }

    return null;
  };

  const videoDetails = getYoutubeOrVimeoDetails(formData.videoUrl);

  const mockListing: Listing = {
    id: existingListing?.id || 'preview-id',
    host_id: user?.id || 'host-id',
    title: formData.title || 'Your property title',
    description: formData.description || 'Description will appear here...',
    price: parseFloat(formData.price) || 0,
    currency: 'INR',
    
    address: formData.address || 'Address',
    lat: formData.lat || 52.52,
    lng: formData.lng || 13.40,
    imageUrls: photos.map(p => p.previewUrl),
    imageUrl: photos.length > 0 ? photos[0].previewUrl : '',
    imageCount: photos.length,
    type: formData.type || 'Apartment',
    maxGuests: formData.maxGuests,
    bedrooms: formData.bedrooms,
    beds: formData.beds,
    bathrooms: formData.bathrooms,
    amenities: formData.amenities,
    rating: existingListing?.rating || 0,
    reviewCount: existingListing?.reviewCount || 0,
    isVerified: existingListing?.isVerified || false,
    rental_mode: formData.rentalMode as any,
    rooms: formData.rooms as any,
    video_url: formData.videoUrl,
    created_at: existingListing?.created_at || new Date().toISOString(),
    updated_at: existingListing?.updated_at || new Date().toISOString(),
    seo_title: formData.seo_title,
    seo_description: formData.seo_description,
    seo_keywords: formData.seo_keywords,
    seo_image_url: formData.seo_image_url,
    dynamicPricing: formData.dynamicPricing,
  };

  // Perform active preview scrolling when focused or when step changes
  const handleFocus = (sectionName: string) => {
      const previewContainer = document.getElementById('preview-container-content');
      if (!previewContainer) return;

      if (sectionName === 'Photos' || sectionName === 'Basics' || sectionName === 'Step1') {
          previewContainer.scrollTo({ top: 0, behavior: 'smooth' });
          return;
      }

      let searchStr = sectionName.toLowerCase();
      if (sectionName === 'Amenities' || sectionName === 'Step4') searchStr = 'what this place offers';
      if (sectionName === 'Location' || sectionName === 'Step2') searchStr = 'where you';
      if (sectionName === 'Configuration' || sectionName === 'Step3') searchStr = 'spatial configuration';
      if (sectionName === 'Pricing' || sectionName === 'Step5') {
          const bookingCard = previewContainer.querySelector('#booking-card');
          if (bookingCard) {
              bookingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return;
          }
          searchStr = 'price';
      }

      const headings = Array.from(previewContainer.querySelectorAll('h1, h2, h3, h4'));
      const target = headings.find(el => el.textContent?.toLowerCase().includes(searchStr));

      if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
  };

  // Handle focusing live preview automatically on step transitions
  useEffect(() => {
    if (currentStep === 1) handleFocus('Step1');
    if (currentStep === 2) handleFocus('Step2');
    if (currentStep === 3) handleFocus('Step3');
    if (currentStep === 4) handleFocus('Step4');
    if (currentStep === 5) handleFocus('Step5');
  }, [currentStep]);

  const handleLocationChange = (updates: { address: string; city: string; lat?: number; lng?: number }) => {
    setFormData(prev => ({
      ...prev,
      ...updates
    }));
  };

  const handleAmenitiesChange = (amenities: string[]) => {
    setFormData(prev => ({ ...prev, amenities }));
  };

  const handleAddRoom = () => {
    const newIndex = formData.rooms.length;
    setFormData(prev => ({
      ...prev,
      rooms: [...prev.rooms, { 
        id: Math.random().toString(36).substring(2, 9), 
        name: `Luxury Suite ${prev.rooms.length + 1}`, 
        price: parseFloat(formData.price) ? Math.round(parseFloat(formData.price) / 2) : 5000, 
        capacity: 2, 
        bedrooms: 1,
        beds: 1,
        inventory_count: 1,
        hasAttachedBathroom: true, 
        hasAc: true, 
        amenities: ['King Bed', 'En-suite Bathroom', 'Ocean View'], 
        photos: [] 
      }]
    }));
    // Expand the newly added room and collapse others
    setExpandedRoomIndices({ [newIndex]: true });
  };

  const handleRemoveRoom = (index: number) => {
    setFormData(prev => ({
      ...prev,
      rooms: prev.rooms.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateRoom = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const newRooms = [...prev.rooms];
      newRooms[index] = { ...newRooms[index], [field]: value };
      return { ...prev, rooms: newRooms };
    });
  };

  const toggleExpandRoom = (index: number) => {
    setExpandedRoomIndices(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const validateStep = (stepNum: number) => {
    if (stepNum === 1) {
      if (!formData.title || formData.title.trim().length < 5) {
        addToast("Validation Error", "Please provide an expressive title (at least 5 characters).", "warning");
        return false;
      }
      if (!formData.description || formData.description.trim().length < 10) {
        addToast("Validation Error", "Please write a comprehensive description (at least 10 characters).", "warning");
        return false;
      }
    }
    if (stepNum === 2) {
      if (!formData.address || !formData.city) {
        addToast("Validation Error", "Please select a verified location address.", "warning");
        return false;
      }
    }
    if (stepNum === 3) {
      if ((formData.rentalMode === 'private_rooms' || formData.rentalMode === 'hybrid') && formData.rooms.length === 0) {
        addToast("Validation Error", "Please configure at least one individual bookable room unit for room rental mode.", "warning");
        return false;
      }
    }
    if (stepNum === 4) {
      if (photos.length === 0 && !existingListing?.imageUrl) {
        addToast("Validation Error", "Please upload at least one main listing photo.", "warning");
        return false;
      }
    }
    if (stepNum === 5) {
      if (formData.rentalMode !== 'private_rooms') {
        const parsedPrice = parseFloat(formData.price);
        if (isNaN(parsedPrice) || parsedPrice <= 0) {
          addToast("Validation Error", "Please specify a valid base price.", "warning");
          return false;
        }
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(6, prev + 1));
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(prev => Math.max(1, prev - 1));
  };

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
        const { uploadUrl, fileUrl } = await presignRes.json();
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'image/webp' },
          body: file,
        });
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
        const data = await res.json();
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
    for (let i = 1; i <= 5; i++) {
      if (!validateStep(i)) {
        setCurrentStep(i);
        return;
      }
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const uploadedImageUrls: string[] = [];
      for (const photo of photos) {
        const url = await resolveAndUploadPhoto(photo);
        if (url && !url.startsWith('blob:')) {
          uploadedImageUrls.push(url);
        }
      }

      const processedRooms = await Promise.all(
        formData.rooms.map(async (room: any) => {
          const roomPhotoUrls: string[] = [];
          if (room.photos && Array.isArray(room.photos)) {
            for (const rp of room.photos) {
              const url = await resolveAndUploadPhoto(rp);
              if (url && !url.startsWith('blob:')) {
                roomPhotoUrls.push(url);
              }
            }
          } else if (room.imageUrls && Array.isArray(room.imageUrls)) {
            roomPhotoUrls.push(...room.imageUrls);
          }
          return {
            ...room,
            imageUrls: roomPhotoUrls,
            imageUrl: roomPhotoUrls[0] || ''
          };
        })
      );

      const payload = {
        title: formData.title,
        description: formData.description,
        price: parseFloat(formData.price) || 0,
        type: formData.type,
        address: formData.address,
        city: formData.city,
        imageUrl: uploadedImageUrls[0] || '',
        imageUrls: uploadedImageUrls,
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
        dynamicPricing: formData.dynamicPricing
      };

      const endpoint = existingListing?.id ? `/api/listings/${existingListing.id}` : '/api/listings';
      const method = existingListing?.id ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save listing');
      }

      addToast("Success", existingListing ? "Property successfully updated!" : "Property successfully published!", "success");
      setSubmitted(true);
      setTimeout(() => {
        onSuccess();
        onBack();
      }, 2000);
    } catch (error: any) {
      console.error('Failed to list space:', error);
      addToast("Upload Failed", error.message || 'Failed to publish property listing.', "error");
    } finally {
      setLoading(false);
    }
  };

    if (submitted) {
      return (
          <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-center text-zinc-100">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 bg-[#0284C7]/20 border border-[#0284C7] rounded-full flex items-center justify-center mb-6"
              >
                  <ShieldCheck className="w-10 h-10 text-[#0284C7]" />
              </motion.div>
              <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
                {existingListing ? 'Property Updated!' : 'Property Published Successfully!'}
              </h1>
              <p className="text-zinc-400 max-w-md mx-auto text-sm leading-relaxed">
                {existingListing 
                  ? "Your luxury real estate alterations have been registered and successfully written to the distributed ledger." 
                  : "Your architectural masterpiece is now published. Guests will be redirected to the exploration dashboard shortly."}
              </p>
          </div>
      );
  }

  // Calculate percentage of progress for the beautiful top progress indicator
  const progressPercent = Math.round((currentStep / STEPS.length) * 100);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-neutral-950 flex flex-col font-sans">
      
      {/* Premium Sleek Control Bar */}
      <header className="sticky top-0 z-50 bg-white dark:bg-neutral-900 border-b border-zinc-200 dark:border-neutral-800 px-4 md:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-zinc-100 dark:hover:bg-neutral-800 rounded-full transition-colors cursor-pointer text-zinc-900 dark:text-zinc-100">
                <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-base font-bold text-zinc-900 dark:text-white tracking-tight leading-none">
                {existingListing ? 'Revise Luxury Listing' : 'Setup Masterful Listing'}
              </h1>
              <p className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7] mt-1">Host Portal Engine</p>
            </div>
        </div>
        
        {/* Step Indicator Badges (Large Screens) */}
        <div className="hidden lg:flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          <span>Step {currentStep} of {STEPS.length}</span>
          <span className="text-zinc-300 dark:text-neutral-700">|</span>
          <span className="text-zinc-900 dark:text-white font-extrabold">{STEPS[currentStep - 1].name}</span>
        </div>

        <div className="flex items-center gap-4">
            <button onClick={onBack} type="button" className="px-5 py-2 font-bold text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer">
              Abort
            </button>
            <button 
              form="host-form" 
              type="submit" 
              disabled={loading || isCompressing} 
              className="px-6 py-2.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-50 cursor-pointer"
            >
                {isCompressing ? 'Compressing...' : loading ? 'Saving...' : existingListing ? 'Save Master' : 'Publish Master'}
            </button>
        </div>
      </header>

      {/* Elegant Multi-Step Stepper & Progress Ribbon */}
      <div className="w-full bg-white dark:bg-neutral-900 border-b border-zinc-100 dark:border-neutral-800/50 py-3 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Progress bar info */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full border border-zinc-200 dark:border-neutral-700 flex items-center justify-center font-mono font-extrabold text-sm text-zinc-800 dark:text-zinc-200">
              {progressPercent}%
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Setup Progress</div>
              <div className="text-sm font-extrabold text-zinc-900 dark:text-white mt-0.5">{STEPS[currentStep - 1].label}</div>
            </div>
          </div>

          {/* Stepper Dots/Cards */}
          <div className="flex items-center flex-1 justify-end max-w-4xl gap-2 md:gap-4 overflow-x-auto no-scrollbar py-1">
            {STEPS.map(st => {
              const isActive = st.id === currentStep;
              const isCompleted = st.id < currentStep;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    // Jump to step if previous is validated
                    let valid = true;
                    for (let i = 1; i < st.id; i++) {
                      if (!validateStep(i)) {
                        valid = false;
                        setCurrentStep(i);
                        break;
                      }
                    }
                    if (valid) setCurrentStep(st.id);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-left transition-all shrink-0 cursor-pointer ${
                    isActive 
                      ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-neutral-800 text-zinc-900 dark:text-white font-extrabold shadow-sm' 
                      : isCompleted 
                        ? 'border-emerald-200 dark:border-emerald-950/40 bg-emerald-50/50 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400' 
                        : 'border-zinc-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-extrabold ${
                    isActive 
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900' 
                      : isCompleted 
                        ? 'bg-emerald-500 text-white' 
                        : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-400 dark:text-zinc-500'
                  }`}>
                    {isCompleted ? <Check className="w-3 h-3" /> : st.id}
                  </div>
                  <div className="hidden sm:block text-[11px] uppercase tracking-wider font-bold">
                    {st.name}
                  </div>
                </button>
              );
            })}
          </div>

        </div>
      </div>

      {/* Main Dual-Column Workspace Layout */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto px-4 md:px-6 py-6 md:py-8 lg:grid lg:grid-cols-12 lg:gap-8 xl:gap-10 overflow-hidden">
        
        {/* Left Side: Wizard Forms */}
        <div className="lg:col-span-6 xl:col-span-6 flex flex-col overflow-y-auto pr-0 lg:pr-2 xl:pr-4">
          
          <form id="host-form" onSubmit={handleSubmit} className="space-y-6 pb-24">
            
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-6"
              >
                
                {/* STEP 1: BASICS & CATEGORY SELECTION */}
                {currentStep === 1 && (
                  <div className="space-y-6">
                    
                    {/* Visual Category Grid */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm">
                      <div className="mb-4">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 1.1</span>
                        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Which of these best describes your architectural canvas?</h2>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Specify the property format category to align query routing engines.</p>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {PROPERTY_TYPES.map(pt => {
                          const isSelected = formData.type === pt.id;
                          const Icon = pt.icon;
                          return (
                            <div 
                              key={pt.id}
                              onClick={() => setFormData({...formData, type: pt.id})}
                              className={`
                                cursor-pointer border-2 rounded-xl p-4 flex flex-col items-start gap-4 transition-all hover:bg-zinc-50 dark:hover:bg-neutral-800/40 
                                ${isSelected 
                                  ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-neutral-800/30 ring-1 ring-zinc-900 dark:ring-white scale-[1.02]' 
                                  : 'border-zinc-200/70 dark:border-neutral-800'
                                }
                              `}
                            >
                              <div className={`p-2 rounded-lg ${isSelected ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950' : 'bg-zinc-100 text-zinc-500 dark:bg-neutral-800/50 dark:text-zinc-400'}`}>
                                <Icon className="w-5 h-5" strokeWidth={1.5} />
                              </div>
                              <span className="font-extrabold text-xs text-zinc-800 dark:text-zinc-200 leading-tight tracking-wider uppercase">{pt.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Basic Meta Inputs */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 1.2</span>
                          <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5 font-sans">Core Details</h2>
                        </div>
                        <button 
                            type="button" 
                            className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-neutral-800 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 rounded-lg transition-colors cursor-pointer"
                            onClick={async () => {
                                try {
                                    const token = localStorage.getItem('token');
                                    const res = await fetch('/api/ai/suggest-listing', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({
                                            type: formData.type,
                                            city: formData.city,
                                            amenities: formData.amenities,
                                            rooms: formData.rooms,
                                            rentalMode: formData.rentalMode
                                        })
                                    });
                                    if (res.ok) {
                                        const data = await res.json();
                                        if (data.title) setFormData(prev => ({...prev, title: data.title}));
                                        if (data.description) setFormData(prev => ({...prev, description: data.description}));
                                        addToast("AI Complete", "Autogenerated premium copy generated.", "success");
                                    }
                                } catch(e) {
                                    console.error('AI Suggestion failed', e);
                                }
                            }}
                        >
                            <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                            <span>Suggest with AI</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Expressive Title</label>
                        <input 
                          required 
                          value={formData.title} 
                          onChange={e => setFormData({...formData, title: e.target.value})} 
                          className="w-full p-4 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-[#0284C7] focus:border-transparent outline-none text-sm font-semibold transition-all dark:text-white" 
                          placeholder="e.g. Grand Chalet with Panoramic Valley View" 
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Compelling Description</label>
                        <textarea 
                          required 
                          rows={6}
                          value={formData.description} 
                          onChange={e => setFormData({...formData, description: e.target.value})} 
                          className="w-full p-4 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-[#0284C7] outline-none text-sm transition-all dark:text-white resize-none" 
                          placeholder="Compose a description highlighting the materials, layout, unique location context, and experience offerings..." 
                        />
                      </div>
                    </div>

                    {/* Property Video Tour */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 1.3</span>
                        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">High-Fidelity Video Tour (Optional)</h2>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Provide a link to a video tour (YouTube, Vimeo, or a raw .mp4 asset URL).</p>
                      </div>

                      <div className="relative">
                        <input 
                          type="url"
                          value={formData.videoUrl} 
                          onChange={e => setFormData({...formData, videoUrl: e.target.value})} 
                          className="w-full p-4 pl-12 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-[#0284C7] focus:border-transparent outline-none text-sm font-semibold transition-all dark:text-white" 
                          placeholder="https://youtube.com/watch?v=..." 
                        />
                        <Video className="w-5 h-5 text-zinc-400 absolute left-4 top-4" />
                      </div>

                      {videoDetails && (
                        <div className="flex items-center gap-2 p-3 bg-[#0284C7]/5 dark:bg-[#0284C7]/10 border border-[#0284C7]/20 rounded-xl text-xs text-[#0284C7]">
                          <CheckCircle2 className="w-4 h-4 text-[#0284C7]" />
                          <span className="font-bold">Source Verified:</span>
                          <span>Detected {videoDetails.type} stream (ID: {videoDetails.id})</span>
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {/* STEP 2: LOCATION & MAP SPATIAL */}
                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-6">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 2.1</span>
                        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Geospatial Information</h2>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Set physical coordinate geometry and textual address details.</p>
                      </div>

                      <LocationPicker 
                        address={formData.address} 
                        city={formData.city} 
                        onChange={handleLocationChange} 
                      />

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-100 dark:border-neutral-800">
                        <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Latitude</label>
                          <input 
                            type="number"
                            step="any"
                            value={formData.lat}
                            onChange={e => setFormData(p => ({ ...p, lat: parseFloat(e.target.value) || 0 }))}
                            className="w-full p-3 rounded-lg border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs dark:text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Longitude</label>
                          <input 
                            type="number"
                            step="any"
                            value={formData.lng}
                            onChange={e => setFormData(p => ({ ...p, lng: parseFloat(e.target.value) || 0 }))}
                            className="w-full p-3 rounded-lg border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs dark:text-white font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: CONFIGURATION & CAPACITY */}
                {currentStep === 3 && (
                  <div className="space-y-6">
                    
                    {/* Booking Mode Options */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 3.1</span>
                        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5 font-sans">Rental Operations Model</h2>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Select whether guests rent the entirety of your estate, private individual suites, or both models.</p>
                      </div>

                      <div className="flex flex-col gap-3">
                        <label className={`cursor-pointer border-2 rounded-xl p-4 flex items-center gap-4 transition-all hover:bg-zinc-50 dark:hover:bg-neutral-800/20 ${formData.rentalMode === 'entire_place' ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-neutral-800/30' : 'border-zinc-200 dark:border-neutral-800'}`}>
                          <input type="radio" name="rentalMode" value="entire_place" checked={formData.rentalMode === 'entire_place'} onChange={() => setFormData({...formData, rentalMode: 'entire_place'})} className="sr-only" />
                          <div className="flex-1">
                            <span className="font-extrabold text-zinc-900 dark:text-white text-sm block">Entire Place Buyout</span>
                            <span className="text-zinc-400 dark:text-zinc-500 text-xs mt-0.5 block">Guests secure exclusive occupancy of the absolute entirety of your estate.</span>
                          </div>
                        </label>
                        <label className={`cursor-pointer border-2 rounded-xl p-4 flex items-center gap-4 transition-all hover:bg-zinc-50 dark:hover:bg-neutral-800/20 ${formData.rentalMode === 'private_rooms' ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-neutral-800/30' : 'border-zinc-200 dark:border-neutral-800'}`}>
                          <input type="radio" name="rentalMode" value="private_rooms" checked={formData.rentalMode === 'private_rooms'} onChange={() => setFormData({...formData, rentalMode: 'private_rooms'})} className="sr-only" />
                          <div className="flex-1">
                            <span className="font-extrabold text-zinc-900 dark:text-white text-sm block">Boutique Room Inventory</span>
                            <span className="text-zinc-400 dark:text-zinc-500 text-xs mt-0.5 block">Guests purchase specific rooms, cabins, or wings, sharing common core facilities.</span>
                          </div>
                        </label>
                        <label className={`cursor-pointer border-2 rounded-xl p-4 flex items-center gap-4 transition-all hover:bg-zinc-50 dark:hover:bg-neutral-800/20 ${formData.rentalMode === 'hybrid' ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-neutral-800/30' : 'border-zinc-200 dark:border-neutral-800'}`}>
                          <input type="radio" name="rentalMode" value="hybrid" checked={formData.rentalMode === 'hybrid'} onChange={() => setFormData({...formData, rentalMode: 'hybrid'})} className="sr-only" />
                          <div className="flex-1">
                            <span className="font-extrabold text-zinc-900 dark:text-white text-sm block">Hybrid (Entire Place & Individual Rooms)</span>
                            <span className="text-zinc-400 dark:text-zinc-500 text-xs mt-0.5 block">Supports full buyout booking or multi-subunit breakdown reservation dynamically.</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Capacity layout for buyout entire place */}
                    {formData.rentalMode !== 'private_rooms' && (
                      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 3.2</span>
                          <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Buyout Spatial Capacity</h2>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Specify maximum capacity limits and details for entire place buyout.</p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {[
                            { label: 'Guests', key: 'maxGuests' as const },
                            { label: 'Bedrooms', key: 'bedrooms' as const },
                            { label: 'Beds', key: 'beds' as const },
                            { label: 'Bathrooms', key: 'bathrooms' as const },
                          ].map((item) => (
                            <div key={item.key} className="space-y-1.5 p-3 rounded-xl border border-zinc-100 dark:border-neutral-800 bg-zinc-50/40 dark:bg-neutral-900">
                              <label className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest block text-center">{item.label}</label>
                              <div className="flex items-center justify-between gap-1 mt-2">
                                <button 
                                  type="button"
                                  onClick={() => setFormData(prev => ({ ...prev, [item.key]: Math.max(1, prev[item.key] - 1) }))}
                                  className="w-7 h-7 flex items-center justify-center rounded-full border border-zinc-200 dark:border-neutral-700 hover:border-zinc-950 dark:hover:border-white transition-colors cursor-pointer bg-white dark:bg-neutral-800 font-extrabold text-xs dark:text-white"
                                >
                                  -
                                </button>
                                <span className="font-extrabold text-sm text-zinc-900 dark:text-white">{formData[item.key]}</span>
                                <button 
                                  type="button"
                                  onClick={() => setFormData(prev => ({ ...prev, [item.key]: prev[item.key] + 1 }))}
                                  className="w-7 h-7 flex items-center justify-center rounded-full border border-zinc-200 dark:border-neutral-700 hover:border-zinc-950 dark:hover:border-white transition-colors cursor-pointer bg-white dark:bg-neutral-800 font-extrabold text-xs dark:text-white"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Subunit Rooms Interactive Builder */}
                    {(formData.rentalMode === 'private_rooms' || formData.rentalMode === 'hybrid') && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between bg-white dark:bg-neutral-900 p-4 rounded-xl border border-zinc-200/60 dark:border-neutral-800">
                          <div>
                            <h3 className="font-extrabold text-sm text-zinc-900 dark:text-white">Spatial Inventory Units</h3>
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Manage suites, cottages, or individual private spaces.</p>
                          </div>
                          <button 
                            type="button" 
                            onClick={handleAddRoom} 
                            className="px-3.5 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            + Add Unit
                          </button>
                        </div>

                        {formData.rooms.length === 0 && (
                          <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-neutral-800 rounded-2xl text-zinc-400 text-xs italic">
                            No subunits configured. Please add at least one luxury room or private cottage.
                          </div>
                        )}

                        <div className="space-y-3">
                          {formData.rooms.map((room, index) => {
                            const isExpanded = expandedRoomIndices[index];
                            return (
                              <div 
                                key={room.id} 
                                className={`border rounded-2xl transition-all shadow-sm ${
                                  isExpanded 
                                    ? 'border-zinc-900 dark:border-white bg-white dark:bg-neutral-900 p-6' 
                                    : 'border-zinc-200/70 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-4'
                                }`}
                              >
                                {/* Collapsed Header Summary */}
                                <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpandRoom(index)}>
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-[#0284C7]/10 flex items-center justify-center font-bold text-[#0284C7] text-xs">
                                      {index + 1}
                                    </div>
                                    <div>
                                      <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white leading-snug">{room.name || `Unit ${index + 1}`}</h4>
                                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mt-0.5">
                                        {formatPrice(room.price || 0, 'INR')} / Month • {room.capacity || 1} Max Guests {room.bedrooms ? `• ${room.bedrooms} BHK` : ''}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-3">
                                    <button 
                                      type="button" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveRoom(index);
                                      }} 
                                      className="text-zinc-400 hover:text-red-500 transition-colors p-1"
                                      title="Delete suite"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#0284C7] bg-[#0284C7]/5 px-2.5 py-1 rounded-md">
                                      {isExpanded ? 'Collapse' : 'Expand'}
                                    </span>
                                  </div>
                                </div>

                                {/* Expanded Inputs */}
                                <AnimatePresence initial={false}>
                                  {isExpanded && (
                                    <motion.div 
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="mt-6 pt-6 border-t border-zinc-100 dark:border-neutral-800 space-y-6 overflow-hidden"
                                    >
                                      
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1.5 col-span-3">
                                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Suite / Unit Name</label>
                                          <input 
                                            value={room.name} 
                                            required 
                                            onChange={e => handleUpdateRoom(index, 'name', e.target.value)} 
                                            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-semibold dark:text-white outline-none focus:ring-1 focus:ring-[#0284C7]" 
                                            placeholder="e.g. Master Penthouse Suite" 
                                          />
                                        </div>

                                        <div className="space-y-1.5 col-span-3">
                                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Room Description</label>
                                          <textarea 
                                            value={room.description || ''} 
                                            onChange={e => handleUpdateRoom(index, 'description', e.target.value)} 
                                            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs dark:text-white outline-none focus:ring-1 focus:ring-[#0284C7] resize-none" 
                                            rows={2}
                                            placeholder="Introduce details of the space, bathroom access, custom views, private entrance details..." 
                                          />
                                        </div>

                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Base Rent (₹)</label>
                                          <input 
                                            value={room.price} 
                                            required 
                                            type="number" 
                                            min="0" 
                                            onChange={e => handleUpdateRoom(index, 'price', parseFloat(e.target.value) || 0)} 
                                            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-semibold dark:text-white outline-none focus:ring-1 focus:ring-[#0284C7]" 
                                            placeholder="e.g. 5000" 
                                          />
                                        </div>

                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Max Capacity</label>
                                          <input 
                                            value={room.capacity || ''} 
                                            type="number" 
                                            min="1" 
                                            onChange={e => handleUpdateRoom(index, 'capacity', parseInt(e.target.value) || 1)} 
                                            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-semibold dark:text-white outline-none focus:ring-1 focus:ring-[#0284C7]" 
                                            placeholder="Guests" 
                                          />
                                        </div>

                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Bedrooms (BHK)</label>
                                          <input 
                                            value={room.bedrooms ?? ''} 
                                            type="number" 
                                            min="0" 
                                            onChange={e => handleUpdateRoom(index, 'bedrooms', parseInt(e.target.value) || 0)} 
                                            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-semibold dark:text-white outline-none focus:ring-1 focus:ring-[#0284C7]" 
                                            placeholder="e.g. 1" 
                                          />
                                        </div>

                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Available Units count</label>
                                          <input 
                                            value={room.inventory_count ?? 1} 
                                            type="number" 
                                            min="1" 
                                            onChange={e => handleUpdateRoom(index, 'inventory_count', parseInt(e.target.value) || 1)} 
                                            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-semibold dark:text-white outline-none focus:ring-1 focus:ring-[#0284C7]" 
                                            placeholder="e.g. 1" 
                                          />
                                        </div>

                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Beds</label>
                                          <input 
                                            value={room.beds ?? ''} 
                                            type="number" 
                                            min="1" 
                                            onChange={e => handleUpdateRoom(index, 'beds', parseInt(e.target.value) || 1)} 
                                            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-semibold dark:text-white outline-none focus:ring-1 focus:ring-[#0284C7]" 
                                            placeholder="Beds Count" 
                                          />
                                        </div>

                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Unit Video Tour (Optional)</label>
                                          <input 
                                            type="url"
                                            value={room.video_url || ''} 
                                            onChange={e => handleUpdateRoom(index, 'video_url', e.target.value)} 
                                            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-semibold dark:text-white outline-none focus:ring-1 focus:ring-[#0284C7]" 
                                            placeholder="Video link" 
                                          />
                                        </div>
                                      </div>

                                      {/* Subunit Checkbox features */}
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="flex items-center justify-between p-3 border border-zinc-200 dark:border-neutral-800 rounded-xl bg-zinc-50/50 dark:bg-neutral-900/30">
                                          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Attached Bathroom</label>
                                          <input 
                                            type="checkbox" 
                                            checked={room.hasAttachedBathroom || false} 
                                            onChange={e => handleUpdateRoom(index, 'hasAttachedBathroom', e.target.checked)} 
                                            className="w-4 h-4 rounded text-[#0284C7] focus:ring-0 cursor-pointer"
                                          />
                                        </div>
                                        <div className="flex items-center justify-between p-3 border border-zinc-200 dark:border-neutral-800 rounded-xl bg-zinc-50/50 dark:bg-neutral-900/30">
                                          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Air Conditioning (AC)</label>
                                          <input 
                                            type="checkbox" 
                                            checked={room.hasAc || false} 
                                            onChange={e => handleUpdateRoom(index, 'hasAc', e.target.checked)} 
                                            className="w-4 h-4 rounded text-[#0284C7] focus:ring-0 cursor-pointer"
                                          />
                                        </div>
                                      </div>

                                      {/* Specific Unit Photos upload */}
                                      <div className="space-y-2 pt-2">
                                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Unit Photos</label>
                                        <PhotoUpload 
                                          photos={room.photos || []} 
                                          setPhotos={p => handleUpdateRoom(index, 'photos', p)} 
                                          isCompressing={isCompressing} 
                                          setIsCompressing={setIsCompressing} 
                                        />
                                      </div>

                                      {/* Packages/Tiers Pricing Builder */}
                                      <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-neutral-800">
                                        <div className="flex items-center justify-between">
                                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Unit Pricing Tiers & Packages</label>
                                          <button 
                                            type="button" 
                                            onClick={() => {
                                              const tiers = room.tiers || [];
                                              handleUpdateRoom(index, 'tiers', [...tiers, { id: Math.random().toString(36).substring(2, 9), name: 'Premium Package', price: Math.round(room.price * 1.2), amenities: ['Breakfast', 'Free Wifi'] }]);
                                            }} 
                                            className="text-xs font-bold text-[#0284C7] hover:underline cursor-pointer"
                                          >
                                            + Add Package Tier
                                          </button>
                                        </div>

                                        {(!room.tiers || room.tiers.length === 0) && (
                                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">No pricing tiers added. Defaults to standard base price only.</p>
                                        )}

                                        <div className="space-y-2">
                                          {room.tiers && room.tiers.map((tier: any, tIndex: number) => (
                                            <div key={tier.id} className="p-3 bg-zinc-50/50 dark:bg-neutral-800/25 border border-zinc-200 dark:border-neutral-800 rounded-xl relative space-y-3">
                                              <button 
                                                type="button" 
                                                onClick={() => {
                                                  handleUpdateRoom(index, 'tiers', room.tiers.filter((_: any, i: number) => i !== tIndex));
                                                }} 
                                                className="absolute top-2.5 right-2.5 text-zinc-400 hover:text-red-500"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </button>

                                              <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                  <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Tier Name</label>
                                                  <input 
                                                    value={tier.name} 
                                                    onChange={e => {
                                                      const newTiers = [...room.tiers];
                                                      newTiers[tIndex].name = e.target.value;
                                                      handleUpdateRoom(index, 'tiers', newTiers);
                                                    }} 
                                                    className="w-full p-2 mt-1 border border-zinc-200 dark:border-neutral-800 rounded-lg text-xs dark:text-white bg-white dark:bg-neutral-900 focus:ring-1 outline-none font-semibold" 
                                                    placeholder="e.g. Breakfast + Airport Shuttle" 
                                                  />
                                                </div>
                                                <div>
                                                  <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Tier Price (₹)</label>
                                                  <input 
                                                    value={tier.price} 
                                                    type="number"
                                                    onChange={e => {
                                                      const newTiers = [...room.tiers];
                                                      newTiers[tIndex].price = parseFloat(e.target.value) || 0;
                                                      handleUpdateRoom(index, 'tiers', newTiers);
                                                    }} 
                                                    className="w-full p-2 mt-1 border border-zinc-200 dark:border-neutral-800 rounded-lg text-xs dark:text-white bg-white dark:bg-neutral-900 focus:ring-1 outline-none font-semibold" 
                                                    placeholder="e.g. 6000" 
                                                  />
                                                </div>
                                                <div className="col-span-2">
                                                  <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Included Tier Perks (comma separated)</label>
                                                  <input 
                                                    value={tier.amenities.join(', ')} 
                                                    onChange={e => {
                                                      const newTiers = [...room.tiers];
                                                      newTiers[tIndex].amenities = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean);
                                                      handleUpdateRoom(index, 'tiers', newTiers);
                                                    }} 
                                                    className="w-full p-2 mt-1 border border-zinc-200 dark:border-neutral-800 rounded-lg text-xs dark:text-white bg-white dark:bg-neutral-900 focus:ring-1 outline-none" 
                                                    placeholder="e.g. Full Hot Buffet Breakfast, Airport Pickup, Free Cancellation" 
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Subunit specific Amenities */}
                                      <div className="space-y-2 pt-4 border-t border-zinc-100 dark:border-neutral-800">
                                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Suite Amenities</label>
                                        <AmenitiesPicker 
                                          selected={room.amenities || []} 
                                          onChange={sel => handleUpdateRoom(index, 'amenities', sel)} 
                                        />
                                      </div>

                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* STEP 4: GLOBAL AMENITIES & PHOTOS */}
                {currentStep === 4 && (
                  <div className="space-y-6">
                    {/* Photos upload */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 4.1</span>
                        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Asset Gallery Upload</h2>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Upload at least one primary cover image. Drag to reorder. The first photo will act as cover.</p>
                      </div>

                      <PhotoUpload 
                        photos={photos} 
                        setPhotos={setPhotos} 
                        isCompressing={isCompressing} 
                        setIsCompressing={setIsCompressing} 
                      />
                      {photos.length === 0 && <p className="text-red-500 text-xs font-bold mt-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> At least one listing cover photo is required.</p>}
                    </div>

                    {/* General Amenities Selection */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 4.2</span>
                        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">What amenities does your estate offer globally?</h2>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Select all features available on site to populate filtering query pipelines.</p>
                      </div>

                      <AmenitiesPicker selected={formData.amenities} onChange={handleAmenitiesChange} />
                    </div>
                  </div>
                )}

                {/* STEP 5: DYNAMIC PRICING & BUSINESS RULES */}
                {currentStep === 5 && (
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-6">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 5.1</span>
                        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Base & Calendar Overrides</h2>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Determine global pricing settings and currency metrics.</p>
                      </div>

                      {formData.rentalMode !== 'private_rooms' ? (
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Base Monthly Rent (₹)</label>
                          <div className="relative">
                            <input 
                              required 
                              type="number" 
                              min="0" 
                              value={formData.price} 
                              onChange={e => setFormData({...formData, price: e.target.value})} 
                              className="w-full p-4 pl-10 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-semibold transition-all dark:text-white focus:ring-1 focus:ring-black focus:border-transparent outline-none" 
                              placeholder="e.g. 15000" 
                            />
                            <div className="absolute left-4 top-4 font-extrabold text-zinc-400 text-sm">₹</div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-zinc-50/50 dark:bg-neutral-800/20 border border-zinc-200 dark:border-neutral-800 rounded-xl">
                          <p className="text-xs text-zinc-500 font-bold flex items-center gap-1.5 leading-relaxed">
                            <Info className="w-4 h-4 text-[#0284C7] shrink-0" />
                            Rent is configured on individual Room subunits in Step 3. No global buyout base pricing is required.
                          </p>
                        </div>
                      )}

                      <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-neutral-800">
                        <div>
                          <h4 className="font-extrabold text-xs text-zinc-900 dark:text-white uppercase tracking-widest">Multipliers Rules</h4>
                          <p className="text-[10px] text-zinc-400 mt-1">Automate pricing adjustments for specific seasonal schedules.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           <div className="space-y-1.5 p-3.5 border border-zinc-100 dark:border-neutral-800 bg-zinc-50/20 rounded-xl">
                             <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block">Weekend Multiplier</label>
                             <input 
                               type="number" 
                               step="0.01"
                               min="0.5"
                               max="5.0"
                               value={formData.dynamicPricing.weekendMultiplier}
                               onChange={e => setFormData(p => ({ ...p, dynamicPricing: { ...p.dynamicPricing, weekendMultiplier: parseFloat(e.target.value) || 1.0 }}))}
                               className="w-full p-2.5 mt-1 rounded-lg border border-zinc-200 dark:border-neutral-800 text-sm font-bold bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white focus:ring-1 outline-none"
                             />
                             <span className="text-[9px] text-zinc-400 mt-1 block">Multiplies rate for Fri/Sat nights.</span>
                           </div>
                           <div className="space-y-1.5 p-3.5 border border-zinc-100 dark:border-neutral-800 bg-zinc-50/20 rounded-xl">
                             <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block">Peak Season Multiplier</label>
                             <input 
                               type="number" 
                               step="0.01"
                               min="0.5"
                               max="5.0"
                               value={formData.dynamicPricing.seasonalMultiplier}
                               onChange={e => setFormData(p => ({ ...p, dynamicPricing: { ...p.dynamicPricing, seasonalMultiplier: parseFloat(e.target.value) || 1.0 }}))}
                               className="w-full p-2.5 mt-1 rounded-lg border border-zinc-200 dark:border-neutral-800 text-sm font-bold bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white focus:ring-1 outline-none"
                             />
                             <span className="text-[9px] text-zinc-400 mt-1 block">Multiplies rate during peak periods.</span>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 6: SEARCH ENGINE OPTIMIZATION */}
                {currentStep === 6 && (
                  <div className="space-y-6 animate-fade-in">
                    
                    {/* Beautiful Google Search Preview Snippet Card */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 6.1</span>
                        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5 font-sans">Google Search Preview</h2>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Live simulation of your indexing metadata in search results.</p>
                      </div>

                      {/* Snippet representation */}
                      <div className="p-5 border border-zinc-100 dark:border-neutral-800/80 bg-zinc-50/50 dark:bg-neutral-950/20 rounded-2xl font-sans max-w-xl shadow-inner">
                        <div className="flex items-center gap-2 mb-1.5">
                          {photos.length > 0 && (
                            <img src={photos[0].previewUrl} className="w-5 h-5 rounded-md object-cover border" alt="" />
                          )}
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate font-mono">
                            https://nestpick.space/stays/{existingListing?.id || 'new-stay-id'}
                          </div>
                        </div>
                        <h3 className="text-indigo-600 dark:text-blue-400 text-lg font-semibold leading-snug hover:underline cursor-pointer">
                          {formData.seo_title || formData.title || 'Masterful Cozy Luxury Nest | Nestpick Stay'}
                        </h3>
                        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mt-1 line-clamp-2">
                          {formData.seo_description || formData.description || 'Secure ultimate co-living luxury stays or complete property buyouts. Nestled in prime scenic neighborhoods...'}
                        </p>
                      </div>
                    </div>

                    {/* SEO Metadata Form */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[#0284C7]">Segment 6.2</span>
                        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5 font-sans">SEO Meta Parameters</h2>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Populate parameters to achieve high positioning in algorithmic indexing cycles.</p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Custom SEO Title</label>
                          <input 
                            type="text" 
                            value={formData.seo_title} 
                            onChange={e => setFormData({...formData, seo_title: e.target.value})} 
                            className="w-full p-3.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-semibold text-zinc-900 dark:text-white focus:ring-1 focus:ring-[#0284C7] outline-none" 
                            placeholder="Defaults to Property Title" 
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Custom SEO Description</label>
                          <textarea 
                            rows={3} 
                            value={formData.seo_description} 
                            onChange={e => setFormData({...formData, seo_description: e.target.value})} 
                            className="w-full p-3.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white focus:ring-1 focus:ring-[#0284C7] outline-none resize-none" 
                            placeholder="Summarize property features and local area attraction specifics under 160 characters..." 
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Index Keywords (comma-separated)</label>
                          <input 
                            type="text" 
                            value={formData.seo_keywords} 
                            onChange={e => setFormData({...formData, seo_keywords: e.target.value})} 
                            className="w-full p-3.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-zinc-900 dark:text-white focus:ring-1 focus:ring-[#0284C7] outline-none" 
                            placeholder="e.g. boutique stay, exclusive pool, mountain view, cozy room" 
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Social Graph Cover Image URL</label>
                          <input 
                            type="text" 
                            value={formData.seo_image_url} 
                            onChange={e => setFormData({...formData, seo_image_url: e.target.value})} 
                            className="w-full p-3.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white focus:ring-1 focus:ring-[#0284C7] outline-none" 
                            placeholder="https://example.com/sharing-card.jpg" 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>

            {/* Stepper Navigation Buttons */}
            <div className="flex items-center justify-between pt-6 border-t border-zinc-200 dark:border-neutral-800/80">
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={currentStep === 1}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  currentStep === 1 
                    ? 'border-zinc-200 text-zinc-300 cursor-not-allowed dark:border-neutral-800 dark:text-neutral-700' 
                    : 'border-zinc-300 dark:border-neutral-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-neutral-800'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous Step
              </button>

              {currentStep < 6 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="flex items-center gap-2 px-6 py-3 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                >
                  Next Step
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading || isCompressing}
                  className="flex items-center gap-2 px-8 py-3 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-md"
                >
                  {loading ? 'Publishing...' : 'Publish Listing'}
                </button>
              )}
            </div>

          </form>
        </div>

        {/* Right Side: Desktop Dual-Mode Live Preview Simulator */}
        <div className="hidden lg:flex lg:col-span-6 xl:col-span-6 flex-col h-[calc(100vh-170px)] sticky top-[140px] overflow-hidden">
          
          {/* Preview Navigation & Fidelity controls */}
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl p-4 border-t border-x border-zinc-200/80 dark:border-neutral-800 flex items-center justify-between shadow-sm z-20 shrink-0">
             <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-900 dark:text-white">Active Customer Preview</span>
             </div>

             <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-neutral-800 rounded-xl">
               <button
                 type="button"
                 onClick={() => setPreviewFidelity('desktop')}
                 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                   previewFidelity === 'desktop' 
                     ? 'bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white shadow-sm' 
                     : 'text-zinc-400 hover:text-zinc-600'
                 }`}
               >
                 <Laptop className="w-3.5 h-3.5" />
                 Desktop View
               </button>
               <button
                 type="button"
                 onClick={() => setPreviewFidelity('mobile')}
                 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                   previewFidelity === 'mobile' 
                     ? 'bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white shadow-sm' 
                     : 'text-zinc-400 hover:text-zinc-600'
                 }`}
               >
                 <Smartphone className="w-3.5 h-3.5" />
                 Mobile View
               </button>
             </div>
          </div>

          {/* Simulated Screen Container */}
          <div className="flex-1 bg-zinc-100 dark:bg-neutral-950 p-4 md:p-6 border-b border-x border-zinc-200/80 dark:border-neutral-800 rounded-b-2xl flex items-center justify-center overflow-hidden relative">
            
            {previewFidelity === 'desktop' ? (
              <div 
                id="preview-container-content"
                className="w-full h-full bg-white dark:bg-neutral-900 rounded-2xl overflow-y-auto border border-zinc-200/60 dark:border-neutral-800 shadow-md no-scrollbar relative pointer-events-none"
              >
                <div className="p-1 scale-[0.95] origin-top">
                  <ListingDetails 
                    listing={mockListing} 
                    onBack={() => {}} 
                    similarListings={[]} 
                    onListingClick={() => {}} 
                    isFavorite={false} 
                    onToggleFavorite={() => {}} 
                  />
                </div>
              </div>
            ) : (
              // Ultimate iPhone mockup container
              <div className="relative w-[340px] h-[98%] max-h-[640px] bg-neutral-950 rounded-[48px] p-3 border-[10px] border-neutral-900 shadow-2xl overflow-hidden ring-4 ring-neutral-800/40 flex flex-col shrink-0">
                
                {/* Dynamic Camera Notch Island */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-50 flex items-center justify-between px-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-blue-900/40" />
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#0284C7]/20 animate-pulse" />
                </div>

                {/* Simulated Screen Body */}
                <div 
                  id="preview-container-content"
                  className="flex-1 bg-white dark:bg-neutral-900 rounded-[38px] overflow-y-auto no-scrollbar pointer-events-none relative"
                >
                  <div className="scale-[0.8] origin-top-left w-[125%] h-auto pb-10">
                    <ListingDetails 
                      listing={mockListing} 
                      onBack={() => {}} 
                      similarListings={[]} 
                      onListingClick={() => {}} 
                      isFavorite={false} 
                      onToggleFavorite={() => {}} 
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

      </main>

      {/* Floating Eye button for mobile devices */}
      <div className="lg:hidden fixed bottom-6 right-6 z-[60]">
        <button 
          type="button" 
          onClick={() => setShowMobilePreview(true)}
          className="bg-zinc-950 hover:bg-neutral-800 text-white p-4 rounded-full shadow-2xl border border-white/10 active:scale-95 transition-transform flex items-center justify-center"
        >
          <Eye className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Swipe Up Fullscreen Preview */}
      <AnimatePresence>
        {showMobilePreview && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="fixed inset-0 z-[100] bg-white dark:bg-neutral-900 overflow-y-auto"
          >
             <div className="sticky top-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md z-10 border-b border-zinc-100 dark:border-neutral-800 px-4 py-4 flex items-center justify-between shadow-sm">
               <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[#0284C7]" />
                  <h3 className="font-extrabold text-sm text-zinc-900 dark:text-white uppercase tracking-wider">Live mobile Preview</h3>
               </div>
               <button onClick={() => setShowMobilePreview(false)} className="p-2 bg-zinc-100 dark:bg-neutral-800 rounded-full cursor-pointer">
                  <X className="w-5 h-5 text-zinc-800 dark:text-zinc-100" />
               </button>
             </div>
             <div className="pb-24 pointer-events-none">
                <ListingDetails 
                  listing={mockListing} 
                  onBack={() => {}} 
                  similarListings={[]} 
                  onListingClick={() => {}} 
                  isFavorite={false} 
                  onToggleFavorite={() => {}} 
                />
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HostForm;
