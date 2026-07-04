const fs = require('fs');
let code = fs.readFileSync('components/FilterBar.tsx', 'utf8');

code = code.replace(
    `<div className="p-5 md:px-10 md:py-6 border-t border-gray-100 flex items-center justify-between bg-white w-full sticky bottom-0 z-20">`,
    `<div className="p-5 md:px-10 md:py-6 pb-safe border-t border-gray-100 flex items-center justify-between bg-white w-full sticky bottom-0 z-20">`
);

// We can also ensure the filter modal slide animation is butter smooth
code = code.replace(
    `className="relative w-full md:w-[780px] bg-white rounded-t-3xl md:rounded-3xl shadow-2xl h-[95vh] md:h-[85vh] flex flex-col animate-slide-up overflow-hidden"`,
    `className="relative w-full md:w-[780px] bg-white rounded-t-3xl md:rounded-3xl shadow-2xl h-[95vh] md:h-[85vh] flex flex-col animate-slide-up overflow-hidden border border-gray-100"`
);

fs.writeFileSync('components/FilterBar.tsx', code);
