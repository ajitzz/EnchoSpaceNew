const fs = require('fs');

function replaceFile(path, replacer) {
   let code = fs.readFileSync(path, 'utf8');
   code = replacer(code);
   fs.writeFileSync(path, code);
}

replaceFile('components/ExperienceDetails.tsx', code => {
   code = code.replace(/currency="inr"\n/g, '');
   return code;
});

replaceFile('components/ExperiencesPage.tsx', code => {
   code = code.replace(/\/\* @ts-expect-error mock \*\//g, '');
   return code;
});

replaceFile('components/MapSidebar.tsx', code => {
   code = code.replace(/lat === 0/g, 'Number(lat) === 0');
   code = code.replace(/lng === 0/g, 'Number(lng) === 0');
   code = code.replace(/lat !== 0/g, 'Number(lat) !== 0');
   code = code.replace(/lng !== 0/g, 'Number(lng) !== 0');
   return code;
});

