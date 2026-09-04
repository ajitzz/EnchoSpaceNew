import React, { useState } from 'react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImagePlus, X, GripHorizontal, Sparkles, Check, Loader2, Filter } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { motion, AnimatePresence } from 'framer-motion';

// ADR-001: tier is now a free-form string. TierCategory kept for legacy compat.
export type SpatialCategory = 'living_room' | 'dining' | 'bedroom' | 'bathroom' | 'garden' | 'exterior' | 'pool' | 'details' | 'balcony' | 'parking' | 'restaurant' | 'lobby' | 'spa' | 'gym' | 'activity_area' | 'view' | 'other';
export type TierCategory = string; // Was fixed union — now free-form (ADR-001)

export const SPATIAL_CATEGORIES: { key: SpatialCategory; label: string; icon: string }[] = [
  { key: 'bedroom', label: 'Bedroom', icon: '🛏️' },
  { key: 'bathroom', label: 'Full Bathroom', icon: '🚿' },
  { key: 'living_room', label: 'Living Room', icon: '🏛️' },
  { key: 'balcony', label: 'Balcony / Terrace', icon: '🌅' },
  { key: 'dining', label: 'Dining Area', icon: '🍽️' },
  { key: 'pool', label: 'Pool & Deck', icon: '🏊' },
  { key: 'garden', label: 'Garden', icon: '🌿' },
  { key: 'exterior', label: 'Exterior Facade', icon: '🏰' },
  { key: 'restaurant', label: 'Restaurant', icon: '🍴' },
  { key: 'lobby', label: 'Lobby / Reception', icon: '🏨' },
  { key: 'spa', label: 'Spa & Wellness', icon: '💆' },
  { key: 'gym', label: 'Gym / Fitness', icon: '🏋️' },
  { key: 'activity_area', label: 'Activity Area', icon: '🎯' },
  { key: 'view', label: 'Views', icon: '🌄' },
  { key: 'parking', label: 'Parking', icon: '🚗' },
  { key: 'details', label: 'Details', icon: '✨' },
  { key: 'other', label: 'Other', icon: '📷' },
];

export interface PhotoData {
  id: string;
  file?: File;
  previewUrl?: string;
  url?: string;
  blurhash?: string;
  category?: SpatialCategory;
  tier?: string;              // ADR-001: free-form tier key
  title?: string;
  description?: string;
  specs?: string;
}

interface PhotoUploadProps {
  photos: PhotoData[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoData[]>>;
  /** When set, tier selection is hidden and all photos are locked to this tier.
   *  Used by RoomTypeBuilder to prevent cross-room photo mixing. */
  lockedTier?: string;
  /** Label shown in the locked-tier badge */
  lockedTierLabel?: string;
  isCompressing?: boolean;
  setIsCompressing?: (val: boolean) => void;
}

interface SortablePhotoItemProps {
  photo: PhotoData;
  index: number;
  onRemove: (id: string) => void;
  isActive: boolean;
  onSelect: (id: string) => void;
  tierLabel?: string; // Display label for the tier badge
}

const SortablePhotoItem = ({ photo, index, onRemove, isActive, onSelect, tierLabel }: SortablePhotoItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : isActive ? 40 : 1 };
  const url = photo.previewUrl || photo.url || (photo as any).imageUrl || '';
  const isMain = index === 0;
  
  const activeCategory = SPATIAL_CATEGORIES.find(c => c.key === photo.category) || SPATIAL_CATEGORIES[0];
  const tierDisplay = tierLabel || photo.tier || 'common';

  return (
    <motion.div
      layout
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(photo.id)}
      className={`relative rounded-3xl overflow-hidden group transition-all cursor-pointer ${
        isMain ? 'col-span-2 row-span-2 border-4 border-[#0284C7] shadow-xl' : 'border-2 border-zinc-200/60 dark:border-neutral-800'
      } ${isDragging ? 'shadow-2xl scale-105 z-50 ring-4 ring-[#0284C7]/30 opacity-90' : 'hover:shadow-lg hover:border-[#0284C7]/50'}
      ${isActive && !isDragging ? 'ring-4 ring-[#0284C7] scale-[1.02]' : ''}`}
    >
      <div className="relative h-full w-full bg-zinc-100 dark:bg-neutral-900 overflow-hidden min-h-[160px]">
        {url ? (
          <img 
            src={url} 
            alt={photo.title || "Space Photo"} 
            className={`w-full h-full object-cover transition-transform duration-700 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} 
            onError={(e) => {
              // Graceful fallback for broken image links
              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80';
            }}
          />
        ) : (
          <div className="w-full h-full min-h-[160px] flex items-center justify-center bg-slate-800/80 text-slate-500">
            <ImagePlus className="w-8 h-8 opacity-40" />
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {isActive && <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />}

        <div className="absolute top-3 left-3 p-2 bg-black/40 backdrop-blur-md rounded-xl text-white opacity-0 group-hover:opacity-100 transition-all cursor-grab active:cursor-grabbing hover:bg-black hover:scale-105 shadow-sm z-10" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}>
          <GripHorizontal className="w-4 h-4" />
        </div>

        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(photo.id); }} className="absolute top-3 right-3 p-2 bg-black/40 backdrop-blur-md rounded-xl text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:scale-105 z-10">
          <X className="w-4 h-4" />
        </button>

        <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 z-10 opacity-90 group-hover:opacity-100">
          {isMain && (
            <div className="px-2 py-1 bg-[#0284C7] backdrop-blur-md rounded-md text-[9px] font-bold text-white uppercase tracking-widest shadow-lg flex items-center gap-1 w-fit">
              <Sparkles className="w-3 h-3" /> Hero Shot
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <div className="px-2 py-1 bg-white/20 backdrop-blur-md border border-white/20 rounded-md text-[10px] font-bold text-white flex items-center gap-1 shadow-lg">
              <span>{tierDisplay}</span>
            </div>
            <div className="px-2 py-1 bg-black/60 backdrop-blur-md rounded-md text-[10px] font-bold text-white flex items-center gap-1 shadow-lg">
              <span>{activeCategory.icon}</span> <span>{activeCategory.label}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const PhotoUpload: React.FC<PhotoUploadProps> = ({ photos, setPhotos, isCompressing, setIsCompressing, lockedTier, lockedTierLabel }) => {
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'spatial'>('spatial');
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPhotos((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (setIsCompressing) setIsCompressing(true);
    const filesArray = Array.from(e.target.files);
    const newPhotos: PhotoData[] = [];
    for (const file of filesArray) {
      try {
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
        const compressedFile = await imageCompression(file, options);
        const previewUrl = URL.createObjectURL(compressedFile);
        newPhotos.push({
          id: Math.random().toString(36).substring(2, 9),
          file: compressedFile,
          previewUrl,
          tier: lockedTier || 'common',  // ADR-001: auto-assign locked tier
          category: 'exterior'
        });
      } catch (error) {
        console.error('Image compression failed', error);
      }
    }
    setPhotos((prev) => [...prev, ...newPhotos]);
    if (setIsCompressing) setIsCompressing(false);
  };

  const activePhoto = photos.find(p => p.id === activePhotoId);

  return (

    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
            {lockedTier ? `${lockedTierLabel || lockedTier} Media` : 'Sanctuary 2D Media Matrix'}
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            {lockedTier
              ? `All photos here belong to: ${lockedTierLabel || lockedTier}. Tag each by spatial category.`
              : 'Tag each media asset to its Spatial Category.'}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-full p-[1px]">
          <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
          <label className="relative flex items-center gap-2 px-6 py-2.5 bg-white dark:bg-neutral-900 rounded-full cursor-pointer hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors">
            {isCompressing ? <Loader2 className="w-4 h-4 animate-spin text-[#0284C7]" /> : <ImagePlus className="w-4 h-4 text-[#0284C7]" />}
            <span className="font-bold text-sm text-zinc-900 dark:text-white">{isCompressing ? 'Compressing...' : 'Upload Media'}</span>
            <input type="file" multiple accept="image/*" onChange={handleFileChange} className="hidden" disabled={isCompressing} />
          </label>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        <div className={`flex-1 transition-all duration-500 ${activePhotoId ? 'xl:w-2/3' : 'w-full'}`}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
              <motion.div layout className="grid grid-cols-2 md:grid-cols-3 gap-4 auto-rows-[160px]">
                {photos.map((photo, index) => (
                  <SortablePhotoItem
                    key={photo.id} photo={photo} index={index} isActive={activePhotoId === photo.id}
                    onSelect={(id) => setActivePhotoId(activePhotoId === id ? null : id)}
                    onRemove={(id) => setPhotos(prev => prev.filter(p => p.id !== id))}
                    tierLabel={lockedTierLabel || lockedTier}
                  />
                ))}
                {photos.length === 0 && (
                  <div className="col-span-full h-[320px] rounded-3xl border-2 border-dashed border-zinc-200 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-900/50 flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-neutral-800 flex items-center justify-center text-zinc-400">
                      <ImagePlus className="w-8 h-8" />
                    </div>
                    <div className="text-center">
                      <h4 className="font-bold text-zinc-900 dark:text-white">No Photos Yet</h4>
                      <p className="text-xs text-zinc-500 mt-1">Upload high-resolution photography for this space.</p>
                    </div>
                  </div>
                )}
              </motion.div>
            </SortableContext>
          </DndContext>
        </div>

        <AnimatePresence>
          {activePhoto && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col bg-white dark:bg-neutral-900 rounded-3xl border border-zinc-200/60 dark:border-neutral-800 shadow-xl overflow-hidden flex-shrink-0 w-full xl:w-[360px] xl:h-full mt-6 xl:mt-0"
            >
              <div className="w-full flex flex-col h-full">
                <div className="p-6 border-b border-zinc-100 dark:border-neutral-800 flex items-center justify-between bg-zinc-50/50 dark:bg-neutral-900/50">
                  <div className="flex flex-col">
                    <h4 className="font-bold text-zinc-900 dark:text-white">Photo Inspector</h4>
                    {lockedTier && (
                      <span className="text-[10px] font-bold text-[#0284C7] mt-0.5 flex items-center gap-1">
                        🔒 Locked to: {lockedTierLabel || lockedTier}
                      </span>
                    )}
                    {!lockedTier && (
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Spatial Tag</span>
                    )}
                  </div>
                  <button onClick={() => setActivePhotoId(null)} className="p-2 bg-white dark:bg-neutral-800 rounded-full hover:bg-zinc-100 transition-colors shadow-sm border border-zinc-200 dark:border-neutral-700">
                    <X className="w-4 h-4 text-zinc-500" />
                  </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                  {/* Spatial Category Grid — always shown */}
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-3">Spatial Category</label>
                    <div className="grid grid-cols-3 gap-2">
                      {SPATIAL_CATEGORIES.map(cat => (
                        <button
                          key={cat.key}
                          onClick={() => setPhotos(prev => prev.map(p => p.id === activePhoto.id ? { ...p, category: cat.key } : p))}
                          className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-all border-2 ${
                            (activePhoto.category || 'exterior') === cat.key 
                              ? 'border-[#0284C7] bg-[#0284C7]/5 text-[#0284C7]' 
                              : 'border-transparent bg-zinc-50 dark:bg-neutral-800/50 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100'
                          }`}
                        >
                          <span className="text-xl">{cat.icon}</span>
                          <span className="font-bold text-[9px] text-center uppercase tracking-wider leading-tight">{cat.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-100 dark:border-neutral-800">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5"><Filter className="w-3 h-3"/>Space Name (Title)</label>
                    <input 
                      type="text"
                      className="w-full mt-3 p-3 rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#0284C7] outline-none transition-all font-bold"
                      placeholder="e.g. Master Salon"
                      value={activePhoto.title || ''}
                      onChange={e => setPhotos(prev => prev.map(p => p.id === activePhoto.id ? { ...p, title: e.target.value } : p))}
                    />
                  </div>

                  <div className="pt-4 border-t border-zinc-100 dark:border-neutral-800">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5"><Filter className="w-3 h-3"/>Caption (Description)</label>
                    <textarea 
                      className="w-full mt-3 p-3 rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 text-sm focus:ring-2 focus:ring-[#0284C7] outline-none transition-all resize-none h-20 font-medium"
                      placeholder="e.g. Acoustic Hearth & Evening Reading Salon"
                      value={activePhoto.description || ''}
                      onChange={e => setPhotos(prev => prev.map(p => p.id === activePhoto.id ? { ...p, description: e.target.value } : p))}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
