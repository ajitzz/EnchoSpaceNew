const fs = require('fs');
let code = fs.readFileSync('components/ListingDetails.tsx', 'utf8');

const floatingHeaderStart = code.indexOf('{/* Floating Scroll-Aware Header */}');
const floatingHeaderEnd = code.indexOf('{/* Main Content Container - Added pt-20 to compensate for fixed header */}');
if (floatingHeaderStart !== -1 && floatingHeaderEnd !== -1) {
    const oldHeader = code.substring(floatingHeaderStart, floatingHeaderEnd);
    
    // We make the header ONLY visible on desktop OR when scrolled down on mobile.
    // Wait, on mobile we'll have a different absolute header if not scrolled. 
    // Actually, Airbnb hides the top bar until scrolled, then it shows.
    // We can just add `hidden md:flex` to this one, and create a custom mobile floating header!
    
    const newHeader = oldHeader.replace(
        `className="\n            fixed top-0`,
        `className="\n            hidden md:flex fixed top-0`
    );
    code = code.replace(oldHeader, newHeader);
}

// Update the Main Content Container to have 0 padding on mobile, and pt-20 on desktop
code = code.replace(
    `<div className="max-w-7xl mx-auto px-4 sm:px-6 pt-20">`,
    `<div className="max-w-7xl mx-auto md:px-6 md:pt-20">`
);

// Mobile carousel - full bleed, aspect ratio fix
const mobileCarouselStart = code.indexOf('{/* Mobile Carousel (Swipable) */}');
const mobileCarouselEnd = code.indexOf('{/* Desktop Grid (Airbnb/Zumper style) */}');
if (mobileCarouselStart !== -1 && mobileCarouselEnd !== -1) {
    const mobileCarousel = code.substring(mobileCarouselStart, mobileCarouselEnd);
    const newCarousel = `
        {/* Mobile Header Buttons (Absolute over image) */}
        <div className="md:hidden absolute top-0 inset-x-0 z-[70] flex items-center justify-between p-4 pt-safe mt-2 pointer-events-none">
            <button 
                onClick={(e) => { e.stopPropagation(); uiAudio.playClick(); onBack(); }}
                className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center shadow-lg pointer-events-auto active:scale-95 transition-transform"
            >
                <ChevronLeft className="w-5 h-5 text-gray-900 pr-0.5" />
            </button>
            <div className="flex gap-2">
                <button className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center shadow-lg pointer-events-auto active:scale-95 transition-transform">
                    <svg viewBox="0 0 32 32" className="w-4 h-4 text-gray-900" aria-hidden="true" role="presentation" focusable="false" style={{display: 'block', fill: 'none', stroke: 'currentcolor', strokeWidth: 2.5, overflow: 'visible'}}><g fill="none"><path d="M27 18v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9"></path><path d="M16 3v23V3z"></path><path d="M6 13l9.293-9.293a1 1 0 0 1 1.414 0L26 13"></path></g></svg>
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); uiAudio.playPop(); onToggleFavorite(listing); }}
                    className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center shadow-lg pointer-events-auto active:scale-95 transition-transform"
                >
                    <HeartIcon className={\`w-5 h-5 \${isFavorite ? 'fill-[#e51d53] text-[#e51d53]' : 'text-gray-900'}\`} filled={isFavorite} />
                </button>
            </div>
        </div>
        
        {/* Mobile Carousel (Swipable) */}
        <div className="md:hidden flex overflow-x-auto snap-x snap-mandatory scrollbar-hide aspect-[4/3] w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {images.map((img, i) => (
                <div key={i} className="w-full h-full flex-shrink-0 snap-center relative">
                    <OptimizedImage 
                        src={img} 
                        priority={i === 0}
                        className="w-full h-full object-cover cursor-pointer" 
                        alt={\`Mobile Image \${i + 1}\`}
                        onClick={() => openGallery(i)}
                    />
                    {listing.isVerified && i === 0 && (
                        <div className="absolute top-16 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 pointer-events-none">
                            <ShieldCheck className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-bold tracking-wide text-gray-900 uppercase">Verified Plus</span>
                        </div>
                    )}
                    <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-md text-white text-xs font-medium cursor-pointer pointer-events-none">
                        {i + 1} / {images.length}
                    </div>
                </div>
            ))}
        </div>
    `;
    code = code.replace(mobileCarousel, newCarousel);
}

// Title and Content needs padding on mobile!
code = code.replace(
    `<div className="mb-8 relative group rounded-2xl overflow-hidden">`,
    `<div className="md:mb-8 relative group md:rounded-2xl overflow-hidden">`
);

code = code.replace(
    `{/* Title & Key Stats */}`,
    `<div className="px-5 md:px-0 mt-5 md:mt-0">\n        {/* Title & Key Stats */}`
);

// Close the wrapper somewhere before sticky bar
const stickyBarStart = code.indexOf(`{/* Sticky Mobile Booking Bar */}`);
if (stickyBarStart !== -1) {
    code = code.substring(0, stickyBarStart) + `</div>\n\n        ` + code.substring(stickyBarStart);
}

// Redo Rating UI 
code = code.replace(
    `className="bg-[#003B95] text-white text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-0.5 rounded-t-md rounded-br-md shadow-sm mt-0.5"`,
    `className="flex items-center gap-1 font-semibold text-[15px] mt-0.5"`
);
code = code.replace(
    `{formatRating(listing.rating)}\n                            </div>`,
    `<StarIcon className="w-3.5 h-3.5 fill-current" /> {formatRating(listing.rating)}\n                            </div>`
);

fs.writeFileSync('components/ListingDetails.tsx', code);
