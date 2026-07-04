const fs = require('fs');

function replaceFile(path, replacer) {
   let code = fs.readFileSync(path, 'utf8');
   code = replacer(code);
   fs.writeFileSync(path, code);
}

replaceFile('components/AdminDashboard.tsx', code => {
   code = code.replace(/fetchListings\(\)/g, 'window.location.reload()');
   return code;
});

replaceFile('components/AdminExperiences.tsx', code => {
   code = code.replace(/fetchExperiences\(\)/g, 'window.location.reload()');
   return code;
});

replaceFile('components/MapSidebar.tsx', code => {
   code = code.replace(/setMarkerRef\?\: \(key\: string, marker\: AdvancedMarkerElement\) \=\> void/g, 'setMarkerRef?: (key: string, marker: google.maps.marker.AdvancedMarkerElement) => void');
   return code;
});

