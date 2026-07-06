const fs = require('fs');
let file = fs.readFileSync('App.tsx', 'utf-8');

file = file.replace(
`function App() {
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
  }, []);`,
  "function App() {"
);

const target2 = `const { setBadge, clearBadge } = useAppBadge();`;
const replacement2 = `const { setBadge, clearBadge } = useAppBadge();

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

file = file.replace(target2, replacement2);
fs.writeFileSync('App.tsx', file);
console.log('App fixed for sync placement');
