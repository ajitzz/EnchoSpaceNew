import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation, useMotionValue } from 'framer-motion';

interface Props {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export const PullToRefresh: React.FC<Props> = ({ onRefresh, children }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const controls = useAnimation();
  
  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);

  const THRESHOLD = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY > 5) return;
    startY.current = e.touches[0].clientY;
    isPulling.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    
    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;

    if (diff > 0 && window.scrollY <= 0) {
      if (e.cancelable) e.preventDefault();
      const pullDistance = Math.min(diff * 0.4, THRESHOLD * 1.5);
      y.set(pullDistance);
      if (pullDistance >= THRESHOLD && !isRefreshing) {
         if (navigator.vibrate) navigator.vibrate(10);
      }
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    const currentPull = y.get();

    if (currentPull >= THRESHOLD && !isRefreshing) {
      if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
      setIsRefreshing(true);
      controls.start({ y: 50, transition: { type: 'spring', stiffness: 400, damping: 25 } });
      try { await onRefresh(); } finally {
        setIsRefreshing(false);
        controls.start({ y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
      }
    } else {
      controls.start({ y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
    }
  };

  return (
    <div ref={containerRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} className="w-full relative">
      <motion.div className="absolute top-0 left-0 w-full flex justify-center items-center pointer-events-none z-0 h-16">
        <motion.div style={{ opacity: useMotionValue(0), scale: isRefreshing ? 1 : 0.8 }} animate={isRefreshing ? { rotate: 360 } : {}} transition={isRefreshing ? { repeat: Infinity, duration: 1, ease: 'linear' } : {}} className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-gray-900 mt-safe" />
      </motion.div>
      <motion.div style={{ y }} animate={controls} className="w-full bg-dune relative z-10 min-h-screen">{children}</motion.div>
    </div>
  );
};
