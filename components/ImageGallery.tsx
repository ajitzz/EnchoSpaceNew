import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { OptimizedImage } from './OptimizedImage';

interface ImageGalleryProps {
  images: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  // Sync index when opened
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (currentIndex < images.length - 1) setCurrentIndex((prev) => prev + 1);
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) setCurrentIndex((prev) => prev - 1);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, images.length, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed inset-0 z-[300] bg-black bg-opacity-95 text-white flex flex-col w-full h-full"
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 px-4 py-4 md:px-8 md:py-6 flex items-center justify-between">
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition backdrop-blur-md"
            >
              <X className="w-6 h-6 text-white" />
            </button>
            <div className="font-medium text-sm md:text-base px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md">
              {currentIndex + 1} / {images.length}
            </div>
          </div>

          {/* Main Image Viewer */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden w-full h-full group" onClick={onClose}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={1}
                onDragEnd={(e, { offset, velocity }) => {
                  const swipe = offset.x;
                  if (swipe < -50 && currentIndex < images.length - 1) {
                    setCurrentIndex((prev) => prev + 1);
                  } else if (swipe > 50 && currentIndex > 0) {
                    setCurrentIndex((prev) => prev - 1);
                  }
                }}
                className="w-full h-full flex items-center justify-center p-4 md:p-12 cursor-grab active:cursor-grabbing"
                onClick={(e) => e.stopPropagation()} // Prevent close on clicking image
              >
                <OptimizedImage
                  src={images[currentIndex]}
                  alt={`Gallery image ${currentIndex + 1}`}
                  className="max-w-full max-h-full object-contain select-none shadow-2xl rounded-sm pointer-events-none"
                />
              </motion.div>
            </AnimatePresence>

            {/* Navigation Arrows */}
            {currentIndex > 0 && (
              <button
                onClick={handlePrev}
                className="absolute left-4 p-3 rounded-full bg-white/10 hover:bg-white/20 transition backdrop-blur-md text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
            )}
            {currentIndex < images.length - 1 && (
              <button
                onClick={handleNext}
                className="absolute right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 transition backdrop-blur-md text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="relative w-full pb-8 pt-4 px-4 overflow-x-auto select-none flex justify-center no-scrollbar">
              <div className="flex gap-2 min-w-min mx-auto max-w-full">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative w-16 h-16 md:w-20 md:h-20 rounded-md overflow-hidden shrink-0 transition-all ${
                      currentIndex === idx ? 'ring-2 ring-white scale-105 opacity-100' : 'opacity-40 hover:opacity-100'
                    }`}
                  >
                    <OptimizedImage
                      src={img}
                      alt={`Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
