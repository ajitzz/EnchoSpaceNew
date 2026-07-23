import React from 'react';
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
import { ImagePlus, X, GripHorizontal } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { encodeImageToBlurhash } from '../lib/blurhash';

interface SortablePhotoProps {
  id: string;
  url: string;
  file?: File;
  onRemove: (id: string) => void;
  isMain?: boolean;
}

const SortablePhoto: React.FC<SortablePhotoProps> = ({ id, url, onRemove, isMain }) => {
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
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative aspect-video rounded-2xl overflow-hidden group border-2 transition-shadow ${isMain ? 'border-[#0284C7]' : 'border-gray-200'} ${isDragging ? 'shadow-2xl scale-105 z-50 ring-4 ring-[#0284C7]/30' : 'hover:shadow-md'}`}
    >
      <div className="w-full h-full bg-gray-100">
        <img src={url} alt="Space" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
      </div>
      
      {/* Overlay to dim on drag */}
      {isDragging && <div className="absolute inset-0 bg-dune/20 backdrop-blur-[2px]" />}

      {/* Drag Handle */}
      <div 
        className="absolute top-3 left-3 p-2 bg-black/60 backdrop-blur-md rounded-xl text-white opacity-0 group-hover:opacity-100 transition-all cursor-grab active:cursor-grabbing hover:bg-black hover:scale-105 shadow-sm"
        {...attributes}
        {...listeners}
      >
        <GripHorizontal className="w-5 h-5 pointer-events-none" />
      </div>

      {isMain && (
        <div className="absolute bottom-3 left-3 bg-[#0284C7] text-white px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider shadow-md z-10 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-dune animate-pulse" />
          Cover Photo
        </div>
      )}

      {/* Remove Button */}
      <button 
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation(); // prevent drag
        }}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(id);
        }}
        className="absolute top-3 right-3 p-2 bg-dune/90 backdrop-blur-md rounded-xl shadow-sm hover:bg-dune transition-all opacity-0 group-hover:opacity-100 hover:scale-105 hover:text-red-500"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
};

export interface PhotoData {
  id: string; // unique internal id for sorting
  file?: File;
  previewUrl: string;
  blurhash?: string;
}

interface PhotoUploadProps {
  photos: PhotoData[];
  setPhotos: (photos: PhotoData[]) => void;
  isCompressing?: boolean;
  setIsCompressing?: (val: boolean) => void;
}


export const PhotoUpload: React.FC<PhotoUploadProps> = ({ photos, setPhotos, isCompressing, setIsCompressing }) => {
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

  const processFiles = async (files: FileList | File[]) => {
    const activeSetCompressing = setIsCompressing || setLocalCompressing;
    activeSetCompressing(true);
    
    try {
        const compressedFiles = await Promise.all(
          Array.from(files).map(async (file) => {
            const options = {
              maxSizeMB: 0.5,
              maxWidthOrHeight: 1600,
              useWebWorker: true,
              fileType: 'image/webp',
              initialQuality: 0.8,
            };
            
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
                previewUrl: URL.createObjectURL(compressedFile), // URL.createObjectURL works with Blob/File
                blurhash
              };
            } catch (error) {
              console.error('Compression error:', error);
              return {
                id: Math.random().toString(36).substr(2, 9),
                file,
                previewUrl: URL.createObjectURL(file)
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
    // clear value to allow adding same file again
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
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
                  onRemove={handleRemove}
                  isMain={index === 0}
                />
              ))}
            </SortableContext>
          </div>
        </DndContext>
      )}

      {/* Upload Zone */}
      <div 
        className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer relative group ${
          isDragActive 
            ? 'border-[#0284C7] bg-[#0284C7]/5 scale-[1.02]' 
            : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
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
        <div className="flex flex-col items-center gap-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
            isDragActive 
              ? 'bg-[#0284C7]/10 text-[#0284C7] scale-110 animate-pulse' 
              : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200 group-hover:text-gray-600 group-hover:scale-105'
          }`}>
            <ImagePlus className="w-8 h-8" />
          </div>
          <div>
            <p className={`text-lg font-bold transition-colors ${isDragActive ? 'text-[#0284C7]' : 'text-canvas'}`}>
              {(isCompressing || localCompressing) ? 'Compressing images...' : isDragActive ? 'Drop your photos here' : photos.length > 0 ? 'Add more photos' : 'Add photos of your space'}
            </p>
            <p className="text-gray-500 mt-1">
               {(isCompressing || localCompressing) ? 'Please wait a moment' : 'Drag & drop photos here, or click to browse'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
