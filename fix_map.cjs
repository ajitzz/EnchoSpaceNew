const fs = require('fs');
const lines = fs.readFileSync('components/MapSidebar.tsx', 'utf8').split('\n');

// We want to delete from "const [markers, setMarkers] = useState<{[key: string]" up to "}, []);"
let inDuplicate = false;
const newLines = [];
let count = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('const [markers, setMarkers]') && count === 0) {
        inDuplicate = true;
        count++;
        continue;
    }
    if (inDuplicate) {
        if (line.includes('    }, []);')) {
            inDuplicate = false;
        }
        continue;
    }
    if (line.includes('useMarkerCluster(')) {
        continue;
    }
    newLines.push(line);
}

fs.writeFileSync('components/MapSidebar.tsx', newLines.join('\n'));
