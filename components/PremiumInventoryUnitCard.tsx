import React, { useState } from 'react';


const PremiumInventoryUnitCard = ({ room, listing, isSelected, toggleSelection, formatPrice }: { room: any, listing: any, isSelected: boolean, toggleSelection: () => void, formatPrice: any }) => {
  const [expanded, setExpanded] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  return (
    <div className={`relative overflow-hidden transition-all duration-700 ease-in-out transform ${expanded ? 'rounded-[2rem] shadow-2xl scale-[1.02] border-0 z-50 my-12' : 'rounded-3xl border border-gray-200 hover:shadow-xl hover:border-gray-300 my-6'} bg-white`} style={{ transformOrigin: 'center' }}>
      
      {/* If expanded, we show the ultra-premium full-bleed view */}
      {expanded ? (
        <div className="flex flex-col relative w-full bg-black text-white shadow-[0_0_100px_rgba(0,0,0,0.5)]">
           {/* Immersive Media Header */}
           <div className="relative h-[60vh] md:h-[70vh] w-full overflow-hidden rounded-t-[2rem]">
               {room.video_url ? (
                  <video 
                     autoPlay 
                     loop 
                     muted={isVideoMuted} 
                     playsInline 
                     className="absolute inset-0 w-full h-full object-cover opacity-80"
                     src={room.video_url}
                  />
               ) : (
                  <img 
                     src={room.imageUrls?.[0] || listing.imageUrl} 
                     alt={room.name}
                     className="absolute inset-0 w-full h-full object-cover opacity-80 scale-105 motion-safe:animate-[slowZoom_20s_ease-in-out_infinite_alternate]"
                  />
               )}
               <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
               <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent" />
               
               {/* Top Actions */}
               <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-10">
                   <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full text-xs font-semibold tracking-widest uppercase border border-white/20 shadow-lg">
                      Signature Collection
                   </div>
                   <button onClick={() => setExpanded(false)} className="p-3 bg-white/10 backdrop-blur-md rounded-full border border-white/20 hover:bg-white/30 transition-all shadow-lg group">
                      <svg className="w-5 h-5 text-white group-hover:rotate-90 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
               </div>

               {/* Bottom Content */}
               <div className="absolute bottom-10 left-10 right-10 z-10 flex flex-col items-start">
                   <h3 className="text-4xl md:text-5xl lg:text-6xl text-white font-bold mb-4 tracking-tight leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
                       {room.name}
                   </h3>
                   <div className="flex flex-wrap items-center gap-4 text-white/90 text-xs md:text-sm tracking-widest uppercase font-medium">
                       {room.capacity && <span className="flex items-center gap-1.5"><svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> Up to {room.capacity} Guests</span>}
                       {room.capacity && <span className="text-white/30">•</span>}
                       {room.bedrooms && <span className="flex items-center gap-1.5"><svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> {room.bedrooms} Bedrooms</span>}
                       {room.bedrooms && <span className="text-white/30">•</span>}
                       {room.inventory_count !== undefined && <span className={`flex items-center gap-1.5 ${room.inventory_count > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{room.inventory_count} Available Units</span>}
                   </div>
               </div>
           </div>

           {/* Details Section */}
           <div className="p-10 md:p-16 bg-zinc-950 flex flex-col lg:flex-row gap-16 rounded-b-[2rem]">
               <div className="flex-1 space-y-10">
                   <div>
                       <h4 className="text-xs font-bold tracking-widest text-white/50 uppercase mb-4">The Experience</h4>
                       <p className="text-lg md:text-xl text-white/80 leading-relaxed font-light">
                           {room.description || `Immerse yourself in the extraordinary elegance of ${room.name}, part of the magnificent ${listing.title}. Crafted for discerning travelers, this sanctuary offers unmatched tranquility, bespoke amenities, and a seamless blend of modern luxury and timeless aesthetics.`}
                       </p>
                   </div>
                   
                   {/* Amenities Grid */}
                   {room.amenities && (
                       <div>
                           <h4 className="text-xs font-bold tracking-widest text-white/50 uppercase mb-6">Signature Amenities</h4>
                           <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-4">
                               {room.amenities.map(am => (
                                   <div key={am} className="flex items-center gap-3 text-white/90">
                                       <div className="p-2 rounded-full bg-white/5 border border-white/10 text-amber-400">
                                           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                       </div>
                                       <span className="text-sm font-medium">{am}</span>
                                   </div>
                               ))}
                           </div>
                       </div>
                   )}
               </div>

               <div className="w-full lg:w-[420px] flex-shrink-0 flex flex-col gap-6">
                   <div className="p-10 rounded-[2rem] bg-zinc-900 border border-white/10 relative overflow-hidden group shadow-2xl">
                       <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                       <div className="relative z-10 flex flex-col h-full justify-between">
                           <div>
                               <span className="text-white/50 text-xs font-bold uppercase tracking-widest block mb-4">Reserve Your Stay</span>
                               <div className="text-4xl md:text-5xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                                   {formatPrice(room.price, listing.currency)} 
                               </div>
                               <div className="text-sm font-normal text-white/40 mb-8">per night, exclusive of taxes</div>
                           </div>
                           
                           <button 
                               onClick={() => {
                                   if (room.inventory_count !== 0) {
                                       if (!isSelected) toggleSelection();
                                       setExpanded(false);
                                       setTimeout(() => {
                                          document.getElementById('booking-card')?.scrollIntoView({ behavior: 'smooth' });
                                       }, 300);
                                   }
                               }}
                               className={`w-full py-5 rounded-2xl font-bold text-sm uppercase tracking-widest transition-all duration-500 relative overflow-hidden group/btn
                                   ${room.inventory_count === 0 
                                       ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10' 
                                       : 'bg-white text-black hover:bg-gray-100 shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-[0_0_60px_rgba(255,255,255,0.2)]'
                                   }`}
                           >
                               <span className="relative z-10 flex items-center justify-center gap-3">
                                  {isSelected ? (
                                      <>
                                          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                          Added to Reservation
                                      </>
                                  ) : (
                                      <>
                                          Add to Your Stay
                                          <svg className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                      </>
                                  )}
                               </span>
                           </button>
                       </div>
                   </div>
               </div>
           </div>
        </div>
      ) : (
        /* Compact Card View */
        <div 
          onClick={() => setExpanded(true)}
          className={`flex flex-col md:flex-row h-auto md:h-[280px] cursor-pointer group`}
        >
           {/* Image */}
           <div className="w-full md:w-[40%] h-64 md:h-full relative overflow-hidden">
               <img 
                   src={room.imageUrls?.[0] || listing.imageUrl} 
                   alt={room.name}
                   className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
               />
               <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500" />
               
               {/* Play Icon Overlay if Video Exists */}
               {room.video_url && (
                   <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10">
                       <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/40 shadow-xl">
                           <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                       </div>
                   </div>
               )}

               {isSelected && (
                   <div className="absolute top-4 left-4 bg-black/90 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl flex items-center gap-2 border border-white/10">
                       <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                       Selected
                   </div>
               )}
           </div>
           
           {/* Details */}
           <div className="w-full md:w-[60%] p-8 md:p-10 flex flex-col justify-between bg-white transition-colors duration-500 group-hover:bg-zinc-50">
               <div>
                   <div className="flex justify-between items-start mb-3">
                       <h3 className="text-2xl md:text-3xl font-bold text-gray-900 group-hover:text-black transition-colors" style={{ fontFamily: 'Playfair Display, serif' }}>{room.name}</h3>
                       <div className="text-right">
                           <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Starts From</span>
                           <span className="font-bold text-xl md:text-2xl text-gray-900">{formatPrice(room.price, listing.currency)}</span>
                       </div>
                   </div>
                   <p className="text-gray-500 text-sm md:text-base line-clamp-2 mt-2 font-light leading-relaxed">
                       {room.description || `Experience the ultimate comfort and exclusive amenities in our signature ${room.name}. A perfectly crafted retreat.`}
                   </p>
                   
                   <div className="flex flex-wrap items-center gap-3 mt-6">
                       {room.capacity && <span className="text-xs font-semibold text-gray-600 bg-gray-100/80 px-3 py-1.5 rounded-lg border border-gray-200/50">{room.capacity} Guests</span>}
                       {room.bedrooms && <span className="text-xs font-semibold text-gray-600 bg-gray-100/80 px-3 py-1.5 rounded-lg border border-gray-200/50">{room.bedrooms} Beds</span>}
                       {room.inventory_count !== undefined && <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${room.inventory_count > 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-red-700 bg-red-50 border-red-100'}`}>{room.inventory_count} Available</span>}
                   </div>
               </div>
               
               <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-100">
                   <div className="text-xs font-bold uppercase tracking-widest text-gray-900 flex items-center gap-2 group-hover:gap-4 transition-all duration-300">
                       <span className="border-b border-gray-900 pb-0.5">Explore Space</span>
                       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                   </div>
                   
                   <button 
                       onClick={(e) => {
                           e.stopPropagation(); // prevent expanding
                           if (room.inventory_count !== 0) {
                               toggleSelection();
                               if (!isSelected) {
                                  setTimeout(() => {
                                     document.getElementById('booking-card')?.scrollIntoView({ behavior: 'smooth' });
                                  }, 300);
                               }
                           }
                       }}
                       className={`px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all duration-300 ${
                           isSelected 
                               ? 'bg-black text-white shadow-xl shadow-black/20' 
                               : 'bg-white border border-gray-300 text-gray-900 hover:border-black hover:bg-gray-50'
                       }`}
                   >
                       {isSelected ? 'Selected' : 'Add to Stay'}
                   </button>
               </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default PremiumInventoryUnitCard;
