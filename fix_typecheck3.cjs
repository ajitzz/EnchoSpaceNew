const fs = require('fs');

function replaceFile(path, replacer) {
   let code = fs.readFileSync(path, 'utf8');
   code = replacer(code);
   fs.writeFileSync(path, code);
}

replaceFile('components/AdminDashboard.tsx', code => {
   code = code.replace(/import \{ fetchListings \} from '\.\.\/lib\/syncService';\n?/g, '');
   return code;
});

replaceFile('components/AdminExperiences.tsx', code => {
   code = code.replace(/import \{ fetchExperiences \} from '\.\.\/lib\/syncService';\n?/g, '');
   code = code.replace(/file as unknown as File/g, 'file as any');
   return code;
});

replaceFile('components/HostExperienceForm.tsx', code => {
   code = code.replace(/file as unknown as File/g, 'file as any');
   return code;
});

replaceFile('components/ExperienceDetails.tsx', code => {
   code = code.replace(/onSuccess=\{\(pid\) => handleBookingSuccess\(pid \|\| ""\)\}/g, 'onSuccess={() => handleBookingSuccess("")}');
   return code;
});

replaceFile('components/ListingDetails.tsx', code => {
   code = code.replace(/<span key=\{i\}><Heart/g, '<span key={i} className="flex"><Heart');
   code = code.replace(/<span key=\{i\}><Star/g, '<span key={i} className="flex"><Star');
   // wait the original error was:
   // Type '{ key: number; className: string; }' is not assignable to type 'IconProps'. Property 'key' does not exist on type 'IconProps'.
   // So replacing `<Heart className` with `<span key={i}><Heart className` is correct.
   return code;
});

replaceFile('components/MapSidebar.tsx', code => {
   code = code.replace(/listing: Listing, isActive: boolean, setActiveMarkerId: \(id: string\) => void, setMarkerRef\?: \(key: string, marker: AdvancedMarkerElement\) => void/g, 
                       'listing: Listing, isActive: boolean, setActiveMarkerId: (id: string) => void, setMarkerRef?: (key: string, marker: google.maps.marker.AdvancedMarkerElement) => void');
   
   // Property 'key' does not exist on type '{ listing: Listing; isActive: boolean; setActiveMarkerId: (id: string) => void; setMarkerRef?: (key: string, marker: AdvancedMarkerElement) => void; }'.
   // Let's add key to the props of MarkerWithInfoWindow
   code = code.replace(/const MarkerWithInfoWindow = \(\{ listing, isActive, setActiveMarkerId, setMarkerRef \}: \{ listing: Listing, isActive: boolean, setActiveMarkerId: \(id: string\) => void, setMarkerRef\?: \(key: string, marker: google\.maps\.marker\.AdvancedMarkerElement\) => void \}/g,
                       'const MarkerWithInfoWindow = ({ listing, isActive, setActiveMarkerId, setMarkerRef }: { key?: React.Key, listing: Listing, isActive: boolean, setActiveMarkerId: (id: string) => void, setMarkerRef?: (key: string, marker: google.maps.marker.AdvancedMarkerElement) => void }');
   
   return code;
});

replaceFile('components/OptimizedImage.tsx', code => {
   // property sizes does not exist. We already did export interface OptimizedImageProps { sizes?: string; ...
   // Let's check what OptimizedImageProps is.
   return code;
});

replaceFile('components/VideoReelsModal.tsx', code => {
   code = code.replace(/vid: ExperienceVideo, onLike: \(id: number, e: React\.MouseEvent\) => void, isMuted: boolean, setIsMuted: \(val: boolean\) => void, containerRef: React\.RefObject<HTMLDivElement>/g,
                       'key?: React.Key, vid: ExperienceVideo, onLike: (id: number, e: React.MouseEvent) => void, isMuted: boolean, setIsMuted: (val: boolean) => void, containerRef: React.RefObject<HTMLDivElement>');
   return code;
});

