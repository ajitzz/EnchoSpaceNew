const fs = require('fs');
const map = JSON.parse(fs.readFileSync('dist/assets/HostForm-B2ngvZnG.js.map'));
const idx = map.sources.indexOf('../../components/HostForm.tsx');
if (idx !== -1) {
    fs.writeFileSync('components/HostForm.tsx', map.sourcesContent[idx]);
    console.log('Restored HostForm.tsx!');
} else {
    console.log('HostForm.tsx not found in sourcemap sources:', map.sources);
}
