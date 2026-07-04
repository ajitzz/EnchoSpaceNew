const fs = require('fs');

function replaceFile(path, replacer) {
   let code = fs.readFileSync(path, 'utf8');
   code = replacer(code);
   fs.writeFileSync(path, code);
}

replaceFile('components/Icons.tsx', code => {
   code = code.replace(/interface IconProps \{/g, 'interface IconProps {\n  key?: string | number;\n  onClick?: (e?: any) => void;');
   return code;
});

// For `<StarIcon key={star} onClick={() => setNewReviewRating(star)} className...`
// that should be fine now since `onClick` and `key` are in IconProps.

