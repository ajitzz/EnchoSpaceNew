const fs = require('fs');

function replaceFile(path, replacer) {
   let code = fs.readFileSync(path, 'utf8');
   code = replacer(code);
   fs.writeFileSync(path, code);
}

replaceFile('components/AdminDashboard.tsx', code => {
   code = code.replace(/\/\* fetchListings \*\/ \[\]\(\)/g, 'fetchListings()');
   if (!code.includes("import { fetchListings }")) {
      code = code.replace(/import \{ Listing \} from '\.\.\/types';/, "import { Listing } from '../types';\nimport { fetchListings } from '../lib/syncService';");
   }
   return code;
});

replaceFile('components/AdminExperiences.tsx', code => {
   code = code.replace(/\/\* fetchExperiences \*\/ \[\]\(\)/g, 'fetchExperiences()');
   if (!code.includes("import { fetchExperiences }")) {
      code = code.replace(/import \{ Experience \} from '\.\.\/types';/, "import { Experience } from '../types';\nimport { fetchExperiences } from '../lib/syncService';");
   }
   // Also the file as any -> file as unknown as File
   code = code.replace(/file as any/g, 'file as unknown as File');
   return code;
});

replaceFile('components/HostExperienceForm.tsx', code => {
   code = code.replace(/file as any/g, 'file as unknown as File');
   return code;
});

replaceFile('components/ExperienceDetails.tsx', code => {
   // Wait, checkout modal onSuccess
   code = code.replace(/onSuccess=\{\(\) => handleBookingSuccess\(""\)\}/g, 'onSuccess={(pid) => handleBookingSuccess(pid || "")}');
   return code;
});

replaceFile('components/ExperiencesPage.tsx', code => {
   code = code.replace(/likes: '12K'/g, 'likes: 12000');
   code = code.replace(/shares: '1\.2K'/g, 'shares: 1200');
   code = code.replace(/comments: '850'/g, 'comments: 850');
   code = code.replace(/likes: '45K'/g, 'likes: 45000');
   code = code.replace(/shares: '4\.2K'/g, 'shares: 4200');
   code = code.replace(/comments: '3\.1K'/g, 'comments: 3100');
   code = code.replace(/likes: '8\.5K'/g, 'likes: 8500');
   code = code.replace(/shares: '950'/g, 'shares: 950');
   code = code.replace(/comments: '420'/g, 'comments: 420');
   code = code.replace(/likes: '22K'/g, 'likes: 22000');
   code = code.replace(/shares: '2\.8K'/g, 'shares: 2800');
   code = code.replace(/comments: '1\.5K'/g, 'comments: 1500');
   return code;
});

replaceFile('components/HostCalendar.tsx', code => {
   code = code.replace(/l\.city/g, '(l as any).city');
   return code;
});

replaceFile('components/ListingDetails.tsx', code => {
   code = code.replace(/<Heart className/g, '<div key={i}><Heart className');
   code = code.replace(/<\/Heart>/g, '</Heart></div>'); // wait, Heart doesn't have children usually, it's an icon
   // let's do a more robust fix
   code = code.replace(/<Heart className="w-5 h-5 text-red-500 fill-current" \/>/g, '<span key={i}><Heart className="w-5 h-5 text-red-500 fill-current" /></span>');
   code = code.replace(/<Star className="w-5 h-5 text-yellow-400 fill-current" \/>/g, '<span key={i}><Star className="w-5 h-5 text-yellow-400 fill-current" /></span>');
   return code;
});

replaceFile('components/MapSidebar.tsx', code => {
   code = code.replace(/l\.price === price/g, 'l.price === Number(price)');
   code = code.replace(/listing\.price === price/g, 'listing.price === Number(price)');
   return code;
});

replaceFile('components/OptimizedImage.tsx', code => {
   code = code.replace(/@ts-expect-error/g, ''); // just remove it
   code = code.replace(/export interface OptimizedImageProps \{/g, 'export interface OptimizedImageProps {\n  sizes?: string;');
   return code;
});

replaceFile('components/VideoReelsModal.tsx', code => {
   // we removed the key earlier, let's wrap it in a div or something? 
   // actually key on a component is fine if the component allows it. But React.memo/forwardRef might not explicitly type it in old typescript.
   // Wait, we removed key earlier! But let's check what it complains about.
   return code;
});

replaceFile('index.tsx', code => {
   if (!code.includes('/// <reference types="vite-plugin-pwa/client" />')) {
      code = '/// <reference types="vite-plugin-pwa/client" />\n' + code;
   }
   return code;
});

