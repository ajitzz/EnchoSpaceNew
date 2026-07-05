import React, { useState } from 'react';
import { Listing } from '../types';
import { ChevronLeft, ShieldCheck } from './Icons';
import { LocationPicker } from './LocationPicker';
import { PhotoUpload, PhotoData } from './PhotoUpload';
import { AmenitiesPicker } from './AmenitiesPicker';
import { useAuth } from './AuthContext';
import { 
  Building2, Home, Tractor, Coffee, Ship, Tent, Caravan, Castle, Mountain, Box, Circle, Leaf, X, Eye
} from 'lucide-react';
import { useToast } from './ToastContext';
import ListingDetails from './ListingDetails';
import { motion, AnimatePresence } from 'framer-motion';

import { queueCustomMutation } from '../lib/syncService';

interface HostFormProps {
  onBack: () => void;
  onSuccess: () => void;
  existingListing?: Listing;
}

const PROPERTY_TYPES = [
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

const HostForm: React.FC<HostFormProps> = ({ onBack, onSuccess, existingListing }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
        id: Math.random().toString(36).substr(2, 9),
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
      id: Math.random().toString(36).substr(2, 9),
      previewUrl: url
    }));
  });

  const [showMobilePreview, setShowMobilePreview] = useState(false);

  const mockListing: Listing = {
    id: existingListing?.id || 'preview-id',
    host_id: user?.id || 'host-id',
    title: formData.title || 'Your property title',
    description: formData.description || 'Description will appear here...',
    price: parseFloat(formData.price) || 0,
    currency: 'USD',
    city: formData.city || 'City',
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

  const handleFocus = (sectionName: string) => {
      const previewContainer = document.getElementById('preview-container');
      if (!previewContainer) return;

      if (sectionName === 'Photos' || sectionName === 'Basics') {
          previewContainer.scrollTo({ top: 0, behavior: 'smooth' });
          return;
      }

      let searchStr = sectionName.toLowerCase();
      if (sectionName === 'Amenities') searchStr = 'what this place offers';
      if (sectionName === 'Location') searchStr = 'where you';
      if (sectionName === 'Configuration') searchStr = 'choose configuration';

      const headings = Array.from(previewContainer.querySelectorAll('h2, h3'));
      const target = headings.find(el => el.textContent?.toLowerCase().includes(searchStr));

      if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
  };

  const existingImageUrls = (existingListing?.imageUrls && existingListing.imageUrls.length > 0)
      ? existingListing.imageUrls
      : (existingListing?.imageUrl ? [existingListing.imageUrl] : []);

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
    setFormData(prev => ({
      ...prev,
      rooms: [...prev.rooms, { 
        id: Date.now().toString(), 
        name: `Room ${prev.rooms.length + 1}`, 
        price: 0, 
        capacity: 1, 
        hasAttachedBathroom: false, 
        hasAc: false, 
        amenities: [], 
        photos: [] 
      }]
    }));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validations
    if (!formData.title || formData.title.trim().length < 5) {
        addToast("Validation Error", "Title must be at least 5 characters long.", "warning");
        return;
    }
    if (!formData.description || formData.description.trim().length < 10) {
        addToast("Validation Error", "Description must be at least 10 characters long.", "warning");
        return;
    }
    const parsedPrice = parseFloat(formData.price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
        addToast("Validation Error", "Please enter a valid price.", "warning");
        return;
    }
    if (photos.length === 0 && !existingListing?.imageUrl) {
        addToast("Validation Error", "Please upload at least one photo.", "warning");
        return;
    }
    if (!formData.city || !formData.address) {
        addToast("Validation Error", "Please select a valid location for the property.", "warning");
        return;
    }

    setLoading(true);
    try {
      const payload = {
          existingListing,
          formData,
          photos,
          user
      };
      
      const success = await queueCustomMutation('upload_listing', payload);
      
      if (!success && !navigator.onLine) {
          addToast("Scheduled", "You are offline. Your property will be listed once you reconnect.", "info");
      }

      setSubmitted(true);
      setTimeout(() => {
          onSuccess();
          onBack();
      }, 2000);
    } catch (error) {
      console.error('Failed to list space:', error);
      addToast("Upload Failed", "Failed to schedule property listing.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
      return (
          <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center animate-fade-in">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                  <ShieldCheck className="w-10 h-10 text-green-600" />
              </div>
              <h1 className="text-3xl font-extrabold text-gray-900 mb-2">{existingListing ? 'Your space has been updated!' : 'Your space is live!'}</h1>
              <p className="text-gray-500 max-w-md mx-auto">{existingListing ? "Your property details have been saved successfully." : "Congratulations! Your property has been successfully listed. You'll be redirected to the search page in a moment."}</p>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <ChevronLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">{existingListing ? 'Edit your space' : 'Host your space'}</h1>
        </div>
        <div className="hidden md:flex items-center gap-4">
            <button onClick={onBack} type="button" className="px-6 py-2.5 font-bold text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
            <button form="host-form" type="submit" disabled={loading || isCompressing || photos.length === 0} className="px-8 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#0284C7]/20 disabled:opacity-50">
                {isCompressing ? 'Compressing...' : loading ? 'Saving...' : existingListing ? 'Save Changes' : 'Publish Listing'}
            </button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 pt-8 md:pt-12 flex gap-8 pb-20">
        <div className="flex-1 max-w-3xl">
          <form id="host-form" onSubmit={handleSubmit} className="space-y-12 pb-12">
          
          {/* Section 1: Property Type */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100" onClick={() => handleFocus('Basics')}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Which of these best describes your place?</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {PROPERTY_TYPES.map(type => {
                const isSelected = formData.type === type.id;
                const Icon = type.icon;
                return (
                  <div 
                    key={type.id}
                    onClick={() => setFormData({...formData, type: type.id})}
                    className={`
                      cursor-pointer border-2 rounded-xl p-4 flex flex-col items-start gap-4 transition-all hover:bg-gray-50 
                      ${isSelected ? 'border-black bg-gray-50 ring-1 ring-black' : 'border-gray-200'}
                    `}
                  >
                    <Icon className="w-8 h-8 text-gray-800" strokeWidth={1.5} />
                    <span className="font-semibold text-gray-900 leading-tight">{type.label}</span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Section 1.5: Rental Mode */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100" onClick={() => handleFocus('Configuration')}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">How will guests book your place?</h2>
            <div className="flex flex-col gap-4">
              <label className={`cursor-pointer border-2 rounded-xl p-4 flex items-center gap-4 transition-all hover:bg-gray-50 ${formData.rentalMode === 'entire_place' ? 'border-black bg-gray-50 ring-1 ring-black' : 'border-gray-200'}`}>
                <input type="radio" name="rentalMode" value="entire_place" checked={formData.rentalMode === 'entire_place'} onChange={() => setFormData({...formData, rentalMode: 'entire_place'})} className="sr-only" />
                <div className="flex-1">
                  <span className="font-semibold text-gray-900 block text-lg">Entire Place</span>
                  <span className="text-gray-500 text-sm">Guests have the whole place to themselves.</span>
                </div>
              </label>
              <label className={`cursor-pointer border-2 rounded-xl p-4 flex items-center gap-4 transition-all hover:bg-gray-50 ${formData.rentalMode === 'private_rooms' ? 'border-black bg-gray-50 ring-1 ring-black' : 'border-gray-200'}`}>
                <input type="radio" name="rentalMode" value="private_rooms" checked={formData.rentalMode === 'private_rooms'} onChange={() => setFormData({...formData, rentalMode: 'private_rooms'})} className="sr-only" />
                <div className="flex-1">
                  <span className="font-semibold text-gray-900 block text-lg">Private Rooms</span>
                  <span className="text-gray-500 text-sm">Guests book individual rooms and share common areas.</span>
                </div>
              </label>
              <label className={`cursor-pointer border-2 rounded-xl p-4 flex items-center gap-4 transition-all hover:bg-gray-50 ${formData.rentalMode === 'hybrid' ? 'border-black bg-gray-50 ring-1 ring-black' : 'border-gray-200'}`}>
                <input type="radio" name="rentalMode" value="hybrid" checked={formData.rentalMode === 'hybrid'} onChange={() => setFormData({...formData, rentalMode: 'hybrid'})} className="sr-only" />
                <div className="flex-1">
                  <span className="font-semibold text-gray-900 block text-lg">Both (Entire Place & Private Rooms)</span>
                  <span className="text-gray-500 text-sm">Guests can book the entire place OR individual rooms.</span>
                </div>
              </label>
            </div>
            
            {(formData.rentalMode === 'private_rooms' || formData.rentalMode === 'hybrid') && (
              <div className="mt-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900">Add Rooms</h3>
                  <button type="button" onClick={handleAddRoom} className="px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold text-sm hover:bg-gray-800 transition-colors">
                    + Add Room
                  </button>
                </div>
                {formData.rooms.length === 0 && (
                  <p className="text-gray-500 text-sm italic">No rooms added. Please add at least one bookable room.</p>
                )}
                {formData.rooms.map((room, index) => (
                  <div key={room.id} className="p-6 border-2 rounded-2xl border-gray-100 bg-gray-50 space-y-6 relative">
                    <button type="button" onClick={() => handleRemoveRoom(index)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors bg-white rounded-full p-1 border shadow-sm z-10">
                      <X className="w-4 h-4" />
                    </button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700 uppercase">Room Name</label>
                        <input value={room.name} required onChange={e => handleUpdateRoom(index, 'name', e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none bg-white" placeholder="e.g. Master Bedroom" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700 uppercase">Nightly Price (₹)</label>
                        <input value={room.price} required type="number" min="0" onChange={e => handleUpdateRoom(index, 'price', parseFloat(e.target.value) || 0)} className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none bg-white" placeholder="e.g. 50" />
                      </div>
                      <div className="space-y-2 flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-white">
                        <label className="text-sm font-semibold text-gray-700">Attached Bathroom</label>
                        <input type="checkbox" checked={room.hasAttachedBathroom} onChange={e => handleUpdateRoom(index, 'hasAttachedBathroom', e.target.checked)} className="w-5 h-5 accent-[#0284C7]" />
                      </div>
                      <div className="space-y-2 flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-white">
                        <label className="text-sm font-semibold text-gray-700">Air Conditioning (AC)</label>
                        <input type="checkbox" checked={room.hasAc} onChange={e => handleUpdateRoom(index, 'hasAc', e.target.checked)} className="w-5 h-5 accent-[#0284C7]" />
                      </div>
                    </div>
                    
                    <div className="space-y-2 pt-2 border-t border-gray-200">
                      <label className="text-sm font-bold text-gray-900">Room Amenities</label>
                      <AmenitiesPicker selected={room.amenities || []} onChange={sel => handleUpdateRoom(index, 'amenities', sel)} />
                    </div>

                    <div className="space-y-2 pt-2 border-t border-gray-200">
                      <label className="text-sm font-bold text-gray-900">Room Photos</label>
                      <PhotoUpload photos={room.photos || []} setPhotos={p => handleUpdateRoom(index, 'photos', p)} isCompressing={isCompressing} setIsCompressing={setIsCompressing} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2: Basics */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100" onFocusCapture={() => handleFocus('Basics')} onClick={() => handleFocus('Basics')}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">The Basics</h2>
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <button 
                        type="button" 
                        className="text-sm font-semibold flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm ml-auto"
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
                                }
                            } catch(e) {
                                console.error('AI Suggestion failed', e);
                            }
                        }}
                    >
                        <span>✨ Auto-write with AI</span>
                    </button>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Property Title</label>
                  <input 
                    required 
                    value={formData.title} 
                    onChange={e => setFormData({...formData, title: e.target.value})} 
                    className="w-full p-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] focus:border-transparent outline-none text-lg transition-all" 
                    placeholder="e.g. Modern Loft with City View" 
                  />
                </div>
              </div>
              
              {(formData.rentalMode === 'entire_place' || formData.rentalMode === 'hybrid') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Monthly Rent (₹)</label>
                    <input 
                      required 
                      type="number" 
                      min="0" 
                      value={formData.price} 
                      onChange={e => setFormData({...formData, price: e.target.value})} 
                      className="w-full p-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none" 
                      placeholder="1200" 
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Description</label>
                <textarea 
                  required 
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})} 
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] outline-none min-h-[150px] resize-none" 
                  placeholder="Describe what makes your space unique, the neighborhood, and any special features..." 
                />
              </div>
            </div>
          </section>

          {/* Section: Video Tour */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100" onFocusCapture={() => handleFocus('Video Tour')} onClick={() => handleFocus('Video Tour')}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Video Tour</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Property Video URL (Optional)</label>
                <p className="text-sm text-gray-500 mb-2">
                  Provide a link to a video tour of your property (Max 45 seconds recommended, e.g. YouTube, Vimeo, or standard MP4).
                  This will be displayed prominently on your property detailing page to attract more guests.
                </p>
                <input 
                  type="url"
                  value={formData.videoUrl} 
                  onChange={e => setFormData({...formData, videoUrl: e.target.value})} 
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-[#0284C7] focus:border-transparent outline-none text-lg transition-all" 
                  placeholder="e.g. https://youtube.com/watch?v=..." 
                />
              </div>
            </div>
          </section>

          {/* Section 3: Location */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100" onFocusCapture={() => handleFocus('Location')} onClick={() => handleFocus('Location')}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Location</h2>
            <LocationPicker 
              address={formData.address} 
              city={formData.city} 
              onChange={handleLocationChange} 
            />
          </section>

          {/* Section 4: Capacity */}
          {(formData.rentalMode === 'entire_place' || formData.rentalMode === 'hybrid') && (
            <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Capacity & Layout (Entire Place)</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { label: 'Guests', key: 'maxGuests' as const },
                  { label: 'Bedrooms', key: 'bedrooms' as const },
                  { label: 'Beds', key: 'beds' as const },
                  { label: 'Bathrooms', key: 'bathrooms' as const },
                ].map((item) => (
                  <div key={item.key} className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{item.label}</label>
                    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-xl">
                      <button 
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, [item.key]: Math.max(1, prev[item.key] - 1) }))}
                        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 hover:border-gray-900 transition-colors"
                      >
                        -
                      </button>
                      <span className="font-bold text-gray-900">{formData[item.key]}</span>
                      <button 
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, [item.key]: prev[item.key] + 1 }))}
                        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 hover:border-gray-900 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Section 4.5: Dynamic Pricing */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Dynamic Pricing</h2>
            <p className="text-gray-500 mb-6">Set multiplier rules for weekends and peak seasons. Leave at 1.0 for a flat rate.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
               <div className="space-y-2">
                 <label className="text-sm font-bold text-gray-900">Weekend Multiplier (e.g. 1.2 for +20%)</label>
                 <input 
                   type="number" 
                   step="0.01"
                   min="0.5"
                   max="5.0"
                   value={formData.dynamicPricing.weekendMultiplier}
                   onChange={e => setFormData(p => ({ ...p, dynamicPricing: { ...p.dynamicPricing, weekendMultiplier: parseFloat(e.target.value) || 1.0 }}))}
                   className="w-full p-4 rounded-xl border border-gray-300 focus:border-black focus:ring-1 focus:ring-black outline-none transition-all font-bold"
                 />
               </div>
               <div className="space-y-2">
                 <label className="text-sm font-bold text-gray-900">Seasonal Multiplier</label>
                 <input 
                   type="number" 
                   step="0.01"
                   min="0.5"
                   max="5.0"
                   value={formData.dynamicPricing.seasonalMultiplier}
                   onChange={e => setFormData(p => ({ ...p, dynamicPricing: { ...p.dynamicPricing, seasonalMultiplier: parseFloat(e.target.value) || 1.0 }}))}
                   className="w-full p-4 rounded-xl border border-gray-300 focus:border-black focus:ring-1 focus:ring-black outline-none transition-all font-bold"
                 />
               </div>
            </div>
          </section>

          {/* Section 5: Amenities */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100" onClick={() => handleFocus('Amenities')} onFocusCapture={() => handleFocus('Amenities')}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Amenities</h2>
            <AmenitiesPicker selected={formData.amenities} onChange={handleAmenitiesChange} />
          </section>

          {/* Section 6: Photos */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100" onClick={() => handleFocus('Photos')}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Photos</h2>
            <PhotoUpload photos={photos} setPhotos={setPhotos} isCompressing={isCompressing} setIsCompressing={setIsCompressing} />
            {photos.length === 0 && <p className="text-red-500 text-sm mt-2">At least one photo is required.</p>}
          </section>

          {/* Section 7: SEO Settings */}
          <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">SEO Settings (Optional)</h2>
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">SEO Title</label>
                    <input type="text" value={formData.seo_title} onChange={e => setFormData({...formData, seo_title: e.target.value})} className="w-full p-4 rounded-xl border border-gray-300 focus:border-black focus:ring-1 focus:ring-black outline-none transition-all font-bold" placeholder="Custom SEO Title" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">SEO Description</label>
                    <textarea rows={2} value={formData.seo_description} onChange={e => setFormData({...formData, seo_description: e.target.value})} className="w-full p-4 rounded-xl border border-gray-300 focus:border-black focus:ring-1 focus:ring-black outline-none transition-all font-bold" placeholder="Custom SEO Description"></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">SEO Keywords</label>
                    <input type="text" value={formData.seo_keywords} onChange={e => setFormData({...formData, seo_keywords: e.target.value})} className="w-full p-4 rounded-xl border border-gray-300 focus:border-black focus:ring-1 focus:ring-black outline-none transition-all font-bold" placeholder="e.g. luxury villa, ocean view, bali" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Social Sharing Image URL</label>
                    <input type="text" value={formData.seo_image_url} onChange={e => setFormData({...formData, seo_image_url: e.target.value})} className="w-full p-4 rounded-xl border border-gray-300 focus:border-black focus:ring-1 focus:ring-black outline-none transition-all font-bold" placeholder="https://..." />
                </div>
            </div>
          </section>

          <div className="md:hidden fixed bottom-24 right-4 z-[60]">
            <button 
              type="button" 
              onClick={() => setShowMobilePreview(true)}
              className="bg-black/80 backdrop-blur-md text-white p-4 rounded-full shadow-2xl border border-white/10 active:scale-95 transition-transform"
            >
              <Eye className="w-6 h-6" />
            </button>
          </div>

          {/* Mobile Footer Action */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 z-50">
            <button 
              type="submit" 
              disabled={loading || isCompressing || photos.length === 0} 
              className="w-full py-4 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#0284C7]/20 disabled:opacity-50"
            >
              {isCompressing ? 'Compressing...' : loading ? 'Saving...' : existingListing ? 'Save Changes' : 'Publish Listing'}
            </button>
          </div>
        </form>
        </div>

        {/* Desktop Live Preview Pane */}
        <div 
          id="preview-container"
          className="hidden lg:block w-[45%] xl:w-[50%] sticky top-24 h-[calc(100vh-120px)] overflow-y-auto rounded-3xl border border-gray-200 shadow-xl bg-white no-scrollbar pb-10"
        >
           <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-gray-100 px-6 py-4 flex items-center justify-between pointer-events-none">
             <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-900">Live Customer Preview</h3>
             </div>
             <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full uppercase tracking-wider">0ms Latency Sync</span>
           </div>
           <div className="pointer-events-none p-4">
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

        {/* Mobile Swipe Up Preview */}
        <AnimatePresence>
          {showMobilePreview && (
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="fixed inset-0 z-[100] bg-white overflow-y-auto"
            >
               <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-gray-100 px-4 py-4 flex items-center justify-between shadow-sm">
                 <div className="flex items-center gap-2">
                    <Eye className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold text-gray-900">Live Preview</h3>
                 </div>
                 <button onClick={() => setShowMobilePreview(false)} className="p-2 bg-gray-100 rounded-full">
                    <X className="w-5 h-5" />
                 </button>
               </div>
               <div className="pb-20 pointer-events-none">
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
      </main>
    </div>
  );
};

export default HostForm;
