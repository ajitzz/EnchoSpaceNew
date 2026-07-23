import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Volume2, VolumeX, Eye, X, Share2, MessageCircle, Play, Pause, MapPin } from 'lucide-react';

interface ExperienceVideo {
  id: number;
  experience_id: number;
  user_id?: number;
  video_url: string;
  thumbnail_url: string;
  title: string;
  author_name: string;
  likes: number;
  created_at: string;
}

interface VideoReelsModalProps {
  videos: ExperienceVideo[];
  initialVideoId: number | null;
  onClose: () => void;
  onLike: (id: number, e: React.MouseEvent) => void;
  isMuted: boolean;
  setIsMuted: (val: boolean) => void;
}

export const VideoReelsModal: React.FC<VideoReelsModalProps> = ({ 
  videos, 
  initialVideoId, 
  onClose, 
  onLike,
  isMuted,
  setIsMuted
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialVideoId && containerRef.current) {
      const idx = videos.findIndex(v => v.id === initialVideoId);
      if (idx !== -1) {
        // Scroll to the index on mount
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.scrollTo({
              top: idx * containerRef.current.clientHeight,
              behavior: 'auto'
            });
          }
        }, 100);
      }
    }
  }, [initialVideoId, videos]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: 20 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[120] flex items-center justify-center overflow-hidden"
    >
      <button
        onClick={onClose}
        className="absolute top-6 left-6 z-[130] w-12 h-12 rounded-full bg-dune/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-dune/20 transition-all hover:scale-110 active:scale-95 shadow-2xl"
      >
        <X className="w-5 h-5" />
      </button>

      <div 
        ref={containerRef}
        className="relative w-full h-[100dvh] md:h-[90dvh] md:max-w-[400px] md:rounded-[2.5rem] mx-auto snap-y snap-mandatory overflow-y-auto scrollbar-hide bg-black md:shadow-[0_0_50px_rgba(0,0,0,0.5)] md:border border-white/10"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style dangerouslySetInnerHTML={{__html: `
          ::-webkit-scrollbar { display: none; }
        `}} />
        {videos.map((vid, idx) => (
          <VideoReelItem 
            key={vid.id}
            vid={vid}
            onLike={onLike}
            isMuted={isMuted}
            setIsMuted={setIsMuted}
            containerRef={containerRef}
          />
        ))}
      </div>
    </motion.div>
  );
};

const VideoReelItem = ({ vid, onLike, isMuted, setIsMuted, containerRef }: { key?: React.Key, vid: ExperienceVideo, onLike: (id: number, e: React.MouseEvent) => void, isMuted: boolean, setIsMuted: (val: boolean) => void, containerRef: React.RefObject<HTMLDivElement> }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showPlayAnimation, setShowPlayAnimation] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting);
          if (entry.isIntersecting) {
             videoRef.current?.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          } else {
             videoRef.current?.pause();
             setIsPlaying(false);
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.7,
      }
    );

    if (videoRef.current) {
      observer.observe(videoRef.current);
    }

    return () => observer.disconnect();
  }, [containerRef]);

  const togglePlay = () => {
      if (videoRef.current) {
          if (isPlaying) {
              videoRef.current.pause();
              setIsPlaying(false);
          } else {
              videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          }
          
          setShowPlayAnimation(true);
          setTimeout(() => setShowPlayAnimation(false), 500);
      }
  };

  const handleTimeUpdate = () => {
      if (videoRef.current) {
          const progress = (videoRef.current.currentTime / videoRef.current.duration) * 100;
          setProgress(progress);
      }
  };

  return (
    <div 
        className="w-full h-[100dvh] md:h-full snap-start snap-always relative flex-shrink-0 bg-black overflow-hidden flex items-center justify-center cursor-pointer group"
        onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={vid.video_url}
        loop
        muted={isMuted}
        playsInline
        onTimeUpdate={handleTimeUpdate}
        className="w-full h-full object-cover transition-transform duration-700"
      />
      
      {/* Player overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/60 pointer-events-none" />

      {/* Play/Pause Animation Overlay */}
      <AnimatePresence>
          {showPlayAnimation && (
              <motion.div 
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.5 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 m-auto w-24 h-24 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white pointer-events-none z-30"
              >
                  {isPlaying ? <Play className="w-10 h-10 fill-white ml-2" /> : <Pause className="w-10 h-10 fill-white" />}
              </motion.div>
          )}
      </AnimatePresence>

      {/* Header details */}
      <div className="absolute top-6 right-5 flex items-center gap-3 z-20" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col items-end">
              <h5 className="text-white text-sm font-bold tracking-tight drop-shadow-md">{vid.author_name || 'Verified Explorer'}</h5>
              <span className="text-[9px] text-emerald-400 font-bold tracking-widest uppercase drop-shadow-md bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">Verified Reel</span>
          </div>
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 p-[2px] shadow-xl">
              <div className="w-full h-full rounded-full bg-black/80 flex items-center justify-center text-sm font-black text-white backdrop-blur-md">
                  {vid.author_name?.charAt(0) || 'E'}
              </div>
          </div>
      </div>

      {/* Sidebar Interaction Buttons */}
      <div className="absolute right-5 bottom-28 flex flex-col gap-6 items-center z-20" onClick={(e) => e.stopPropagation()}>
          <button
              onClick={(e) => onLike(vid.id, e)}
              className="group/btn flex flex-col items-center gap-1.5 active:scale-90 transition-all duration-300"
          >
              <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl group-hover/btn:bg-rose-500/20 group-hover/btn:border-rose-500/50 transition-colors">
                  <Heart className="w-6 h-6 text-white group-hover/btn:fill-rose-500 group-hover/btn:text-rose-500 transition-all" />
              </div>
              <span className="text-xs text-white font-bold drop-shadow-md">{vid.likes || 0}</span>
          </button>

          <button
              className="group/btn flex flex-col items-center gap-1.5 active:scale-90 transition-all duration-300"
          >
              <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl group-hover/btn:bg-brand/20 group-hover/btn:border-brand/50 transition-colors">
                  <MessageCircle className="w-6 h-6 text-white group-hover/btn:fill-blue-500/50 transition-all" />
              </div>
              <span className="text-xs text-white font-bold drop-shadow-md">24</span>
          </button>

          <button
              className="group/btn flex flex-col items-center gap-1.5 active:scale-90 transition-all duration-300"
          >
              <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl group-hover/btn:bg-green-500/20 group-hover/btn:border-green-500/50 transition-colors">
                  <Share2 className="w-6 h-6 text-white group-hover/btn:text-green-400 transition-all" />
              </div>
              <span className="text-xs text-white font-bold drop-shadow-md">Share</span>
          </button>

          <button
              onClick={(e) => setIsMuted(!isMuted)}
              className="group/btn flex flex-col items-center gap-1.5 active:scale-90 transition-all duration-300 mt-2"
          >
              <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl group-hover/btn:bg-dune/20 transition-colors">
                  {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
              </div>
          </button>
      </div>

      {/* Footer description overlay */}
      <div className="absolute bottom-6 left-5 right-20 text-left z-20 pointer-events-none">
          <div className="flex items-center gap-2 mb-3">
              <span className="bg-dune/20 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/30 flex items-center gap-1.5 shadow-lg">
                  <MapPin className="w-3 h-3" />
                  Wayanad
              </span>
              <span className="bg-black/40 backdrop-blur-md text-gray-300 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1.5 shadow-lg">
                  <Eye className="w-3 h-3" />
                  1.2K
              </span>
          </div>
          <h4 className="text-white text-xl font-black tracking-tight mb-2 drop-shadow-lg leading-tight">{vid.title}</h4>
          <p className="text-gray-300 text-sm font-medium leading-relaxed drop-shadow-md line-clamp-2">
              Captured during our weekend escape. Amazing vibes, great network, and pure nature.
          </p>
      </div>
      
      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-dune/20 z-20">
          <div 
              className="h-full bg-emerald-500 transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(16,185,129,0.8)]"
              style={{ width: `${progress}%` }}
          />
      </div>
    </div>
  );
};

