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

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
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
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) window.navigator.vibrate([15, 30, 15]);
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[300] bg-black text-white flex items-center justify-center touch-none"
          onClick={onClose}
        >
          <div className="absolute top-0 left-0 right-0 p-4 pt-safe flex justify-between items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
            <button
              onClick={(e) => { e?.stopPropagation(); onClose(); }}
              className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="font-semibold text-sm bg-black/40 backdrop-blur-md px-3 py-1 rounded-full">
              {currentIndex + 1} / {images.length}
            </div>
          </div>

          <motion.div
            className="relative w-full h-full flex items-center justify-center"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.8}
            onDragEnd={(e, { offset, velocity }) => {
              if (offset.y > 100 || velocity.y > 500) {
                onClose();
              }
            }}
          >
            <motion.div
                key={currentIndex}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full h-full flex items-center justify-center absolute inset-0"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={1}
                onDragEnd={(e, { offset, velocity }) => {
                    const swipeThreshold = 50;
                    if (offset.x < -swipeThreshold || velocity.x < -500) {
                        handleNext();
                    } else if (offset.x > swipeThreshold || velocity.x > 500) {
                        handlePrev();
                    }
                }}
            >
                <div className="w-full h-full flex items-center justify-center p-4">
                  <OptimizedImage
                    src={images[currentIndex]}
                    alt={`Gallery image ${currentIndex + 1}`}
                    className="max-w-full max-h-full object-contain pointer-events-none"
                    style={{ maxHeight: '85vh' }}
                  />
                </div>
            </motion.div>
          </motion.div>

          {/* Desktop Controls (Hidden on small screens) */}
          {currentIndex > 0 && (
            <button
              onClick={(e) => { handlePrev(); e?.stopPropagation(); }}
              className="hidden md:flex absolute left-4 p-3 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition z-10"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}
          {currentIndex < images.length - 1 && (
            <button
              onClick={(e) => { handleNext(); e?.stopPropagation(); }}
              className="hidden md:flex absolute right-4 p-3 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition z-10"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
