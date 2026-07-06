const fs = require('fs');
let file = fs.readFileSync('App.tsx', 'utf-8');

const target = `function App() {`;
const replacement = `function App() {
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'hostPreviewListing' && window.location.hash.toUpperCase() === '#PREVIEW_HOST') {
        if (e.newValue) {
          try {
            setSelectedListing(JSON.parse(e.newValue));
          } catch(err) {
            console.error('Preview sync parse error:', err);
          }
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);`;

if (!file.includes('handleStorage = (e: StorageEvent)')) {
    file = file.replace(target, replacement);
    fs.writeFileSync('App.tsx', file);
    console.log('App patched for sync');
}
