const fs = require('fs');

function replaceFile(path, replacer) {
   let code = fs.readFileSync(path, 'utf8');
   code = replacer(code);
   fs.writeFileSync(path, code);
}

replaceFile('components/ListingDetails.tsx', code => {
   // I made a mistake: `<span key={i}><StarIcon className={`w-3 h-3 ${i < Number(review.rating) ? 'fill-current text-black' : 'text-gray-300'}`} />` doesn't have </span>
   code = code.replace(/<span key=\{i\}><StarIcon className=\{`w-3 h-3 \$\{i < Number\(review\.rating\) \? 'fill-current text-black' : 'text-gray-300'\}`\} \/>/g, 
                       '<span key={i}><StarIcon className={`w-3 h-3 ${i < Number(review.rating) ? \'fill-current text-black\' : \'text-gray-300\'}`} /></span>');
   return code;
});

