const fs = require('fs');

function replaceFile(path, replacer) {
   let code = fs.readFileSync(path, 'utf8');
   code = replacer(code);
   fs.writeFileSync(path, code);
}

replaceFile('components/MapSidebar.tsx', code => {
   // Add key to MarkerWithInfoWindow
   code = code.replace(/\{ listing: Listing, isActive: boolean, setActiveMarkerId: \(id: string \| null\) => void, setMarkerRef\?: \(key: string, marker: google\.maps\.marker\.AdvancedMarkerElement \| null\) => void \}/g,
                       '{ key?: React.Key, listing: Listing, isActive: boolean, setActiveMarkerId: (id: string | null) => void, setMarkerRef?: (key: string, marker: google.maps.marker.AdvancedMarkerElement | null) => void }');
   return code;
});

replaceFile('components/VideoReelsModal.tsx', code => {
   // Add key to the Reel Component
   code = code.replace(/\{ vid: ExperienceVideo, onLike: \(id: number, e: React\.MouseEvent\) => void, isMuted: boolean, setIsMuted: \(val: boolean\) => void, containerRef: React\.RefObject<HTMLDivElement> \}/g,
                       '{ key?: React.Key, vid: ExperienceVideo, onLike: (id: number, e: React.MouseEvent) => void, isMuted: boolean, setIsMuted: (val: boolean) => void, containerRef: React.RefObject<HTMLDivElement> }');
   return code;
});

replaceFile('components/ListingDetails.tsx', code => {
   // Wait, let's verify if `<Heart className="w-5 h-5 text-red-500 fill-current" />` is still there
   return code;
});

