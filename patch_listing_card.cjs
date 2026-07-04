const fs = require('fs');
let code = fs.readFileSync('components/ListingCard.tsx', 'utf8');

// Replace the aspect ratio from `aspect-[4/3] rounded-2xl` to `aspect-square rounded-3xl`
code = code.replace(
    `className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 isolate cursor-grab active:cursor-grabbing group"`,
    `className="relative aspect-square rounded-[24px] overflow-hidden bg-gray-100 isolate cursor-grab active:cursor-grabbing group"`
);

// We want the text to look cleaner, more like Airbnb. 
code = code.replace(
    `className="pt-4 px-1 pb-2 flex flex-col gap-1.5"`,
    `className="pt-4 px-1 pb-2 flex flex-col gap-0.5"`
);

code = code.replace(
    `className="font-bold text-gray-900 truncate text-lg pr-2 leading-tight group-hover:text-[#0284C7] transition-colors"`,
    `className="font-bold text-gray-900 truncate text-[16px] pr-2 leading-tight group-hover:text-[#e51d53] transition-colors"`
);

// Adjust rating badge
code = code.replace(
    `<div className="bg-[#003B95] text-white text-xs font-bold px-1.5 py-0.5 rounded-t-md rounded-br-md shadow-sm">`,
    `<div className="flex items-center gap-1 font-semibold text-[14px]">`
);
code = code.replace(
    `{formatRating(listing.rating)}\n                    </div>`,
    `<StarIcon className="w-3.5 h-3.5 fill-current" /> {formatRating(listing.rating)}\n                    </div>`
);

// Price formatting
code = code.replace(
    `className="font-bold text-gray-900 text-xl"`,
    `className="font-bold text-gray-900 text-[16px]"`
);

code = code.replace(
    `text-[#0284C7]`,
    `text-[#e51d53]`
);

// Redo heart icon fill
code = code.replace(
    `fill-[#0284C7]`,
    `fill-[#e51d53]`
);

fs.writeFileSync('components/ListingCard.tsx', code);
