const fs = require('fs');
let code = fs.readFileSync('components/FilterBar.tsx', 'utf8');

// The scrollable pills container
const scrollableContainerStart = `className="flex overflow-x-auto scrollbar-hide py-3 md:py-4 gap-2 md:gap-3 items-center mx-1 md:mx-2 flex-grow mask-fade-right"`;

code = code.replace(
    scrollableContainerStart,
    `className="flex overflow-x-auto scrollbar-hide py-3 md:py-4 gap-2 md:gap-3 items-center mx-1 md:mx-2 flex-grow"`
);

// Filter chip design
code = code.replace(
    `<button onClick={onClick} className={\`px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap flex items-center gap-1.5 transition-all duration-300`,
    `<button onClick={onClick} className={\`px-4 py-2 rounded-full border text-[14px] font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all duration-300 shadow-sm active:scale-95`
);

// We should replace the background colors for active filter chip from #0284C7 to Airbnb's simple inverted contrast
// Or we can just use `text-white bg-[#0284C7]` to `text-white bg-gray-900 border-gray-900 shadow-md`
code = code.replace(
    `text-white bg-[#0284C7] border-[#0284C7]`,
    `text-white bg-gray-900 border-gray-900 shadow-md`
);
code = code.replace(
    `text-gray-700 bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50`,
    `text-gray-900 bg-white border-gray-200 hover:border-gray-900 hover:shadow-sm`
);

fs.writeFileSync('components/FilterBar.tsx', code);
