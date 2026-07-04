import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const NetworkStatus: React.FC = () => {
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return (
        <AnimatePresence>
            {isOffline && (
                <motion.div
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -100, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="fixed top-0 left-0 right-0 z-[9999] flex justify-center pt-safe pointer-events-none"
                >
                    <div className="mt-2 bg-gray-900/90 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide shadow-lg flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        No Internet Connection
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
