import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShareIcon, PlusSquareIcon, XIcon } from './Icons';

export const InstallPrompt: React.FC = () => {
    const [showPrompt, setShowPrompt] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Check if already installed
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
        if (isStandalone) return;

        // Detect iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIOS(isIOSDevice);

        // Android Install Prompt
        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowPrompt(true);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Show iOS prompt after a slight delay if they are on Safari
        if (isIOSDevice) {
            const isSafari = /safari/.test(userAgent) && !/chrome|crios|crmo/.test(userAgent);
            if (isSafari) {
                // Only show once per session or use localStorage to limit
                const hasSeenPrompt = sessionStorage.getItem('hasSeenInstallPrompt');
                if (!hasSeenPrompt) {
                    setTimeout(() => {
                        setShowPrompt(true);
                        sessionStorage.setItem('hasSeenInstallPrompt', 'true');
                    }, 5000);
                }
            }
        }

        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    const handleInstallClick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setShowPrompt(false);
            }
            setDeferredPrompt(null);
        } else if (isIOS) {
            // Can't automatically install on iOS, just show them how
        }
    };

    if (!showPrompt) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 200, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 200, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:bottom-8 md:w-96 z-[9999]"
            >
                <div className="bg-dune/90 backdrop-blur-3xl saturate-150 p-5 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.15)] border border-white/50 glass-panel">
                    <button 
                        onClick={() => setShowPrompt(false)}
                        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"
                    >
                        <XIcon className="w-4 h-4" />
                    </button>
                    
                    <div className="flex items-start gap-4 pr-8">
                        <img src="/logo.svg" alt="App Icon" className="w-14 h-14 rounded-2xl shadow-sm" />
                        <div>
                            <h3 className="font-bold text-canvas text-[15px]">Install Amigove</h3>
                            <p className="text-sm text-gray-500 mt-1 leading-snug">
                                Add to your home screen for a full-screen, native experience.
                            </p>
                        </div>
                    </div>

                    {isIOS ? (
                        <div className="mt-4 bg-gray-50/50 rounded-xl p-3 text-xs text-gray-600 font-medium flex flex-col gap-2 border border-gray-100/50">
                            <div className="flex items-center gap-2">
                                1. Tap <ShareIcon className="w-4 h-4 text-brand" /> in the Safari menu bar
                            </div>
                            <div className="flex items-center gap-2">
                                2. Scroll down and tap <PlusSquareIcon className="w-4 h-4 text-canvas" /> "Add to Home Screen"
                            </div>
                        </div>
                    ) : (
                        <button 
                            onClick={handleInstallClick}
                            className="mt-4 w-full bg-gray-900 text-white font-bold text-sm py-3 rounded-xl hover:bg-gray-800 transition-colors active:scale-95"
                        >
                            Install App
                        </button>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
