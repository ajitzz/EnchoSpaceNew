const fs = require('fs');

function replaceFile(path, replacer) {
   let code = fs.readFileSync(path, 'utf8');
   code = replacer(code);
   fs.writeFileSync(path, code);
}

replaceFile('components/HostCalendar.tsx', code => {
   code = code.replace(/listing\.city/g, '(listing as any).city');
   return code;
});

replaceFile('components/OptimizedImage.tsx', code => {
   code = code.replace(/interface OptimizedImageProps extends React\.ImgHTMLAttributes<HTMLImageElement> \{/g, 
                       'interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {\n  sizes?: string;');
   return code;
});

