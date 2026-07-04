const fs = require('fs');
let code = fs.readFileSync('components/ListingDetails.tsx', 'utf8');

const oldBar = `className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-8 z-50 flex items-center gap-3 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] safe-pb"`;
const newBar = `className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-safe z-50 flex items-center justify-between gap-4 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"`;

code = code.replace(oldBar, newBar);

// Update Airbnb style price display in mobile bottom bar
const oldButtons = `<button className="flex-shrink-0 w-12 h-12 flex items-center justify-center border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
              <PhoneIcon className="w-5 h-5" />
          </button>
          <button className="flex-shrink-0 w-12 h-12 flex items-center justify-center border border-gray-300 rounded-xl text-green-600 hover:bg-gray-50 transition-colors">
               <MessageCircleIcon className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowMobileBooking(true)}
            className="flex-1 h-12 bg-[#0284C7] text-white font-bold rounded-xl text-base hover:bg-[#D01755] transition-colors shadow-sm"
          >
              Check availability
          </button>`;

const newButtons = `<div className="flex flex-col">
              <span className="text-[16px] font-bold text-gray-900">{formatPrice(listing.displayPrice ?? listing.price, listing.currency)} <span className="font-normal text-sm text-gray-500">/{listing.period}</span></span>
              {listing.rating && listing.rating > 0 && (
                  <span className="text-xs font-semibold text-gray-900 underline mt-0.5">{getRatingWord(listing.rating)}</span>
              )}
          </div>
          <button 
            onClick={() => setShowMobileBooking(true)}
            className="px-6 h-12 bg-[#e51d53] text-white font-bold rounded-xl text-[16px] hover:bg-[#d01749] transition-colors shadow-md active:scale-95"
          >
              Reserve
          </button>`;

code = code.replace(oldButtons, newButtons);

// Make Reserve button in Mobile Booking Sheet to use Airbnb red (#e51d53)
code = code.replace(
    `className={\`w-full text-white font-bold text-lg py-4 rounded-xl shadow-lg active:scale-[0.98] transition-transform mt-2 \${dayInfo?.status === 'blocked' ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#0284C7]'}\`}`,
    `className={\`w-full text-white font-bold text-[16px] py-3.5 rounded-xl shadow-lg active:scale-[0.98] transition-transform mt-4 \${dayInfo?.status === 'blocked' ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#e51d53]'}\`}`
);

// We need to also replace it inside the Desktop Booking box
code = code.replace(
    `bg-[#0284C7] hover:bg-[#D01755]`,
    `bg-[#e51d53] hover:bg-[#d01749]`
);

fs.writeFileSync('components/ListingDetails.tsx', code);
