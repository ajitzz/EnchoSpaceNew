
import React, { useState, useEffect } from 'react';
import { SEO } from './SEO';
import { Listing } from '../types';
import { ShieldCheck, StarIcon, HouseIcon, MessageCircleIcon } from './Icons';

interface BookingPageProps {
  listing: Listing;
  bookingDetails: {
    moveInDate: string;
    configuration: string;
    name: string;
    phone: string;
    totalRent: number;
  };
  onBackToHome: () => void;
}

const BookingPage: React.FC<BookingPageProps> = ({ listing, bookingDetails, onBackToHome }) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [whatsappConfig, setWhatsappConfig] = useState<{ enabled: boolean, number: string } | null>(null);
  const [callConfig, setCallConfig] = useState<{ enabled: boolean, number: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings/whatsapp')
      .then(res => res.json())
      .then(data => {
        if (data && data.enabled && data.number) {
          setWhatsappConfig(data);
          setCountdown(5);
        }
      })
      .catch(console.error);

    fetch('/api/settings/call')
      .then(res => res.json())
      .then(data => {
        if (data && data.enabled && data.number) {
          setCallConfig(data);
        }
      })
      .catch(console.error);
  }, []);

  const handleWhatsAppRedirect = React.useCallback(() => {
    if (!whatsappConfig?.number) return;
    
    // Formatting the message
    const message = `Hello! I have just placed a booking request on ENCHO Space.\n\n*Property:* ${listing.title}\n*Location:* ${listing.address}\n*Move-in Date:* ${new Date(bookingDetails.moveInDate).toLocaleDateString()}\n*Name:* ${bookingDetails.name}`;
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${whatsappConfig.number}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  }, [whatsappConfig, listing.title, listing.address, bookingDetails.moveInDate, bookingDetails.name]);

  useEffect(() => {
    if (countdown === null || !whatsappConfig?.enabled) return;
    
    if (countdown === 0) {
      handleWhatsAppRedirect();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => prev !== null ? prev - 1 : prev);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, whatsappConfig, handleWhatsAppRedirect]);

  return (
    <>
      <SEO title={`Booking Confirmed - ${listing.title}`} description={`Your reservation for ${listing.title} is confirmed.`} />
    <div className="min-h-screen bg-gray-50 flex flex-col items-center animate-fade-in-up font-sans">
      
      {/* Navbar */}
      <header className="w-full bg-white/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
             {/* Brand Logo - Click to Home */}
             <div onClick={onBackToHome} className="cursor-pointer flex flex-col justify-center leading-none select-none group">
                 <div className="flex items-baseline gap-0.5">
                     <span className="font-black text-xl tracking-tighter text-gray-900 group-hover:text-[#0284C7] transition-colors">ENCHO</span>
                     <div className="w-1.5 h-1.5 bg-[#0284C7] rounded-full mb-1"></div>
                 </div>
                 <span className="text-[9px] font-bold tracking-[0.35em] text-gray-400 uppercase ml-0.5">Space</span>
            </div>

            {/* Done Button */}
             <button 
                onClick={onBackToHome}
                className="text-sm font-bold text-gray-600 hover:text-black hover:bg-gray-100 px-4 py-2 rounded-full transition-all"
             >
                Done
             </button>
        </div>
      </header>

      <div className="w-full max-w-2xl mt-8 mb-12 px-4 sm:px-6">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
          
          {/* Success Header */}
          <div className="bg-[#0284C7] p-8 text-center text-white">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
               <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold mb-2">Reservation Request Sent!</h1>
            <p className="text-white/90 font-medium">We've sent your details to the host. You'll hear back shortly.</p>
          </div>

          <div className="p-4 md:p-8">
              {/* Listing Recap */}
              <div className="flex gap-4 mb-8 pb-8 border-b border-gray-100">
                  <img 
                      src={listing.imageUrl} 
                      alt={listing.title} 
                      className="w-24 h-24 object-cover rounded-xl shadow-sm bg-gray-100"
                  />
                  <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{listing.type} in {listing.address?.split(',')[0]}</div>
                      <h3 className="font-bold text-gray-900 text-lg leading-tight mb-2">{listing.title}</h3>
                      <div className="flex items-center gap-1 text-sm font-medium text-gray-600">
                          <StarIcon className="w-3.5 h-3.5 fill-current text-orange-400" />
                          <span>{listing.rating}</span>
                          <span className="text-gray-300">•</span>
                          <span>{listing.isVerified ? 'Verified Host' : 'Host'}</span>
                      </div>
                  </div>
              </div>

              {/* Booking Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-8">
                  <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Move-in Date</label>
                      <div className="font-semibold text-gray-900 text-lg">{new Date(bookingDetails.moveInDate).toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Configuration</label>
                      <div className="font-semibold text-gray-900 text-lg">{bookingDetails.configuration}</div>
                  </div>
                   <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Guest Name</label>
                      <div className="font-semibold text-gray-900 text-lg">{bookingDetails.name}</div>
                  </div>
                   <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Contact</label>
                      <div className="font-semibold text-gray-900 text-lg">{bookingDetails.phone}</div>
                  </div>
              </div>

              {/* Financial Summary */}
              <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 mb-8">
                  <div className="flex justify-between items-center mb-4">
                      <span className="text-gray-600 font-medium">Estimated Monthly Rent</span>
                      <span className="font-bold text-gray-900 text-xl">₹{bookingDetails.totalRent.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-gray-500 leading-relaxed">
                      * This is an estimate. Final lease terms including deposit and maintenance fees will be confirmed by the property manager upon approval of your application.
                  </div>
              </div>

              {/* Next Steps / WhatsApp Section - Updated */}
              <div className="bg-[#E7F6EC] rounded-2xl p-5 border border-[#D1E8D9] mb-8 flex flex-col sm:flex-row items-center sm:items-center justify-between gap-4">
                   <div className="text-center sm:text-left">
                       <h3 className="font-bold text-[#0F5C2E] text-base mb-1">What happens next?</h3>
                       <p className="text-sm text-[#0F5C2E]/90 font-medium">
                          Our team will reach out to you soon.
                       </p>
                       <p className="text-sm text-[#0F5C2E] font-bold mt-1">
                          {countdown !== null ? `Redirecting to WhatsApp in ${countdown}s...` : 'More details will be shared through WhatsApp.'}
                       </p>
                   </div>
                   <div className="flex flex-col sm:flex-row gap-2">
                       <button onClick={handleWhatsAppRedirect} className="flex-shrink-0 flex items-center gap-2 bg-[#25D366] hover:bg-[#20b85a] text-white px-6 py-3 rounded-full font-bold text-sm shadow-sm transition-all active:scale-95">
                           <span>WhatsApp</span>
                           <MessageCircleIcon className="w-5 h-5" />
                       </button>
                       {callConfig?.enabled && callConfig?.number && (
                           <button onClick={() => window.open(`tel:${callConfig.number}`, '_self')} className="flex-shrink-0 flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-900 px-6 py-3 rounded-full font-bold text-sm shadow-sm border border-gray-200 transition-all active:scale-95">
                               <span>Call Us</span>
                           </button>
                       )}
                   </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                  <button 
                      onClick={onBackToHome}
                      className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg hover:scale-[1.02] transition-transform shadow-lg"
                  >
                      Back to Explore
                  </button>
                  <button className="w-full bg-white text-gray-900 py-4 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition-colors">
                      Download Summary PDF
                  </button>
              </div>
          </div>
        </div>
        
        <div className="mt-8 text-gray-400 text-sm font-medium flex items-center gap-2 justify-center">
           <HouseIcon className="w-4 h-4" />
           <span>ENCHO Space Secure Booking</span>
        </div>
      </div>
    </div>
    </>
  );
};

export default BookingPage;
