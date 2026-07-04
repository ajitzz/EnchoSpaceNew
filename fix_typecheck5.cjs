const fs = require('fs');

function replaceFile(path, replacer) {
   let code = fs.readFileSync(path, 'utf8');
   code = replacer(code);
   fs.writeFileSync(path, code);
}

replaceFile('components/AdminExperiences.tsx', code => {
   code = code.replace(/Array\.from\(e\.target\.files\)\.map\(f => handleFileUpload\(f\)\)/g, 'Array.from(e.target.files).map((f: any) => handleFileUpload(f))');
   return code;
});

replaceFile('components/HostExperienceForm.tsx', code => {
   code = code.replace(/Array\.from\(e\.target\.files\)\.map\(f => handleFileUpload\(f\)\)/g, 'Array.from(e.target.files).map((f: any) => handleFileUpload(f))');
   return code;
});

replaceFile('components/ListingDetails.tsx', code => {
   code = code.replace(/<StarIcon key=\{i\} className/g, '<span key={i}><StarIcon className');
   // need to close span!
   // 983: <StarIcon key={i} className={`w-3 h-3 ${i < Number(review.rating) ? 'fill-current text-black' : 'text-gray-300'}`} />
   code = code.replace(/<StarIcon key=\{i\} className=\{`w-3 h-3 \$\{i < Number\(review\.rating\) \? 'fill-current text-black' : 'text-gray-300'\}&`\} \/>/g, '<span key={i}><StarIcon className={`w-3 h-3 ${i < Number(review.rating) ? \'fill-current text-black\' : \'text-gray-300\'}`} /></span>');
   code = code.replace(/<StarIcon key=\{i\} className=\{`w-3 h-3 \$\{i < Number\(review\.rating\) \? 'fill-current text-black' : 'text-gray-300'\}`\} \/>/g, '<span key={i}><StarIcon className={`w-3 h-3 ${i < Number(review.rating) ? \'fill-current text-black\' : \'text-gray-300\'}`} /></span>');

   // 999: <StarIcon key={star} onClick={() => setNewReviewRating(star)} className={`w-10 h-10 ${...}
   // Wait, there's a click handler on StarIcon directly. But wait, we can just add `onClick?: () => void;` to IconProps!
   return code;
});

replaceFile('components/Icons.tsx', code => {
   code = code.replace(/export interface IconProps \{/g, 'export interface IconProps {\n  key?: string | number;\n  onClick?: (e?: any) => void;');
   return code;
});

replaceFile('components/OptimizedImage.tsx', code => {
   code = code.replace(/export interface OptimizedImageProps \{/g, 'export interface OptimizedImageProps {\n  sizes?: string;');
   return code;
});

replaceFile('components/MapSidebar.tsx', code => {
   code = code.replace(/listing\.price === Number\(price\)/g, 'String(listing.price) === String(price)');
   code = code.replace(/l\.price === Number\(price\)/g, 'String(l.price) === String(price)');
   return code;
});

replaceFile('components/ExperiencesPage.tsx', code => {
   code = code.replace(/likes: '12000'/g, 'likes: 12000 as any');
   code = code.replace(/shares: '1200'/g, 'shares: 1200 as any');
   code = code.replace(/comments: '850'/g, 'comments: 850 as any');
   code = code.replace(/likes: '45000'/g, 'likes: 45000 as any');
   code = code.replace(/shares: '4200'/g, 'shares: 4200 as any');
   code = code.replace(/comments: '3100'/g, 'comments: 3100 as any');
   code = code.replace(/likes: '8500'/g, 'likes: 8500 as any');
   code = code.replace(/shares: '950'/g, 'shares: 950 as any');
   code = code.replace(/comments: '420'/g, 'comments: 420 as any');
   code = code.replace(/likes: '22000'/g, 'likes: 22000 as any');
   code = code.replace(/shares: '2800'/g, 'shares: 2800 as any');
   code = code.replace(/comments: '1500'/g, 'comments: 1500 as any');
   return code;
});

replaceFile('components/ExperienceDetails.tsx', code => {
   code = code.replace(/onSuccess=\{\(\) => handleBookingSuccess\(""\)\}/g, 'onSuccess={() => handleBookingSuccess("") as any}');
   return code;
});

