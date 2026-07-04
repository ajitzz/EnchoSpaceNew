const fs = require('fs');
let code = fs.readFileSync('components/MapSidebar.tsx', 'utf8');

// Enhance the Map Marker to pulse when active and have a smoother transition
const oldMarker = `          className={\`
              relative flex items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] 
              transition-all duration-300 ring-1 ring-black/5
              \${(isActive || open) 
                  ? 'bg-[#0284C7] text-white px-5 py-2.5 scale-110 z-50' 
                  : 'bg-white text-gray-900 px-3.5 py-1.5 hover:scale-110 hover:shadow-xl'}
          \`}`;

const newMarker = `          className={\`
              relative flex items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] 
              transition-all duration-500 ring-1 ring-black/5 ease-[cubic-bezier(0.34,1.56,0.64,1)]
              \${(isActive || open) 
                  ? 'bg-gray-900 text-white px-5 py-2.5 scale-125 z-50' 
                  : 'bg-white text-gray-900 px-3.5 py-1.5 hover:scale-110 hover:shadow-xl z-10'}
          \`}`;

code = code.replace(oldMarker, newMarker);

code = code.replace(
    `className="pointer-events-auto flex items-center justify-center bg-white/90 backdrop-blur-xl p-3 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/50 cursor-pointer hover:scale-105 hover:text-[#0284C7] transition-all active:scale-95 group"`,
    `className="pointer-events-auto flex items-center justify-center bg-white/90 backdrop-blur-xl p-3 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/50 cursor-pointer hover:scale-105 hover:text-gray-900 transition-all active:scale-95 group"`
);

code = code.replace(
    `text-gray-700 group-hover:text-[#0284C7]`,
    `text-gray-700 group-hover:text-gray-900`
);

code = code.replace(
    `checked:bg-[#0284C7] checked:border-[#0284C7]`,
    `checked:bg-gray-900 checked:border-gray-900`
);

fs.writeFileSync('components/MapSidebar.tsx', code);
