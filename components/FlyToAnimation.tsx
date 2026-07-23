
import React, { useEffect, useState } from 'react';
import { Listing } from '../types';
import { ShieldCheck, HeartIcon } from './Icons';

interface Props {
    listing: Listing;
    target: 'RESERVES' | 'WISHLIST';
    onComplete: () => void;
}

const FlyToAnimation: React.FC<Props> = ({ listing, target, onComplete }) => {
    const [style, setStyle] = useState<React.CSSProperties>({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%) scale(0.8)',
        opacity: 0,
        zIndex: 100,
    });

    useEffect(() => {
        // 1. Appear in center
        requestAnimationFrame(() => {
             setStyle(prev => ({ ...prev, opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }));
             
             // 2. Fly to target after brief pause
             setTimeout(() => {
                 const isMobile = window.innerWidth < 768;
                 
                 // Target Coordinates (Approximate based on Header layout)
                 // Desktop Header: [Reserves (~200px from right)] [Wishlist (~110px from right)] [Profile (~20px)]
                 // Mobile Header: [Menu (~24px from right)]
                 
                 const targetTop = 40; 
                 let targetRight = 20;

                 if (isMobile) {
                     // On mobile, everything flies to the Menu icon
                     targetRight = 24; 
                 } else {
                     if (target === 'RESERVES') targetRight = 210; // Reserves button position
                     if (target === 'WISHLIST') targetRight = 110; // Wishlist button position
                 }

                 const targetLeft = window.innerWidth - targetRight;

                 setStyle({
                     position: 'fixed',
                     top: `${targetTop}px`,
                     left: `${targetLeft}px`,
                     transform: 'translate(-50%, -50%) scale(0.05)',
                     opacity: 0,
                     zIndex: 100,
                     transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
                 });
             }, 500);
        });

        // 3. Cleanup
        const timer = setTimeout(onComplete, 1300);
        return () => clearTimeout(timer);
    }, [onComplete, target]);

    const isWishlist = target === 'WISHLIST';

    return (
        <div 
            style={style}
            className="flex flex-col items-center p-2 bg-dune rounded-2xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.5)] border border-gray-100 w-56 pointer-events-none overflow-hidden transition-all"
        >
            <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden mb-2">
                <img src={listing.imageUrl} className="w-full h-full object-cover" alt="" />
                <div className={`absolute inset-0 backdrop-blur-[2px] flex items-center justify-center animate-pulse ${isWishlist ? 'bg-pink-500/60' : 'bg-[#0284C7]/80'}`}>
                    {isWishlist ? (
                        <HeartIcon className="w-10 h-10 text-white" filled={true} />
                    ) : (
                        <ShieldCheck className="w-10 h-10 text-white" />
                    )}
                </div>
            </div>
            <div className="w-full text-center px-1 pb-1">
                <div className={`font-bold text-[10px] uppercase tracking-wider mb-0.5 ${isWishlist ? 'text-pink-500' : 'text-[#0284C7]'}`}>
                    {isWishlist ? 'Saved to Wishlist' : 'Booking Confirmed'}
                </div>
                <div className="text-canvas font-bold text-xs truncate">{listing.title}</div>
            </div>
        </div>
    );
};

export default FlyToAnimation;
