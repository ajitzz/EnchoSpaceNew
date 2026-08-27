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
import { ImagePlus, X, GripHorizontal, Tag, Sparkles, ChevronDown } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { encodeImageToBlurhash } from '../lib/blurhash';

export type SpatialCategory = 
  | 'living_room' 
  | 'dining' 
  | 'bedroom' 
  | 'bathroom' 
  | 'garden' 
  | 'exterior' 
  | 'pool' 
  | 'details' 
  | 'other';

export const SPATIAL_CATEGORIES: { key: SpatialCategory; label: string; icon: string }[] = [
  { key: 'living_room', label: 'Living Room', icon: '🏛️' },
  { key: 'dining', label: 'Dining Area', icon: '🍽️' },
  { key: 'bedroom', label: 'Bedroom', icon: '🛏️' },
  { key: 'bathroom', label: 'Full Bathroom', icon: '🚿' },
  { key: 'garden', label: 'Back Garden', icon: '🌿' },
  { key: 'exterior', label: 'Exterior Facade', icon: '🏰' },
  { key: 'pool', label: 'Pool & Deck', icon: '🏊' },
  { key: 'details', label: 'Additional Details', icon: '✨' },
];

export interface PhotoData {
  id: string; // unique internal id for sorting
  file?: File;
  previewUrl: string;
  blurhash?: string;
  category?: SpatialCategory;
  title?: string;
  description?: string;
  specs?: string;
}

interface SortablePhotoProps {
  id: string;
  url: string;
  file?: File;
  photo: PhotoData;
  onRemove: (id: string) => void;
  onUpdateMetadata: (id: string, metadata: Partial<PhotoData>) => void;
  isMain?: boolean;
}

const SortablePhoto: React.FC<SortablePhotoProps> = ({ 
  id, 
  url, 
  photo, 
  onRemove, 
  onUpdateMetadata, 
  isMain 
}) => {
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 1,
  };

  const activeCategory = SPATIAL_CATEGORIES.find(c => c.key === photo.category) || SPATIAL_CATEGORIES[0];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-2xl overflow-hidden group border-2 transition-all bg-white flex flex-col ${
        isMain ? 'border-amber-500 shadow-md' : 'border-zinc-200 hover:border-zinc-300'
      } ${isDragging ? 'shadow-2xl scale-105 z-50 ring-4 ring-amber-500/30' : 'hover:shadow-lg'}`}
    >
      <div className="relative aspect-video w-full bg-zinc-100 overflow-hidden">
        <img src={url} alt="Space" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        
        {/* Dim on drag */}
        {isDragging && <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px]" />}

        {/* Drag Handle */}
        <div 
          className="absolute top-2.5 left-2.5 p-1.5 bg-black/60 backdrop-blur-md rounded-lg text-white opacity-0 group-hover:opacity-100 transition-all cursor-grab active:cursor-grabbing hover:bg-black hover:scale-105 shadow-xs z-10"
          {...attributes}
          {...listeners}
          title="Drag to re-order"
        >
          <GripHorizontal className="w-4 h-4 pointer-events-none" />
        </div>

        {/* Cover Photo Pill */}
        {isMain && (
          <div className="absolute top-2.5 right-11 bg-amber-500 text-zinc-950 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider shadow-md z-10 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-pulse" />
            Cover Hero
          </div>
        )}

        {/* Remove Button */}
        <button 
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(id);
          }}
          className="absolute top-2.5 right-2.5 p-1.5 bg-white/90 backdrop-blur-md rounded-lg shadow-xs hover:bg-white transition-all text-zinc-600 hover:text-red-500 hover:scale-105 z-10 cursor-pointer"
          title="Delete photo"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Architectural Spatial Tag & Metadata Bar */}
      <div className="p-3 bg-zinc-50 border-t border-zinc-100 space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Category Dropdown Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTagMenu(prev => !prev)}
              className="px-2.5 py-1 rounded-lg bg-zinc-200/80 hover:bg-zinc-300/80 text-zinc-800 text-[11px] font-bold font-display flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>{activeCategory.icon}</span>
              <span>{activeCategory.label}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {showTagMenu && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-zinc-200 p-1 z-30 space-y-0.5 animate-fade-in">
                {SPATIAL_CATEGORIES.map(cat => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => {
                      onUpdateMetadata(id, { category: cat.key });
                      setShowTagMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-display flex items-center gap-2 transition-all cursor-pointer ${
                      photo.category === cat.key ? 'bg-amber-50 text-amber-900 font-bold' : 'hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsEditingText(prev => !prev)}
            className="text-[10px] font-mono font-bold text-amber-700 hover:text-amber-800 underline cursor-pointer"
          >
            {isEditingText ? 'Done' : (photo.title ? 'Edit Story' : '+ Add Story')}
          </button>
        </div>

        {/* Spatial Description / Title Inputs */}
        {isEditingText ? (
          <div className="space-y-1.5 pt-1 animate-fade-in">
            <input
              type="text"
              placeholder="Spatial Title (e.g. Sunken Fireside Salon)"
              value={photo.title || ''}
              onChange={(e) => onUpdateMetadata(id, { title: e.target.value })}
              className="w-full text-xs p-2 rounded-lg border border-zinc-200 bg-white focus:outline-none focus:border-amber-400 font-display"
            />
            <input
              type="text"
              placeholder="Architectural note / lighting / materials..."
              value={photo.description || ''}
              onChange={(e) => onUpdateMetadata(id, { description: e.target.value })}
              className="w-full text-[11px] p-2 rounded-lg border border-zinc-200 bg-white focus:outline-none focus:border-amber-400 font-sans"
            />
          </div>
        ) : photo.title ? (
          <p className="text-[11px] font-bold text-zinc-800 font-display truncate">
            {photo.title}
          </p>
        ) : null}
      </div>
    </div>
  );
};

interface PhotoUploadProps {
  photos: PhotoData[];
  setPhotos: (photos: PhotoData[]) => void;
  isCompressing?: boolean;
  setIsCompressing?: (val: boolean) => void;
}

export const PhotoUpload: React.FC<PhotoUploadProps> = ({ 
  photos, 
  setPhotos, 
  isCompressing, 
  setIsCompressing 
}) => {
  const [isDragActive, setIsDragActive] = React.useState(false);
  const [localCompressing, setLocalCompressing] = React.useState(false);
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = photos.findIndex(item => item.id === active.id);
      const newIndex = photos.findIndex(item => item.id === over.id);
      setPhotos(arrayMove(photos, oldIndex, newIndex));
    }
  };

  const handleUpdateMetadata = (id: string, metadata: Partial<PhotoData>) => {
    setPhotos(photos.map(p => p.id === id ? { ...p, ...metadata } : p));
  };

  const processFiles = async (files: FileList | File[]) => {
    const activeSetCompressing = setIsCompressing || setLocalCompressing;
    activeSetCompressing(true);
    
    try {
        const compressedFiles = await Promise.all(
          Array.from(files).map(async (file, idx) => {
            const options = {
              maxSizeMB: 0.5,
              maxWidthOrHeight: 1600,
              useWebWorker: true,
              fileType: 'image/webp',
              initialQuality: 0.8,
            };
            
            const categoryKeys: SpatialCategory[] = ['exterior', 'living_room', 'pool', 'bedroom', 'bathroom', 'dining', 'garden', 'details'];
            const defaultCat = categoryKeys[(photos.length + idx) % categoryKeys.length];

            try {
              const compressedFile = await imageCompression(file, options);
              let blurhash = undefined;
              try {
                  blurhash = await encodeImageToBlurhash(compressedFile);
              } catch (e) {
                  console.warn("Failed to generate blurhash:", e);
              }
              return {
                id: Math.random().toString(36).substr(2, 9),
                file: compressedFile,
                previewUrl: URL.createObjectURL(compressedFile),
                category: defaultCat,
                blurhash
              };
            } catch (error) {
              console.error('Compression error:', error);
              return {
                id: Math.random().toString(36).substr(2, 9),
                file,
                previewUrl: URL.createObjectURL(file),
                category: defaultCat
              };
            }
          })
        );
        setPhotos([...photos, ...compressedFiles]);
    } finally {
        activeSetCompressing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (id: string) => {
    setPhotos(photos.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-4">
      {photos.length > 0 && (
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <SortableContext 
              items={photos.map(p => p.id)}
              strategy={rectSortingStrategy}
            >
              {photos.map((photo, index) => (
                <SortablePhoto 
                  key={photo.id}
                  id={photo.id}
                  url={photo.previewUrl}
                  file={photo.file}
                  photo={photo}
                  onRemove={handleRemove}
                  onUpdateMetadata={handleUpdateMetadata}
                  isMain={index === 0}
                />
              ))}
            </SortableContext>
          </div>
        </DndContext>
      )}

      {/* Upload Zone */}
      <div 
        className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all cursor-pointer relative group ${
          isDragActive 
            ? 'border-amber-500 bg-amber-500/5 scale-[1.01]' 
            : 'border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300'
        }`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input 
          type="file" 
          title=""
          accept="image/*" 
          multiple
          onChange={handleFileChange} 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
        />
        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            isDragActive 
              ? 'bg-amber-500/10 text-amber-600 scale-110 animate-pulse' 
              : 'bg-zinc-100 text-zinc-400 group-hover:bg-zinc-200 group-hover:text-zinc-600 group-hover:scale-105'
          }`}>
            <ImagePlus className="w-7 h-7" />
          </div>
          <div>
            <p className={`text-base font-bold font-display transition-colors ${isDragActive ? 'text-amber-600' : 'text-zinc-900'}`}>
              {(isCompressing || localCompressing) ? 'Compressing high-res images...' : isDragActive ? 'Drop sanctuary photos here' : photos.length > 0 ? 'Add more spatial perspectives' : 'Upload sanctuary photos & assign spatial zones'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
               {(isCompressing || localCompressing) ? 'Generating blurhashes & WebP...' : 'Categorize Living Room, Dining, Bedroom, Bathroom, Garden, Pool, and Details'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
